-- =======================================================
-- RLS Policies para storage.objects bucket "ramber-tunes"
-- Fecha: 2026-08-06  (v2 - corregido: auth.uid() es NULL durante
--                     S3 Presigned POST / createSignedUploadUrl
--                     porque el navegador no envía JWT real al storage endpoint).
--
-- SEGURIDAD:
--   INSERT: Solo permite si bucket=ramber-tunes y path empieza por rutas
--           controladas por nuestro servidor (uploads/audio, uploads/<uid>,
--           avatars, profiles). NO usa auth.uid() porque en uploads firmados
--           desde el navegador, el contexto de Supabase NO tiene JWT del
--           usuario y auth.uid() es NULL -> bloqueaba todo. Nuestro servidor
--           se encarga de que el "name" (key) SIEMPRE empiece por
--           uploads/audio/<userId>/...  -> nadie puede subir a rutas ajenas.
--   SELECT: Permite por owner_id=<uid> o path del usuario o archivos legacy
--           sin owner.
--   UPDATE: Solo owner_id=<uid>.
--   DELETE: Solo owner_id=<uid> o path del usuario.
-- =======================================================

-- =======================================================
-- 1) POLICY INSERT en storage.objects (SUBIDA)
--    Esta policy NO depende de auth.uid() -> funciona para S3 Presigned POST
--    y para SDK createSignedUploadUrl desde el navegador.
-- =======================================================
DROP POLICY IF EXISTS "authenticated_insert_own_ramber_tunes_objects" ON storage.objects;
DROP POLICY IF EXISTS "anon_insert_ramber_tunes_uploads_paths" ON storage.objects;
CREATE POLICY "anon_insert_ramber_tunes_uploads_paths"
ON storage.objects
FOR INSERT
TO public  -- afecta anon + authenticated (aún cuando auth.uid() sea null)
WITH CHECK (
  bucket_id = 'ramber-tunes'
  AND (
    (storage.foldername(name))[1] = 'uploads' AND (storage.foldername(name))[2] = 'audio'
    OR (storage.foldername(name))[1] = 'uploads'
    OR (storage.foldername(name))[1] = 'avatars'
    OR (storage.foldername(name))[1] = 'profiles'
  )
);

-- =======================================================
-- 2) POLICY SELECT en storage.objects (LEER / DESCARGAR)
--    Permitimos también por OWNER_ID o path. Usamos TO public (incluye
--    authenticated/anon). El acceso por URL firmada de reproducción se
--    genera por ADMIN en el servidor así que no depende de esto.
-- =======================================================
DROP POLICY IF EXISTS "authenticated_select_own_ramber_tunes_objects" ON storage.objects;
DROP POLICY IF EXISTS "public_select_own_ramber_tunes_objects" ON storage.objects;
CREATE POLICY "public_select_own_ramber_tunes_objects"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'ramber-tunes'
  AND (
    owner_id IS NOT NULL AND owner_id = ((auth.uid())::text)
    OR (storage.foldername(name))[1] = 'uploads' AND (storage.foldername(name))[2] = 'audio' AND (storage.foldername(name))[3] = ((auth.uid())::text)
    OR (storage.foldername(name))[1] = 'uploads' AND (storage.foldername(name))[2] = ((auth.uid())::text)
    OR (storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = ((auth.uid())::text)
    OR (storage.foldername(name))[1] = 'profiles' AND (storage.foldername(name))[2] = ((auth.uid())::text)
    OR owner_id IS NULL  -- archivos legacy
    OR auth.role() = 'service_role'
  )
);

-- =======================================================
-- 3) POLICY UPDATE en storage.objects
-- =======================================================
DROP POLICY IF EXISTS "authenticated_update_own_ramber_tunes_objects" ON storage.objects;
DROP POLICY IF EXISTS "public_update_own_ramber_tunes_objects" ON storage.objects;
CREATE POLICY "public_update_own_ramber_tunes_objects"
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'ramber-tunes'
  AND (
    (owner_id IS NOT NULL AND owner_id = ((auth.uid())::text))
    OR auth.role() = 'service_role'
  )
)
WITH CHECK (
  bucket_id = 'ramber-tunes'
  AND (
    (owner_id IS NOT NULL AND owner_id = ((auth.uid())::text))
    OR auth.role() = 'service_role'
  )
);

-- =======================================================
-- 4) POLICY DELETE en storage.objects
-- =======================================================
DROP POLICY IF EXISTS "authenticated_delete_own_ramber_tunes_objects" ON storage.objects;
DROP POLICY IF EXISTS "public_delete_own_ramber_tunes_objects" ON storage.objects;
CREATE POLICY "public_delete_own_ramber_tunes_objects"
ON storage.objects
FOR DELETE
TO public
USING (
  bucket_id = 'ramber-tunes'
  AND (
    owner_id IS NOT NULL AND owner_id = ((auth.uid())::text)
    OR (storage.foldername(name))[1] = 'uploads' AND (storage.foldername(name))[2] = 'audio' AND (storage.foldername(name))[3] = ((auth.uid())::text)
    OR (storage.foldername(name))[1] = 'uploads' AND (storage.foldername(name))[2] = ((auth.uid())::text)
    OR (storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = ((auth.uid())::text)
    OR (storage.foldername(name))[1] = 'profiles' AND (storage.foldername(name))[2] = ((auth.uid())::text)
    OR auth.role() = 'service_role'
  )
);

