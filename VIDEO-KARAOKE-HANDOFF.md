# Video Karaoke — Handoff (Estado del trabajo)

Repositorio local:
- `C:\Users\DELL\Documents\Codex\2026-08-03\ch\work\RAMBER-Tunes-real`

Rama obligatoria:
- `luciana-redesign-integration` (NO tocar `main`)

Fecha del handoff:
- 2026-08-16 (America/Mexico_City)

---

## 1) Hash del último commit (en remoto)

- `c079da607255211f158e97e61d5dca15a5638f66`
- Mensaje: `feat: improve Karaoke editor and enable Youka video export`
- Estado: este commit está en `origin/luciana-redesign-integration`.

---

## 2) Archivos modificados (sin commitear, pendientes locales)

Estado actual (`git status --porcelain`):
- `M api/_lib/video-karaoke/handler.js`
- `M src/views/VideoKaraokePreview.tsx`

Estos cambios NO están en GitHub todavía.

Recomendación para no perderlos al cambiar de cuenta:
- Opción A (recomendado para “pausar trabajo”): `git stash push -m "wip: sanitize provider name in UX"`
- Opción B: hacer commit cuando el usuario lo autorice.

---

## 3) Cambios realizados en cada archivo (pendientes locales)

### A) api/_lib/video-karaoke/handler.js

Objetivo:
- Sanitizar errores devueltos al frontend para que el usuario final NO vea el nombre del proveedor externo.

Cambio:
- Se agregó `sanitizeProviderError(error)` para:
  - Reescribir mensajes sensibles (“credencial rechazada”, “no implementado”, etc.) a mensajes neutros (“Servicio temporalmente no disponible.”).
  - Reemplazar cualquier aparición de “youka” por “el servicio” en `error.message`.
  - Forzar `error.provider = "karaoke"` (en vez de exponer provider real).
- Se aplica sanitización en:
  - `sendProviderResponse()` (para errores del provider)
  - `invalid()` (para errores de validación)

Nota:
- Esto NO cambia la arquitectura interna (solo lo que se expone al usuario final).

### B) src/views/VideoKaraokePreview.tsx

Objetivo:
- Quitar menciones visibles del proveedor externo en la experiencia del usuario (labels y mensajes).

Cambios (solo textos):
- Mensajes de error del flujo del Paso 3:
  - “No pude preparar la subida a …” → “No pude preparar el archivo.”
  - “No pude subir el archivo a …” → “No pude subir el archivo.”
  - “No pude cotizar el proyecto con …” → “No pude obtener la cotización.”
  - “No pude crear el proyecto de …” → “No pude iniciar el procesamiento.”
  - “... falló al procesar ...” → “El servicio falló al procesar el karaoke.”
- Paso 2 (Letra):
  - “... activo ...” → “Sincronización activa: …”
  - placeholder “detectará …” → “Detectaremos …”
- Paso 3 (Audio):
  - “Costo [proveedor]” → “Costo de procesamiento”
  - “Instrumental real generado por [proveedor]” → “Instrumental generado automáticamente.”
- Mensaje técnico interno:
  - “... no devolvió exportId” → “No se recibió el identificador de exportación.”

---

## 4) Estado actual del flujo de Video Karaoke (arquitectura)

### Frontend (Wizard)
Archivo principal del módulo:
- `src/views/VideoKaraokePreview.tsx`

Wizard:
1) Canción (selección + metadata duración real)
2) Letra (auto / pegar / archivo)
3) Karaoke (procesamiento + reproducción instrumental)
4) Diseño (editor ancho con preview sticky + pantalla completa)
5) Exportar (cotizar export + crear export + polling + mostrar MP4)

### Backend (Vercel /api)
Entry point:
- `api/[...route].ts` (router principal)

Módulo Video Karaoke (runtime compatible JS):
- `api/_lib/video-karaoke/handler.js` (router interno del módulo)
- `api/_lib/providers/youka.js` (provider real, pero solo backend)

Regla de seguridad:
- El frontend NUNCA usa API key del proveedor.
- El backend es el único que tiene acceso a `YOUKA_API_KEY`.

---

## 5) Funciones completamente operativas (en código)

### UI / Editor
- Duración real por metadata (`audioDurationSec`) en UI.
- Paso 4 editor ancho + preview grande sticky.
- Modo “Pantalla completa” en Paso 4.

### Flujo de procesamiento (Paso 3)
- `POST /api/video-karaoke/uploads`
- `PUT` al `uploadUrl` firmado (directo desde browser)
- `POST /api/video-karaoke/quote` (cotización de proyecto)
- `POST /api/video-karaoke/projects` (creación de proyecto, idempotente)
- Polling: `GET /api/video-karaoke/tasks/:id`
  - Trata `finalized` como estado exitoso.
- Carga de stems: `GET /api/video-karaoke/projects/:id`
  - Usa stem instrumental cuando “Eliminar voz principal” está activo.

### Flujo de export (Paso 5) — listo para usarse, pero NO ejecutado en pruebas por el asistente
- `POST /api/video-karaoke/projects/:projectId/exports/quote`
- `POST /api/video-karaoke/projects/:projectId/exports`
- Polling: `GET /api/video-karaoke/exports/:exportId`
- UI para mostrar video final y botón Descargar MP4 cuando exista `downloadUrl`.

---

## 6) Funciones simuladas / mock

- No se detectó un “mock de export” activo en el Paso 5 dentro del commit `c079da6` (flujo real está implementado).
- Componentes/estados “demo” pueden existir solo como UI (ej. vista previa visual), pero el flujo backend está real.

Importante:
- Aunque el flujo real exista, NO se debe disparar exportación automáticamente. Debe ser acción manual del usuario tras ver la cotización.

---

## 7) Endpoints internos (Luciana) que ya existen / funcionan en código

Base: `/api/video-karaoke/*`

Proyecto:
- `POST /api/video-karaoke/uploads`
- `POST /api/video-karaoke/quote`
- `POST /api/video-karaoke/projects`
- `GET /api/video-karaoke/tasks/:taskId`
- `GET /api/video-karaoke/projects/:projectId`

Export:
- `POST /api/video-karaoke/projects/:projectId/exports/quote`
- `POST /api/video-karaoke/projects/:projectId/exports`
- `GET /api/video-karaoke/exports/:exportId`

---

## 8) Endpoints pendientes

No se detectaron endpoints “faltantes” para el flujo descrito (proyecto + export) dentro del código actual.

Pendiente real:
- Confirmar en Preview real que el `PUT` al uploadUrl firmado funcione sin CORS/bloqueos, y que el deployment NO redirija a login/SSO para llamadas `/api`.

---

## 9) Variables de entorno necesarias (Preview/Production)

Necesarias para procesamiento:
- `KARAOKE_YOUKA_ENABLED=true`
- `YOUKA_API_BASE_URL=https://api.youka.io/api/v1` (o el base correcto)
- `YOUKA_API_KEY=yk_...` (solo backend; nunca en frontend)

Opcionales (config):
- `KARAOKE_CREDIT_MULTIPLIER=1` (default)
- `KARAOKE_CREDIT_FIXED=0` (default)
- `KARAOKE_DOWNLOAD_TTL_HOURS=72` (default)

Notas:
- Si el Preview tiene “Deployment Protection” / SSO, el frontend puede fallar al llamar `/api/*` (depende de configuración Vercel).

---

## 10) Último Preview (Vercel)

URL reportada por el usuario (Preview):
- `https://ramber-tunes-6gp3l5mfs-rubens-projects-7434d380.vercel.app/karaoke`

Commit asociado en Vercel deployments:
- `c079da6` (según la lista de Deployments visible en Vercel)

---

## 11) Problemas corregidos hasta este momento

- Vercel runtime: compatibilidad JS para el módulo backend de Video Karaoke (`api/_lib/**.js`), evitando imports TS en runtime.
- Cotización del proyecto: corregido el error por enviar simultáneamente `inputFileId` y `durationSeconds` (ahora si existe `inputFileId`, no se manda `durationSeconds`).
- Polling de tareas: se agregó compatibilidad con estado `finalized` como éxito.
- Duración: la UI usa duración real del audio por metadata (no un valor fijo).
- Paso 4: editor grande (layout) con preview sticky y pantalla completa.
- Paso 5: se conectó export real por backend (quote/create/polling/result).

---

## 12) Problemas pendientes (prioridad alta)

### A) “Failed to fetch” en Paso 3 (Preview)
Estado:
- Ocurre en el Preview al llegar al Paso 3.
- No se confirmó aún el request exacto porque el acceso a Runtime Logs/Network del Preview puede estar bloqueado por login/SSO desde algunos entornos.

Hipótesis más probable:
- El `PUT` al `uploadUrl` firmado (cross-origin) está fallando por CORS / bloqueo / protección del destino.

Siguiente paso recomendado:
- En el navegador del usuario:
  - DevTools → Network → filtrar “video-karaoke”
  - Identificar el request en rojo (endpoint + método).
  - Si es el `PUT` al uploadUrl: revisar CORS del destino del uploadUrl.
  - Si es `/api/video-karaoke/*`: revisar protección/SSO del deployment o headers/redirect.

### B) Ocultar nombre del proveedor en UI (pendiente de finalizar)
Estado:
- Ya hay cambios locales listos para:
  - Sanitizar errores backend.
  - Remover textos visibles del proveedor en frontend.
- Falta que el usuario autorice commit/push de estos cambios (si se desea dejarlos permanentes).

---

## 13) Estado exacto del error actual “Failed to fetch”

Interpretación técnica:
- En frontend, “Failed to fetch” suele ocurrir cuando:
  - CORS bloquea la petición,
  - hay error de red,
  - el request es bloqueado por seguridad / redirect cross-origin,
  - timeout / conexión abortada.

Requests candidatos del flujo:
1) `PUT` al `uploadUrl` firmado (más probable porque es cross-origin).
2) `POST /api/video-karaoke/uploads` si el deployment exige autenticación/SSO para `/api`.
3) Cualquier otro `/api/video-karaoke/*` que esté siendo redirigido a login.

Pendiente:
- Confirmar con Network/Runtime Logs el request exacto.

---

## 14) IDs creados durante pruebas (según historial del proyecto)

Proyecto del proveedor (creado en pruebas previas por el usuario):
- `projectId: egoces430mrh`
- `taskId: 71cngdup23b1`
- Estado reportado previamente: task `finalized`, project `ready`, stems: `original`, `instrumental`, `vocals`

Exports:
- No hay IDs confirmados de exports creados por el asistente.

---

## 15) Créditos consumidos durante pruebas

Por el asistente:
- 0 créditos adicionales (no se dispararon exports ni se crearon proyectos nuevos desde las acciones del asistente).

Por el usuario (historial previo):
- Se creó al menos 1 proyecto (IDs arriba). Eso normalmente consume créditos del proveedor. El monto exacto debe confirmarse con el panel/quote del proveedor o logs del momento.

---

## 16) Siguientes pasos recomendados (para retomar con otra cuenta)

1) Asegurar que NO se pierdan cambios locales:
   - `git status`
   - `git stash push -m "wip: sanitize provider name in UX"` (recomendado)
   - o pedir autorización para commit/push.
2) Resolver “Failed to fetch” sin consumir créditos:
   - Identificar en Network si el fallo es:
     - `PUT uploadUrl` (CORS), o
     - `/api/video-karaoke/*` (bloqueo/redirect).
3) Si el fallo es `PUT uploadUrl`:
   - Ajustar CORS del destino del upload, o migrar el upload a backend (si se autoriza un cambio mayor).
4) Si el fallo es `/api/video-karaoke/*`:
   - Revisar Vercel Deployment Protection/SSO para permitir llamadas desde la app al endpoint `/api` del mismo dominio.
5) Una vez estable el Paso 3:
   - Probar Paso 5 en modo controlado:
     - primero `exports/quote`,
     - luego el usuario presiona manualmente “Generar Video Karaoke” (control de créditos).

