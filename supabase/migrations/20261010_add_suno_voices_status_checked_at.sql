-- Agrega la columna status_checked_at a public.suno_voices para el refresco
-- acotado de estado de voces clonadas. Idempotente (si ya existe no hace nada).
alter table if exists public.suno_voices
  add column if not exists status_checked_at timestamptz;
