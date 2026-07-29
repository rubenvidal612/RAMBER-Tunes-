-- Corrige los números "canciones" mostrados en Planes de Recarga.
-- Regla visual: (créditos ÷ 12) × 2
-- No toca Pack Inicio ($350 mensual) porque no vive en credit_packs.

UPDATE public.credit_packs
SET
  songs = 6,
  name = 'Mini',
  description = '6 canciones · Vigencia 30 días',
  is_active = TRUE,
  sort_order = 1
WHERE pack_key = 'mini_3';

UPDATE public.credit_packs
SET
  songs = 20,
  name = 'Chico',
  description = '20 canciones · Vigencia 30 días',
  is_active = TRUE,
  sort_order = 2
WHERE pack_key = 'chico_10';

UPDATE public.credit_packs
SET
  songs = 60,
  name = 'Mediano',
  description = '60 canciones · Vigencia 30 días',
  is_active = TRUE,
  sort_order = 3
WHERE pack_key = 'mediano_30';

-- El mini pack "Grande" ($350 pago único) no se ofrece (duplicado de Pack Inicio mensual).
UPDATE public.credit_packs
SET
  songs = 160,
  name = 'Grande',
  description = '160 canciones · Vigencia 30 días',
  is_active = FALSE,
  sort_order = 4
WHERE pack_key = 'grande_80';

