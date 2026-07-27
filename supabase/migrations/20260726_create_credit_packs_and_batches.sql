-- Tabla de paquetes de créditos (configurable por admin desde Supabase)
CREATE TABLE IF NOT EXISTS credit_packs (
  id BIGSERIAL PRIMARY KEY,
  pack_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  songs INTEGER NOT NULL,
  credits_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  price_mxn NUMERIC(10,2) NOT NULL,
  validity_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_packs_active ON credit_packs(is_active);
CREATE INDEX IF NOT EXISTS idx_credit_packs_sort ON credit_packs(sort_order);

-- Trigger para actualizar updated_at automáticamente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_credit_packs_updated_at'
  ) THEN
    CREATE TRIGGER trg_credit_packs_updated_at
    BEFORE UPDATE ON credit_packs
    FOR EACH ROW
    EXECUTE FUNCTION moddatetime('updated_at');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Tabla de lotes de créditos (cada compra = un lote con su propia expiración)
-- Cada canción cuesta 12 créditos (CREDIT_COSTS.generate_music).
-- El sistema FIFO resta primero del lote que vence más pronto.
CREATE TABLE IF NOT EXISTS credit_batches (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pack_id BIGINT REFERENCES credit_packs(id) ON DELETE SET NULL,
  pack_key TEXT,
  payment_id TEXT,
  original_credits NUMERIC(12,2) NOT NULL,
  remaining_credits NUMERIC(12,2) NOT NULL,
  purchased_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_expired BOOLEAN NOT NULL DEFAULT FALSE,
  amount_mxn NUMERIC(10,2) DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_batches_user_active ON credit_batches(user_id, is_expired)
  WHERE is_expired = FALSE;
CREATE INDEX IF NOT EXISTS idx_credit_batches_user_expires ON credit_batches(user_id, expires_at)
  WHERE is_expired = FALSE AND remaining_credits > 0;
CREATE INDEX IF NOT EXISTS idx_credit_batches_expiry_candidate ON credit_batches(expires_at)
  WHERE is_expired = FALSE;
CREATE INDEX IF NOT EXISTS idx_credit_batches_payment_id ON credit_batches(payment_id);

-- Trigger moddatetime para credit_batches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_credit_batches_updated_at'
  ) THEN
    CREATE TRIGGER trg_credit_batches_updated_at
    BEFORE UPDATE ON credit_batches
    FOR EACH ROW
    EXECUTE FUNCTION moddatetime('updated_at');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Permisos básicos (políticas RLS)
ALTER TABLE credit_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_batches ENABLE ROW LEVEL SECURITY;

-- Cualquiera autenticado puede VER los paquetes activos
DROP POLICY IF EXISTS credit_packs_select_active ON credit_packs;
CREATE POLICY credit_packs_select_active ON credit_packs
  FOR SELECT
  USING (is_active = TRUE);

-- Un usuario solo VE sus propios lotes
DROP POLICY IF EXISTS credit_batches_select_own ON credit_batches;
CREATE POLICY credit_batches_select_own ON credit_batches
  FOR SELECT
  USING (auth.uid() = user_id);

-- ========== INSERT DE PAQUETES INICIALES ==========
-- Mini 3 canciones $25  30 días
-- Chico 10 canciones $70  30 días
-- Mediano 30 canciones $180  30 días
-- Grande 80 canciones $350  30 días
--
-- Nota: cada canción = 12 créditos (CREDIT_COSTS.generate_music = 12)
INSERT INTO credit_packs (pack_key, name, songs, credits_amount, price_mxn, validity_days, is_active, sort_order, description)
VALUES
  (
    'mini_3',
    'Mini Pack 3 Canciones',
    3,
    36.00,
    25.00,
    30,
    TRUE,
    1,
    '3 canciones · Vigencia 30 días'
  ),
  (
    'chico_10',
    'Pack Chico 10 Canciones',
    10,
    120.00,
    70.00,
    30,
    TRUE,
    2,
    '10 canciones · Vigencia 30 días'
  ),
  (
    'mediano_30',
    'Pack Mediano 30 Canciones',
    30,
    360.00,
    180.00,
    30,
    TRUE,
    3,
    '30 canciones · Vigencia 30 días'
  ),
  (
    'grande_80',
    'Pack Grande 80 Canciones',
    80,
    960.00,
    350.00,
    30,
    TRUE,
    4,
    '80 canciones · Vigencia 30 días'
  )
ON CONFLICT (pack_key) DO NOTHING;
