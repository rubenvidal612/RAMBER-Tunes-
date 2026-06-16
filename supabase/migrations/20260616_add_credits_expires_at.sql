-- Agregar columna credits_expires_at a la tabla profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits_expires_at TIMESTAMP WITH TIME ZONE;

-- Crear índice para búsquedas eficientes por fecha de vencimiento
CREATE INDEX IF NOT EXISTS idx_profiles_credits_expires_at ON profiles(credits_expires_at);

-- Actualizar registros existentes para establecer una fecha de vencimiento por defecto
-- Si no tienen fecha de vencimiento, establecer 60 días a partir de ahora
UPDATE profiles 
SET credits_expires_at = NOW() + INTERVAL '60 days'
WHERE credits_expires_at IS NULL 
  AND (ramber_credits > 0 OR zingy_credits > 0 OR credits > 0);