-- ============================================================================
-- MIGRACIÓN v2 CORREGIDA: RECOMPENSAS DE AFILIADOS EN CRÉDITOS
-- (reemplaza el pago en efectivo del sistema viejo)
--
-- PUNTOS OBLIGATORIOS APLICADOS:
--   1. affiliate_commissions NUEVAS COLUMNAS: reward_credits, reward_batch_id, reversed_at.
--      amount_mxn conserva el MONTO REAL DE LA COMPRA (nunca créditos).
--   2. RPC NO CONFÍA EN JS: resuelve affiliate_user_id por affiliate_referrals,
--      rechaza autorreferidos, valida auth.users (existencia, banned_until,
--      last_sign_in_at < 60 días).
--   3. pg_advisory_xact_lock(hashtextextended(affiliate_user_id::text, 0))
--      ANTES de calcular el CAP 2000 (anti-race-condition).
--   4. Valida ORIGEN real: payment_id existe en mp_payment_claims (aprobado),
--      user_id coincide, kind <> 'share_unlock', tier por kind+pack_key+amount.
--   5. Claim + CAP + credit_batch + actualización reward_* = UNA sola RPC.
--   6. payment_id UNIQUE (idempotencia). pack_key='affiliate_reward', 60 días.
--   7. Reversión idempotente: solo afecta lote affiliate_reward, nunca <0,
--      marca status='reversed' y reversed_at.
--   8. SECURITY DEFINER, search_path seguro, REVOKE PUBLIC/anon/authenticated,
--      GRANT solo a service_role.
--   9. Ningún money_transfer, ningún payout_email write (neutralizado en JS).
--      Nada de histórico se borra.
--
-- IDEMPOTENTE: ejecuta N veces sin error (CREATE OR REPLACE, IF NOT EXISTS).
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 0) Garantizar tablas base afiliados (replicar createTablesSql autocontenido).
--    NUNCA se borran filas históricas.
-- ============================================================================
create table if not exists public.affiliate_accounts (
  user_id uuid primary key,
  code text unique not null,
  payout_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null,
  referred_user_id uuid not null unique,
  referred_full_name text,
  created_at timestamptz default now()
);

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null,
  referred_user_id uuid not null,
  payment_id text not null unique,
  pack_key text,
  amount_mxn numeric default 0,
  status text default 'pending',
  detail text,
  payout_payment_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.affiliate_accounts enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.affiliate_commissions enable row level security;

drop policy if exists "affiliate_accounts_select_own" on public.affiliate_accounts;
create policy "affiliate_accounts_select_own" on public.affiliate_accounts for select to authenticated using (auth.uid() = user_id);
drop policy if exists "affiliate_accounts_update_own" on public.affiliate_accounts;
create policy "affiliate_accounts_update_own" on public.affiliate_accounts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "affiliate_referrals_select_own" on public.affiliate_referrals;
create policy "affiliate_referrals_select_own" on public.affiliate_referrals for select to authenticated using (auth.uid() = affiliate_user_id);

drop policy if exists "affiliate_commissions_select_own" on public.affiliate_commissions;
create policy "affiliate_commissions_select_own" on public.affiliate_commissions for select to authenticated using (auth.uid() = affiliate_user_id);

-- ============================================================================
-- 1) NUEVAS COLUMNAS en affiliate_commissions (punto 1 de correcciones).
--    amount_mxn = monto real compra.  reward_credits = créditos entregados.
-- ============================================================================
alter table public.affiliate_commissions
  add column if not exists reward_credits numeric(12,2) default 0;

alter table public.affiliate_commissions
  add column if not exists reward_batch_id bigint;

alter table public.affiliate_commissions
  add column if not exists reversed_at timestamptz;

-- ============================================================================
-- 2) RPC #1: grant_affiliate_credit_reward(p_payment_id)
--    SOLO service_role. Todo se resuelve INTERNAMENTE (regla 2, 4).
--    Un solo payment_id → UNA sola transacción (regla 5).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.grant_affiliate_credit_reward(
  p_payment_id TEXT
)
RETURNS TABLE (
  success           BOOLEAN,
  already_processed BOOLEAN,
  reward_credits    NUMERIC,
  rewarded          BOOLEAN,
  tier_amount_mxn   NUMERIC,
  detail            TEXT,
  message           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_email      CONSTANT TEXT    := 'rubenfiverr612@gmail.com';
  v_max_cap          CONSTANT NUMERIC := 2000;

  v_claim            RECORD;   -- mp_payment_claims (fuente de verdad)
  v_aff_user_id      UUID;     -- referente (por affiliate_referrals)
  v_referred_id      UUID;     -- comprador
  v_aff_email        TEXT;
  v_aff_banned       TIMESTAMPTZ;
  v_aff_last_login   TIMESTAMPTZ;

  v_tier_credits     NUMERIC := 0;
  v_tier_amount      NUMERIC := 0;
  v_unlimited        BOOLEAN := FALSE;
  v_lock_key         BIGINT;

  v_profile_credits  NUMERIC := 0;
  v_batch_credits    NUMERIC := 0;
  v_total_before     NUMERIC := 0;
  v_allowed          NUMERIC := 0;

  v_new_batch_id     BIGINT;
  v_commission_id    UUID;
BEGIN
  success           := FALSE;
  already_processed := FALSE;
  reward_credits    := 0;
  rewarded          := FALSE;
  tier_amount_mxn   := 0;
  detail            := '';
  message           := '';

  -- ---------- ENTRADA BÁSICA ----------
  IF p_payment_id IS NULL OR char_length(trim(p_payment_id)) = 0 THEN
    message := 'payment_id vacio';
    RETURN NEXT; RETURN;
  END IF;

  -- ---------- PASO 1: VALIDAR ORIGEN DEL PAGO (regla 4) ----------
  -- ÚNICA FUENTE DE VERDAD: mp_payment_claims (payment_id PK).
  -- claimed_at IS NOT NULL = pago APROBADO y procesado por mp_claim_payment_transaction.
  -- Si no está ahí o claimed_at es NULL → sin recompensa (NO retroactivo).
  SELECT pc.user_id, pc.kind, pc.pack_key, pc.amount_mxn, pc.claimed_at
    INTO v_claim
  FROM public.mp_payment_claims pc
  WHERE pc.payment_id = trim(p_payment_id)
    AND pc.claimed_at IS NOT NULL
  LIMIT 1;

  IF v_claim IS NULL OR v_claim.user_id IS NULL THEN
    message := 'payment_id no encontrado o sin claim aprobado en mp_payment_claims';
    detail  := 'missing_claim';
    RETURN NEXT; RETURN;
  END IF;

  v_referred_id := v_claim.user_id;
  tier_amount_mxn := COALESCE(v_claim.amount_mxn, 0);

  -- Excluir share_unlock y productos no elegibles (regla 4).
  IF COALESCE(v_claim.kind, '') = 'share_unlock' THEN
    message := 'share_unlock sin recompensa de afiliado';
    detail  := 'kind_share_unlock';
    RETURN NEXT; RETURN;
  END IF;

  -- ---------- PASO 2: CÁLCULO DE TIER (regla 3 + regla 4) ----------
  -- WHITELIST EXACTA. 5 combinaciones SOLAMENTE.
  -- Cualquier otra combinación = 0 créditos.
  --   mini_pack + inicio_50       + $50  → 12
  --   mini_pack + chico_10       + $70  → 12
  --   mini_pack + mediano_30     + $180 → 24
  --   mini_pack + pack_grande_250 + $250 → 36
  --   songs     + inicio         + $350 → 48
  -- mini_3 $25 NO es elegible.
  DECLARE
    v_k  TEXT    := COALESCE(NULLIF(trim(v_claim.kind),''),'');
    v_pk TEXT    := COALESCE(NULLIF(trim(v_claim.pack_key),''),'');
    v_am NUMERIC := COALESCE(v_claim.amount_mxn,0);
  BEGIN
    v_tier_credits := 0;

    IF     v_k = 'mini_pack' AND v_pk = 'inicio_50'        AND v_am = 50  THEN v_tier_credits := 12;
    ELSIF  v_k = 'mini_pack' AND v_pk = 'chico_10'        AND v_am = 70  THEN v_tier_credits := 12;
    ELSIF  v_k = 'mini_pack' AND v_pk = 'mediano_30'      AND v_am = 180 THEN v_tier_credits := 24;
    ELSIF  v_k = 'mini_pack' AND v_pk = 'pack_grande_250' AND v_am = 250 THEN v_tier_credits := 36;
    ELSIF  v_k = 'songs'     AND v_pk = 'inicio'          AND v_am = 350 THEN v_tier_credits := 48;
    END IF;
  END;

  IF v_tier_credits <= 0 THEN
    message := 'monto/kind/pack_key sin recompensa (no elegible)';
    detail  := 'no_tier amount=' || COALESCE(v_claim.amount_mxn,0)::text ||
               ' kind=' || COALESCE(v_claim.kind,'') ||
               ' pack_key=' || COALESCE(v_claim.pack_key,'');
    RETURN NEXT; RETURN;
  END IF;
  v_tier_amount := v_claim.amount_mxn;

  -- ====================================================================
  -- ORDEN SEGURO ANTI-RETROACTIVO (corrección):
  --   PRIMERO insertamos affiliate_commissions (payment_id UNIQUE).
  --   DESPUÉS evaluamos inactivo / baneado / sin cuenta.
  --
  -- Si salimos ANTES del INSERT → unique_violation NUNCA ocurrió, por lo que
  -- un reintento posterior (cuando el afiliado ya haya iniciado sesión o
  -- haya sido desbaneado) PODRÍA ENTREGAR recompensa RETROACTIVA.
  -- Al hacer el INSERT primero, el UNIQUE bloquea el pago para SIEMPRE,
  -- incluso si la evaluación arroja inactivo en esta primera corrida.
  -- ====================================================================

  -- ---------- PASO 3: BUSCAR referente + autorreferido (solo para poblar datos) ----------
  --   Si NO hay referente → no insertamos NADA, salimos directo (no hay
  --   payment_id que marcar y no hay riesgo).
  --   Si HAY referente (incluso inactivo) → INSERTAMOS claim primero,
  --   y luego lo marcamos como blocked.
  SELECT ar.affiliate_user_id
    INTO v_aff_user_id
  FROM public.affiliate_referrals ar
  WHERE ar.referred_user_id = v_referred_id
  LIMIT 1;

  IF v_aff_user_id IS NULL THEN
    message := 'usuario sin referente asignado (no es referido)';
    detail  := 'no_referral';
    RETURN NEXT; RETURN;
  END IF;

  IF v_aff_user_id = v_referred_id THEN
    message := 'autorreferido rechazado';
    detail  := 'self_referral';
    RETURN NEXT; RETURN;
  END IF;

  -- ---------- PASO 4: IDEMPOTENCIA (UNIQUE payment_id) + INSERT claim PRIMERO ----------
  BEGIN
    INSERT INTO public.affiliate_commissions (
      affiliate_user_id, referred_user_id, payment_id, pack_key,
      amount_mxn,
      reward_credits,
      reward_batch_id,
      status,
      detail,
      created_at, updated_at
    ) VALUES (
      v_aff_user_id, v_referred_id, trim(p_payment_id),
      COALESCE(NULLIF(trim(v_claim.pack_key),''), v_claim.kind),
      COALESCE(v_claim.amount_mxn, 0),
      0,          -- reward_credits → se actualiza después
      NULL,       -- reward_batch_id → se actualiza después
      'pending',
      NULL,
      NOW(), NOW()
    ) RETURNING id INTO v_commission_id;
  EXCEPTION WHEN unique_violation THEN
    already_processed := TRUE;
    success := TRUE;
    message := 'ya procesado (idempotente por payment_id UNIQUE)';
    detail  := 'idempotent';
    RETURN NEXT; RETURN;
  END;

  -- ---------- PASO 5: EVALUAR auth.users AHORA (después del INSERT) ----------
  -- cuenta exista · no baneada · último login < 60 días.
  SELECT lower(u.email), u.banned_until, u.last_sign_in_at
    INTO v_aff_email, v_aff_banned, v_aff_last_login
  FROM auth.users u
  WHERE u.id = v_aff_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE public.affiliate_commissions
       SET status = 'blocked', detail = 'affiliate_missing_in_auth', updated_at = NOW()
     WHERE id = v_commission_id;
    message := 'referente no existe en auth.users';
    detail  := 'affiliate_missing_in_auth';
    reward_credits := 0;
    rewarded := FALSE;
    success := TRUE;
    RETURN NEXT; RETURN;
  END IF;

  -- Admin único: ilimitado Y SIEMPRE activo (sin login check).
  IF COALESCE(v_aff_email, '') = v_admin_email THEN
    v_unlimited := TRUE;
  ELSE
    v_unlimited := FALSE;

    -- Suspensión / ban (columna LIVE confirmada: banned_until).
    IF v_aff_banned IS NOT NULL AND v_aff_banned > NOW() THEN
      UPDATE public.affiliate_commissions
         SET status = 'blocked', detail = 'affiliate_banned', updated_at = NOW()
       WHERE id = v_commission_id;
      message := 'referente suspendido (banned_until activo)';
      detail  := 'affiliate_banned';
      reward_credits := 0;
      rewarded := FALSE;
      success := TRUE;
      RETURN NEXT; RETURN;
    END IF;

    -- Último login dentro de 60 días.
    IF v_aff_last_login IS NULL OR v_aff_last_login < (NOW() - '60 days'::interval) THEN
      UPDATE public.affiliate_commissions
         SET status = 'blocked',
             detail = 'affiliate_inactive (login=' || COALESCE(EXTRACT(DAY FROM NOW()-v_aff_last_login)::text,'never') || 'dias)',
             updated_at = NOW()
       WHERE id = v_commission_id;
      message := 'referente inactivo (sin login en 60 dias). SIN recompensa, NO retroactivo (payment_id ya reclamado por UNIQUE).';
      detail  := 'affiliate_inactive';
      reward_credits := 0;
      rewarded := FALSE;
      success := TRUE;
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- ---------- PASO 6: BLOQUEO TRANSACCIONAL POR AFFILIATE (regla 3) ----------
  -- Sin esto, dos compras simultáneas pueden superar el CAP 2000.
  v_lock_key := hashtextextended(v_aff_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- ---------- PASO 7: CALCULAR SALDO + CAP 2000 (regla 4, 6) ----------
  INSERT INTO public.profiles (id, ramber_credits, zingy_credits, credits_expires_at)
  VALUES (v_aff_user_id, 0, 0, NULL)
  ON CONFLICT (id) DO NOTHING;

  SELECT CASE
      WHEN ramber_credits IS NOT NULL THEN COALESCE(ramber_credits::numeric, 0)
      WHEN zingy_credits  IS NOT NULL THEN COALESCE(zingy_credits::numeric, 0)
      ELSE 0
    END
    INTO v_profile_credits
  FROM public.profiles WHERE id = v_aff_user_id;

  SELECT COALESCE(SUM(remaining_credits), 0)
    INTO v_batch_credits
  FROM public.credit_batches
  WHERE user_id = v_aff_user_id
    AND is_expired = FALSE
    AND remaining_credits > 0
    AND (expires_at IS NULL OR expires_at > NOW());

  v_total_before := COALESCE(v_profile_credits,0) + COALESCE(v_batch_credits,0);

  IF v_unlimited THEN
    v_allowed := v_tier_credits;
  ELSE
    v_allowed := GREATEST(0, LEAST(v_tier_credits, GREATEST(0, v_max_cap - v_total_before)));
  END IF;

  -- ---------- PASO 8A: CAP alcanzado → sin créditos, marcar blocked ----------
  IF v_allowed <= 0 THEN
    UPDATE public.affiliate_commissions
       SET status = 'blocked',
           detail = 'cap_reached (saldo='||v_total_before||', tier='||v_tier_credits||')',
           reward_credits = 0,
           updated_at = NOW()
     WHERE id = v_commission_id;
    success        := TRUE;
    reward_credits := 0;
    rewarded       := FALSE;
    message        := 'cap 2000 alcanzado: no se entregaron creditos en esta compra';
    detail         := 'cap_reached';
    RETURN NEXT; RETURN;
  END IF;

  -- ---------- PASO 8B: CREAR credit_batch + actualizar comisión (REGLA 5 - todo junto) ----------
  INSERT INTO public.credit_batches (
    user_id, pack_key, payment_id,
    original_credits, remaining_credits,
    purchased_at, expires_at, is_expired,
    amount_mxn, note
  ) VALUES (
    v_aff_user_id, 'affiliate_reward', trim(p_payment_id),
    v_allowed, v_allowed,
    NOW(), NOW() + '60 days'::interval, FALSE,
    COALESCE(v_tier_amount, 0),
    'Recompensa de afiliado por compra aprobada (creditos promocionales, vencen en 60 dias)'
  ) RETURNING id INTO v_new_batch_id;

  UPDATE public.affiliate_commissions
     SET status          = 'granted',
         detail          = 'tier='||v_tier_credits||' allowed='||v_allowed,
         reward_credits  = v_allowed,
         reward_batch_id = v_new_batch_id,
         updated_at      = NOW()
   WHERE id = v_commission_id;

  success        := TRUE;
  reward_credits := v_allowed;
  rewarded       := TRUE;
  message        := 'recompensa entregada';
  detail         := 'granted';
  RETURN NEXT; RETURN;
END;
$$;

-- ============================================================================
-- 3) RPC #2: reverse_affiliate_credit_reward(p_payment_id)
--    Reversión idempotente (punto 7).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reverse_affiliate_credit_reward(
  p_payment_id TEXT
)
RETURNS TABLE (
  success          BOOLEAN,
  already_reversed BOOLEAN,
  affected_batches INT,
  reward_credits   NUMERIC,
  reversed_at      TIMESTAMPTZ,
  message          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_aff_id       UUID;
  v_comm_id      UUID;
  v_old_status   TEXT;
  v_old_reversed TIMESTAMPTZ;
  v_count        INT;
  v_credits      NUMERIC := 0;
BEGIN
  success          := FALSE;
  already_reversed := FALSE;
  affected_batches := 0;
  reward_credits   := 0;
  reversed_at      := NULL;
  message          := '';

  IF p_payment_id IS NULL OR char_length(trim(p_payment_id)) = 0 THEN
    message := 'payment_id vacio';
    RETURN NEXT; RETURN;
  END IF;

  SELECT id, affiliate_user_id, status, reversed_at, COALESCE(reward_credits,0)
    INTO v_comm_id, v_aff_id, v_old_status, v_old_reversed, v_credits
  FROM public.affiliate_commissions
  WHERE payment_id = trim(p_payment_id)
  LIMIT 1;

  IF v_comm_id IS NULL THEN
    success          := TRUE;
    already_reversed := TRUE;
    message          := 'sin recompensa registrada para este payment_id';
    RETURN NEXT; RETURN;
  END IF;

  IF v_old_reversed IS NOT NULL THEN
    success          := TRUE;
    already_reversed := TRUE;
    reversed_at      := v_old_reversed;
    reward_credits   := v_credits;
    message          := 'ya estaba revertida (idempotente)';
    RETURN NEXT; RETURN;
  END IF;

  -- 1) Marcar la comisión como reversed (reversed_at = NOW() vía UPDATE,
  --    usando una sola variable para evitar SET reversed_at = reversed_at).
  DECLARE
    v_now_ts TIMESTAMPTZ := NOW();
  BEGIN
    UPDATE public.affiliate_commissions
       SET status      = 'reversed',
           reversed_at = v_now_ts,
           detail      = NULLIF(CONCAT_WS(' | ', NULLIF(detail,''), 'reversed por reembolso/contracargo'), ''),
           updated_at  = v_now_ts
     WHERE id = v_comm_id;
    reversed_at := v_now_ts;
  END;

  -- 2) Anular el lote (NUNCA por debajo de cero; solo afecta affiliate_reward).
  UPDATE public.credit_batches
     SET remaining_credits = 0,
         is_expired        = TRUE,
         note              = NULLIF(CONCAT_WS(' | ', NULLIF(note,''), 'REVERSED por reembolso/contracargo'), '')
   WHERE user_id        = v_aff_id
     AND payment_id     = trim(p_payment_id)
     AND pack_key       = 'affiliate_reward'
     AND remaining_credits > 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  affected_batches := v_count;

  reward_credits := v_credits;
  success := TRUE;
  already_reversed := FALSE;
  message := 'reversion aplicada (idempotente)';
  RETURN NEXT; RETURN;
END;
$$;

-- ============================================================================
-- 4) SEGURIDAD: solo service_role puede ejecutar las RPC (regla 8).
-- ============================================================================
REVOKE ALL ON FUNCTION public.grant_affiliate_credit_reward(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_affiliate_credit_reward(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.grant_affiliate_credit_reward(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_affiliate_credit_reward(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reverse_affiliate_credit_reward(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_affiliate_credit_reward(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_affiliate_credit_reward(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_affiliate_credit_reward(TEXT) TO service_role;

-- ============================================================================
-- FIN. Nada de histórico se borra. Nada de payout_email se toca.
-- Nada de money_transfer se usa.
-- ============================================================================
