-- ==================================================
-- MIGRACIÓN V3: storage.objects para bucket ramber-tunes
--   * Borramos TODAS las policies anteriores (limpieza total).
--   * Creamos 4 nuevas, SIN depender de auth.uid() en INSERT.
--   * NO incluimos ALTER TABLE OWNER (causa 'must be owner' errors en Supabase SaaS).
-- Autor: Fix RLS 403 row violates policy (upload URL firmada = auth.uid() NULL)
-- ==================================================

-- 1) BORRADO COMPLETO: TODAS las policies existentes (antiguas + nuestras + default uploads)
DROP POLICY IF EXISTS "Uploads: authenticated can insert" ON storage.objects;
DROP POLICY IF EXISTS "Uploads: authenticated can read" ON storage.objects;
DROP POLICY IF EXISTS "anon_insert_ramber_tunes_uploads_paths" ON storage.objects;
DROP POLICY IF EXISTS "public_select_own_ramber_tunes_objects" ON storage.objects;
DROP POLICY IF EXISTS "public_update_own_ramber_tunes_objects" ON storage.objects;
DROP POLICY IF EXISTS "public_delete_own_ramber_tunes_objects" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_insert_own_ramber_tunes_objects" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_select_own_ramber_tunes_objects" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_update_own_ramber_tunes_objects" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_own_ramber_tunes_objects" ON storage.objects;

-- 2) ASEGURAR QUE RLS ESTÁ ACTIVADO (solo si no lo estaba — no tiene por qué fallar)
ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- 3) INSERT policy (NUEVA): NO usa auth.uid() (está NULL durante upload URL firmada por navegador)
CREATE POLICY "anon_insert_ramber_tunes_uploads_paths"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  bucket_id = 'ramber-tunes'
  AND (
    (storage.foldername(name))[1] = 'uploads' AND (storage.foldername(name))[2] = 'audio'
    OR (storage.foldername(name))[1] = 'uploads'
    OR (storage.foldername(name))[1] = 'avatars'
    OR (storage.foldername(name))[1] = 'profiles'
  )
);

-- 4) SELECT policy (NUEVA): owner propio, archivos legacy sin dueño, o path propio uploads/<algo>/<userId>
CREATE POLICY "public_select_own_ramber_tunes_objects"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'ramber-tunes'
  AND (
    owner_id IS NULL
    OR owner_id = ((auth.uid())::text)
    OR (
      (storage.foldername(name))[1] = 'uploads'
      AND (storage.foldername(name))[3] = ((auth.uid())::text)
    )
  )
);

-- 5) UPDATE policy (NUEVA): solo owner propio (service_role bypass RLS)
CREATE POLICY "public_update_own_ramber_tunes_objects"
ON storage.objects FOR UPDATE TO public
USING (bucket_id = 'ramber-tunes' AND owner_id = ((auth.uid())::text));

-- 6) DELETE policy (NUEVA): solo owner propio o path propio uploads
CREATE POLICY "public_delete_own_ramber_tunes_objects"
ON storage.objects FOR DELETE TO public
USING (
  bucket_id = 'ramber-tunes'
  AND (
    owner_id = ((auth.uid())::text)
    OR ((storage.foldername(name))[1] = 'uploads' AND (storage.foldername(name))[3] = ((auth.uid())::text))
  )
);
