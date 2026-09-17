# LucIAna Bot - Rediseño visual, logo, tema, chat persistente y móvil (RAMBER-Tunes-real)

## Overview
- **Summary**: Rediseño integral de la experiencia visual y funcional de LucIAna Music en la ruta `/copiloto` (visiblemente llamada `LucIAna Bot`), que incluye: nuevo logo oficial reutilizable en toda la UI, favicons/PWA, botón tema claro/oscuro persistente, chat profesional con caja compositora siempre sticky/visible al fondo, historial de conversaciones persistente en tablas propias de Supabase con RLS por usuario, idioma por defecto español sin bilingüismo visible, y validación responsive móvil.
- **Purpose**: Cumplir los 32 puntos funcionales solicitados por el propietario de LucIAna Music: profesionalizar la UI, arreglar bugs móvil/compositor chat, conservar intacto el flujo de negocio (créditos 12, ready_to_generate, botón Generar canción), no exponer claves/tecnologías a usuarios finales y cambiar de repositorio al correcto RAMBER-Tunes-real (NO usar ZoCo).
- **Target Users**: Usuarios finales de LucIAna Music con cuenta autenticada Google (todos los planes), incluyendo el propietario Rubén Vidal Hernández (rol admin). Específicamente quienes usan el asistente `LucIAna Bot` desde navegador desktop Chrome/Edge/Firefox y navegadores móviles Chrome Android y Safari iOS (incluida PWA "Añadir a pantalla inicio").

## Goals
- G1: Instalar el nuevo logo oficial de LucIAna Music en TODOS los puntos visibles de la app (header, avatar asistente, favicon, PWA iconos, manifest, OG).
- G2: Añadir cambio de tema claro/oscuro persistente, con preferencia de sistema por defecto, botón luna/sol visible y identidad morado/azul/dorado legible en ambos temas.
- G3: Rediseñar `LucIAna Bot` como chat moderno (burbujas user derecha/bot izquierda logo, bienvenida breve, sin IDs técnicos, compositor sticky al fondo, altura dinámica `100dvh`, safe-area, no desaparece en chats largos).
- G4: Idioma visible 100% español. Título y descripción de bienvenida con las frases exactas que se indicaron.
- G5: Historial de chats persistente en SUPABASE por user_id, con RLS, tablas nuevas (no `profiles.settings`), `conversation_id` Dify interno nunca visible, "Nuevo chat" con confirmación, sugerencia discreta chat nuevo a las 25-30 intervenciones y después de generar canción.
- G6: Conservar INTACTO el backend, la seguridad, el flujo `chat → resumen → botón Generar canción → descuento créditos reales del usuario → generación existente`.
- G7: Móvil: LucIAna Bot accesible desde navegación drawer (menú ☰), ancho/alto correctos con tema claro/oscuro, layout con safe-area y teclado virtual.

## Non-Goals
- NG-1: NO modificar NINGÚN archivo del proyecto ZoCo `C:\ZoCo\ZoCo_Oficial_Marzo` (repositorio POS ajeno). Todo el scope es `C:\Users\DELL\Documents\Codex\2026-08-03\ch\work\RAMBER-Tunes-real`.
- NG-2: NO cambiar el sistema de créditos, los precios en `CREDIT_COSTS`, el endpoint `/api/gpt/generate`, el handler interno `gptGenerateInternal`, el costo 12 créditos ni la lógica de descuento al usuario real.
- NG-3: NO cambiar el pipeline backend de Dify en `api/[...route].ts handleDifyChat` (solo se podrá tocar error formatting neutro y endpoints NUEVOS `/api/chat/*` para historial propio).
- NG-4: NO exponer al usuario final `DIFY_COPILOT_API_KEY`, `DIFY_TOOL_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUNO_KEY` ni ningún token/secreto.
- NG-5: NO llamar Dify directamente desde el frontend. Único punto de contacto debe seguir siendo endpoints autenticados del backend de LucIAna.
- NG-6: NO generar automáticamente una canción después del `structured_action ready_to_generate`; el usuario debe pulsar manualmente el botón "Generar canción".
- NG-7: NO reiniciar automáticamente conversaciones ni borrar el chat activo por alcanzar un número de mensajes.
- NG-8: NO traducir textos ni internacionalizar a inglés. 100% español visible por defecto.

## Background & Context
- Repositorio validado: `RAMBER-Tunes-real` working dir correcto.
- Precondiciones confirmadas el 2026-09-17:
  1. ✅ `src/views/DifyCopilotView.tsx` existe (pantalla actual LucIAna Bot).
  2. ✅ `api/[...route].ts` existe (catch-all backend serverless + vercel.json wildcard).
  3. ✅ Ruta `/copiloto` existe en App.tsx (ruta técnica `/copiloto`, label visible `LucIAna Bot`, alias `/chatbot` y `/luciana` redirigen internamente a tab `copiloto`).
  4. ✅ Commits históricos confirmados: `f3f032a` (integración inicial Dify conversacional) y `5ffb8d4` (fix Bearer JWT object/string parsing) presentes en HEAD.
- Stack confirmado: React 19 + TypeScript + Vite SPA (no Next.js Pages Router ni App Router). Routing manual por `window.location.pathname` en App.tsx auth wall. Supabase Auth (Google OAuth), Tablas `profiles` + `user_profiles` existen. Vercel deployment catch-all vercel.json `api/[...route].ts` + fallback SPA `((?!api/).*) → /index.html`.
- Logo anterior actual: `public/assets/luciana-music-logo.jpeg` (JPEG), favicons `public/icon-r.svg` (S), `public/logo192.png / logo512.png / icon-192.png / icon-512.png / apple-touch-icon.png`, manifest `public/manifest.webmanifest` con name "LucIAna".
- Tema actual: hardcoded dark-only, clases Tailwind `bg-slate-950`, sin sistema `data-theme` ni CSS vars.
- Historial chat actual: guardado en `useState` local de DifyCopilotView (MAP memoria frontend y `conversation_id` en `profiles.metadata.chat.conversation_id`), se pierde al cerrar pestaña, recargar o redeploy, sin RLS ni tablas propias.
- Problema compositor actual: caja de texto se oculta / se desplaza hacia abajo después de varios mensajes porque el layout actual NO separa historial-scroll de compositor sticky/fixed y NO usa `100dvh` con safe-area mobile (punto 14 pedido).
- PWA: manifest y `sw.js` existen, theme-color meta fija `#0a0a0a`.

## Functional Requirements
- **FR-1 (Logo)**: Guardar nuevo logo oficial (la imagen L azul/dorado adjuntada por el usuario) como archivo HD PNG transparente o fondo limpio en `public/logo-luciana-hd.png` y `public/assets/logo-luciana-official.png` (alta resolución >= 1024x1024).
- **FR-2 (Favicon + PWA)**: Generar versiones favicon 32/192/512, apple-touch-icon 180x180, svg versión simple desde el logo para `icon-r.svg`, reemplazar manifest PWA `short_name/name/description/icons/theme_color/background_color` y actualizar version `?v=YYYYMMDD-X` en links favicon/manifest de `index.html`.
- **FR-3 (Header)**: Sustituir el logo anterior por el nuevo en el encabezado principal de la app (top bar / header que aparece después de login) y en el landing HomeLandingView.
- **FR-4 (Avatar LucIAna Bot)**: Quitar todo avatar genérico, emoji, icono de robot del chat de LucIAna Bot. Avatar del asistente = exclusivamente el nuevo logo oficial de LucIAna circular con borde sutil.
- **FR-5 (OG + metadatos)**: Actualizar `<title>` de `index.html` a "LucIAna Music | Canciones, Covers y MP3 con IA" y añadir meta OG `og:title`, `og:description` en español con la frase del punto 6.
- **FR-6 (Idioma visible)**: Toda UI visible debe quedar en español. Si existen textos bilingües EN+ES en landing/PrivacyPolicy/otros visibles (e.g., pantalla chatGPT GPT) se dejará solo la versión en español de forma predeterminada (excepto términos jurídicos PrivacyPolicy si fuera necesario).
- **FR-7 (Bienvenida pantalla principal)**: La pantalla Home / Landing debe mostrar un título H1 "LucIAna Music | Canciones, Covers y MP3 con IA" y descripción "Crea canciones completas con IA, covers y pistas personalizadas. Escucha y descarga tu MP3 en alta calidad al instante."
- **FR-8 (Botón tema)**: Agregar un botón visible con icono `Moon` / `Sun` (lucide-react, librería ya existente) en el encabezado superior de la app y dentro del header de la pantalla LucIAna Bot para alternar tema.
- **FR-9 (Alternancia tema 1-clic)**: Un clic invierte el tema inmediatamente en toda la SPA, sin recargar página.
- **FR-10 (Persistencia tema)**: Preferencia tema se guarda en `localStorage` key `luciana_theme` (valores `light` / `dark`) y NO cambia al recargar, cerrar sesión, reabrir PWA/celular.
- **FR-11 (Sistema por defecto)**: Si `localStorage.luciana_theme` no existe, se inicializa el tema al valor de `window.matchMedia('(prefers-color-scheme: light)')`.
- **FR-12 (Identidad colores tema claro/oscuro)**: En tema claro = fondo blanco/gris muy limpio (no amarillo, no verde), textos alto contraste; en tema oscuro = estilo oscuro elegante actual. Tonos morados, azules y dorados de marca visibles y legibles en ambos temas (WCAG AA al menos 4.5:1 para cuerpo). Tema implementado vía `data-theme="light|dark"` en `<html>` y nuevas variables CSS + 1 contexto `<ThemeProvider>` React mínimo sin librerías externas (no `next-themes`).
- **FR-13 (PWA mobile theme-color dinámico)**: Actualizar meta `theme-color` del DOM al cambiar de tema (oscuro `#0a0a0a` / claro `#f7f7fb`).
- **FR-14 (Chat profesional UI)**: Rediseñar DifyCopilotView. Layout:
  - Header superior (barra) con logo + "LucIAna Bot" título, botón "Nuevo chat", botón tema, botón toggle drawer historial.
  - Cola de mensajes: **Mensajes del usuario a la DERECHA** (bubble sin avatar user opcional inicial), **Mensajes de LucIAna Bot a la IZQUIERDA** con avatar circular logo nuevo a la izquierda.
  - Leyenda/espaciado compacto (no cards gigantes), fecha relativa de cada mensaje (e.g. "hoy 14:23"), contraste adecuado en ambos temas.
  - Sin badges BETA, sin strings visibles "Dify", "Claude", "DeepSeek", "Gemini", "API", "Proveedor".
  - Quitar visualizaciones `Conversación: xxxx-xxxx`.
- **FR-15 (Bienvenida chat vacío)**: Si la cola está vacía, renderizar UNA sola card bienvenida centrada con logo nuevo, título "Hola, soy LucIAna Bot", subtítulo breve p.ej. "Cuéntame la canción que quieres y te ayudo con letra, título y estilo.". Sin mensajes duplicados.
- **FR-16 (Compositor chat siempre visible)**: El área de escribir (textarea + botón enviar) debe permanecer **siempre sticky/fijo en la parte inferior del chat**. Implementar:
  - Contenedor principal de DifyCopilotView con altura efectiva `min(100dvh, calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom)))`.
  - `flex-col`, zona header fija, zona `messages-list` **flex-1 overflow-y-auto** (solo ESTA zona hace scroll), zona compositor `sticky bottom-0` separada, padding-bottom `safe-area-inset-bottom`.
  - Al `scrollHeight` cambiar tras insertar mensaje nuevo, hacer `element.scrollTop = element.scrollHeight` de forma asíncrona con rAF dentro de un effect que observa `messages.length`.
  - NO usar `scrollIntoView` sobre el compositor ni nunca hacer scroll sobre ventana global.
- **FR-17 (Tablas Supabase Historial)**: Crear NUEVAS tablas (NO usar `profiles.settings`), una migration SQL `chat_conversations` + `chat_messages` en carpeta `supabase/migrations/` con RLS:
  - `chat_conversations`: `id uuid pk`, `user_id uuid references auth.users(id) not null`, `title text default 'Nuevo chat' not null`, `summary_snapshot jsonb default '{}'::jsonb null`, `internal_dify_conversation_id text null` (Dify conversation_id NO se muestra en UI), `created_at timestamptz default now() not null`, `updated_at timestamptz default now() not null`, `archived_at timestamptz null`, índice `(user_id, created_at desc)`.
  - `chat_messages`: `id uuid pk`, `conversation_id uuid references chat_conversations(id) on delete cascade not null`, `role text check (role in ('user','assistant','system')) not null`, `content text not null`, `structured_action jsonb null`, `tokens int null`, `created_at timestamptz default now() not null`, índice `(conversation_id, created_at asc)` + `(user_id via conversation)`.
  - **RLS activado** en ambas tablas. Policies `select for update/delete/insert` = `auth.uid() = user_id` (en messages, join via conversation.user_id = auth.uid()). Trigger `updated_at` para chat_conversations.
- **FR-18 (Endpoints backend /api/chat/*)**: Nuevos endpoints JS/TS en `api/[...route].ts` (sintaxis pura JS no TS type expressions para compatible Vercel catch-all). Todos requieren Bearer JWT del usuario real vía `requireAnyUserFromToken` ya existente. Operaciones:
  - `GET /api/chat/conversations` → lista chats activos del usuario (sin archived por default) ordenados `updated_at desc`. Devuelve `id,title,updated_at,message_count`. NO incluye `internal_dify_conversation_id`.
  - `POST /api/chat/conversations` → crea chat nuevo (con title opcional). Devuelve `id`, guarda user_id = auth.uid().
  - `GET /api/chat/conversations/:id/messages` → mensajes del chat del user actual (solo si es dueño). Incluye `structured_action` si lo hay.
  - `PATCH /api/chat/conversations/:id` → actualiza title / archived_at.
  - `POST /api/chat/conversations/:id/messages` → inserta un mensaje `user o assistant` (con role/content/structured_action opcional) y actualiza `updated_at` conversación.
- **FR-19 (Sincronización local ↔ Supabase)**: Frontend DifyCopilotView al cargar:
  1. Obtiene `user.id` via Supabase Auth onAuthStateChange.
  2. Hace GET lista conversaciones, muestra en drawer izquierdo dentro de la pantalla chat.
  3. Si no existe chat → automáticamente crea uno nuevo (POST /api/chat/conversations) sin pedir confirmación la primera vez.
  4. Chat seleccionado: GET mensajes llena cola local.
  5. En cada sendMessage → antes de POST /api/dify/chat, inserta mensaje USER en tabla (POST messages). Cuando llega respuesta LucIAna Bot del backend, inserta mensaje ASSISTANT en tabla messages con structured_action si hay. Así nunca se pierden mensajes al cerrar pestaña o redeploy.
- **FR-20 (Guardado conversation_id interno Dify)**: Cuando `POST /api/dify/chat` devuelve en la respuesta un `conversation_id`, el frontend NO lo muestra al usuario pero debe mandarlo al endpoint `PATCH /api/chat/conversations/:id` con un campo interno `internal_dify_conversation_id` para persistirlo en la tabla `chat_conversations` del usuario correspondiente (no lo lee nadie más).
- **FR-21 (Botón Reiniciar → "Nuevo chat" + confirmación)**: Cambiar texto del botón "Reiniciar" de DifyCopilotView por "Nuevo chat". Al pulsar, muestra modal / confirm window.confirm amigable: **"¿Quieres iniciar un nuevo chat? Tu conversación anterior se conservará en el historial."** → Si el usuario confirma → NO borra el chat anterior. Se archiva? No, solo se deselecciona y se crea uno nuevo en la lista (archived_at = NULL siempre, los chats se conservan, punto 25). El chat nuevo se selecciona, se limpia la cola local y el conversation_id Dify interno se reinicia también.
- **FR-22 (Historial navegable)**: Drawer lateral DENTRO DE DifyCopilotView (no global sidebar) lista los chats del usuario como items clickables `title` + fecha relativa. Al hacer click → carga mensajes del chat seleccionado desde Supabase, setea `selectedConversationId`, setea el `conversation_id` Dify interno si lo hay en el campo interno.
- **FR-23 (Sugerencia chat nuevo 25-30 intervenciones)**: Después de 25-30 mensajes en el chat activo (contando user + assistant), renderizar UN solo banner discreto (sticky top messages-list o inline) "Llevas 27 mensajes en este chat. Si quieres empezar una idea nueva, crea un chat nuevo." + botón chiquito "Nuevo chat". NUNCA se reinicia solo el chat si el usuario no pulsa ese botón (punto 26).
- **FR-24 (Sugerencia chat nuevo después de generar canción)**: Inmediatamente después de que el usuario confirma `handleGenerate` correctamente y se recibe `task_id` de /api/gpt/generate, insertar un mensaje sugerencia del sistema (no se guarda en tabla como assistant, se muestra inline) "Canción en generación. Quieres empezar un chat nuevo para otra idea?" + botón "Nuevo chat". NUNCA borra el chat actual (punto 27).
- **FR-25 (Navegación móvil LucIAna Bot)**: LucIAna Bot queda en el drawer del menú (☰) de BottomNav, como ya está fijado desde commit `a15bc59`. Confirmar visible en mobile sin overflow. NO regresa a la barra inferior por petición del usuario.
- **FR-26 (Mobile responsive chat)**: Comprobación en modo responsive móvil 360x800 dp:
  - Compositor no se oculta al abrir teclado virtual (safe-area).
  - Chat list scroll correcto.
  - Drawer historial dentro de pantalla se abre con botón menú hamburguesa arriba izquierda y no overflow fuera de 100dvh.
  - Header no se sale de pantalla.

## Non-Functional Requirements
- **NFR-1 (Sin librerías tema / chat externas)**: Tema claro/oscuro con CSS vars + `data-theme` + Context React mínimo sin dependencias nuevas. Historial backend con endpoints ya existentes pattern `api/[...route].ts`. No instalar `react-chat-ui`, `next-themes`, `zustand`, `recoil`.
- **NFR-2 (Compatibilidad Vercel catch-all /api/*)**: Nuevos endpoints deben seguir el estilo del closure actual en `api/[...route].ts`, headers parseados con funciones actuales y respuesta JSON con status explícitos.
- **NFR-3 (Compatibilidad enlaces antiguos /chatbot + /luciana)**: Sigue redirigiendo a `/copiloto` (ya implementado en App.tsx tabFromPathname; no tocarlo).
- **NFR-4 (Compatibilidad tokens Bearer)**: Toda llamada frontend a endpoints nuevos usa el helper `getValidBearerToken()` del fix commit 5ffb8d4, que hace getAccessToken() → getSession → refreshSession().
- **NFR-5 (Performance)**: Tiempo hasta paint LCP pantalla chat no debe degradarse más de 150ms con el cambio. Sin importar icons extras pesados.
- **NFR-6 (Build sin errores)**: `npm run build` debe salir exit code 0. Sin TS unused imports warnings si `noUnusedLocals=true` (en la medida de lo posible, quitar imports MessageSquare sobrantes).
- **NFR-7 (Push a origin/main)**: Se entrega con push a main. Stash@{0} y stash@{1} intactos. Working tree clean.
- **NFR-8 (Mobile PWA safe-area)**: Layout DifyCopilotView con `padding-top: max(0px, calc(env(safe-area-inset-top) - 8px))` y `padding-bottom: max(12px, env(safe-area-inset-bottom))`.
- **NFR-9 (Seguridad RLS)**: No debe ser posible leer o escribir en chat_conversations / chat_messages sin autenticación como dueño del registro. Verificar en logs backend: siempre valida `auth.uid() === user_id` antes de cualquier operación.

## Constraints
- **Technical**: Repo React 19 + Vite SPA. Routing manual. NO Next.js. NO TS type expressions en api/[...route].ts. Supabase Postgres 15+ (RLS habilitado).
- **Business**: Identidad visual de marca NO usar recursos de ChatGPT, botones estilo ChatGPT, texto "Preguntar a ChatGPT", emojis robot. SOLO inspiración distribución limpia y modo claro/oscuro.
- **Dependencies**: Las imágenes adjuntas son el logo nuevo. NO generar imágenes placeholder ni URL text_to_image. El logo ya se proporciona.
- **Dependencies supabase**: Supabase debe tener habilitadas `pgcrypto` y RLS antes de ejecutar la migración. Se asume que `supabase_get_project` + `supabase_apply_migration` existen como herramientas.

## Assumptions
- A1: El usuario envió el logo nuevo oficial como imagen PNG circular L azul/dorado (3 veces la misma imagen). Se copia y se guarda.
- A2: Herramientas `supabase_get_project`, `supabase_get_tables`, `supabase_apply_migration` se pueden ejecutar en esta sesión para crear tablas nuevas en el Supabase del proyecto.
- A3: El usuario aceptará que el cambio tema afecta a toda la SPA (no solo LucIAna Bot) para una experiencia uniforme.
- A4: Punto 6 "idioma por defecto español sin bilingüismo" = se reemplazan textos EN visibles como "LucIAna Music | AI Songs, Covers & MP3" por su versión española, pero se mantienen frases jurídicas en PrivacyPolicy si están redactadas adecuadamente (no hay prisa por cambiar PrivacyPolicy salvo strings visibles bilingües user-facing).

## Open Questions
- [Q1, cierre implícito NFR-1]: Usuario aceptará instalar dependencia `sharp` solo si se requiere generar PNG multi-tamaño desde el logo? Si no, se generan multi-tamaño haciendo resize manual vía canvas en build script sin dependencia nueva. → DECISIÓN: **sin nuevas deps**, se usa un script nativo JS simple con Canvas HTML en build-time si fuera necesario; por defecto se guarda el logo HD tal cual y se reutiliza con CSS width/height en todas partes excepto PWA icons que necesitan PNG específicos 192/512/180, que se guardan copiando la versión HD con `<img width/>` en el manifest (si la imagen es 1024x1024 ya sirve para todos los tamaños; los navegadores la reducen).
- [Q2]: ¿El botón tema claro/oscuro visible también en SettingsView? → Se coloca ENCABEZADO GLOBAL (App.tsx Header) y en el header interno de DifyCopilotView.
- [Q3]: ¿Historial drawer se coloca DENTRO de la pantalla DifyCopilotView (no pisa el sidebar global)? → Sí, para no mezclar navegación global con navegación de chats (punto 19-25), según lo común en apps chat modernas.

---

## Acceptance Criteria

### AC-1: Nuevo logo visible en encabezado
- **Type**: `rule`
- **Given**: Estoy autenticado/a en la app y en la ruta `/crear`
- **When**: Cargo la página
- **Then**: El `<img>` del logo del encabezado superior (header global) apunta a `public/logo-luciana-hd.png` o al asset HD nuevo, y el tag no muestra el logo anterior JPEG `luciana-music-logo.jpeg`
- **Pass Condition**: 1) grep `src=".*luciana-music-logo"` en index.html + src/ devuelve 0 coincidencias en renders. 2) Inspección visual elemento header muestra logo circular L azul/dorado nuevo.
- **Evidence**: build finalizado; screenshots y grep output.

### AC-2: LucIAna Bot usa el nuevo logo como avatar (sin robot / emoji)
- **Type**: `rule`
- **Given**: Entro a `/copiloto` y envío un mensaje para que LucIAna Bot responda.
- **When**: El mensaje de LucIAna aparece renderizado a la izquierda.
- **Then**: Al lado del mensaje hay un avatar `<img>` circular del nuevo logo. NO hay icono `<Bot />`, `<Sparkles />` emoji `🤖` como avatar.
- **Pass Condition**: DifyCopilotView no renderiza ninguno de estos componentes como avatar en la burbuja assistant: Bot, Sparkles, MessageCircle, ningún texto/emoji. Solo imagen `<img src={logoNuevo} />`.
- **Evidence**: DifyCopilotView diff code + screenshot pantalla chat.

### AC-3: Favicon + PWA actualizados
- **Type**: `rule`
- **Given**: Abro `https://lucianamusic.app` en navegador móvil Chrome Android y "Añadir a pantalla inicio".
- **When**: Regreso al launcher Android.
- **Then**: El icono de la app del launcher = logo nuevo circular L azul/dorado (no la letra S antigua ni logo viejo). Favicons 16/32 en pestaña navegador = logo nuevo.
- **Pass Condition**: manifest.webmanifest `icons[]` todos apuntan a archivos PNG nuevos. `index.html` links favicon/apple-touch-icon apuntan a los nuevos nombres con `?v=YYYYMMDD-3` nuevo cache-bust.
- **Evidence**: index.html head diff + manifest.webmanifest content diff + Android PWA screenshot.

### AC-4: `<title>` + meta descripción (idioma español)
- **Type**: `rule`
- **Given**: Abre la app sin login.
- **When**: Mira el título de la pestaña del navegador.
- **Then**: Título dice exactamente "LucIAna Music | Canciones, Covers y MP3 con IA".
- **Pass Condition**: grep `<title>` en `index.html` igual al texto esperado y meta description/og:description con la frase español del punto 6.
- **Evidence**: Contenido index.html actualizado.

### AC-5: Botón tema luna/sol visible
- **Type**: `rule`
- **Given**: Cargo la app estando logueado.
- **When**: Busco en la esquina superior derecha (dentro de top bar) un botón.
- **Then**: Existe un botón circular con SVG `Sun` cuando el tema actual es oscuro, o `Moon` cuando es claro. No está oculto con `display:none` ni opacity:0.
- **Pass Condition**: `data-theme` del `<html>` cambia inmediatamente después del clic.
- **Evidence**: video grabación 1 clic alternancia tema + screenshot tema claro + tema oscuro top-bar.

### AC-6: Persistencia tema (localStorage)
- **Type**: `rule`
- **Given**: Selecciono tema claro.
- **When**: Cierro la pestaña y abro otra. (Hard reload Ctrl+Shift+R).
- **Then**: Sigue en modo claro. Cierro sesión / inicio con otro correo y vuelvo a entrar: la preferencia se mantiene igual (porque es del navegador user-agent, no de cuenta).
- **Pass Condition**: `localStorage.getItem('luciana_theme') == 'light'` y `document.documentElement.getAttribute('data-theme') == 'light'` tras reload.
- **Evidence**: Chrome DevTools Application → Local storage keys + después hard reload inspección.

### AC-7: Preferencia del sistema inicial
- **Type**: `rule`
- **Given**: Abro la app en un navegador que NUNCA visitó el sitio (limpio local storage `luciana_theme` key). Sistema operativo está en modo CLARO.
- **When**: Entro a la app.
- **Then**: Tema arranca claro. Si pongo SO en modo oscuro y limpio localStorage vuelve a oscuro por defecto.
- **Pass Condition**: matchMedia usado en el initTheme() y data-theme inicial = media.matches ? 'light' : 'dark'.
- **Evidence**: ThemeContext/initTheme código + devtools application cleared demo.

### AC-8: LucIAna Chat layout. Usuario derecha, asistente izquierda
- **Type**: `rule`
- **Given**: Entro a LucIAna Bot y hay 4 mensajes en el historial (2 user, 2 assistant).
- **When**: Los miro en la cola.
- **Then**: Los 2 mensajes USER están alineados a la DERECHA (flex justify-end). Los 2 mensajes ASSISTANT están a la IZQUIERDA (justify-start) y tienen avatar logo nuevo a la izquierda del texto. Contraste >= 4.5:1 en ambos temas.
- **Pass Condition**: Ningún mensaje user tiene avatar. Assistant siempre tiene avatar logo nuevo. Clases Tailwind: user `ml-auto`, assistant `mr-auto`.
- **Evidence**: Screenshots modo claro + oscuro con chat 4 mensajes.

### AC-9: No aparecen IDs técnicos ni marcas prohibidas
- **Type**: `rule`
- **Given**: Estoy en la pantalla LucIAna Bot (con chat cargado de mensajes).
- **When**: Reviso texto visible incluyendo header, footer dentro de chat, títulos, toasts errores.
- **Then**: 0 apariciones visibles strings literales "Dify", "Claude", "DeepSeek", "Gemini", "API", "proveedor", "Beta", "Conversación:" como label.
- **Pass Condition**: `grep -iE "(Dify|Claude|DeepSeek|Gemini|proveedor|\bAPI\b|\bBeta\b)" --include="*View.tsx"` solo encuentra comentarios internos o imports internos; NUNCA dentro de un string renderizado (textContent).
- **Evidence**: Grep output después de aplicar cambios.

### AC-10: Compositor (caja escribir) no desaparece. Sticky al fondo. Scroll solo mensajes.
- **Type**: `rule`
- **Given**: Abro LucIAna Bot y envío 40 mensajes cortos (lorem ipsum) de forma consecutiva para tener scroll.
- **When**: Hago scroll hacia arriba en el historial. Luego vuelvo a la parte de abajo con mouse/teclado.
- **Then**: El `<div>` compositor (textarea + botón enviar) Sigue VISIBLE en el fondo del viewport. NUNCA desaparece ni se oculta. Al inspeccionar CSS, solo el `<ol class="messages-list">` tiene `overflow-y-auto`. El layout usa `min-height: 100dvh` del contenedor del chat.
- **Pass Condition**: DifyCopilotView render DOM structure:
  - outer = `h-[calc(100dvh-...)] flex flex-col`
  - header chat = `flex-none`
  - mensajes = `flex-1 overflow-y-auto`
  - composer = `sticky bottom-0 flex-none pb-[env(safe-area-inset-bottom)]`
- **Evidence**: Screenshot después de 40 mensajes (se ve compositor) + DOM inspección clases.

### AC-11: 100dvh + safe-area en móvil (no se oculta con teclado iOS/Android)
- **Type**: `rubric`
- **Dimension**: Layout chat móvil.
- **Scale**: 1-5
- **Anchors**: 1 = Compositor se oculta detrás del teclado virtual / overflow ; 3 = Compositor visible pero espacio incorrecto en notch ; 5 = Compositor visible, historial hace scroll por dentro, safe-area considera notch+bottom iPhone Safari y teclado Android Chrome.
- **Pass Threshold**: >= 4
- **Evidence**: Prueba DevTools Responsive 390x844 iPhone 14 Pro + prueba real con usuario si fuera posible, o al menos inspección `padding-bottom: max(12px, env(safe-area-inset-bottom))` y `viewport-fit=cover` meta viewport.

### AC-12: Tablas Supabase chat_conversations + chat_messages creadas con RLS
- **Type**: `rule`
- **Given**: Usuario Rubén ejecuta la migración SQL contra el proyecto Supabase conectado (usando la integración actual).
- **When**: Corro `supabase_get_tables(schema=public, tables=['chat_conversations','chat_messages'])`.
- **Then**:
  1. Tablas existen en `public`.
  2. RLS está `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` habilitado en ambas.
  3. Existen policies SELECT, INSERT, UPDATE, DELETE sólo donde `auth.uid() = user_id` (messages con join a conversations.user_id).
  4. No hay policies públicas `true` para anon.
- **Pass Condition**: Supabase dashboard tables RLS column green check + policies list match.
- **Evidence**: Resultado supabase_get_tables + archivo SQL migration commit en `supabase/migrations/20260917-..._chat_tables.sql`.

### AC-13: Historial no se pierde por cierre / redeploy pestaña
- **Type**: `rule`
- **Given**: Usuario "ruben@..." inició sesión, entró a LucIAna Bot, creó chat "prueba1" y escribió 2 mensajes user + 2 respuestas assistant.
- **When**:
  1. Cierra la pestaña del navegador completamente.
  2. Abre de nuevo e inicia sesión con la misma cuenta Google.
  3. Abre LucIAna Bot.
- **Then**: Drawer historial a la izquierda muestra el chat "prueba1". Al pulsarlo aparecen los 4 mensajes exactamente iguales (content, fechas, structured_action si existía).
- **Pass Condition**: GET /api/chat/conversations después de recargar devuelve 1 entrada. GET messages devuelve 4 rows.
- **Evidence**: Network tab requests a /api/chat/conversations GET 200 JSON + después de click GET messages 200 JSON.

### AC-14: Botón "Nuevo chat" con confirmación (no borra el anterior)
- **Type**: `rule`
- **Given**: Dentro de LucIAna Bot tengo un chat de 5 mensajes guardado en Supabase.
- **When**: Pulsar botón "Nuevo chat". Ventana confirm aparece.
- **Then**:
  - Texto: "¿Quieres iniciar un nuevo chat? Tu conversación anterior se conservará en el historial."
  - Si pulse "Aceptar": Drawer historial muestra 2 chats (anterior + nuevo). Chat anterior NO ha sido deleted ni archived con deleted_at. El chat nuevo está seleccionado y vacío.
  - Si pulse "Cancelar": Sigo en el mismo chat.
- **Pass Condition**: `confirm()` text exacto o equivalente modal, y 2 rows en chat_conversations después de pulsar aceptar. El chat anterior sigue visible (no archivado, no borrado).
- **Evidence**: Screenshots confirm dialog + drawer historial 2 chats.

### AC-15: Sugerencia chat nuevo a las 25-30 intervenciones (sin reinicio automático)
- **Type**: `rule`
- **Given**: Tengo 27 mensajes en el mismo chat (se suma 1 por user + 1 por assistant, total 27).
- **When**: Miro la parte superior del messages list.
- **Then**: Existe UN (1 solo) banner discreto "Llevas X mensajes en este chat. Si quieres empezar una idea nueva, crea un chat nuevo." + botón "Nuevo chat". Banner NO borra mensajes ni hace que el selector de chat cambie solo. Si sigo escribiendo, banner sigue visible (no se elimina solo).
- **Pass Condition**: No hay `setSelectedConversationId(newId)` automático en un effect por `messages.length>28`; solo render banner.
- **Evidence**: Screenshot 27 mensajes + banner.

### AC-16: Sugerencia chat nuevo después de Generar canción (no borra actual)
- **Type**: `rule`
- **Given**: Estoy en chat 1, LucIAna Bot devolvió structured_action ready_to_generate. Pulsé "Generar canción (12 créditos)" y la llamada /api/gpt/generate devuelve 200 con {task_id}.
- **When**: Recibo la respuesta 200.
- **Then**: Aparece un mensaje inline dentro del chat "Canción en generación. ¿Quieres empezar un chat nuevo para otra idea?" + botón "Nuevo chat". Si pulso NO el chat actual sigue con sus mensajes. Si pulso SÍ se crea uno nuevo como en AC-14 pero chat actual NO desaparece del drawer.
- **Pass Condition**: handleGenerate() no hace `setMessages([])` ni `resetConversation()`, solo añade banner o mensaje sugerencia y al pulsar botón nuevo chat ejecuta flow AC-14.
- **Evidence**: Código handleGenerate diff + screenshot tras Generar.

### AC-17: Flujo créditos / Generación intacto (Punto 31 + 32)
- **Type**: `rule`
- **Given**: Estoy autenticado, créditos suficientes, envío mensaje al LucIAna Bot que devuelve resumen editable y botón "Generar canción (12 créditos)".
- **When**: Pulso el botón "Generar canción".
- **Then**:
  - Frontend llama POST /api/gpt/generate (no /api/dify/generate ni a Dify directo).
  - Authorization header lleva Bearer JWT REAL del usuario.
  - Créditos del usuario real se descuentan 12 en la tabla profiles (no admin fijo).
  - La generación continua con el flujo existente y la canción aparece en Biblioteca.
- **Pass Condition**: `/api/gpt/generate` endpoint invocado (Network tab). Token real (no vacío, no DIFY_TOOL_API_KEY). Después: perfil créditos -=12.
- **Evidence**: Network tab payloads + LibraryView después del proceso.

### AC-18: Móvil: LucIAna Bot accesible en drawer (no barra inferior)
- **Type**: `rule`
- **Given**: Navegador móvil Chrome en 360x640.
- **When**: Pulsar ☰ Menú.
- **Then**: Dentro del drawer abierto se ve `LucIAna Bot` (como primer item antes de Clonar voz). NO está en la barra inferior (barra inferior = Inicio · Crear · Mis canciones · Menú).
- **Pass Condition**: BottomNav.tsx `mainItems[]` NO contiene `id=copiloto`. `menuItems[]` SI lo tiene primero.
- **Evidence**: Screenshot drawer + código BottomNav arrays.

### AC-19: Tema claro y oscuro legible + contraste
- **Type**: `rubric`
- **Dimension**: Legibilidad colores identidad LucIAna.
- **Scale**: 1-5
- **Anchors**: 1 = morados/dorados no se ven sobre fondo claro (se confunden) ; 3 = colores visibles pero sin suficiente contraste WCAG AA ; 5 = todos los textos principales pasan WCAG AA, gradientes morados y dorados se aprecian en ambos temas.
- **Pass Threshold**: >= 4
- **Evidence**: Screenshots 6 pantallas (Home, Crear, LucIAna Bot, Biblioteca, Perfil, Drawer) en tema claro + oscuro + validación Chrome Lighthouse contrast color para una muestra de textos.

### AC-20: Idioma visible español (no bilingüe)
- **Type**: `rule`
- **Given**: Pantallas visibles sin tocar lenguaje settings.
- **When**: Reviso títulos y descripciones landing + drawer items + textos LucIAna Bot + mensajes bienvenida + generales.
- **Then**: No hay bloques bilingües EN/ES. Título landing "AI Songs, Covers & MP3" → español. Items drawer = Inicio, Crear, LucIAna Bot, Clonar voz, Masterizar, Comprar créditos, Mi perfil. Todo en español.
- **Pass Condition**: 0 strings visibles bilingües repetidos "AI Songs, Covers..." + en español pegado con "/ Genera...".
- **Evidence**: Grep src "AI Songs|Covers & MP3|Download your MP3 directly" 0 user-facing matches.
