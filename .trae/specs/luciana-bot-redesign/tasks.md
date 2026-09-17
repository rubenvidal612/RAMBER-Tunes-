# LucIAna Bot - Rediseño (Plan de Implementación)
- Repository: `c:\Users\DELL\Documents\Codex\2026-08-03\ch\work\RAMBER-Tunes-real`
- Spec: `spec.md` en la misma carpeta.
- NO tocar ZoCo. NO tocar flujo créditos ni generación. NO tocar /api/gpt/generate ni handlers internos gptGenerateInternal.

---

## Task 1: Guardar nuevo logo oficial en public/assets y generar versiones HD para avatar/header
- **Status**: `pending`
- **Priority**: `high`
- **Depends On**: None
- **Description**:
  - Guardar la imagen L circular azul/dorado proporcionada por el usuario como:
    1. `public/logo-luciana-hd.png` (copia HD, 1024x1024, PNG transparente/fondo limpio, reutilizable para avatar/header)
    2. `public/assets/logo-luciana-official.png` (mismo archivo, conservar compatibilidad path assets/)
    3. Sobrescribir versiones PWA/iconos con versiones redimensionadas a partir de la HD:
       - Sobrescribir `public/logo192.png` (192²)
       - Sobrescribir `public/logo512.png` (512²)
       - Sobrescribir `public/icon-192.png`, `public/icon-512.png`
       - Sobrescribir `public/apple-touch-icon.png` (180²)
    4. Opcionalmente crear `public/icon-r.svg` nuevo version minimalista SVG circular o mantener fallback a PNG nuevo.
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `rule` TR-1.1: `Test-Path public/logo-luciana-hd.png` y `public/assets/logo-luciana-official.png` = True y peso > 0.
  - `rule` TR-1.2: Archivos sobrescritos logo192, logo512, icon-192, icon-512, apple-touch-icon existen y son PNG (file header 89504E47).
- **Notes**: NO borrar `public/assets/luciana-music-logo.jpeg` (archivo histórico, solo dejar de referenciarlo).

## Task 2: Actualizar index.html (title, OG, favicons, manifest cache-bust y viewport safe-area)
- **Status**: `pending`
- **Priority**: `high`
- **Depends On**: Task 1
- **Description**:
  - Cambiar `<title>` a "LucIAna Music | Canciones, Covers y MP3 con IA".
  - Añadir meta tags:
    - `<meta name="description" content="Crea canciones completas con IA, covers y pistas personalizadas. Escucha y descarga tu MP3 en alta calidad al instante.">`
    - `<meta property="og:title" content="LucIAna Music | Canciones, Covers y MP3 con IA">`
    - `<meta property="og:description" content="Crea canciones completas con IA, covers y pistas personalizadas. Escucha y descarga tu MP3 en alta calidad al instante.">`
    - `<meta property="og:image" content="/logo-luciana-hd.png">`
  - Cambiar versión cache-bust de links favicon/manifest de `v=20260628-2` a `v=20260917-3`.
  - Asegurar viewport con `viewport-fit=cover` para safe-area: `width=device-width, initial-scale=1.0, viewport-fit=cover`.
  - Añadir id al `<html lang="es">` y `<meta name="theme-color">` dejarlo para manipular dinámicamente (tema claro/oscuro).
- **Acceptance Criteria Addressed**: AC-4, AC-11
- **Test Requirements**:
  - `rule` TR-2.1: `<title>` index.html == exact string esperado (no "AI Songs", no inglés).
  - `rule` TR-2.2: viewport contiene `viewport-fit=cover`.
  - `rule` TR-2.3: Todas las referencias favicon/manifest tienen `?v=20260917-3`.

## Task 3: Actualizar manifest PWA y theme-color inicial
- **Status**: `pending`
- **Priority**: `high`
- **Depends On**: Task 1
- **Description**:
  - Sobrescribir `public/manifest.webmanifest`:
    - name = "LucIAna Music | Canciones, Covers y MP3 con IA"
    - short_name = "LucIAna"
    - description = "Crea canciones completas con IA, covers y pistas personalizadas. Escucha y descarga tu MP3 en alta calidad al instante."
    - theme_color = "#0a0a0a" (default, dark)
    - background_color = "#0a0a0a"
    - icons array → apuntar a `/logo192.png` (192²) + `/logo512.png` (512²) + `/icon-r.svg` con cache-bust `?v=20260917-3`.
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `rule` TR-3.1: manifest `name` y `description` texto español esperado.
  - `rule` TR-3.2: manifest icons `src` 3 entradas = logo192, logo512, icon-r con `?v=20260917-3`.

## Task 4: Crear sistema tema claro/oscuro persistente (ThemeProvider, sin librerías)
- **Status**: `pending`
- **Priority**: `high`
- **Depends On**: None
- **Description**:
  - Crear `src/theme/ThemeProvider.tsx` y `src/theme/theme.css`:
    - theme.css: define `:root`, `html[data-theme="light"]`, `html[data-theme="dark"]` con variables CSS colores:
      - `--bg`, `--bg-elev-1`, `--bg-elev-2`
      - `--text`, `--text-muted`
      - `--border`
      - `--brand-primary` (morado), `--brand-secondary` (azul), `--brand-accent` (dorado)
      - `--bubble-user-bg / text`, `--bubble-assistant-bg / text`
      - `--composer-bg / border`
    - ThemeProvider: React Context que lee `localStorage['luciana_theme']` y si no existe → `matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'`. Expone `{theme, toggleTheme}`.
    - Efecto: al cambiar theme → `document.documentElement.setAttribute('data-theme', theme)` + `localStorage.setItem(...)` + actualiza `document.querySelector('meta[name="theme-color"]').content` (dark = '#0a0a0a', light = '#f7f7fb').
  - Inyectar `ThemeProvider` encima del `App()` en `main.tsx` (antes de render).
  - Importar `theme.css` por `import './theme/theme.css'` en main.tsx.
  - Añadir botón luna/sol icon `Sun / Moon` de lucide-react en:
    1. App.tsx Header global (esquina superior derecha, junto a créditos / avatar de perfil).
    2. Header interno de DifyCopilotView (repetirlo dentro del chat para fácil acceso en móvil).
- **Acceptance Criteria Addressed**: AC-5, AC-6, AC-7, AC-19
- **Test Requirements**:
  - `rule` TR-4.1: Con DevTools Application, borrar `localStorage.luciana_theme`. Aplicación inicia tema correcto según `matchMedia`.
  - `rule` TR-4.2: Tras 1 clic en botón tema, `data-theme` cambia, `localStorage.luciana_theme` persiste, tras hard reload se mantiene.
  - `rule` TR-4.3: Meta tag `theme-color` actualiza contenido tras cambio tema.

## Task 5: Reemplazar logo viejo en Header global + HomeLandingView (landing)
- **Status**: `pending`
- **Priority**: `high`
- **Depends On**: Task 1, Task 2, Task 4
- **Description**:
  - Buscar en App.tsx / HomeLandingView.tsx / componentes header (Sidebar.tsx, BottomNav drawer) los `<img src="/assets/luciana-music-logo.jpeg">` o referencias viejas.
  - Sustituir por `<img src="/logo-luciana-hd.png">` y aplicar estilos circulares (`rounded-full border/ring`).
  - Asegurar tamaños visuales similares (no agrandar/reducir drásticamente).
  - Actualizar copy Landing HomeLandingView (FR-6 / FR-7 / AC-20):
    - Título H1 = "LucIAna Music | Canciones, Covers y MP3 con IA"
    - Descripción H2/p = "Crea canciones completas con IA, covers y pistas personalizadas. Escucha y descarga tu MP3 en alta calidad al instante."
    - Quitar bloques bilingües EN/ES si existen (frases en inglés que repiten en español con `/`).
- **Acceptance Criteria Addressed**: AC-1, AC-13, AC-20
- **Test Requirements**:
  - `rule` TR-5.1: grep `src\views\HomeLandingView.tsx` por strings "AI Songs" / "Download your MP3 directly" devuelve 0.
  - `rule` TR-5.2: grep archivos `src/**/*.tsx` por `assets/luciana-music-logo.jpeg` devuelve 0 matches.

## Task 6: Migración Supabase tablas chat_conversations + chat_messages con RLS
- **Status**: `pending`
- **Priority**: `high`
- **Depends On**: None
- **Description**:
  - Crear `supabase/migrations/20260917010000_chat_tables.sql` (nombre convención timestamp):
    - `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
    - Tabla `chat_conversations`:
      - id uuid DEFAULT gen_random_uuid() PRIMARY KEY
      - user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
      - title text NOT NULL DEFAULT 'Nuevo chat'
      - summary_snapshot jsonb DEFAULT '{}'::jsonb
      - internal_dify_conversation_id text DEFAULT NULL
      - created_at timestamptz DEFAULT now() NOT NULL
      - updated_at timestamptz DEFAULT now() NOT NULL
      - archived_at timestamptz DEFAULT NULL
      - INDEX idx_chat_conversations_user_id_created_at (user_id, created_at DESC)
      - TRIGGER set_timestamp chat_conversations_updated_at BEFORE UPDATE ON chat_conversations EXECUTE FUNCTION moddatetime('updated_at') (o crear función propia moddatetime si no existiera)
    - Tabla `chat_messages`:
      - id uuid DEFAULT gen_random_uuid() PRIMARY KEY
      - conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE
      - role text NOT NULL CHECK (role IN ('user', 'assistant', 'system'))
      - content text NOT NULL
      - structured_action jsonb DEFAULT NULL
      - tokens integer DEFAULT NULL
      - created_at timestamptz DEFAULT now() NOT NULL
      - INDEX idx_chat_messages_conversation_id_created_at (conversation_id, created_at ASC)
      - INDEX idx_chat_messages_conversation_id (conversation_id)
    - ENABLE ROW LEVEL SECURITY EN BOTH.
    - POLICIES:
      - Conversations:
        - SELECT: `true USING (auth.uid() = user_id)`
        - INSERT: `true WITH CHECK (auth.uid() = user_id)`
        - UPDATE: `true USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
        - DELETE: `true USING (auth.uid() = user_id)`
      - Messages:
        - SELECT: `true USING (EXISTS (SELECT 1 FROM chat_conversations c WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid()))`
        - INSERT: `true WITH CHECK (EXISTS (SELECT 1 FROM chat_conversations c WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid()))`
        - UPDATE: `true USING (EXISTS (SELECT 1 FROM chat_conversations c WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM chat_conversations c WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid()))`
        - DELETE: `true USING (EXISTS (SELECT 1 FROM chat_conversations c WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid()))`
  - Aplicar la migración con `supabase_apply_migration(file_path)`.
  - Después de aplicar, confirmar tablas con `supabase_get_tables(schema=public, tables=['chat_conversations','chat_messages'])`.
- **Acceptance Criteria Addressed**: AC-12
- **Test Requirements**:
  - `rule` TR-6.1: Archivo SQL existe en supabase/migrations/ y no depende de `profiles.settings`.
  - `rule` TR-6.2: `supabase_get_tables` devuelve ambas tablas y RLS habilitado.
  - `rule` TR-6.3: Tratar sin usuario autenticado (anónimo) insert falla con policy violation.

## Task 7: Backend: endpoints /api/chat/* en api/[...route].ts (JS puro, NO type expressions)
- **Status**: `pending`
- **Priority**: `high`
- **Depends On**: Task 6
- **Description**:
  - Dentro del closure `apiHandler` en `api/[...route].ts`, añadir switch/rama `head === 'chat'`:
    - Todas las operaciones requieren `requireAnyUserFromToken(bearer)`, `401 {error:'unauthorized', message:'Sesión inválida o faltante.'}` si falla.
    - `GET /api/chat/conversations`
      - Query param opcional `include_archived=1`
      - SELECT id, title, updated_at, created_at, (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count
        FROM chat_conversations c WHERE user_id = auth.id
        ORDER BY updated_at DESC
      - Devolver { data: array, error: null }
    - `POST /api/chat/conversations`
      - Body: `{ title?: string, internal_dify_conversation_id?: string | null }`
      - Insert en chat_conversations(user_id, title, internal_dify_conversation_id) values(auth.id, title|'Nuevo chat', internal_dify_conversation_id) RETURNING id, title, created_at, updated_at.
      - Devolver { data: newConversation, error: null }
    - `PATCH /api/chat/conversations/:id`
      - Body opcional: `{ title?: string, archived_at?: string|null, internal_dify_conversation_id?: string|null }`
      - Sólo se actualiza si `user_id = auth.id`.
      - Devolver { data: updatedRow, error: null } o 404 si no existe.
    - `GET /api/chat/conversations/:id/messages`
      - SELECT id, conversation_id, role, content, structured_action, tokens, created_at FROM chat_messages m WHERE EXISTS(SELECT 1 FROM chat_conversations c WHERE c.id = m.conversation_id AND c.user_id = auth.id AND c.id = :id) ORDER BY created_at ASC.
      - Devolver { data: rows, error: null }
    - `POST /api/chat/conversations/:id/messages`
      - Body obligatorio: `{ role: 'user'|'assistant'|'system', content: string, structured_action?: object|null, tokens?: number }`
      - Validar conversation pertenece a user_id=auth.id (JOIN chat_conversations).
      - Insert message RETURNING id, role, content, structured_action, tokens, created_at, conversation_id.
      - También actualiza `updated_at = now()` del chat_conversations padre.
      - Devolver { data: insertedMessage, error: null }
- **Acceptance Criteria Addressed**: AC-13, AC-12
- **Test Requirements**:
  - `rule` TR-7.1: `POST /api/chat/conversations` 200 con Bearer correcto devuelve {data: {id, title...}}.
  - `rule` TR-7.2: Sin Bearer / token equivocado → 401 {error:'unauthorized'}.
  - `rule` TR-7.3: Otro usuario intenta GET messages chat ajeno → 0 rows no 403 (privacidad).

## Task 8: Rediseño UI base de DifyCopilotView (layout 100dvh, mensajes burbujas, compositor sticky, sin IDs técnicos)
- **Status**: `pending`
- **Priority**: `high`
- **Depends On**: Task 1, Task 4
- **Description**:
  - Estructura DOM DifyCopilotView:
    - Contenedor raíz: `w-full h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col` (o `calc(100dvh - 64px)` si ocupa header global, ajustar según App layout). Safe-area: `pt-[max(0px,calc(env(safe-area-inset-top)-8px))] pb-0`.
    - Header Chat (flex-none):
      - Botón hamburguesa Drawer historial chats
      - Logo nuevo circular pequeño + título "LucIAna Bot"
      - Botón "Nuevo chat"
      - Botón tema (Moon/Sun)
    - Main `flex-1 min-h-0 flex overflow-hidden`:
      - Drawer historial chats (puede ser offcanvas si móvil, o panel izquierdo 280px desktop)
      - Cola mensajes → div interior `flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-4` (SOLO esta área hace scroll).
    - Compositor: `sticky bottom-0 left-0 right-0 z-20 flex-none bg-[var(--bg-elev-1)] border-t border-[var(--border)] px-3 md:px-6 py-3 pb-[max(12px,env(safe-area-inset-bottom))]`.
  - Message bubbles:
    - User: justify-end → wrapper `ml-auto` → bubble `bg-[var(--bubble-user-bg)] text-[var(--bubble-user-text)] rounded-2xl rounded-tr-md max-w-[80%] shadow-sm px-3 py-2`. Sin avatar.
    - Assistant: justify-start → avatar logo nuevo `w-9 h-9 rounded-full mr-2 flex-none object-cover shadow ring-1` + bubble `bg-[var(--bubble-assistant-bg)] text-[var(--bubble-assistant-text)] rounded-2xl rounded-tl-md max-w-[85%] border border-[var(--border)] px-3 py-2`.
  - Bienvenida cola vacía (FR-15 / AC-9):
    - ÚNICA card centrada verticalmente: logo-nuevo grande, "Hola, soy LucIAna Bot", subtítulo "Cuéntame la canción que quieres y te ayudo con letra, título y estilo.", botón pequeño ejemplo ideas ("Ej: reggaetón sobre playa y fiestas").
    - Quitar mensajes duplicados.
    - Quitar texto "Conversación: {id}". Quitar badge Beta. Quitar referencias visibles a Dify/Claude/Gemini/API/proveedor (limpiar).
  - Compositor:
    - Textarea auto-resize (max-height 150px) + botón enviar circulo gradiente morado azul. Placeholder: "Escribe tu idea o pregunta musical…".
    - Desplazar historial al final cada vez que `messages.length` cambie → `scrollRef.current.scrollTop = scrollRef.current.scrollHeight` dentro de requestAnimationFrame.
  - Mapeo toast errores neutro (ya aplicado commit anterior, reforzar): no exponer dify_copilot_XXX codes.
- **Acceptance Criteria Addressed**: AC-8, AC-9, AC-10, AC-11, AC-19
- **Test Requirements**:
  - `rule` TR-8.1: Messages list DOM → `overflow-y-auto` set. Compositor → `sticky bottom-0` (position: sticky, bottom:0).
  - `rule` TR-8.2: Assistant tiene `<img src="/logo-luciana-hd.png">` avatar. User NO tiene avatar.
  - `rule` TR-8.3: Cola vacía no muestra "Conversación:", no muestra beta.
  - `rubric` TR-8.4: Layout sticky; scale 1-5. Anchors 1=compositor oculto, 3=compositor visible pero historial scroll raro, 5=compositor siempre visible, scroll solo mensajes y se va al final al enviar/recibir. Threshold >=4.

## Task 9: Integración frontend historial ↔ Supabase (carga chats, mensajes, guardar cada mensaje)
- **Status**: `pending`
- **Priority**: `high`
- **Depends On**: Task 7, Task 8
- **Description**:
  - DifyCopilotView state:
    - `conversations` = array chats
    - `selectedConversationId` = string | null
    - `messages` = array ChatMessage
    - `drawerOpen` = boolean
  - Efecto on mount + onAuthStateChange:
    - Espera user activo → GET `/api/chat/conversations` → setConversations.
    - Si array 0 → POST `/api/chat/conversations` (title "Nuevo chat") → selectedConversationId = newId, setMessages([]).
    - Si hay más de una: selectedConversationId = conversations[0].id, GET messages y setMessages(messages).
  - Al cambiar `selectedConversationId`:
    - GET messages de ese id, setMessages([]) antes, setMessages(new).
    - Leer campo interno `internal_dify_conversation_id` (NO lo muestra) y guardarlo en `conversationId` state interno (el que envía a /api/dify/chat).
  - `sendMessage`:
    - 1) Insertar mensaje USER en Supabase: POST `/api/chat/conversations/:selectedId/messages` {role:user, content:text}
    - 2) Continuar con el flujo existente POST `/api/dify/chat` con Bearer y body.
    - 3) Al recibir respuesta LucIAna:
      - Parse structured_action si viene.
      - Guardar respuesta ASSISTANT → POST `/api/chat/conversations/:selectedId/messages` {role:assistant, content:respuesta, structured_action: structured_action||null}
      - Si la respuesta incluye conversation_id (Dify), llamar PATCH `/api/chat/conversations/:selectedId` { internal_dify_conversation_id: conversation_id } para persistirlo.
    - 4) Refrescar conversations list (updated_at ha cambiado) para orden correcto.
- **Acceptance Criteria Addressed**: AC-13, AC-2
- **Test Requirements**:
  - `rule` TR-9.1: Después de cerrar pestaña y volver a abrir, `messages` y `conversations` GET 200 = valores persistidos.
  - `rule` TR-9.2: `internal_dify_conversation_id` nunca aparece en el texto renderizado.

## Task 10: "Nuevo chat" confirmación + drawer historial navegable
- **Status**: `pending`
- **Priority**: `high`
- **Depends On**: Task 9
- **Description**:
  - Botón `Nuevo chat` (antes "Reiniciar"):
    - onClick → abrir `window.confirm` con texto exacto:
      "¿Quieres iniciar un nuevo chat? Tu conversación anterior se conservará en el historial."
    - Si confirmar → POST `/api/chat/conversations` { title: "Nuevo chat" } → selectedConversationId = newId → setMessages([]) → conversationId Dify interno = null. NO borra el chat anterior (ninguna llamada a delete ni PATCH archived_at a menos que el usuario lo pida explícitamente).
    - Si cancelar → return.
  - Drawer historial:
    - Item cada chat: título + fecha relativa (hace 2 horas / ayer / 17 sept) + badge cantidad mensajes pequeño.
    - Item activo highlight gradiente morado.
    - Click → selectedConversationId = id, carga mensajes.
- **Acceptance Criteria Addressed**: AC-14, AC-13
- **Test Requirements**:
  - `rule` TR-10.1: Click Nuevo chat aceptar → lista conversations tiene 1 elemento más que antes. Chat antiguo sigue existiendo.
  - `rule` TR-10.2: window.confirm texto exacto o equivalente modal.

## Task 11: Sugerencias chat nuevo (25-30 msgs) y después de Generar canción
- **Status**: `pending`
- **Priority**: `medium`
- **Depends On**: Task 8, Task 9, Task 10
- **Description**:
  - Dentro del messages-list, al principio del render, renderizar condicionalmente:
    - Si `messages.length >= 25 && messages.length <= 30` → UNA banner pequeña `border rounded-xl p-3 text-xs italic` "Llevas ${messages.length} mensajes en este chat. Si quieres empezar una idea nueva, crea un chat nuevo → [Botón Nuevo chat]".
    - Si `messages.length > 30` NO renderiza nada más que la primera vez (evitar spam). Opcional mantiene la sugerencia pero sin duplicados.
  - Dentro de `handleGenerate` → justo después de recibir 200 OK `/api/gpt/generate` (antes del loading/tracking), renderizar un mensaje `role: system` temporal (o banner inline) en el chat:
    - "Canción en generación. Puedes seguir en el historial o crear un chat nuevo si tienes otra idea → [Botón Nuevo chat]."
    - El system message NUNCA se borra el chat actual.
- **Acceptance Criteria Addressed**: AC-15, AC-16
- **Test Requirements**:
  - `rule` TR-11.1: messages.length = 27 → banner visible. messages.length = 10 → banner NO visible.
  - `rule` TR-11.2: Tras handleGenerate success → banner o system message inline aparece. NO setConversationId a nuevo chat automáticamente.

## Task 12: BottomNav (drawer móvil) — confirmar LucIAna Bot solo drawer y visible (no barra inferior)
- **Status**: `pending`
- **Priority**: `medium`
- **Depends On**: Task 5
- **Description**:
  - Revisar BottomNav.tsx (ya está en este estado desde commit a15bc59) y dejarlo intacto:
    - mainItems: [landing, studio, biblioteca]
    - menuItems: [copiloto (LucIAna Bot), voces, masterizar, planes, perfil]
  - Añadir padding-bottom safe-area al drawer ya que Task 2 añadió viewport-fit=cover.
  - Asegurar que en mobile 360px el texto "LucIAna Bot" no se corta (truncate ok).
- **Acceptance Criteria Addressed**: AC-18, AC-11
- **Test Requirements**:
  - `rule` TR-12.1: BottomNav.mainItems NO incluye id=copiloto. BottomNav.menuItems[0].id = 'copiloto'.
  - `rule` TR-12.2: Drawer items padding-bottom mínimo `max(12px, env(safe-area-inset-bottom))`.

## Task 13: Build producción y validación TS, push origin main (stash intacto)
- **Status**: `pending`
- **Priority**: `high`
- **Depends On**: Tasks 1–12 (all)
- **Description**:
  - Ejecutar `npm.cmd run build` → exit code 0.
  - Revisar diagnostics TS.
  - `git stash list` → stash@{0} sigue existiendo (intacto).
  - `git status` clean (solo archivos nuevos esperados + modificados).
  - `git add` solo archivos necesarios.
  - Commit conv: `feat(redesign): logo nuevo, tema claro/oscuro, chat sticky + historial Supabase RLS + Nuevo chat confirm`.
  - `git push origin main`.
- **Acceptance Criteria Addressed**: Todos los ACs, NFR-6, NFR-7
- **Test Requirements**:
  - `rule` TR-13.1: `npm.cmd run build` → exit 0.
  - `rule` TR-13.2: `git push origin main` exit 0 y commit SHA visible en git log -n 1.
  - `rule` TR-13.3: `git stash list` primer entry = stash@{0} intacto (WIP usuario App.tsx/LibraryView).
