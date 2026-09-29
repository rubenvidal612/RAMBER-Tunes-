-- 20260929_add_admin_plan_grants.sql
-- Tabla para registrar asignaciones MANUALES de paquetes / overrides administrativos.
-- SEPARADA de mp_payment_claims (no representa pagos reales de MP).
-- Protegida: solo service_role / backend puede escribir.

SET search_path TO public;

-- ============================================================
-- PASO 1: Crear tabla (idempotente: IF NOT EXISTS)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_plan_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    granted_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    grant_kind TEXT NOT NULL,
    pack_key TEXT,
    amount_mxn NUMERIC(10,2) NOT NULL DEFAULT 0,
    credits_granted INTEGER NOT NULL DEFAULT 0,
    validity_days INTEGER,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    reason TEXT
);

-- ============================================================
-- PASO 2: Índices
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_admin_plan_grants_to_kind_granted
    ON public.admin_plan_grants (granted_to_user_id, grant_kind, granted_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_plan_grants_to_revoked_expires
    ON public.admin_plan_grants (granted_to_user_id, revoked_at, expires_at);

-- ============================================================
-- PASO 3: Seguridad. Bloquear acceso público/anónimo/autenticado.
-- ============================================================
REVOKE ALL ON public.admin_plan_grants FROM PUBLIC;
REVOKE ALL ON public.admin_plan_grants FROM anon;
REVOKE ALL ON public.admin_plan_grants FROM authenticated;

GRANT ALL ON public.admin_plan_grants TO service_role;
GRANT SELECT ON public.admin_plan_grants TO postgres;

-- ============================================================
-- PASO 4: RLS off (porque nadie puede acceder directamente;
-- todo pasa por service_role backend). Si queremos RLS más
-- estricto lo activamos + policy service_role.
-- ============================================================
ALTER TABLE public.admin_plan_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_plan_grants_all_service_role ON public.admin_plan_grants;
CREATE POLICY admin_plan_grants_all_service_role ON public.admin_plan_grants
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- PASO 5: Trigger / CHECK de consistencia (opcional)
-- grant_kind permitidos: inicio_350, productor_545, masterizar_150,
-- mini_pack, voice_clone_override_unlimited
-- ============================================================
ALTER TABLE public.admin_plan_grants
    DROP CONSTRAINT IF EXISTS admin_plan_grants_grant_kind_check;
ALTER TABLE public.admin_plan_grants
    ADD CONSTRAINT admin_plan_grants_grant_kind_check
    CHECK (grant_kind IN (
        'inicio_350',
        'productor_545',
        'masterizar_150',
        'mini_pack',
        'voice_clone_override_unlimited'
    ));

-- ============================================================
-- PASO 6: Helper function para el helper userHasVoiceCloneAccess
-- (usado desde API; la usamos para saber si hay override
--  activo desde SQL también si hace falta).
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_voice_clone_override_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_plan_grants g
        WHERE g.granted_to_user_id = p_user_id
          AND g.grant_kind = 'voice_clone_override_unlimited'
          AND g.revoked_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.admin_voice_clone_override_active(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_voice_clone_override_active(UUID) TO service_role;

-- ============================================================
-- PASO 7: Helper para saber si hay grant admin inicio_350 activo <30d
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_inicio_350_grant_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_plan_grants g
        WHERE g.granted_to_user_id = p_user_id
          AND g.grant_kind = 'inicio_350'
          AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR g.expires_at >= NOW())
    );
$$;

REVOKE ALL ON FUNCTION public.admin_inicio_350_grant_active(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_inicio_350_grant_active(UUID) TO service_role;
