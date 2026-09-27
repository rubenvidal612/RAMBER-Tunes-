-- ============================================================
-- MIGRACIÓN: Protección idempotente Mercado Pago 1 payment_id = 1 acreditación
-- Objetivo: Impedir RACE CONDITION (10-14 webhooks simultáneos → 10-14 lotes).
-- Motor: PostgreSQL 15+ Supabase
-- Autor: Rubén (automático)
-- ============================================================
--
-- PASO 0 (PREVIO OBLIGATORIO ANTES DE APLICAR ÍNDICE UNIQUE):
--   Hay payment_id DUPLICADOS históricos (mismo id 2/10/14 filas). No puedes
--   crear UNIQUE(payment_id) si existen duplicados. Primero limpia.
--   ESTE BLOQUE LO EJECUTAS TÚ MANUALMENTE SI ES NECESARIO (una sola vez):
--
--   BEGIN;
--   -- (Opcional) Respalda antes:
--   -- CREATE TABLE mp_transactions_backup_20260926 AS TABLE mp_transactions;
--   DELETE FROM mp_transactions
--   WHERE id NOT IN (
--     SELECT MIN(id) FROM mp_transactions GROUP BY payment_id
--   );
--   -- Verifica: SELECT payment_id, COUNT(*) FROM mp_transactions GROUP BY payment_id HAVING COUNT(*) > 1;
--   -- Debe retornar 0 filas. Si sale 0 → COMMIT. Si no → ROLLBACK y revisa.
--   COMMIT;
-- ============================================================

-- Paso 1: Restricción ÚNICA a nivel base de datos. ESTA ES LA PROTECCIÓN REAL.
-- Ningún INSERT en mp_transactions podrá meter el mismo payment_id DOS VECES.
CREATE UNIQUE INDEX IF NOT EXISTS uk_mp_transactions_payment_id
  ON mp_transactions (payment_id);

-- ============================================================
-- Paso 2: RPC transaccional. LOS TRES CAMINOS (webhook / verify / confirm-manual)
-- llaman EXACTAMENTE a ESTA FUNCIÓN y NUNCA más hacen SELECT exists + INSERT separado.
--
-- CONTRATO:
--  - Si p_payment_id YA FUE PROCESADO (existe en mp_transactions) → retorna already_processed=TRUE
--    y NO HACE NADA (0 updates, 0 inserts). Idempotente.
--  - Si p_payment_id NUNCA fue procesado → DENTRO DE UNA MISMA TRANSACCIÓN (BEGIN…COMMIT implícito):
--      a. Inserta 1 fila en mp_transactions (reclama payment_id). Si falla por duplicado → already_processed.
--      b. Según p_kind:
--         * 'mini_pack'    → INSERT credit_batches (UN lote) + UPDATE profiles SET ramber_credits / credits_expires_at.
--                             Respeta CAP global 2000 créditos, columna preferida ramber_credits, admin = sin cap.
--         * 'songs'        → Solo reclama payment_id; applyCreditRolloverWithCap / mastering lo hace el handler JS.
--         * 'share_unlock' → UPDATE preview_shares SET is_paid=true; INSERT share_commissions si role='empleado'.
--      c. COMMIT. Todo o nada.
--
-- NO TOCA:
--   - Suno / Mureka / clonación / library_items / etc.
--   - NO elimina saldos / NO hace refunds.
--   - NO usa columna profiles.credits (obsoleta) - SOLO ramber_credits.
-- ============================================================

CREATE OR REPLACE FUNCTION mp_claim_payment_transaction(
  p_payment_id        TEXT,       -- Obligatorio. Mercado Pago payment_id.
  p_user_id           UUID,       -- Obligatorio excepto share_unlock (puede ser NULL si es share/vendor).
  p_kind              TEXT,       -- 'mini_pack' | 'songs' | 'share_unlock'
  p_pack_key          TEXT,       -- pack_key créditos (chico_10, inicio, productor, etc.) | product_type para share_unlock
  p_pack_id           INT,        -- id tabla credit_packs (NULL si n/a)
  p_amount_mxn        NUMERIC,    -- Monto pagado MXN
  p_credits           NUMERIC,    -- Cantidad de créditos a otorgar (0 si share_unlock)
  p_validity_days     INT,        -- Vigencia del lote (default 60 para mini_pack)
  p_note              TEXT,       -- Nota descriptiva lote/transacción
  p_share_id          TEXT DEFAULT NULL, -- SOLO share_unlock: id preview_shares
  p_share_created_by  UUID DEFAULT NULL, -- SOLO share_unlock: user_id del vendedor
  p_vendor_role       TEXT DEFAULT NULL, -- SOLO share_unlock: 'vendor' | 'empleado'
  p_unlock_price      NUMERIC DEFAULT NULL, -- SOLO share_unlock: precio producto
  p_empleado_commission NUMERIC DEFAULT NULL -- SOLO share_unlock: comisión empleado MXN
)
RETURNS TABLE (
  success              BOOLEAN,
  already_processed    BOOLEAN,
  credited             BOOLEAN,
  credits_granted      NUMERIC,
  batch_id             INT,
  share_unlocked       BOOLEAN,
  commission_created   BOOLEAN,
  message              TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp_tx_id       INT;
  v_col            TEXT;
  v_admin_1        TEXT := 'rubenfiverr612@gmail.com';
  v_admin_2        TEXT := 'rubenvidal612@gmail.com';
  v_profile_email  TEXT;
  v_is_admin       BOOLEAN;
  v_current        NUMERIC;
  v_max_cap        NUMERIC := 2000; -- MAX_ACCUMULATED_CREDITS (mismo valor que TS L28)
  v_profile_credits NUMERIC;
  v_batch_credits   NUMERIC;
  v_total_before    NUMERIC;
  v_allowed         NUMERIC;
  v_purchased_at    TIMESTAMPTZ;
  v_batch_expires   TIMESTAMPTZ;
  v_batch_id        INT;
  v_share_paid      BOOLEAN;
BEGIN
  success            := FALSE;
  already_processed  := FALSE;
  credited           := FALSE;
  credits_granted    := 0;
  batch_id           := NULL;
  share_unlocked     := FALSE;
  commission_created := FALSE;
  message            := '';

  IF p_payment_id IS NULL OR char_length(trim(p_payment_id)) = 0 THEN
    message := 'payment_id vacío';
    RETURN NEXT;
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- PASO A: Reclamar payment_id A-TÓ-MI-CA-MEN-TE.
  -- El índice UNIQUE uk_mp_transactions_payment_id garantiza que
  -- DOS llamadas simultáneas NUNCA pasen este paso. Una gana, la otra
  -- se va por EXCEPTION duplicate key value → already_processed.
  -------------------------------------------------------------------
  BEGIN
    INSERT INTO mp_transactions (user_id, kind, pack_key, amount_mxn, payment_id)
    VALUES (
      p_user_id,
      COALESCE(p_kind, 'unknown'),
      COALESCE(p_pack_key, 'unknown'),
      COALESCE(p_amount_mxn, 0),
      trim(p_payment_id)
    )
    RETURNING id INTO v_mp_tx_id;
  EXCEPTION WHEN unique_violation THEN
    -- Otro proceso paralelo ya ganó. Idempotente → ya procesado.
    already_processed := TRUE;
    success           := TRUE;
    message           := 'ya procesado (idempotente)';
    RETURN NEXT;
    RETURN;
  END;

  IF v_mp_tx_id IS NULL THEN
    already_processed := TRUE;
    success           := TRUE;
    message           := 'payment_id ya reclamado';
    RETURN NEXT;
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- CASO 1: share_unlock (no créditos, solo marcar cancion desbloqueada + comisión empleado)
  -------------------------------------------------------------------
  IF p_kind = 'share_unlock' THEN
    IF p_share_id IS NULL THEN
      success := TRUE;
      message := 'share_unlock sin share_id (claim ok, nada que actualizar)';
      RETURN NEXT;
      RETURN;
    END IF;

    -- Marcar preview_shares pagado (idempotente: si ya está is_paid, no pasa nada)
    UPDATE preview_shares
    SET is_paid = TRUE, paid_at = COALESCE(paid_at, NOW())
    WHERE id = trim(p_share_id)
    RETURNING is_paid INTO v_share_paid;

    IF FOUND THEN
      share_unlocked := TRUE;
    END IF;

    -- Si role=empleado, registrar comisión share_commissions (idempotente: ON CONFLICT nada)
    IF COALESCE(p_vendor_role, '') = 'empleado'
       AND p_share_created_by IS NOT NULL
       AND COALESCE(p_empleado_commission, 0) > 0 THEN
      INSERT INTO share_commissions (share_id, seller_user_id, role_at_time, product_type, amount_mxn, status)
      VALUES (trim(p_share_id), p_share_created_by, 'empleado', COALESCE(p_pack_key, 'cancion_generada'), COALESCE(p_empleado_commission, 0), 'pending')
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        commission_created := TRUE;
      END IF;
    END IF;

    success := TRUE;
    message := 'share_unlock procesado';
    RETURN NEXT;
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- Resto de casos (mini_pack / songs) requieren user_id
  -------------------------------------------------------------------
  IF p_user_id IS NULL THEN
    success := FALSE;
    message := 'Falta user_id para acreditar';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Columna SALDO REAL (SOLO ramber_credits, nunca profiles.credits obsoleto)
  v_col := 'ramber_credits';

  -- Admin check (mismo bypass que TS)
  SELECT email INTO v_profile_email FROM auth.users WHERE id = p_user_id;
  v_is_admin := COALESCE(v_profile_email IN (v_admin_1, v_admin_2), FALSE);

  -- Asegura profile si no existe (mismo ensureProfileExists en TS)
  INSERT INTO profiles (id, ramber_credits, zingy_credits, credits, song_balance, credits_expires_at)
  VALUES (p_user_id, 0, 0, 0, 0, NULL)
  ON CONFLICT (id) DO NOTHING;

  SELECT COALESCE((profiles.ramber_credits)::numeric, 0)
  INTO v_profile_credits
  FROM profiles WHERE id = p_user_id;

  -------------------------------------------------------------------
  -- CASO 2: mini_pack (chico_10 $70 etc) → 1 lote credit_batches + actualiza saldo
  -------------------------------------------------------------------
  IF p_kind = 'mini_pack' THEN
    -- Suma de lotes ACTIVOS (no expirados, con remanente) para el CAP global
    SELECT COALESCE(SUM(remaining_credits), 0)
    INTO v_batch_credits
    FROM credit_batches
    WHERE user_id = p_user_id
      AND NOT is_expired
      AND remaining_credits > 0
      AND (expires_at IS NULL OR expires_at > NOW());

    v_total_before := v_profile_credits + v_batch_credits;

    v_allowed := CASE
      WHEN v_is_admin THEN GREATEST(0, COALESCE(p_credits, 0))
      ELSE GREATEST(0, LEAST(COALESCE(p_credits, 0), GREATEST(0, v_max_cap - v_total_before)))
    END;

    -- Actualizar expiración 60 días siempre (mismo TS)
    UPDATE profiles SET credits_expires_at = NOW() + '60 days'::interval WHERE id = p_user_id;

    IF v_allowed > 0 THEN
      v_purchased_at  := NOW();
      v_batch_expires := v_purchased_at + (COALESCE(p_validity_days, 60) || ' days')::interval;
      INSERT INTO credit_batches (
        user_id, pack_id, pack_key, payment_id,
        original_credits, remaining_credits, purchased_at, expires_at, is_expired,
        amount_mxn, note
      ) VALUES (
        p_user_id,
        CASE WHEN COALESCE(p_pack_id, 0) > 0 THEN p_pack_id ELSE NULL END,
        NULLIF(trim(COALESCE(p_pack_key, '')), ''),
        trim(p_payment_id),
        v_allowed, v_allowed,
        v_purchased_at, v_batch_expires, FALSE,
        COALESCE(p_amount_mxn, 0),
        CASE
          WHEN v_allowed < COALESCE(p_credits, 0) THEN COALESCE(p_note, 'Compra Mercado Pago') || ' (cap 2000)'
          ELSE COALESCE(p_note, 'Compra Mercado Pago ' || trim(p_payment_id))
        END
      ) RETURNING id INTO v_batch_id;

      batch_id        := v_batch_id;
      credited        := TRUE;
      credits_granted := v_allowed;
    END IF;

    success := TRUE;
    message := 'mini_pack procesado';
    RETURN NEXT;
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- CASO 3: songs (plan inicio / productor / masterizar / ajuste directo)
  -- El pago se reclama (mp_transactions insert). Los ajustes de plan o
  -- suscripción de masterización los realiza el handler JS por claridad.
  -- Si vienen créditos > 0 → actualiza saldo ramber_credits directo (fallback)
  -------------------------------------------------------------------
  IF p_kind = 'songs' AND COALESCE(p_credits, 0) > 0 THEN
    v_current := v_profile_credits;
    UPDATE profiles
    SET ramber_credits        = v_current + COALESCE(p_credits, 0),
        credits_expires_at    = NOW() + '60 days'::interval
    WHERE id = p_user_id;
    credited        := TRUE;
    credits_granted := COALESCE(p_credits, 0);
  END IF;

  success := TRUE;
  message := COALESCE(message, 'songs / plan procesado (reclamo payment_id OK)');
  RETURN NEXT;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION mp_claim_payment_transaction(TEXT,UUID,TEXT,TEXT,INT,NUMERIC,NUMERIC,INT,TEXT,TEXT,UUID,TEXT,NUMERIC,NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION mp_claim_payment_transaction(TEXT,UUID,TEXT,TEXT,INT,NUMERIC,NUMERIC,INT,TEXT,TEXT,UUID,TEXT,NUMERIC,NUMERIC) TO postgres;
