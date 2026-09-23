-- Registro privado de sesiones de Stripe. Sirve como candado de idempotencia:
-- una misma sesión de Checkout no puede acreditar créditos dos veces.
CREATE TABLE IF NOT EXISTS public.stripe_checkout_transactions (
  id BIGSERIAL PRIMARY KEY,
  checkout_session_id TEXT NOT NULL UNIQUE,
  payment_intent_id TEXT UNIQUE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_id BIGINT REFERENCES public.credit_packs(id) ON DELETE SET NULL,
  pack_key TEXT NOT NULL,
  amount_mxn NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'mxn',
  status TEXT NOT NULL DEFAULT 'paid',
  credits_granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_checkout_transactions_user_id
  ON public.stripe_checkout_transactions(user_id, created_at DESC);

ALTER TABLE public.stripe_checkout_transactions ENABLE ROW LEVEL SECURITY;

-- Esta tabla solo la consulta/escribe el webhook del servidor con service_role.
-- No se expone a visitantes ni a usuarios autenticados desde el navegador.
REVOKE ALL ON TABLE public.stripe_checkout_transactions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stripe_checkout_transactions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.stripe_checkout_transactions_id_seq TO service_role;
