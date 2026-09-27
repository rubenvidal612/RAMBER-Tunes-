-- ============================================================
-- MIGRACIÓN (CORREGIDA v3): Protección idempotente Mercado Pago
-- 1 payment_id = SOLAMENTE 1 acreditación (mutex atómico DB-level)
-- Tabla nueva mp_payment_claims. SIN TOCAR histórico.
-- ============================================================

-- ============================================================
-- PASO 1: Tabla mutex mp_payment_claims (payment_id PK)
--         NUNCA insertaremos 2 filas con mismo payment_id.
--         NO TOCAMOS mp_transactions HISTÓRICO (ningún DELETE).
-- ============================================================
CREATE TABLE IF NOT EXISTS mp_payment_claims (
  payment_id       TEXT PRIMARY KEY,
  user_id          UUID,
  kind             TEXT NOT NULL,
  pack_key         TEXT,
  pack_id          BIGINT,
  amount_mxn       NUMERIC(10,2) DEFAULT 0,
  credits_granted  NUMERIC(12,2) DEFAULT 0,
  batch_id         BIGINT,
  share_id         TEXT,
  claimed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mp_payment_claims_user ON mp_payment_claims(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mp_payment_claims_pack ON mp_payment_claims(pack_key);

ALTER TABLE mp_payment_claims ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PASO 2: RPC transaccional mp_claim_payment_transaction
--         1 SOLA TRANSACCIÓN (Postgres BEGIN…COMMIT implícito):
--           VALIDAR → RECLAMAR PK → ACREDITAR → REGISTRAR
-- ============================================================
CREATE OR REPLACE FUNCTION mp_claim_payment_transaction(
  p_payment_id          TEXT,
  p_user_id             UUID,
  p_kind                TEXT,
  p_pack_key            TEXT,
  p_pack_id             INT,
  p_amount_mxn          NUMERIC,
  p_credits_param       NUMERIC,
  p_validity_days       INT,
  p_note                TEXT,
  p_share_id            TEXT DEFAULT NULL,
  p_share_created_by    UUID DEFAULT NULL,
  p_vendor_role         TEXT DEFAULT NULL,
  p_unlock_price        NUMERIC DEFAULT NULL,
  p_empleado_commission NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  success              BOOLEAN,
  already_processed    BOOLEAN,
  credited             BOOLEAN,
  credits_granted      NUMERIC,
  batch_id             INT,
  share_unlocked       BOOLEAN,
  commission_created   BOOLEAN,
  message              TEXT,
  used_pack_key        TEXT,
  used_pack_id         INT,
  used_amount_mxn      NUMERIC,
  used_validity_days   INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_1 CONSTANT TEXT := 'rubenfiverr612@gmail.com';
  v_admin_2 CONSTANT TEXT := 'rubenvidal612@gmail.com';
  v_max_cap  CONSTANT NUMERIC := 2000;

  v_profile_email  TEXT;
  v_is_admin       BOOLEAN := FALSE;

  v_pack_key       TEXT;
  v_pack_id        INT;
  v_amount_mxn     NUMERIC;
  v_credits        NUMERIC;
  v_validity_days  INT;

  v_profile_credits NUMERIC := 0;
  v_batch_credits   NUMERIC := 0;
  v_total_before    NUMERIC := 0;
  v_allowed         NUMERIC := 0;
  v_purchased_at    TIMESTAMPTZ;
  v_batch_expires   TIMESTAMPTZ;
  v_batch_id        INT;

  v_share_paid      BOOLEAN;
BEGIN
  success              := FALSE;
  already_processed    := FALSE;
  credited             := FALSE;
  credits_granted      := 0;
  batch_id             := NULL;
  share_unlocked       := FALSE;
  commission_created   := FALSE;
  message              := '';
  used_pack_key        := COALESCE(trim(p_pack_key), '');
  used_pack_id         := COALESCE(p_pack_id, 0);
  used_amount_mxn      := COALESCE(p_amount_mxn, 0);
  used_validity_days   := COALESCE(p_validity_days, 0);

  -------------------------------------------------------------------
  -- VALIDACIÓN 0: payment_id no vacío
  -------------------------------------------------------------------
  IF p_payment_id IS NULL OR char_length(trim(p_payment_id)) = 0 THEN
    message := 'payment_id vacío';
    RETURN NEXT;
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- VALIDACIÓN 1: kind válido (solo 3 permitidos)
  -------------------------------------------------------------------
  IF p_kind NOT IN ('mini_pack', 'songs', 'share_unlock') THEN
    message := 'kind inválido (solo mini_pack / songs / share_unlock)';
    RETURN NEXT;
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- VALIDACIÓN 2: share_unlock requiere share_id. Resto requieren user_id.
  -------------------------------------------------------------------
  IF p_kind = 'share_unlock' THEN
    IF p_share_id IS NULL OR char_length(trim(p_share_id)) = 0 THEN
      message := 'share_unlock requiere share_id';
      RETURN NEXT;
      RETURN;
    END IF;
  ELSE
    IF p_user_id IS NULL THEN
      message := 'Falta user_id para acreditar';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -------------------------------------------------------------------
  -- VALIDACIÓN 3: Importe mínimo razonable (para songs/mini_pack/share_unlock)
  -------------------------------------------------------------------
  IF p_kind = 'share_unlock' THEN
    IF COALESCE(p_unlock_price, COALESCE(p_amount_mxn, 0)) <= 0 THEN
      message := 'share_unlock requiere monto unlock_price o amount_mxn';
      RETURN NEXT;
      RETURN;
    END IF;
  ELSE
    IF COALESCE(p_amount_mxn, 0) <= 0 THEN
      message := 'Importe p_amount_mxn debe ser mayor a 0';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -------------------------------------------------------------------
  -- CASO: songs o mini_pack → user_id no NULL (validado arriba)
  -------------------------------------------------------------------
  IF p_kind <> 'share_unlock' THEN
    -- Ensure profile ON CONFLICT DO NOTHING.
    -- SIN referencias estáticas a profiles.credits ni song_balance (nunca existieron como columnas writeable driver usuario).
    INSERT INTO profiles (id, ramber_credits, zingy_credits, credits_expires_at)
    VALUES (p_user_id, 0, 0, NULL)
    ON CONFLICT (id) DO NOTHING;

    -- Admin bypass: emails fijos
    SELECT email INTO v_profile_email FROM auth.users WHERE id = p_user_id;
    v_is_admin := COALESCE(v_profile_email IN (v_admin_1, v_admin_2), FALSE);
  END IF;

  -------------------------------------------------------------------
  -- VALIDACIÓN 4: mini_pack → PACK DEBE EXISTIR EN credit_packs.
  -- NO FALLBACK. SIN EXCEPTION WHEN OTHERS.
  -- Si el pack no existe → error. No se reclama nada. No se duplica.
  -------------------------------------------------------------------
  IF p_kind = 'mini_pack' THEN
    v_pack_key      := COALESCE(trim(p_pack_key), '');
    v_pack_id       := COALESCE(p_pack_id, 0);

    IF char_length(v_pack_key) = 0 AND COALESCE(v_pack_id, 0) <= 0 THEN
      message := 'mini_pack requiere pack_key o pack_id';
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT id, pack_key, credits_amount, price_mxn, validity_days
      INTO v_pack_id, v_pack_key, v_credits, v_amount_mxn, v_validity_days
      FROM credit_packs
     WHERE (char_length(v_pack_key) > 0 AND pack_key = v_pack_key)
        OR (COALESCE(v_pack_id, 0) > 0 AND id = v_pack_id)
     LIMIT 1;

    IF NOT FOUND THEN
      message := 'mini_pack no encontrado en credit_packs (revisa pack_key/pack_id)';
      RETURN NEXT;
      RETURN;
    END IF;

    -- Importe real pagado p_amount_mxn gana sobre credit_packs.price_mxn
    IF COALESCE(p_amount_mxn, 0) > 0 THEN
      v_amount_mxn := p_amount_mxn;
    END IF;

    -- Validez: p_validity_days > 0 gana sobre la tabla
    IF COALESCE(p_validity_days, 0) > 0 THEN
      v_validity_days := p_validity_days;
    END IF;
    IF COALESCE(v_validity_days, 0) <= 0 THEN
      v_validity_days := 60;
    END IF;
  ELSIF p_kind = 'songs' THEN
    v_pack_key      := COALESCE(trim(p_pack_key), '');
    v_pack_id       := COALESCE(p_pack_id, 0);
    v_amount_mxn    := COALESCE(p_amount_mxn, 0);
    v_credits       := COALESCE(p_credits_param, 0);
    v_validity_days := CASE WHEN COALESCE(p_validity_days, 0) > 0 THEN p_validity_days ELSE 60 END;

    -- Si trae pack, intentamos leer de credit_packs (no obligatorio, pero si existe gana)
    IF char_length(v_pack_key) > 0 OR COALESCE(v_pack_id, 0) > 0 THEN
      DECLARE
        v_pack_row RECORD;
      BEGIN
        SELECT id, pack_key, credits_amount, price_mxn, validity_days
          INTO v_pack_row
          FROM credit_packs
         WHERE pack_key = v_pack_key OR id = v_pack_id
         LIMIT 1;
        IF FOUND THEN
          v_pack_key      := COALESCE(v_pack_row.pack_key, v_pack_key);
          v_pack_id       := COALESCE(v_pack_row.id, v_pack_id);
          v_credits       := COALESCE(v_pack_row.credits_amount, v_credits);
          v_validity_days := CASE WHEN COALESCE(p_validity_days, 0) > 0 THEN p_validity_days ELSE COALESCE(v_pack_row.validity_days, v_validity_days) END;
        END IF;
      END;
    END IF;
  END IF;

  used_pack_key      := COALESCE(v_pack_key, used_pack_key);
  used_pack_id       := COALESCE(v_pack_id, used_pack_id);
  used_amount_mxn    := COALESCE(v_amount_mxn, used_amount_mxn);
  used_validity_days := COALESCE(v_validity_days, used_validity_days);

  -------------------------------------------------------------------
  -- Saldo writeable REAL (solo ramber_credits y zingy_credits)
  -- SIN referencias estáticas a credits ni song_balance.
  -------------------------------------------------------------------
  IF p_kind <> 'share_unlock' THEN
    SELECT
      CASE
        WHEN (ramber_credits IS NOT NULL) THEN COALESCE(ramber_credits::numeric, 0)
        WHEN (zingy_credits IS NOT NULL)  THEN COALESCE(zingy_credits::numeric, 0)
        ELSE 0
      END
      INTO v_profile_credits
    FROM profiles
    WHERE id = p_user_id;
  END IF;

  -------------------------------------------------------------------
  -- RECLAMAR PAYMENT_ID (MUTEX ATÓMICO)
  -- Si ya existe → already_processed. NUNCA se ejecuta lo de abajo.
  -------------------------------------------------------------------
  BEGIN
    INSERT INTO mp_payment_claims (payment_id, user_id, kind, pack_key, pack_id, amount_mxn)
    VALUES (
      trim(p_payment_id),
      p_user_id,
      p_kind,
      NULLIF(COALESCE(v_pack_key, ''), ''),
      CASE WHEN COALESCE(v_pack_id, 0) > 0 THEN v_pack_id ELSE NULL END,
      COALESCE(v_amount_mxn, 0)
    );
  EXCEPTION WHEN unique_violation THEN
    already_processed := TRUE;
    success           := TRUE;
    message           := 'ya procesado (idempotente)';
    RETURN NEXT;
    RETURN;
  END;

  -------------------------------------------------------------------
  -- CASO 1: share_unlock (no créditos)
  -------------------------------------------------------------------
  IF p_kind = 'share_unlock' THEN
    UPDATE preview_shares
    SET is_paid = TRUE, paid_at = COALESCE(paid_at, NOW())
    WHERE id = trim(p_share_id)
    RETURNING is_paid INTO v_share_paid;
    IF FOUND THEN share_unlocked := TRUE; END IF;

    IF COALESCE(p_vendor_role, '') = 'empleado'
       AND p_share_created_by IS NOT NULL
       AND COALESCE(p_empleado_commission, 0) > 0 THEN
      INSERT INTO share_commissions (share_id, seller_user_id, role_at_time, product_type, amount_mxn, status)
      VALUES (
        trim(p_share_id),
        p_share_created_by,
        'empleado',
        COALESCE(p_pack_key, 'cancion_generada'),
        COALESCE(p_empleado_commission, 0),
        'pending'
      ) ON CONFLICT DO NOTHING;
      IF FOUND THEN commission_created := TRUE; END IF;
    END IF;

    INSERT INTO mp_transactions (user_id, kind, pack_key, amount_mxn, payment_id)
    VALUES (NULL, 'share_unlock', COALESCE(p_pack_key, 'unknown'), COALESCE(p_unlock_price, p_amount_mxn, 0), trim(p_payment_id));

    UPDATE mp_payment_claims SET
      share_id   = p_share_id,
      claimed_at = NOW()
    WHERE payment_id = trim(p_payment_id);

    success := TRUE;
    message := 'share_unlock procesado';
    RETURN NEXT;
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- CASO 2: mini_pack
  --   CORRECCIÓN #1 DRIVER: NO aumentamos ramber_credits.
  --   ÚNICAMENTE creamos credit_batch.
  --   El consumo ya suma perfil + lotes vía creditsFromProfile / getActiveBatchCredits.
  --   CAP global 2000cr respetado (admins sin cap).
  -------------------------------------------------------------------
  IF p_kind = 'mini_pack' THEN
    SELECT COALESCE(SUM(remaining_credits), 0)
      INTO v_batch_credits
      FROM credit_batches
     WHERE user_id = p_user_id
       AND NOT is_expired
       AND remaining_credits > 0
       AND (expires_at IS NULL OR expires_at > NOW());

    v_total_before := v_profile_credits + v_batch_credits;
    v_allowed := CASE
      WHEN v_is_admin THEN GREATEST(0, COALESCE(v_credits, 0))
      ELSE GREATEST(0, LEAST(COALESCE(v_credits, 0), GREATEST(0, v_max_cap - v_total_before)))
    END;

    -- NO actualizamos profiles. Solo actualizamos la expiración.
    UPDATE profiles
       SET credits_expires_at = NOW() + '60 days'::interval
     WHERE id = p_user_id;

    IF v_allowed > 0 THEN
      v_purchased_at  := NOW();
      v_batch_expires := v_purchased_at + (GREATEST(COALESCE(v_validity_days, 60), 1) || ' days')::interval;
      INSERT INTO credit_batches (
        user_id, pack_id, pack_key, payment_id,
        original_credits, remaining_credits, purchased_at, expires_at, is_expired,
        amount_mxn, note
      ) VALUES (
        p_user_id,
        CASE WHEN COALESCE(v_pack_id, 0) > 0 THEN v_pack_id ELSE NULL END,
        NULLIF(v_pack_key, ''),
        trim(p_payment_id),
        v_allowed, v_allowed,
        v_purchased_at, v_batch_expires, FALSE,
        COALESCE(v_amount_mxn, 0),
        CASE
          WHEN v_allowed < COALESCE(v_credits, 0)
            THEN COALESCE(p_note, 'Compra Mercado Pago') || ' (cap 2000)'
          ELSE COALESCE(p_note, 'Compra Mercado Pago ' || trim(p_payment_id))
        END
      ) RETURNING id INTO v_batch_id;

      batch_id        := v_batch_id;
      credited        := TRUE;
      credits_granted := v_allowed;
    END IF;

    INSERT INTO mp_transactions (user_id, kind, pack_key, amount_mxn, payment_id)
    VALUES (p_user_id, 'mini_pack', COALESCE(v_pack_key, 'unknown'), COALESCE(v_amount_mxn, 0), trim(p_payment_id));

    UPDATE mp_payment_claims SET
      pack_key        = COALESCE(v_pack_key, pack_key),
      pack_id         = CASE WHEN COALESCE(v_pack_id, 0) > 0 THEN v_pack_id ELSE pack_id END,
      amount_mxn      = COALESCE(v_amount_mxn, amount_mxn),
      credits_granted = COALESCE(v_allowed, credits_granted),
      batch_id        = v_batch_id,
      claimed_at      = NOW()
    WHERE payment_id = trim(p_payment_id);

    success := TRUE;
    message := 'mini_pack procesado (solo credit_batch)';
    RETURN NEXT;
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- CASO 3: songs (inicio / productor / masterizar / ajuste directo)
  --   CORRECCIÓN #2 DRIVER: SOLO actualizamos ramber_credits.
  --   NO creamos credit_batch.
  -------------------------------------------------------------------
  IF p_kind = 'songs' THEN
    IF COALESCE(v_credits, 0) > 0 THEN
      DECLARE
        v_saldo_actual NUMERIC := COALESCE(v_profile_credits, 0);
        v_saldo_nuevo  NUMERIC := GREATEST(0, v_saldo_actual + COALESCE(v_credits, 0));
      BEGIN
        UPDATE profiles
           SET credits_expires_at = NOW() + (GREATEST(COALESCE(v_validity_days, 60), 1) || ' days')::interval,
               ramber_credits     = CASE WHEN ramber_credits IS NOT NULL THEN v_saldo_nuevo ELSE ramber_credits END,
               zingy_credits      = CASE WHEN ramber_credits IS NULL AND zingy_credits IS NOT NULL THEN v_saldo_nuevo ELSE zingy_credits END
         WHERE id = p_user_id;
      END;
      credited        := TRUE;
      credits_granted := COALESCE(v_credits, 0);
    ELSE
      -- Aún sin créditos, actualizamos expiración (planes grandes lo usan)
      UPDATE profiles
         SET credits_expires_at = NOW() + (GREATEST(COALESCE(v_validity_days, 60), 1) || ' days')::interval
       WHERE id = p_user_id;
    END IF;

    INSERT INTO mp_transactions (user_id, kind, pack_key, amount_mxn, payment_id)
    VALUES (p_user_id, 'songs', COALESCE(v_pack_key, 'unknown'), COALESCE(v_amount_mxn, 0), trim(p_payment_id));

    UPDATE mp_payment_claims SET
      pack_key        = COALESCE(v_pack_key, pack_key),
      pack_id         = CASE WHEN COALESCE(v_pack_id, 0) > 0 THEN v_pack_id ELSE pack_id END,
      amount_mxn      = COALESCE(v_amount_mxn, amount_mxn),
      credits_granted = COALESCE(credits_granted, 0),
      claimed_at      = NOW()
    WHERE payment_id = trim(p_payment_id);

    success := TRUE;
    message := 'songs / plan procesado (solo ramber_credits, sin lote)';
    RETURN NEXT;
    RETURN;
  END IF;

  message := 'kind sin manejar (no debería llegar aquí)';
  RETURN NEXT;
  RETURN;
END;
$$;

-- ============================================================
-- PASO 3: PRIVACIDAD (SERVICE ROLE ÚNICAMENTE)
--   - REVOKE nombre COMPLETO con TODOS los tipos.
--   - SOLO service_role tiene EXECUTE. (postgres REMOVIDO como lo pediste)
--   - Tabla mp_payment_claims: SOLO service_role accede.
-- ============================================================
REVOKE ALL ON FUNCTION mp_claim_payment_transaction(
  TEXT,UUID,TEXT,TEXT,INT,NUMERIC,NUMERIC,INT,TEXT,TEXT,UUID,TEXT,NUMERIC,NUMERIC
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE mp_payment_claims FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION mp_claim_payment_transaction(
  TEXT,UUID,TEXT,TEXT,INT,NUMERIC,NUMERIC,INT,TEXT,TEXT,UUID,TEXT,NUMERIC,NUMERIC
) TO service_role;

GRANT ALL ON TABLE mp_payment_claims TO service_role;
