# [OPEN] Debug Session: telegram-credits-link

## Problema
- El endpoint `api/telegram/credits.ts` devuelve `Cuenta no vinculada` para `telegram_user_id = 5549919765`.
- El cliente sí tiene créditos y se espera que el endpoint encuentre su vínculo/cuenta.

## Hipótesis
- H1. `credits.ts` está buscando el vínculo en una tabla/campo incorrecto y no realmente en `profiles`.
- H2. El `telegram_user_id` se guarda como texto en la base, pero el endpoint lo compara con un tipo/formato distinto.
- H3. El endpoint depende de `telegram_links`, pero el usuario solo existe en `profiles`, por eso nunca encuentra el vínculo.
- H4. El `telegram_user_id` llega alterado o vacío por el body del request antes de consultar Supabase.
- H5. Existe un error de consulta o permisos de Supabase y el código lo está traduciendo de forma engañosa como `Cuenta no vinculada`.

## Plan
- Agregar instrumentación mínima en `credits.ts` para registrar entrada, tabla consultada y resultado de Supabase.
- Reproducir la ruta afectada con el `telegram_user_id` reportado.
- Confirmar o descartar hipótesis con evidencia.
- Aplicar el cambio mínimo necesario.
- Verificar que el endpoint deje de responder `Cuenta no vinculada`.

## Evidencia
- `credits.ts` consultaba `telegram_links` y devolvía `Cuenta no vinculada` inmediatamente si no había fila.
- El código original no tenía ningún fallback a `profiles.telegram_user_id`.
- Se agregó `resolveTelegramUser(...)` para intentar:
  - `telegram_links.telegram_user_id`
  - `profiles.telegram_user_id`

## Estado
- Fix aplicado en código.
- Pendiente verificación en entorno real con el `telegram_user_id = 5549919765`.
