# Integración Mureka AI como 2° motor de generación musical (RAMBER-Tunes-real)

## Overview
- **Summary**: Agregar Mureka AI (api.mureka.ai) como 2° proveedor de generación musical A LA PAR del ya existente Suno (100% intacto). Esto comprende: nuevas columnas BD para persistir `provider` y `model_version`, selector en frontend Paso 3 que agrupa modelos Suno+Mureka y oculta sliders exclusivos de Suno cuando se elige Mureka, backend modular con un handler nuevo `/api/mureka/*` y polling asíncrono, guardado final en `library_items` en Cloudflare R2 igual que Suno, badge visible del proveedor/modelo en Mis canciones y metadata preparada para futura separación de stems vía `/v1/song/stem-separation` de Mureka.
- **Purpose**: Cumplir los 4 puntos funcionales del propietario Rubén Vidal Hernández: persistir provider/model en BD, selector frontend con modelos Mureka y Rareza/Influencia ocultos, servicio backend Mureka aislado sin tocar Suno, metadata preparada para stem-separation específica de Mureka.
- **Target Users**: Usuarios finales de RAMBER-Tunes (LucIAna Music) autenticados via Supabase. Ambos proveedores (Suno y Mureka) son interoperables: Mis canciones muestra ambas, reproductor las reproduce, Mis canciones las ordena igual.

## Goals
- **G1 (Base de Datos)**: Agregar columnas `provider`, `model_version`, `mureka_task_id` a `library_items`; guardar de forma obligatoria en cada inserción / actualización el valor `provider='suno'` (backfill canciones históricas existentes por inferencia = `CASE WHEN suno_task_id IS NOT NULL OR suno_audio_id IS NOT NULL THEN 'suno' END`) y `provider='mureka'` cuando viene del nuevo motor.
- **G2 (Frontend Paso 3 / Header selector)**: Extender el selector de "Motor y versión" actual (Suno V6, V6 Wild, V6 Mini) agrupando también 3 modelos Mureka: "Mureka V9.5 (Recomendado)", "Mureka Auto", "Mureka V9".
- **G3 (Sliders exclusivos Suno - off para Mureka)**: Cuando el usuario seleccione un modelo cuyo `provider = mureka`, ocultar o deshabilitar visualmente los sliders "Rareza (weirdnessConstraint)" y "Influencia del estilo (styleWeight)" para no enviar parámetros incompatibles a Mureka.
- **G4 (Backend modular isolado)**: Implementar un nuevo bloque `murekaHandler` (en el router `api/[...route].ts`, análogo a `sunoHandler`):
  - Autenticación Bearer (mismo `requireAnyUserFromToken`).
  - Consumo de 12 créditos (mismo costo que Suno) y reembolso si falla la generación (mismo `adjustUserCredits`).
  - Inicio de tarea: `POST https://api.mureka.ai/v1/song/generate` con `{ lyrics, prompt, model, n: 2 }` y `Authorization: Bearer MUREKA_API_KEY`.
  - Polling progresivo `GET https://api.mureka.ai/v1/song/query/{task_id}` hasta status `succeeded | failed`.
  - Descarga de los audios finales de `data.choices[] / data.output[]` y copia a Cloudflare R2 con URLs permanentes (mismo patrón `uploadToR2` que Suno).
  - Inserción final en `library_items` con `provider='mureka'`, `model_version`, `mureka_task_id`, `audio_url`, `cover_url`.
- **G5 (Guardado transparente)**: El INSERT / UPDATE en `library_items` es idéntico en estructura; solo cambian los campos de provider y task IDs. Todas las pantallas "Mis canciones" (LibraryView, MiniPlayer) renderizan canciones de cualquier proveedor sin distinción adicional, excepto un badge pequeño "Suno V6" / "Mureka V9.5".
- **G6 (Preparación stems Mureka)**: Para canciones de Mureka, guardar en `library_items.metadata` una marca `{ stem_provider: 'mureka', stem_endpoint_hint: '/v1/song/stem-separation' }`. No se implementa el endpoint de stems en esta fase; solo se deja la metadata preparada para el futuro.
- **G7 (Compatibilidad 100% Suno intacto)**: NO modificar NINGUNA línea en el bloque `sunoHandler`, `sunoWebhookHandler`, las columnas `suno_task_id`, `suno_audio_id`, `suno_model`; conservar flujo existente. En la UI/UX selector modelo, los valores antiguos 'Suno V6', 'Suno V6 Wild', 'Suno V6 Mini' siguen siendo los defaults, se comportan exactamente igual, siguen enviando payloades iguales a `/api/suno/generate`.

## Non-Goals
- **NG-1**: NO implementar en esta fase el endpoint real de separación de stems/vocales `/v1/song/stem-separation` de Mureka; solo guardar la metadata preparada en `library_items.metadata`. Cuando el usuario pulse "Separar stems", la UI mostrará que es una funcionalidad "próximamente para Mureka" o se derivará a la implementación existente Suno solo si provider = suno.
- **NG-2**: NO tocar la carpeta `/telegram-bot/` (regla explícita del propietario). El bot de Telegram seguirá usando solo Suno por ahora; Mureka solo Web App.
- **NG-3**: NO cambiar costos de créditos. Ambos proveedores cuestan 12 créditos canción (misma canción = 2 variantes por defecto).
- **NG-4**: NO crear endpoints nuevos fuera del catch-all `api/[...route].ts` (ej. archivos separados `api/mureka/...`). Mantener el pattern actual por compatibilidad Vercel.
- **NG-5**: No exponer `MUREKA_API_KEY` al frontend. Toda llamada a Mureka sale SIEMPRE del serverless backend.
- **NG-6**: NO introducir sintaxis TypeScript exclusiva en el archivo `api/[...route].ts`. No `as const`, no `type`, no `interface` directamente en ese archivo, para cumplir la regla de compatibilidad JavaScript puro al ejecutarse como Serverless Function en Vercel.

## Background & Context
- Repositorio confirmado: `RAMBER-Tunes-real` working dir correcto.
- Suno: Funciona asíncrono vía webhook (`POST /api/webhooks/suno`) cuando la canción está lista. Suno entrega URLs temporales tipo api.sunoapi.org que el backend copia a Cloudflare R2.
- Mureka: Funciona asíncrono VÍA POLLING del backend (no webhook), patrón `generate → GET /query/{task_id}` repetido hasta `succeeded | failed`.
- Tabla actual `library_items`: no tiene columna explícita `provider`. Se infiere hoy implícitamente porque si tiene `suno_task_id` no null ⇒ suno. Con Mureka necesitamos un campo explícito.
- Campo equivalente actual `model_version` = `suno_model` (valores V6, V6_WILD, V6_MINI). Nuevo campo `model_version` unificado acepta también 'mureka-9.5', 'mureka-auto', 'mureka-9'.
- Frontend principal flujo "fácil" (asistente) = `src/ApprovedCreatePreview.jsx` (JSX JS puro; es el que hay que extender con los sliders).
- Frontend flujo "avanzado/personalizado" = `src/views/CreateView.tsx` (TSX; selector modelo en header).
- Créditos: sistema unificado `consumeUserCredits` + `adjustUserCredits` (fns ya existentes en `api/[...route].ts` y `src/lib/credits.ts`).
- R2: bucket Cloudflare, helper `uploadToR2` ya existe en línea ~337.
- Build pipeline: `npm run build` = Vite build del SPA (TypeScript strict) + revisión sintaxis api/[...route].ts (sin TS types inline).

## Functional Requirements
- **FR-1 (SQL migration library_items)**: Crear migración nueva SQL en `supabase/migrations/` que:
  1. Añada columnas:
     - `provider TEXT NULL CHECK (provider IN ('suno', 'mureka'))`
     - `model_version TEXT NULL` (acepta string arbitrario, validación en backend)
     - `mureka_task_id TEXT NULL`
     - `metadata JSONB DEFAULT '{}'::jsonb NOT NULL`
  2. Backfill UPDATE automático para canciones existentes:
     ```sql
     UPDATE library_items
     SET provider = 'suno',
         model_version = suno_model
     WHERE provider IS NULL
       AND (suno_task_id IS NOT NULL OR suno_audio_id IS NOT NULL OR suno_model IS NOT NULL);
     ```
  3. Índice optativo `INDEX idx_library_items_provider_model ON library_items(user_id, provider, created_at DESC);`
- **FR-2 (Selector modelo ApprovedCreatePreview Paso 3)**: En [ApprovedCreatePreview.jsx](file:///c:/Users/DELL/Documents/Codex/2026-08-03/ch/work/RAMBER-Tunes-real/src/ApprovedCreatePreview.jsx):
  - Actualizar el estado `data.model` y la constante `VALID_MODEL_NAMES` para aceptar también:
    - 'Mureka V9.5 (Recomendado)' ← string visible user
    - 'Mureka Auto'
    - 'Mureka V9'
  - Crear un map nuevo `MODEL_TO_PROVIDER` tipo objeto { 'Suno V6': 'suno', 'Suno V6 Wild': 'suno', ..., 'Mureka V9.5 (Recomendado)': 'mureka', ... }
  - Render el selector (actual botones o select) agrupando con títulos "Suno" y "Mureka" (p. ej. 3 opciones Suno + 3 opciones Mureka con separador o label).
- **FR-3 (Ocultar sliders Rareza / Influencia si provider=Mureka)**: En `ApprovedCreatePreview.jsx`:
  - Variable condicional `const isMureka = MODEL_TO_PROVIDER[data.model] === 'mureka';`
  - El `RangeSetting label="Rareza"` y `RangeSetting label="Influencia del estilo"` NO se renderizan cuando isMureka === true (o se deshabilitan con disabled=true y overlay "Parámetro exclusivo Suno. Selecciona un modelo Suno para usarlo.")
  - Slider "Influencia del audio" (si existe porque hay subida de audio referencia) también se oculta si es Mureka? → dejar igual que hoy: solo si `showAudioInfluence === true && provider === suno`. Si es Mureka con audio referencia → comportamiento a confirmar en assumptions.
- **FR-4 (Envío de provider al backend)**: En `ApprovedCreatePreview.jsx` handler que construye el payload (alrededor de las líneas 5246–5320):
  - Traducir modelo visible a código backend (igual que el map `modelMap` actual):
    ```js
    const MODEL_PROVIDER_CODE = {
      'Suno V6':          { provider: 'suno',   model: 'V6' },
      'Suno V6 Wild':     { provider: 'suno',   model: 'V6_WILD' },
      'Suno V6 Mini':     { provider: 'suno',   model: 'V6_MINI' },
      'Mureka V9.5 (Recomendado)': { provider: 'mureka', model: 'mureka-9.5' },
      'Mureka Auto':                 { provider: 'mureka', model: 'auto' },
      'Mureka V9':                   { provider: 'mureka', model: 'mureka-9' },
    };
    ```
  - Si `provider === 'suno'`: el POST va a `/api/suno/generate` (igual que hoy, payload exactamente igual).
  - Si `provider === 'mureka'`: el POST va a `/api/mureka/generate` (endpoint nuevo), payload:
    ```json
    { "provider": "mureka", "model": "mureka-9.5", "title": "...", "lyrics": "...", "style": "...", "n": 2, "audio_reference_url": "..." (si aplica), "gender": "f/m" }
    ```
    No envía `weirdnessConstraint` ni `styleWeight` (incompatibles Mureka), solo envía prompt=title+estilo, lyrics, model, n=2.
- **FR-5 (Selector modelo CreateView.tsx header - modo personalizado)**: En [CreateView.tsx](file:///c:/Users/DELL/Documents/Codex/2026-08-03/ch/work/RAMBER-Tunes-real/src/views/CreateView.tsx):
  - Actualizar `type del state model` de `'V6'|'V6_WILD'|'V6_MINI'` a union que incluya los 3 mureka (o tipo `string` simple para flexibilidad TS sin expandir demasiado).
  - Agregar las 3 opciones Mureka en el menú desplegable y en el `<select>` móvil, agrupadas por header "Mureka".
  - Mismo mapeo para enviar provider correcto al backend.
  - Cuando sea Mureka, los sliders `weirdnessConstraint` y `styleWeight` se omiten del payload y se deshabilitan visualmente en la UI (poner opacity:0.5, disabled, tooltip info).
- **FR-6 (Router catch-all api/[...route].ts)**: En el router (alrededor L22860):
  - Agregar nuevo bloque: `if (head === "mureka") return murekaHandler(req, res);`
- **FR-7 (murekaHandler POST /api/mureka/generate)**: Handler modular en `api/[...route].ts` que hace:
  1. **Auth**: `const auth = await requireAnyUserFromToken(req); if (!auth.ok) return send(res, 401, { ok:false, message:"No autorizado" });`
  2. **Validación payload**: Parsear body JSON, validar `model ∈ {'mureka-9.5','auto','mureka-9'}`, obligatoriedad `lyrics` o `prompt` (al menos uno).
  3. **Consumo créditos**: `const consumeOk = await consumeUserCredits(admin, auth.user.id, 12); if (!consumeOk) return send(res, 402, { ok:false, message:"No tienes suficientes créditos." });`
  4. **Auth Bearer Mureka**: `const apiKey = String(process.env.MUREKA_API_KEY || "").trim(); if (!apiKey) { await adjustUserCredits(admin, userId, 12); return send(res, 500, {ok:false, message:"Proveedor no configurado."}); }`
  5. **Llamada generate**: `POST https://api.mureka.ai/v1/song/generate` body `{ lyrics, prompt: title + " " + style, model, n: 2 }` headers `{ Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }`. timeout 30s.
  6. **Parsear respuesta**: Si 2xx esperar body con `task_id` (o equivalente `data.task.id`). Si no 2xx o no hay task_id → ajustar créditos + send error amigable (no details al user).
  7. **Guardar en tabla tracking (reutilizar suno_tasks o nueva columna)**: Mejor reutilizar `suno_tasks` con un `kind='generate:mureka'`, `provider='mureka'` (añadir provider columna si no existe? O por defecto dejarlo en kind y task_id = mureka task id). Por simplicidad: INSERT en `suno_tasks(task_id, user_id, kind, cost, status, provider)`; si tabla no tiene provider columna, ignorar y usar kind + suno_task_id = mureka task id.
  8. **Respuesta inmediata al frontend**: `send(res, 200, { ok:true, task_id: murekaTaskId, provider:'mureka', model, status:'queued' })`.
- **FR-8 (Polling / Query Endpoint GET /api/mureka/query/:taskId)**: En murekaHandler, método GET:
  1. **Auth**: requiere usuario.
  2. **Validar ownership**: SELECT en suno_tasks WHERE task_id = taskId AND user_id = auth.user.id. Si no existe o no le pertenece → 404/403.
  3. **Llamada GET Mureka**: `GET https://api.mureka.ai/v1/song/query/${task_id}` con Bearer. Timeout 10s.
  4. **Mapear status Mureka**: preparing|queued|running → devolver igual al frontend. failed → marcar failed, reembolsar créditos 12, devolver mensaje amigable user. succeeded → **iniciar proceso de guardado en library_items + R2** (paso FR-9).
  5. **Si guardado ya se ejecutó (existe library_items con mureka_task_id=taskId)**: devolver directamente `{ ok:true, status:'succeeded', library_item_ids:[...] }` sin re-procesar para evitar duplicados.
- **FR-9 (Persistencia succeeded → R2 + library_items)**: Procedimiento `finalizeMurekaTask(taskId, murekaData)`:
  1. Para cada audio en `data.choices` o `data.output` (detectar estructura por try/catch):
     - Extraer `audioUrl = c.audio_url || c.mp3_url || c.url; coverUrl = c.image_url || c.cover_url; title = c.title || inferredTitle; lyricsFinal = c.lyrics || lyricsOriginal;`
     - Si la URL NO empieza por `.r2.cloudflarestorage.com`: fetch buffer → `uploadToR2('imports/${userId}/${ts}_${murekaAudioIdOrIdx}.mp3', buf, 'audio/mpeg')` → `finalAudioUrl`.
     - Fallback si R2 falla: usar URL original temporal de Mureka.
     - Calcular `model_version` según el modelo solicitado (p. ej. el código 'mureka-9.5').
     - `provider = 'mureka'`.
     - metadata JSONB: `{ stem_provider: 'mureka', stem_endpoint_hint: '/v1/song/stem-separation', mureka_raw: {} }`.
     - Check si ya existe por `mureka_task_id + position_index` o `audio_url` para no duplicar.
     - INSERT library_items(user_id, type='song', title, description, lyrics, gender, audio_url, cover_url, suno_task_id=NULL, suno_audio_id=NULL, suno_model=NULL, provider='mureka', model_version=..., mureka_task_id=taskId, metadata).
  2. Marcar `suno_tasks.status='completed'` y `consumed=true` si corresponde.
  3. Responder al frontend con listado de IDs de library_items y URLs para previsualización.
- **FR-10 (Badge proveedor en LibraryView + MiniPlayer)**: En [LibraryView.tsx](file:///c:/Users/DELL/Documents/Codex/2026-08-03/ch/work/RAMBER-Tunes-real/src/views/LibraryView.tsx) y en [MiniPlayer.tsx](file:///c:/Users/DELL/Documents/Codex/2026-08-03/ch/work/RAMBER-Tunes-real/src/components/MiniPlayer.tsx):
  - Al render una song-card: si `provider==='mureka'` + `model_version` → badge `Mureka V9.5` de color distinto a Suno (p. ej. verde púrpura); si `provider==='suno'` o null + `suno_model` → badge `Suno V6` estilo actual (badge default gris/azul actual).
- **FR-11 (Polling frontend ApprovedCreatePreview)**: En ApprovedCreatePreview después de enviar la generación:
  - Si `provider === 'mureka'`: poll `GET /api/mureka/query/${taskId}` cada 5s, igual que el actual polling de Suno que busca en library_items hasta que aparezca. Mismo UX: spinner, texto "Generando canción con Mureka...", barra progreso si hay porcentaje en la data de Mureka.
  - Cuando status='succeeded' y hay `library_item_ids` → mostrar las canciones nuevas en la preview igual que hoy.
- **FR-12 (Variables de entorno)**: Documentar en el spec que Rubén necesitará después setear en Vercel: `MUREKA_API_KEY = mureka_sk_xxx`. El backend valida presencia y retorna 500 si no existe (con créditos devueltos).

## Non-Functional Requirements
- **NFR-1 (Suno intacto 100%)**: Diff de `sunoHandler`, `sunoWebhookHandler` y funciones internas tipo `normalizeModel`, `finalizeSunoTask` = 0 lineas cambiadas. Solo añadimos código alrededor, nunca lo tocamos.
- **NFR-2 (Compatibilidad sintaxis JS puro en api/[...route].ts)**: Nuevas líneas NO usan `as const`, no `type X = ...`, no `interface X { ... }` inline dentro de ese archivo. Los TS Generics `await supabase.from<T>` se mantienen igual que hoy porque no son sintaxis exclusiva (Vercel los ejecuta bien). Si algún tipo nuevo se requiere, se declara en `src/types.ts` o como comment JSDoc.
- **NFR-3 (No exponer detalles técnicos al usuario)**: Igual que el fix 403 anterior: todos los errores HTTP de Mureka se hacen console.error server-side con prefijo `[murekaHandler]` y al cliente solo se envía `{ ok:false, message: <amigable> }`; nunca `error`, `detail`, stacktrace, response body crudo Mureka al frontend.
- **NFR-4 (No duplicates)**: idempotencia. Si Mureka responde polling succeeded 2 veces seguidas con el mismo task_id, el backend detecta que ya existen library_items con ese mureka_task_id y no inserta de nuevo.
- **NFR-5 (Créditos siempre consistentes)**: Cualquier salida de error (4xx/5xx Mureka, parseo fallido, R2 fallo total) ⇒ ejecutar `adjustUserCredits(userId, +12)` y marcar `consumed=false` para no cobrarle al usuario por fallos nuestros.
- **NFR-6 (Build sin errores)**: `npm run build` exit code 0.
- **NFR-7 (Push main + deploy Vercel automático)**: Entrega con push a origin/main y hash commit reportado al user.
- **NFR-8 (Seguridad Bearer)**: Toda llamada frontend al endpoint `/api/mureka/*` lleva `Authorization: Bearer <jwt actualizado via getValidBearerToken()>` igual que el resto de endpoints.
- **NFR-9 (Ownership taskId)**: GET /api/mureka/query/:taskId SIEMPRE chequea user_id en suno_tasks, evita que usuario A consulte task de usuario B.
- **NFR-10 (Timeouts sensatos)**: fetch() hacia Mureka: generate timeout 30s, query timeout 10s, fetch buffer MP3 timeout 90s (igual que Suno).

## Constraints
- **Technical**: Repository React 19 + Vite SPA. Serverless Functions catch-all en `api/[...route].ts`. NO crear archivos separados `api/services/mureka.ts` a menos que sea forzado por longitud extremadamente grande del handler (pero el owner pidió dentro del router actual en sección dedicada; por defecto: todo dentro de api/[...route].ts en una sección nueva `#region Mureka`).
- **Business**: Flujo Suno 100% intacto; selector modelo backward compatible; costo canción = 12 créditos tanto Suno como Mureka.
- **Dependencies**: Nueva variable entorno `MUREKA_API_KEY`. Nuevas 4 columnas SQL en library_items. NO instalar npm packages nuevos (solo fetch nativo / node-fetch que ya existe).
- **UX**: Mismo patrón de polling/spinner que ya existe para Suno (no UX radicalmente distinto).

## Assumptions
- **A1**: Estructura respuesta Mureka `POST /v1/song/generate` retorna `{ task_id: 'xxx' }` o `{ data: { task: { id: 'xxx' } } }`. La implementación hará parsing flexible (ambas estructuras) para evitar romper si cambian.
- **A2**: Estructura `GET /v1/song/query/{task_id}` cuando succeeded retorna los audios en `data.choices[]` o `data.output[]` (campos `audio_url`, `image_url`, `title`, `lyrics`), similar a Suno. La implementación hará un helper `extractMurekaTracks(payload)` que explore ambas estructuras.
- **A3**: Los sliders "Rareza" e "Influencia" no tienen equivalente en Mureka y simplemente se omiten. Mureka usa solo prompt (título+estilo) y lyrics para guiar la canción. Para "Influencia del audio" cuando hay audio referencia y Mureka seleccionado: se omitirá también en esta primera versión.
- **A4**: El `n: 2` (2 canciones por generación) será fijo igual que Suno; el frontend no muestra selector de cantidad.
- **A5**: Stem separation real no se implementa en esta fase. Solo se guarda `metadata.stem_provider` y `stem_endpoint_hint`. El botón "Separar stems" en LibraryView para canciones Mureka mostrará un toast amigable "Próximamente disponible para Mureka" o se deshabilitará.

## Open Questions
- **[Q1]**: Cuando el usuario selecciona Mureka y sube un audio referencia (para cover), ¿Mureka soporta algún parámetro "audio_ref_url" tipo Suno en `POST /v1/song/generate`? Si la respuesta es NO → se omite ese parámetro. Si la respuesta es SÍ → pasarlo también. **DECISIÓN POR DEFECTO**: En esta primera versión, cuando hay audio referencia y provider=Mureka, se omite el audio_ref_url (el backend no lo envía a Mureka) y se muestra un pequeño toast info "Audio referencia no compatible con Mureka aún; solo se usará el estilo escrito." para que el usuario no se sorprenda.
- **[Q2]**: Reutilizamos `suno_tasks` con `kind='generate:mureka'` para trackear? O creamos tabla `mureka_tasks` independiente? **DECISIÓN POR DEFECTO**: Reutilizar `suno_tasks` con `kind` y `task_id`; si la columna `provider` no existe en `suno_tasks`, se ignora (no añadimos migración adicional a menos que sea necesario). Esto evita complejidad extra.
- **[Q3]**: Campo `suno_model` se llena null cuando provider=mureka, y `model_version` se llena para ambos. ¿Qué pasa con filtros antiguos que usen `suno_model`? Por defecto se seguirá poblando solo para Suno. **DECISIÓN**: Nuevo código (LibraryView badge, etc) usa la columna unificada `model_version` preferentemente, con fallback a `suno_model` si provider es suno o null.

---

## Acceptance Criteria

### AC-1: Columnas provider/model_version/mureka_task_id/metadata creadas en library_items con backfill
- **Type**: `rule`
- **Given**: Ejecuto la migración SQL nueva contra Supabase.
- **When**: Consulto `\d library_items` o `supabase_get_tables(tables=['library_items'])`.
- **Then**:
  1. Existen columnas `provider`, `model_version`, `mureka_task_id`, `metadata` con tipos correctos.
  2. Todas las filas existentes que tenían `suno_task_id` not null ahora tienen `provider='suno'` y `model_version = suno_model`.
- **Pass Condition**: `SELECT COUNT(*) FROM library_items WHERE suno_task_id IS NOT NULL AND provider IS DISTINCT FROM 'suno'` retorna 0; `SELECT count(*) FROM information_schema.columns WHERE table_name='library_items' AND column_name IN ('provider','model_version','mureka_task_id','metadata')` retorna 4.
- **Evidence**: archivo SQL en supabase/migrations/ aplicado + resultado query de comprobación.

### AC-2: Selector modelo Paso 3 muestra opciones Suno + Mureka agrupadas
- **Type**: `rule`
- **Given**: Entro al flujo /crear Paso 3 como usuario autenticado.
- **When**: Abro el selector/menú de modelo.
- **Then**: Veo 6 opciones en total:
  - Grupo Suno: "Suno V6", "Suno V6 Wild", "Suno V6 Mini" (V6 default seleccionado).
  - Grupo Mureka: "Mureka V9.5 (Recomendado)", "Mureka Auto", "Mureka V9".
- **Pass Condition**: Click cualquiera Mureka → state `data.model` se actualiza al string seleccionado; radio visual (si fuera botones) marca selected correcto.
- **Evidence**: Screenshots UI selector + console.log state `data.model` tras click Mureka.

### AC-3: Si Mureka seleccionado → sliders Rareza / Influencia NO visibles ni enviados
- **Type**: `rule`
- **Given**: Selecciono "Mureka V9.5 (Recomendado)".
- **When**: Reviso los controles deslizantes del panel de parámetros creativos.
- **Then**:
  1. "Rareza" no se ve en la pantalla (display none o deshabilitado con overlay).
  2. "Influencia del estilo" idem.
  3. Abro Network tab y pulso "Generar canción" → Payload enviado a `/api/mureka/generate` NO contiene `weirdnessConstraint` ni `styleWeight`.
- **Pass Condition**: grep payload Network tab = 0 matches weirdnessConstraint ni styleWeight cuando provider=mureka.
- **Evidence**: Network tab payloads de 2 ejemplos (1 suno SÍ contiene, 1 mureka NO).

### AC-4: POST /api/mureka/generate consume 12 créditos y retorna taskId
- **Type**: `rule`
- **Given**: Usuario con créditos > 12 selecciona Mureka y envía una solicitud válida.
- **When**: Backend recibe el POST.
- **Then**:
  1. Consumo de créditos confirmado (profiles ramber_credits disminuye 12, o credit_batches FIFO correcto).
  2. INSERT en suno_tasks (o tabla tracking) con task_id=murekaId, user_id correcto, kind='generate:mureka' o similar.
  3. Respuesta HTTP 200 con `{ ok:true, task_id, provider:'mureka' }`.
  4. Si MUREKA_API_KEY no está en env, créditos se reembolsan inmediatamente.
- **Pass Condition**: 2 escenarios: (a) apikey válida, créditos descuentan; (b) apikey vacía, crédito descontado luego reembolsado (neto = 0).
- **Evidence**: perfiles créditos before/after + tabla tasks rows.

### AC-5: Polling query hasta succeeded, guardado R2 + library_items provider=mureka
- **Type**: `rule`
- **Given**: Tarea Mureka ya en estado succeeded (mock o real).
- **When**: GET /api/mureka/query/:taskId es llamado una segunda vez.
- **Then**:
  1. Se detecta status 'succeeded', se extraen URLs Mureka de data.choices/data.output.
  2. Se copia MP3 a R2 (o fallback a URL original si R2 falla).
  3. Se insertan 2 rows (n=2) en library_items con `provider='mureka'`, `model_version = 'mureka-9.5'` (o modelo solicitado), `mureka_task_id = taskId`, `metadata.stem_provider = 'mureka'`.
  4. Campos `suno_task_id`, `suno_audio_id`, `suno_model` quedan NULL en esas rows.
  5. Segunda llamada polling con mismo taskId NO inserta duplicados.
- **Pass Condition**: Query `SELECT count(*) FROM library_items WHERE mureka_task_id = 'xxx'` retorna 2 después de succeeded y 2 siempre en las subsiguientes.
- **Evidence**: Filas library_items post-guardado + rows metadata JSONB contenido.

### AC-6: Badge proveedor renderiza en LibraryView / MiniPlayer
- **Type**: `rule`
- **Given**: Tengo 3 canciones en biblioteca: 2 Suno (V6, V6_WILD) y 1 Mureka (mureka-9.5).
- **When**: Abro Mis canciones / LibraryView.
- **Then**:
  1. Cada Suno muestra badge "Suno V6" / "Suno V6 Wild" (estilo actual o mejorado chiquito).
  2. Mureka muestra badge "Mureka V9.5" (color diferente: p. ej. verde esmeralda o púrpura neon).
  3. MiniPlayer reproduce cualquiera de las 3 sin problemas (provider no influye en la reproducción: solo URL MP3).
- **Pass Condition**: DOM inspección en LibraryView card: `<span class="badge badge-mureka">Mureka V9.5</span>` existe; badge-suno existe para suno.
- **Evidence**: Screenshots 3 canciones + player.

### AC-7: Mismas canciones listadas y reproductor funciona transparente
- **Type**: `rubric`
- **Dimension**: Interoperabilidad proveedores en UI Mis canciones / Player.
- **Scale**: 1-5
- **Anchors**: 1 = Mureka no se lista, no reproduce, orden roto; 3 = Se lista pero falla reproducir o metadata se ve rota; 5 = Lista mezclada Suno+Mureka ordenada created_at desc sin filtro implícito, todas reproducen, cover, título, letra se muestran correctamente.
- **Pass Threshold**: ≥ 4
- **Evidence**: Screenshot lista + reproducción real en MiniPlayer.

### AC-8: Stem separation preparado (metadata presente)
- **Type**: `rule`
- **Given**: Canción Mureka guardada en library_items.
- **When**: `SELECT metadata FROM library_items WHERE provider='mureka' LIMIT 1`.
- **Then**: Contiene llaves `stem_provider: 'mureka'` y `stem_endpoint_hint: '/v1/song/stem-separation'` (además opcional mureka_raw reducido).
- **Pass Condition**: JSON incluye esas 2 keys con valores exactos.
- **Evidence**: query SQL resultado + console.log metadata en UI (si aplica).

### AC-9: Suno NO alterado (100% intacto)
- **Type**: `rule`
- **Given**: Diff entre el commit anterior y este:
- **When**: `git diff 422b3b5 HEAD -- api/[...route].ts | grep -n "sunoHandler\|sunoWebhookHandler\|normalizeModel\|finalizeSunoTask"`.
- **Then**: 0 líneas modificadas dentro de esas funciones (solo líneas AÑADIDAS fuera de las regiones Suno, o comentarios `#endregion Suno` y `#region Mureka`).
- **Pass Condition**: Buscar dentro de bloques function Suno no se modificó.
- **Evidence**: `git diff 422b3b5 HEAD -- src/ApprovedCreatePreview.jsx src/views/CreateView.tsx` sólo agrega líneas nuevas de Mureka. Las funciones existentes handleGenerate para Suno siguen exactamente igual.

### AC-10: Build exit code 0 + push main exitoso
- **Type**: `rule`
- **Pass Condition**: `npm run build` exit 0; `git push origin main` retorna exit 0 y hash commit reportado al user.
- **Evidence**: Build output + git log -1 --oneline.
