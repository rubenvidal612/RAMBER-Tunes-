-- Trazabilidad del flujo de clonación de voz (validación + creación) y callbacks en suno_tasks.
-- `extra` (jsonb) ya es usado por el flujo de Mureka; este script es idempotente por si
-- la columna no existiera en algún entorno. No borra ni altera columnas existentes.
alter table if exists public.suno_tasks
add column if not exists extra jsonb;
