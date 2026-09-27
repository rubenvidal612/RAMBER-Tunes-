-- ============================================================
-- MIGRACIÓN: Protección idempotente Mercado Pago 1 payment_id = 1 acreditación
-- Solución: tabla nueva mp_payment_claims (payment_id PK) + RPC privada.
-- Reglas cumplidas:
--   1. NO BORRA datos históricos (ningún DELETE sobre mp_transactions/credit_batches/profiles).
--   2. mp_payment_claims con payment_id TEXT PRIMARY KEY.
--   3. 1 sola transacción: reclamar → acreditar → registrar mp_transacción + credit_batch.
--   4. RPC PRIVADA: REVOKE PUBLIC/anon/authenticated; EXECUTE solo service_role (+ postgres).
--   5. NO usa profiles.credits (obsoleto): SOLO actualiza ramber_credits / credits_expires_at / song_balance cuando corresponda.
--   6. chico_10 y demás packs leen créditos DIRECTAMENTE de la tabla credit_packs (credit_packs.credits_amount, credit_packs.validity_days, credit_packs.price_mxn).
--   7. No dependes de créditos por parámetro (solo se usa como fallback si el pack no se encuentra en credit_packs; pero si existe credit_packs, este gana).
-- ============================================================

-- ============================================================
-- PASO 1: Tabla de claims (payment_id PRIMARY KEY)
--         NUNCA insertaremos 2 filas con mismo payment_id.
--         Esta es nuestra fila de mutex atómico, sin tocar mp_transactions histórico.
-- ============================================================
CREATE TABLE IF NOT EXISTS mp_payment_claims (
  payment_id       TEXT PRIMARY KEY,          -- Mutex atómico Postgres
  user_id          UUID,                      -- (NULL si es share_unlock del vendor)
  kind             TEXT NOT NULL,             -- 'mini_pack' | 'songs' | 'share_unlock'
  pack_key         TEXT,                      -- pack_key credit_packs o product_type
  pack_id          BIGINT,                    -- id credit_packs
  amount_mxn       NUMERIC(10,2) DEFAULT 0,   -- Monto real pagado
  credits_granted  NUMERIC(12,2) DEFAULT 0,   -- Créditos reales otorgados (0 si share unlock)
  batch_id         BIGINT,                    -- id del lote credit_batches (0 si n/a)
  share_id         TEXT,                      -- id preview_shares (share unlock)
  claimed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mp_payment_claims_user ON mp_payment_claims(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mp_payment_claims_pack ON mp_payment_claims(pack_key);

ALTER TABLE mp_payment_claims ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PASO 2: RPC transaccional
-- ============================================================
CREATE OR REPLACE FUNCTION mp_claim_payment_transaction(
  p_payment_id        TEXT,
  p_user_id           UUID,
  p_kind              TEXT,
  p_pack_key          TEXT,
  p_pack_id           INT,
  p_amount_mxn        NUMERIC,
  p_credits_param     NUMERIC,
  p_validity_days     INT,
  p_note              TEXT,
  p_share_id          TEXT DEFAULT NULL,
  p_share_created_by  UUID DEFAULT NULL,
  p_vendor_role       TEXT DEFAULT NULL,
  p_unlock_price      NUMERIC DEFAULT NULL,
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
  -- Columnas informativas extra (para debug en logs)
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
  v_max_cap  CONSTANT NUMERIC := 2000;    -- MAX_ACCUMULATED_CREDITS (mismo TS L28)

  v_profile_email  TEXT;
  v_is_admin       BOOLEAN;

  -- Valores REALES usados (credits_amount desde credit_packs si existe, gana sobre parámetro)
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
  used_pack_key        := COALESCE(p_pack_key, '');
  used_pack_id         := COALESCE(p_pack_id, 0);
  used_amount_mxn      := COALESCE(p_amount_mxn, 0);
  used_validity_days   := COALESCE(p_validity_days, 0);

  IF p_payment_id IS NULL OR char_length(trim(p_payment_id)) = 0 THEN
    message := 'payment_id vacío';
    RETURN NEXT;
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- PASO A: Reclamar payment_id A-TÓ-MI-CA-MEN-TE en tabla nueva.
  -- pk mp_payment_claims(payment_id) garantiza que DOS llamadas
  -- simultáneas NUNCA pasen. Una gana. Otra → already_processed.
  -- NO TOCAMOS mp_transactions HISTÓRICO (no eliminamos filas).
  -------------------------------------------------------------------
  BEGIN
    INSERT INTO mp_payment_claims (payment_id, user_id, kind, pack_key, pack_id, amount_mxn)
    VALUES (
      trim(p_payment_id),
      p_user_id,
      COALESCE(p_kind, 'unknown'),
      NULLIF(trim(COALESCE(p_pack_key, '')), ''),
      CASE WHEN COALESCE(p_pack_id, 0) > 0 THEN p_pack_id ELSE NULL END,
      COALESCE(p_amount_mxn, 0)
    );
  EXCEPTION WHEN unique_violation THEN
    already_processed := TRUE;
    success           := TRUE;
    message           := 'ya procesado (idempotente)';
    RETURN NEXT;
    RETURN;
  END;

  -------------------------------------------------------------------
  -- CASO 1: share_unlock (no créditos; solo marcar preview pagado + comisión empleado)
  -------------------------------------------------------------------
  IF p_kind = 'share_unlock' THEN
    IF p_share_id IS NOT NULL THEN
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
    END IF;

    -- Registrar en mp_transactions (HISTÓRICO sin tocar existentes)
    INSERT INTO mp_transactions (user_id, kind, pack_key, amount_mxn, payment_id)
    VALUES (NULL, 'share_unlock', COALESCE(p_pack_key, 'unknown'), COALESCE(p_unlock_price, p_amount_mxn, 0), trim(p_payment_id));

    UPDATE mp_payment_claims SET
      share_id = p_share_id,
      claimed_at = NOW()
    WHERE payment_id = trim(p_payment_id);

    success := TRUE;
    message := 'share_unlock procesado';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Resto (songs / mini_pack) → requiere user_id
  IF p_user_id IS NULL THEN
    message := 'Falta user_id para acreditar';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Admin bypass (mismo criterio TS: emails)
  SELECT email INTO v_profile_email FROM auth.users WHERE id = p_user_id;
  v_is_admin := COALESCE(v_profile_email IN (v_admin_1, v_admin_2), FALSE);

  -- Ensure profile si no existe (nunca falla, ON CONFLICT DO NOTHING)
  INSERT INTO profiles (id, ramber_credits, zingy_credits, credits, song_balance, credits_expires_at)
  VALUES (p_user_id, 0, 0, 0, 0, NULL)
  ON CONFLICT (id) DO NOTHING;

  -------------------------------------------------------------------
  -- Paso B: Si pack_key existe en credit_packs → VALORES REALES DESDE TABLA.
  -- Regla 6 del usuario: chico_10 y demás NO confían en parámetro; leen de credit_packs.
  -- Si el pack NO está en credit_packs → fallback al parámetro.
  -------------------------------------------------------------------
  v_pack_key      := COALESCE(trim(COALESCE(p_pack_key, '')), '');
  v_pack_id       := COALESCE(p_pack_id, 0);
  v_amount_mxn    := COALESCE(p_amount_mxn, 0);
  v_credits       := COALESCE(p_credits_param, 0);
  v_validity_days := COALESCE(p_validity_days, 0);

  IF char_length(v_pack_key) > 0 OR v_pack_id > 0 THEN
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
        v_amount_mxn    := CASE WHEN COALESCE(p_amount_mxn, 0) <= 0 THEN COALESCE(v_pack_row.price_mxn, 0) ELSE COALESCE(p_amount_mxn, 0) END;
        v_credits       := COALESCE(v_pack_row.credits_amount, v_credits);
        v_validity_days := CASE WHEN COALESCE(p_validity_days, 0) <= 0 THEN COALESCE(v_pack_row.validity_days, v_validity_days) ELSE COALESCE(p_validity_days, v_validity_days) END;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  used_pack_key      := v_pack_key;
  used_pack_id       := v_pack_id;
  used_amount_mxn    := v_amount_mxn;
  used_validity_days := v_validity_days;

  -- Saldo real: RAMBER_CREDITS como writeable (regla 3 + confirmado)
  -- Intentamos ramber_credits primero, luego zingy_credits si no existiera,
  -- luego credits (obsoleto) y song_balance como último. (igual que pickWritableCreditsColumn).
  -- Nunca escribimos en profiles.credits.
  SELECT
    CASE
      WHEN (ramber_credits IS NOT NULL) THEN COALESCE(ramber_credits::numeric, 0)
      WHEN (zingy_credits IS NOT NULL) THEN COALESCE(zingy_credits::numeric, 0)
      WHEN (credits IS NOT NULL)       THEN COALESCE(credits::numeric, 0)
      WHEN (song_balance IS NOT NULL)  THEN COALESCE((song_balance::numeric) * 12, 0)  -- song_balance en #canciones → 12 créditos/cancion
      ELSE 0
    END
    INTO v_profile_credits
  FROM profiles
  WHERE id = p_user_id;

  -------------------------------------------------------------------
  -- CASO 2: mini_pack (chico_10 $70 etc) → 1 solo lote credit_batches + actualizar saldo.
  -------------------------------------------------------------------
  IF p_kind = 'mini_pack' THEN
    -- Batch activos (créditos pendientes de gastar)
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

    -- Actualizamos saldo 60 días y columna writeable.
    DECLARE
      v_saldo_actual NUMERIC := COALESCE(v_profile_credits, 0);
      v_saldo_nuevo  NUMERIC := GREATEST(0, v_saldo_actual + v_allowed);
    BEGIN
      UPDATE profiles
         SET credits_expires_at = NOW() + '60 days'::interval,
             ramber_credits     = CASE
               WHEN ramber_credits IS NOT NULL THEN v_saldo_nuevo  -- columna REAL y writeable
               ELSE ramber_credits
             END,
             -- Si NO existiera ramber_credits (schema antiguo), fallback a zingy_credits:
             zingy_credits = CASE
               WHEN ramber_credits IS NULL AND zingy_credits IS NOT NULL THEN v_saldo_nuevo
               ELSE zingy_credits
             END,
             -- Si NO existieran las anteriores (muy schema viejo), fallback a credits:
             credits = CASE
               WHEN ramber_credits IS NULL AND zingy_credits IS NULL AND credits IS NOT NULL THEN v_saldo_nuevo
               ELSE credits
             END
       WHERE id = p_user_id;
    END;

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

    -- Registrar 1 SOLA transacción mp (reclamamos payment_id único NO TOCANDO HISTÓRICO)
    INSERT INTO mp_transactions (user_id, kind, pack_key, amount_mxn, payment_id)
    VALUES (p_user_id, 'mini_pack', COALESCE(v_pack_key, 'unknown'), COALESCE(v_amount_mxn, 0), trim(p_payment_id));

    UPDATE mp_payment_claims SET
      pack_key = COALESCE(v_pack_key, pack_key),
      pack_id  = CASE WHEN COALESCE(v_pack_id, 0) > 0 THEN v_pack_id ELSE pack_id END,
      amount_mxn = COALESCE(v_amount_mxn, amount_mxn),
      credits_granted = COALESCE(v_allowed, credits_granted),
      batch_id = v_batch_id,
      claimed_at = NOW()
    WHERE payment_id = trim(p_payment_id);

    success := TRUE;
    message := 'mini_pack procesado';
    RETURN NEXT;
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- CASO 3: songs (inicio / productor / masterizar / ajuste directo)
  -- Reclama. Créditos directos en saldo ramber_credits. Rollover masterización/inicio lo hace el handler JS DESPUÉS.
  -------------------------------------------------------------------
  IF COALESCE(v_credits, 0) > 0 THEN
    DECLARE
      v_saldo_actual NUMERIC := COALESCE(v_profile_credits, 0);
      v_saldo_nuevo  NUMERIC := GREATEST(0, v_saldo_actual + COALESCE(v_credits, 0));
    BEGIN
      UPDATE profiles
         SET credits_expires_at = NOW() + '60 days'::interval,
             ramber_credits     = CASE WHEN ramber_credits IS NOT NULL THEN v_saldo_nuevo ELSE ramber_credits END,
             zingy_credits      = CASE WHEN ramber_credits IS NULL AND zingy_credits IS NOT NULL THEN v_saldo_nuevo ELSE zingy_credits END,
             credits            = CASE WHEN ramber_credits IS NULL AND zingy_credits IS NULL AND credits IS NOT NULL THEN v_saldo_nuevo ELSE credits END
       WHERE id = p_user_id;
    END;
    credited        := TRUE;
    credits_granted := COALESCE(v_credits, 0);
  END IF;

  INSERT INTO mp_transactions (user_id, kind, pack_key, amount_mxn, payment_id)
  VALUES (p_user_id, 'songs', COALESCE(v_pack_key, 'unknown'), COALESCE(v_amount_mxn, 0), trim(p_payment_id));

  UPDATE mp_payment_claims SET
    pack_key = COALESCE(v_pack_key, pack_key),
    pack_id  = CASE WHEN COALESCE(v_pack_id, 0) > 0 THEN v_pack_id ELSE pack_id END,
    amount_mxn = COALESCE(v_amount_mxn, amount_mxn),
    credits_granted = COALESCE(credits_granted, 0),
    batch_id = v_batch_id,
    claimed_at = NOW()
  WHERE payment_id = trim(p_payment_id);

  success := TRUE;
  message := COALESCE(message, 'songs / plan procesado (reclamo OK)');
  RETURN NEXT;
  RETURN;
END;
$$;

-- ============================================================
-- PASO 3: PRIVACIDAD (regla 4 usuario).
--   - REVOKE EXECUTE a PUBLIC, anon y authenticated.
--   - SOLO service_role y postgres pueden llamarla (backend server-only).
-- ============================================================
REVOKE ALL ON FUNCTION mp_claim_payment_transaction FROM PUBLIC;
REVOKE ALL ON FUNCTION mp_claim_payment_transaction FROM anon;
REVOKE ALL ON FUNCTION mp_claim_payment_transaction FROM authenticated;
REVOKE ALL ON TABLE mp_payment_claims FROM anon;
REVOKE ALL ON TABLE mp_payment_claims FROM authenticated;
GRANT EXECUTE ON FUNCTION mp_claim_payment_transaction(TEXT,UUID,TEXT,TEXT,INT,NUMERIC,NUMERIC,INT,TEXT,TEXT,UUID,TEXT,NUMERIC,NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION mp_claim_payment_transaction(TEXT,UUID,TEXT,TEXT,INT,NUMERIC,NUMERIC,INT,TEXT,TEXT,UUID,TEXT,NUMERIC,NUMERIC) TO postgres;
GRANT ALL ON TABLE mp_payment_claims TO service_role;
GRANT ALL ON TABLE mp_payment_claims TO postgres;
GRANT SELECT ON TABLE mp_payment_claims TO service_role;
GRANT INSERT ON TABLE mp_payment_claims TO service_role;
GRANT UPDATE ON TABLE mp_payment_claims TO service_role;
