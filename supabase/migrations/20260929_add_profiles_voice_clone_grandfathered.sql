-- =====================================================================
-- MIGRACIÓN: perfiles.voice_clone_grandfathered (Etapa 1 — prep)
-- =====================================================================
-- OBJETIVO (solo esta etapa):
--   1. Todos los perfiles EXISTENTES hoy quedan voice_clone_grandfathered = TRUE
--      (permanente, acceso completo a clonador como hasta hoy).
--   2. Perfiles CREADOS DESPUÉS de esta migración → DEFAULT = FALSE
--      (posteriormente, estos requerirán Pack Inicio $350 para clonar voz).
--
-- SIN EFECTO: clonador, créditos, pagos, mp_*, credit_batches, settings, permisos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1: Agregar columna con DEFAULT = TRUE.
--         PostgreSQL propagará este DEFAULT a TODAS las filas existentes
--         durante el ADD (por ser NOT NULL con valor por omisión no volátil).
--         NINGUNA fila existente queda en NULL o FALSE por este paso.
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS voice_clone_grandfathered BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_profiles_voice_clone_grandfathered
  ON public.profiles(voice_clone_grandfathered);

-- ---------------------------------------------------------------------
-- PASO 2: Safety-net (idempotente).
--         Si la columna ya existía y hubo filas insertadas antes del SET
--         DEFAULT FALSE (escenario de apply/rollback/reapply), forzamos
--         TRUE a todo registro ANTES de cambiar el default.
--         Esto NUNCA toca usuarios nuevos creados CON el DEFAULT=FALSE
--         ya que esos no existían cuando corremos la migración la primera vez.
--         Si es la primera vez que corre este paso 2, UPDATE afecta 0 filas
--         porque el DEFAULT del paso 1 ya puso TRUE en todas.
-- ---------------------------------------------------------------------
UPDATE public.profiles
   SET voice_clone_grandfathered = TRUE
 WHERE voice_clone_grandfathered = FALSE;

-- ---------------------------------------------------------------------
-- PASO 3: Cambiar el DEFAULT a FALSE para registros FUTUROS.
--         ESTA SENTENCIA NO MODIFICA NINGÚN VALOR EN FILAS EXISTENTES.
--         Solo cambia el valor que el servidor asigna si la columna
--         no se menciona explícitamente en un INSERT.
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ALTER COLUMN voice_clone_grandfathered SET DEFAULT FALSE;
