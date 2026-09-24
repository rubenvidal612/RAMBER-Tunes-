# Plan de Implementación: Integración Mureka AI

Mapeo de cada Acceptance Criterion del spec.md hacia tareas atómicas. Fase: Implement.

## Task 1: Migración SQL library_items + backfill provider/model_version/mureka_task_id/metadata

- **Priority**: high
- **AC Coverage**: AC-1
- **Depends on**: —
- **Files touched**:
  - `supabase/migrations/20260924110000_add_mureka_provider_columns.sql` (archivo nuevo)
- **Description**: Crear 4 columnas en library_items, backfill automático a provider='suno' para canciones existentes que tengan suno_task_id o suno_audio_id o suno_model. Añadir índice (user_id, provider, created_at desc).
- **Test Requirements**:
  - **TR-1 (rule)**: Después de `supabase_apply_migration` → `SELECT column_name FROM information_schema.columns WHERE table_name='library_items' AND column_name IN ('provider','model_version','mureka_task_id','metadata')` → retorna 4 filas.
  - **TR-2 (rule)**: `SELECT count(*) FROM library_items WHERE (suno_task_id IS NOT NULL OR suno_audio_id IS NOT NULL) AND provider IS DISTINCT FROM 'suno'` → retorna 0.
  - **TR-3 (rule)**: Check constraint provider en la columna: `INSERT INTO library_items(user_id,type,provider) VALUES ('uuid-de-prueba','song','otro')` debe fallar por CHECK constraint (o probar con una fila dummy y revertir).
- **Status**: pending
- **Completion Evidence**: (llenar tras task terminada)

---

## Task 2: Frontend ApprovedCreatePreview.jsx — Extender VALID_MODEL_NAMES, MODEL_TO_PROVIDER, selector Paso 3 con opciones Mureka

- **Priority**: high
- **AC Coverage**: AC-2 (mitad), AC-3 (toggle isMureka)
- **Depends on**: —
- **Files touched**:
  - `src/ApprovedCreatePreview.jsx`
- **Description**:
  1. Añadir a VALID_MODEL_NAMES: 'Mureka V9.5 (Recomendado)', 'Mureka Auto', 'Mureka V9'.
  2. Crear constante MODEL_TO_PROVIDER y MODEL_PROVIDER_CODE (map nombre visible → {provider, model}).
  3. Actualizar el render del selector modelo Paso 3 para mostrar las 3 opciones Mureka agrupadas (o separador Suno / Mureka).
  4. Computar `isMureka = MODEL_TO_PROVIDER[data.model] === 'mureka'`.
- **Test Requirements**:
  - **TR-1 (rule)**: Seleccionar "Mureka V9.5 (Recomendado)" → console.log(data.model) devuelve el string exacto.
  - **TR-2 (rule)**: VALID_MODEL_NAMES.has('Mureka V9.5 (Recomendado)') → true.
- **Status**: pending
- **Completion Evidence**:

---

## Task 3: Frontend ApprovedCreatePreview.jsx — Ocultar Rareza / Influencia + Payload endpoint correcto /api/mureka/generate

- **Priority**: high
- **AC Coverage**: AC-2 (resto), AC-3, AC-4 (mitad payload), FR-4 (envío provider/model)
- **Depends on**: Task 2
- **Files touched**:
  - `src/ApprovedCreatePreview.jsx` (regiones Rareza/Influencia sliders + handleBuildPayload + handleGenerate)
- **Description**:
  1. Renders de los RangeSetting Rareza / Influencia: envolver en `{!isMureka && (...)}`.
  2. En el handler que construye el payload (~línea 5246), usar MODEL_PROVIDER_CODE para sacar `{ provider, model }`.
  3. Si `provider === 'suno'` → POST al endpoint viejo `/api/suno/generate` con TODO el payload que ya existe (weirdness/styleWeight/...). Sin cambios a la lógica Suno.
  4. Si `provider === 'mureka'` → POST a `/api/mureka/generate` con payload reducido: { provider, model, title, lyrics, style, prompt (title + " " + style para Mureka), n: 2, gender, audio_ref_url solo si provider=suno; para mureka no enviar weirdnessConstraint, styleWeight, audioWeight). Toast info si el usuario tenía audio referencia seleccionado con Mureka "Audio referencia no compatible con Mureka aún".
  5. Polling loop para Mureka: después de recibir `{ task_id, provider:'mureka' }` → poll cada 5s a `GET /api/mureka/query/${taskId}` hasta succeeded/failed. Cuando succeeded → refetch library_items o leer library_item_ids directamente.
- **Test Requirements**:
  - **TR-1 (rule)**: Seleccionar Mureka → inspeccionar panel sliders Rareza/Influencia → `element.getBoundingClientRect().width === 0` o `display === none`.
  - **TR-2 (rule)**: Network tab: POST a `/api/mureka/generate` cuando el selector es Mureka; POST a `/api/suno/generate` cuando es Suno.
  - **TR-3 (rule)**: Body payload mureka 0 matches weirdness/styleWeight/audioWeight; body suno sí incluye.
- **Status**: pending
- **Completion Evidence**:

---

## Task 4: Frontend CreateView.tsx — Selector header modos personalizados + sliders disabled when Mureka

- **Priority**: medium
- **AC Coverage**: AC-2 (CreateView), AC-3 (CreateView)
- **Depends on**: — (se puede hacer en paralelo con Task 2/3 ya que son archivos distintos)
- **Files touched**:
  - `src/views/CreateView.tsx`
- **Description**:
  1. Expandir el state type de `model` para incluir strings mureka (o dejar `string` simple).
  2. Añadir las 3 opciones Mureka en el menú desplegable desktop y en el select móvil (~L3815-L3872). Poner separadores o headers "Suno" y "Mureka".
  3. Crear MAP_MODEL_PROVIDER igual que en ApprovedCreatePreview.jsx.
  4. isMureka flag → cuando True, los sliders Weirdness / Style weight se deshabilitan (disabled + opacity 0.5) y NO se incluyen en el payload a mureka.
  5. handleAddVocalsFromAudio u otro handler que envía generate: enviar al endpoint correcto igual que Task 2.
- **Test Requirements**:
  - **TR-1 (rule)**: Selector desktop + móvil: 3 nuevas opciones Mureka aparecen.
  - **TR-2 (rule)**: Cuando es Mureka, payload no incluye weirdness/styleWeight.
- **Status**: pending
- **Completion Evidence**:

---

## Task 5: Backend api/[...route].ts — murekaHandler: router head, auth, generate POST consume 12 créditos, call Mureka external, guardar task tracking

- **Priority**: high
- **AC Coverage**: AC-4, NFR-1 (suno no tocado), NFR-5 (créditos consistentes)
- **Depends on**: —
- **Files touched**:
  - `api/[...route].ts` (sección nueva, sin tocar sunoHandler/sunoWebhookHandler)
- **Description**:
  1. Buscar línea que tiene `if (head === "suno") return sunoHandler(req, res)` (L22866 aprox). Justo antes o después añadir `if (head === "mureka") return murekaHandler(req, res);`.
  2. Implementar `async function murekaHandler(req, res)`:
     - Parse method / url parts = URL pattern split('/').
     - Validar `MUREKA_API_KEY = process.env.MUREKA_API_KEY`.
     - POST /api/mureka/generate → subrutina `handleMurekaGenerate`:
       - Auth requireAnyUserFromToken.
       - Parse body: { model, lyrics, prompt, style, title, gender, n }.
       - Validar `model` ∈ { 'mureka-9.5', 'auto', 'mureka-9' } (flexible, trim).
       - Consumir 12 créditos; si falla → 402.
       - Armar body para Mureka: { lyrics, prompt: prompt || (title + ". " + style), model, n: n || 2 }.
       - Fetch: `POST https://api.mureka.ai/v1/song/generate` + headers `Authorization: Bearer ${apiKey}`, `Content-Type: application/json`; timeout 30s (AbortController).
       - Parse response: buscar `task_id` flexiblemente (root.task_id, data?.task?.id, data?.task_id…).
       - Si falla Mureka (non-2xx o sin task_id): ajustar créditos +12 → send 502 { ok:false, message: userFriendly } + console.error("[murekaHandler.generate] FAIL ... technical details slice 500").
       - Guardar task tracking: INSERT suno_tasks (task_id, user_id, kind='generate:mureka', model_code, cost=12, status='queued', consumed=false, extra json con provider=mureka). No necesitamos que la tabla tenga provider column, lo ponemos en metadata/kind.
       - Responder al frontend { ok:true, task_id, provider:'mureka', model, status:'queued' }.
     - GET /api/mureka/query/:taskId → subrutina `handleMurekaQuery` (Task 6).
  3. Regla: NO usar sintaxis TS exclusiva (`as const`, `type`, `interface` inline). JSDoc si hace falta.
- **Test Requirements**:
  - **TR-1 (rule)**: `curl -X POST /api/mureka/generate` SIN token → 401.
  - **TR-2 (rule)**: POST válido con usuario créditos OK → tabla suno_tasks tiene 1 row con task_id y kind=generate:mureka, crédito descontado 12.
  - **TR-3 (rule)**: Env MUREKA_API_KEY no definida → créditos se reembolsan (ajuste +12) y response 500 userFriendly.
- **Status**: pending
- **Completion Evidence**:

---

## Task 6: Backend api/[...route].ts — handleMurekaQuery + polling + finalizeMurekaTask: extraer URLs, R2, INSERT library_items provider=mureka + metadata stem_provider

- **Priority**: high
- **AC Coverage**: AC-5, AC-8, NFR-4 (idempotencia), NFR-3 (sin leak details)
- **Depends on**: Task 5
- **Files touched**:
  - `api/[...route].ts` (misma región Task 5)
- **Description**:
  1. `handleMurekaQuery(req, res, taskIdFromPath)`:
     - Auth requireAnyUserFromToken.
     - Validar ownership: SELECT 1 FROM suno_tasks WHERE task_id = $1 AND user_id = $2; si no → 403.
     - Chequear si ya está finalizado: SELECT count(*) FROM library_items WHERE user_id = $1 AND mureka_task_id = $2; si count ≥ 1 → devolver { ok:true, status:'succeeded', library_item_ids: [...] } SIN re-llamar a Mureka (idempotencia).
     - ELSE → GET `https://api.mureka.ai/v1/song/query/${taskId}` Bearer. Timeout 10s.
     - Parsear status: preparing/queued/running → responder { ok:true, status, progress: (pct si hay) }.
     - failed → actualizar suno_tasks.status='failed'; adjustUserCredits +12; respond { ok:false, message:"No se pudo generar la canción con Mureka. Créditos devueltos.", status:'failed' } + console.error técnico.
     - succeeded → ejecutar `finalizeMurekaTask(userId, taskId, murekaResponseBody)`.
  2. Helper `extractMurekaTracks(body)`: explore payload.data?.choices, payload.data?.output, payload.choices, payload.output; array de {audio_url, image_url, title, lyrics}.
  3. Helper `finalizeMurekaTask(userId, taskId, body)`:
     - tracks = extractMurekaTracks(body).
     - Por cada track idx:
       - Si audio_url NO contiene .r2. → fetchBuffer(90s timeout) → uploadToR2(path=`imports/${userId}/${ts}_mureka_${taskId}_${idx}.mp3`, buf, audio/mpeg). Si R2 falla → usar original temporal.
       - Cover opcional: si image_url y no R2 → optional copy o dejar original.
       - Model_version = solicitado en el task tracking (buscar de suno_tasks).
       - metadata JSONB = JSON.stringify({ stem_provider: 'mureka', stem_endpoint_hint: '/v1/song/stem-separation', mureka_model: murekaModelCode, generated_at: nowISO }).
       - dedupe: SELECT 1 FROM library_items WHERE user_id = $1 AND mureka_task_id = $2 AND metadata->>'mureka_idx' = $3; si existe skip.
       - INSERT INTO library_items(user_id,type,title,lyrics,gender,audio_url,cover_url,suno_task_id,suno_audio_id,suno_model,provider,model_version,mureka_task_id,metadata,is_cover) VALUES (..., NULL,NULL,NULL,'mureka',model_version,taskId,metadata, false).
     - UPDATE suno_tasks SET status='completed', consumed=true WHERE task_id = taskId.
     - Responder con { ok:true, status:'succeeded', library_item_ids: [...], tracks: [{id, audio_url, title, ...}] }.
  4. REGLA: Nunca leak technical details al user. Todas las respuestas solo message userFriendly; técnicos en console.error("[murekaHandler.query]...").
- **Test Requirements**:
  - **TR-1 (rule)**: GET /query con task_id de otro user → 403.
  - **TR-2 (rule)**: 2 llamadas polling GET succeeded consecutivas → COUNT library_items WHERE mureka_task_id = X se mantiene igual (no inserts duplicados).
  - **TR-3 (rule)**: metadata JSONB del row incluye stem_provider='mureka' y stem_endpoint_hint='/v1/song/stem-separation'.
- **Status**: pending
- **Completion Evidence**:

---

## Task 7: LibraryView + MiniPlayer badges provider Suno/Mureka + deshabilitar stems para Mureka (próximamente)

- **Priority**: medium
- **AC Coverage**: AC-6, AC-7, AC-8 (UI visible)
- **Depends on**: Task 1 (necesita columnas provider/model_version)
- **Files touched**:
  - `src/views/LibraryView.tsx`
  - `src/components/MiniPlayer.tsx`
  - (Opcional) `src/index.css` o theme si hace falta clases CSS badge-mureka.
- **Description**:
  1. Al hacer fetch de songs en LibraryView, incluir las nuevas columnas `provider`, `model_version` en el select de Supabase (además de suno_model) → `select("id,title,description,lyrics,gender,suno_model,model_version,provider,mureka_task_id,audio_url,cover_url,created_at,deleted_at,deleted_reason,suno_task_id,suno_audio_id,is_cover")`.
  2. Compute displayProviderBadge:
     - Si provider === 'mureka' → `Mureka ${versionCorta(model_version || '')}` con color distinto (bg-emerald-500/20, text-emerald-400, border-emerald-500/30).
     - Si provider === 'suno' o (provider == null y (suno_task_id o suno_model)) → `Suno ${versionCorta(model_version || suno_model || 'V6')}` con badge default estilo actual.
  3. MiniPlayer: mostrar el mismo badge pequeño en la barra inferior.
  4. Para el botón "Separar stems" / "Separar vocal": si provider === 'mureka' → deshabilitar el botón + tooltip "Próximamente disponible para Mureka". Si provider === 'suno' → se mantiene flujo actual.
- **Test Requirements**:
  - **TR-1 (rule)**: Song row provider=mureka → badge class `badge-mureka` o string visual empieza "Mureka".
  - **TR-2 (rule)**: Song row mureka + hover botón stem = disabled y texto tooltip visible.
  - **TR-3 (rubric)**: Badge legible, no se superpone con otros textos. Escala 1-5 threshold ≥ 4.
- **Status**: pending
- **Completion Evidence**:

---

## Task 8: Build + commit + push origin main

- **Priority**: high
- **AC Coverage**: AC-10
- **Depends on**: Task 1-7 completadas.
- **Files touched**: Working tree limpio después del commit.
- **Description**: `npm run build` exit 0. git add, git commit msg descriptivo. git push origin main. Reportar hash commit al user.
- **Test Requirements**:
  - **TR-1 (rule)**: Build exit code = 0.
  - **TR-2 (rule)**: git push termina sin errores; git log -1 en remoto/main coincide con local HEAD.
- **Status**: pending
- **Completion Evidence**:
