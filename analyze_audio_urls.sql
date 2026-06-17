-- Consulta para analizar las URLs de audio en library_items
-- Esta consulta responde a las preguntas del usuario:

-- 1. ¿Cuántas canciones tienen URL de R2 (dominio r2.dev o r2.cloudflarestorage.com)?
-- 2. ¿Cuántas tienen URL de Suno directamente (dominio de Suno/CDN de Suno)?
-- 3. ¿Cuántas URLs de Suno ya pasaron los 14 días y probablemente estén vencidas/rotas?

-- Primero, veamos el total de canciones
SELECT 
  COUNT(*) as total_canciones,
  COUNT(CASE WHEN audio_url IS NOT NULL AND audio_url != '' THEN 1 END) as canciones_con_audio_url,
  COUNT(CASE WHEN audio_url IS NULL OR audio_url = '' THEN 1 END) as canciones_sin_audio_url
FROM library_items 
WHERE type = 'song' 
  AND deleted_at IS NULL;

-- Ahora analicemos las URLs por tipo
SELECT 
  -- URLs de R2
  COUNT(CASE 
    WHEN audio_url ILIKE '%r2.cloudflarestorage.com%' OR 
         audio_url ILIKE '%.r2.dev%' OR
         audio_url ILIKE '%/r2/%' 
    THEN 1 
  END) as urls_r2,
  
  -- URLs de Suno (cdn.suno.ai, suno.ai, etc.)
  COUNT(CASE 
    WHEN audio_url ILIKE '%suno.ai%' OR 
         audio_url ILIKE '%cdn.suno%' OR
         audio_url ILIKE '%firebasestorage.googleapis.com%' -- algunas URLs de Suno usan Firebase
    THEN 1 
  END) as urls_suno,
  
  -- Otras URLs (pueden ser de otros servicios o URLs locales)
  COUNT(CASE 
    WHEN audio_url IS NOT NULL AND audio_url != '' AND
         NOT (audio_url ILIKE '%r2.cloudflarestorage.com%' OR 
              audio_url ILIKE '%.r2.dev%' OR
              audio_url ILIKE '%/r2/%' OR
              audio_url ILIKE '%suno.ai%' OR 
              audio_url ILIKE '%cdn.suno%' OR
              audio_url ILIKE '%firebasestorage.googleapis.com%')
    THEN 1 
  END) as urls_otras
FROM library_items 
WHERE type = 'song' 
  AND deleted_at IS NULL
  AND audio_url IS NOT NULL 
  AND audio_url != '';

-- Ahora analicemos las URLs de Suno por antigüedad
-- Necesitamos ver cuándo se crearon las canciones para saber si las URLs ya expiraron
SELECT 
  -- URLs de Suno que tienen menos de 14 días
  COUNT(CASE 
    WHEN (audio_url ILIKE '%suno.ai%' OR 
          audio_url ILIKE '%cdn.suno%' OR
          audio_url ILIKE '%firebasestorage.googleapis.com%') AND
         created_at >= NOW() - INTERVAL '14 days'
    THEN 1 
  END) as urls_suno_activas,
  
  -- URLs de Suno que tienen más de 14 días (probablemente expiradas)
  COUNT(CASE 
    WHEN (audio_url ILIKE '%suno.ai%' OR 
          audio_url ILIKE '%cdn.suno%' OR
          audio_url ILIKE '%firebasestorage.googleapis.com%') AND
         created_at < NOW() - INTERVAL '14 days'
    THEN 1 
  END) as urls_suno_probablemente_expiradas,
  
  -- URLs de Suno sin fecha de creación (no podemos determinar)
  COUNT(CASE 
    WHEN (audio_url ILIKE '%suno.ai%' OR 
          audio_url ILIKE '%cdn.suno%' OR
          audio_url ILIKE '%firebasestorage.googleapis.com%') AND
         created_at IS NULL
    THEN 1 
  END) as urls_suno_sin_fecha
FROM library_items 
WHERE type = 'song' 
  AND deleted_at IS NULL
  AND audio_url IS NOT NULL 
  AND audio_url != '';

-- Detalle de las canciones con URLs de Suno que tienen más de 14 días
SELECT 
  id,
  title,
  audio_url,
  created_at,
  EXTRACT(DAY FROM NOW() - created_at) as dias_desde_creacion,
  CASE 
    WHEN created_at < NOW() - INTERVAL '14 days' THEN 'PROBABLEMENTE EXPIRADA'
    ELSE 'ACTIVA (menos de 14 días)'
  END as estado_url
FROM library_items 
WHERE type = 'song' 
  AND deleted_at IS NULL
  AND audio_url IS NOT NULL 
  AND audio_url != ''
  AND (audio_url ILIKE '%suno.ai%' OR 
       audio_url ILIKE '%cdn.suno%' OR
       audio_url ILIKE '%firebasestorage.googleapis.com%')
ORDER BY created_at ASC
LIMIT 20;

-- También podemos ver cuántas canciones tienen suno_task_id o suno_audio_id
-- que son indicadores de que vinieron de Suno
SELECT 
  COUNT(CASE WHEN suno_task_id IS NOT NULL AND suno_task_id != '' THEN 1 END) as con_suno_task_id,
  COUNT(CASE WHEN suno_audio_id IS NOT NULL AND suno_audio_id != '' THEN 1 END) as con_suno_audio_id,
  COUNT(CASE WHEN (suno_task_id IS NOT NULL AND suno_task_id != '') OR 
                   (suno_audio_id IS NOT NULL AND suno_audio_id != '') 
             THEN 1 END) as total_con_referencia_suno
FROM library_items 
WHERE type = 'song' 
  AND deleted_at IS NULL;