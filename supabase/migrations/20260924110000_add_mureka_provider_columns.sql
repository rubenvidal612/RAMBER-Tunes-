-- Agrega campos explícitos de proveedor y versión de modelo a library_items
-- para dar soporte a múltiples motores (actualmente Suno y Mureka).
-- También deja metadata JSONB para la preparación de stem-separation
-- específica por proveedor.

-- 1. Columnas nuevas con CHECK constraint explícito por provider admitido.
ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS provider TEXT CHECK (provider IN ('suno', 'mureka'));

ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS model_version TEXT;

ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS mureka_task_id TEXT;

ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Backfill: todas las canciones existentes que hayan nacido con Suno
--    (tienen task_id Suno o audio_id Suno) se marcan explícitamente
--    como provider = 'suno' y model_version = suno_model.
UPDATE public.library_items
SET
  provider = 'suno',
  model_version = suno_model
WHERE
  provider IS NULL
  AND (
    suno_task_id IS NOT NULL
    OR suno_audio_id IS NOT NULL
    OR suno_model IS NOT NULL
  );

-- 3. Índice combinado para consultas rápidas "Mis canciones filtradas por motor"
CREATE INDEX IF NOT EXISTS idx_library_items_provider_model
  ON public.library_items (user_id, provider, created_at DESC);

-- 4. Murekatask_id índice para lookup rápido en polling.
CREATE INDEX IF NOT EXISTS idx_library_items_mureka_task_id
  ON public.library_items (mureka_task_id);
