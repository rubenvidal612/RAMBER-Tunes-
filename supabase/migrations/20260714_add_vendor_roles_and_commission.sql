
-- Migración para roles de vendedor/empleado, precios y comisiones

-- 1. Extender vendor_settings
ALTER TABLE vendor_settings
  ADD COLUMN role TEXT NOT NULL DEFAULT 'vendor',
  ADD COLUMN commission_type TEXT NOT NULL DEFAULT 'percentage',
  ADD COLUMN commission_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN force_countdown_only BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN can_show_payment_info BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Crear tabla product_pricing
CREATE TABLE IF NOT EXISTS product_pricing (
  product_type TEXT PRIMARY KEY,
  unlock_price_mxn NUMERIC NOT NULL,
  empleado_commission_mxn NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar valores iniciales
INSERT INTO product_pricing (product_type, unlock_price_mxn, empleado_commission_mxn)
VALUES
  ('cancion_generada', 250, 50),
  ('karaoke_audio', 100, 50),
  ('karaoke_video', 100, 50)
ON CONFLICT (product_type) DO NOTHING;

-- 3. Crear tabla share_commissions
CREATE TABLE IF NOT EXISTS share_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID REFERENCES preview_shares(id),
  seller_user_id UUID NOT NULL,
  role_at_time TEXT NOT NULL,
  product_type TEXT NOT NULL,
  amount_mxn NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_out_at TIMESTAMPTZ
);

-- Habilitar RLS para las nuevas tablas
ALTER TABLE product_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_commissions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para product_pricing (solo lectura para todos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'product_pricing'
      AND policyname = 'Todos pueden leer product_pricing'
  ) THEN
    CREATE POLICY "Todos pueden leer product_pricing"
    ON public.product_pricing
    FOR SELECT
    USING (true);
  END IF;
END
$$;

-- Políticas RLS para share_commissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'share_commissions'
      AND policyname = 'Usuarios pueden ver sus propias comisiones'
  ) THEN
    CREATE POLICY "Usuarios pueden ver sus propias comisiones"
    ON public.share_commissions
    FOR SELECT
    USING (auth.uid() = seller_user_id);
  END IF;
END
$$;
