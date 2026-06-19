-- Consulta para verificar las columnas de créditos en la tabla profiles
SELECT 
    column_name, 
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('ramber_credits', 'zingy_credits', 'credits', 'song_balance')
ORDER BY column_name;