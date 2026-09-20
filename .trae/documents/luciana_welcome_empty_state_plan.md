# Implementación: Pantalla de Bienvenida Inicial para LucIAna Bot (chat vacío, móvil first)

## Repository Research — Conclusiones previas

1. **Stack:** React 19 + Vite SPA. Layout con 2 vistas paralelas:
   - **MÓVIL (< 768px):** solo 1 columna, `currentTab === 'copiloto'` renderiza `DifyCopilotView` (fullscreen, arriba TopBar global). Archivo [App.tsx:4278](file:///c:/Users/DELL/Documents/Codex/2026-08-03/ch/work/RAMBER-Tunes-real/src/App.tsx#L4278).
   - **ESCRITORIO (≥ 768px):** 3 columnas fijas — Sidebar (200-240px) | CreateView (medio, 340-420px) | `DifyCopilotView` (columna derecha). Archivo [App.tsx:4312-4377](file:///c:/Users/DELL/Documents/Codex/2026-08-03/ch/work/RAMBER-Tunes-real/src/App.tsx#L4312-L4377).
   → **Regla:** pantalla bienvenida CENTRADA y GRANDE = solo móvil; en desktop se muestra reducida DENTRO de la columna derecha del chat (no romper 3 columnas).

2. **Empty state actual de `DifyCopilotView`:** NO EXISTE. El `useState('messages')` siempre inyecta 1 mensaje assistant LARGO ([DifyCopilotView.tsx:282-290](file:///c:/Users/DELL/Documents/Codex/2026-08-03/ch/work/RAMBER-Tunes-real/src/views/DifyCopilotView.tsx#L282-L290)), y lo mismo sucede al abrir `startNewChat` ([DifyCopilotView.tsx:963](file:///c:/Users/DELL/Documents/Codex/2026-08-03/ch/work/RAMBER-Tunes-real/src/views/DifyCopilotView.tsx#L963)) y `loadConversation` ([DifyCopilotView.tsx:910-950](file:///c:/Users/DELL/Documents/Codex/2026-08-03/ch/work/RAMBER-Tunes-real/src/views/DifyCopilotView.tsx#L910-L950)). Este 1er mensaje será más corto y cuando estemos en "modo empty state" se OCULTARÁ VISUALMENTE (sin borrarlo del estado para no romper el flow Dify).

3. **Header actual chat:** Tiene botones a la DERECHA: Tema (☀️/🌙), Historial (🕘), Nuevo chat. FUNCIONALES, no decorativos. AÑADIR botón MENÚ a la IZQUIERDA (solo visible en MÓVIL, ya que en desktop sidebar está permanente). El botón Menú se conecta a un nuevo prop `onMenuClick` que llega desde App.tsx (igual que TopBar lo hace con `setIsSettingsOpen`).

4. **Composer actual:** Funcional — clip (menú foto/audio/mic), textarea autoresize 1-4 líneas, borrador localStorage por user+conv, contador 20k, botón Enviar. Falta el BOTÓN MICRÓFONO PERMANENTE visible a la derecha del textarea (junto a Enviar), pide el usuario.

5. **Logo oficial:** `/public/assets/luciana-logo-oficial.png` (círculo 3D azul/oro, deployado correctamente commit af41be0).

6. **Saludo inicial Dify:** Ahora es largo. Se acorta a `"¡Hola! 🎶 Cuéntame qué canción quieres crear."` para no repetir lo que la pantalla de bienvenida ya muestra visualmente. Solo se muestra el saludo cuando hay ≥1 mensaje de usuario (fuera del empty state).

7. **NO tocar:** Dify endpoints, créditos, Mercado Pago, Suno, Supabase schema, historial, audio uploader, generación. Solo diseño + props + state visual.

## Files and Modules

- **`src/App.tsx`** — Añadir prop `onMenuClick={() => setIsSettingsOpen(true)}` a las 2 llamadas a `DifyCopilotView` (mobile fullscreen línea ~4278 y desktop right col línea ~4377).
- **`src/views/DifyCopilotView.tsx`** — Archivo principal con todos los cambios:
  - Firma: `DifyCopilotView({ onChange, onMenuClick }: { onChange: (t: ViewTab) => void; onMenuClick?: () => void })`.
  - Variable `IS_EMPTY_STATE`: `const isEmptyState = messages.length <= 1 && messages.every(m => m.role === 'assistant');` (solo el saludo inicial, sin mensajes de usuario ni attachments).
  - Ocultar el `messages.map(...)` del 1er mensaje assistant VISUALMENTE cuando `isEmptyState` (poner un condicional `!isEmptyState && messages.map` o filtrar 1er mensaje si isEmpty).
  - Nuevo bloque JSX `<WelcomeEmptyState>` (componente inline) que ocupue `flex-1` y sea visible SOLO cuando `isEmptyState === true`.
  - Nuevo botón Menú en header izquierda (solo `md:hidden`) que llama `onMenuClick?.()`.
  - Composer: añadir BOTÓN MICRÓFONO PERMANENTE a la derecha del textarea (antes del botón Enviar), que haga lo mismo que la opción "Quiero cantarlo" del menú clip → `triggerFilePickForKind('mic')`.
  - Reemplazar el texto bienvenida largo por el SHORT en los 3 sitios donde aparece (initialState, loadConversation, startNewChat).
  - Fade out animado: cuando `isEmptyState` pasa de true → false (primer mensaje user enviado), aplicar clase transición `transition-all duration-300 ease-out opacity-0 pointer-events-none` + `translate-y-4` antes de desmontar.
  - Estilos inline (responsive):
    - Mobile: centrado, logo grande (100-120px), título, subtítulo, autor, tagline con padding horizontal amplio.
    - Desktop ≥ md: logo más pequeño (64px), textos compactos y mostrado DENTRO del `luciana-chat-messages` (no reemplazar el layout 3-columnas padre).
    - Tema claro/oscuro: usar variables existentes `--bg-elev-1`, `--text`, `--text-muted`, `--brand-accent`.
  - Placeholder del textarea: actualizar a `"Escribe tu idea…"` (el usuario lo pide).
- **`src/theme/theme.css`** (si hace falta): Ajuste de `luciana-composer-inner` flex layout para acomodar 4 elementos en fila: [clip] [textarea + counter] [mic-btn] [send-btn]. Si no hace falta por classes tailwind, no tocar.

## Implementation Steps

1. **App.tsx** — Añadir `onMenuClick` prop a las dos instancias `<DifyCopilotView ...>`:
   - Mobile fullscreen (línea ~4278): `onMenuClick={() => setIsSettingsOpen(true)}`
   - Desktop right col (línea ~4377): `onMenuClick={() => setIsSettingsOpen(true)}`
   (Nota: `setIsSettingsOpen` ya existe en el scope, se usa para el botón TopBar).

2. **DifyCopilotView.tsx** — Actualizar tipos props y agregar botón Menú izquierdo (solo mobile):
   - Firma nueva: `function DifyCopilotView({ onChange, onMenuClick }: { onChange: (t: ViewTab) => void; onMenuClick?: () => void })`
   - Dentro de `<header className="luciana-chat-header">` PRIMER HIJO (antes del div del avatar): `<button className="md:hidden luciana-icon-button mr-1" type="button" aria-label="Menú" onClick={() => onMenuClick?.()}><Menu /></button>` (importar `Menu` de lucide-react; usar el mismo estilo "luciana-icon-button" que TopBar usa).

3. **DifyCopilotView.tsx** — Cortar el saludo inicial LARGO a CORTO en 3 lugares:
   - Initial messages `useState` línea 282-290.
   - `loadConversation` default messages línea ~963.
   - `startNewChat` reset messages línea ~978.
   - Nuevo texto: `"¡Hola! 🎶 Cuéntame qué canción quieres crear."`

4. **DifyCopilotView.tsx** — Variable `isEmptyState` + componente WelcomeEmptyState inline:
   - `const isEmptyState = useMemo(() => messages.length <= 1 && messages.every(m => m.role === 'assistant' && !(m.attachment) && !(m.structured?.action)), [messages]);`
   - `const [welcomeFadingOut, setWelcomeFadingOut] = useState(false);`
   - `useEffect(() => { if (!isEmptyState && !welcomeFadingOut) setWelcomeFadingOut(true); const t=setTimeout(() => setWelcomeFadingOut(false), 320); return () => clearTimeout(t); }, [isEmptyState]);` (efecto fade-out al enviar primer mensaje).
   - En el lugar de messages (línea ~2235 `<div ref={listRef} className="luciana-chat-messages">`):
     - Render `<WelcomeEmptyState />` cuando `isEmptyState || welcomeFadingOut` con clase de fade.
     - Render los mensajes NORMALES filtrando: `messages.filter(m => !(isEmptyState && m.role === 'assistant')).map(...)` (así se oculta el 1er mensaje assistant en el empty state, pero sigue existiendo para Dify).
   - Estilos WelcomeEmptyState:
     - Wrapper: `flex flex-col min-h-full items-center justify-center px-6 md:px-10 py-10 text-center`
     - Logo: `<img src={OFFICIAL_BRAND_LOGO} alt="LucIAna Music" className="w-24 h-24 md:w-16 md:h-16 object-contain drop-shadow-[0_0_20px_rgba(183,122,255,.4)] mb-4" />`
     - Título 1: `LucIAna Music | Canciones, Covers y MP3` con `IA` en color `var(--brand-accent)` (igual que TopBar), font-black, text-2xl md:text-lg.
     - Autor: `Por Ruben Vidal Hernandez` — color `--text-muted`, font-medium, text-base md:text-sm, mt-1.
     - Tagline: `Crea canciones completas con IA, elige el estilo, escribe tu idea y descarga tu MP3 al instante. 🎧⚡` — color `--text`, font-semibold, text-[17px] md:text-sm, mt-5, max-w-[480px].

5. **DifyCopilotView.tsx** — Composer: agregar BOTÓN MICRÓFONO PERMANENTE + actualizar placeholder:
   - Cambiar `<textarea placeholder="Escribe aquí tu idea…"` → `placeholder="Escribe tu idea…"`
   - Después de `</div>` que cierra `luciana-composer-textarea-wrap` y ANTES del `luciana-composer-send`:
   ```
   <button type="button" className={cn('luciana-composer-mic', audioBusy ? 'is-busy' : '')} onClick={() => triggerFilePickForKind('mic')} aria-label="Grabar voz (micrófono)" disabled={loading || generating} data-disabled={loading || generating ? 'true' : 'false'}>
     <Mic className={cn('h-4.5 w-4.5')} />
   </button>
   ```
   (Nota: `triggerFilePickForKind('mic')` ya existe, abre la grabadora; el menú clip sigue teniendo la opción también por compatibilidad).
   - En theme.css si hace falta, añadir `.luciana-composer-mic` con el mismo style que `luciana-attach-btn` (mismo tamaño, altura, círculo, colores).

6. **Opcional theme.css** — Si el layout composer se rompe al agregar 4ta columna (mic nuevo):
   - `.luciana-composer-inner { display: flex; align-items: flex-end; gap: 0.4rem; }` (ya lo tiene).
   - Añadir `.luciana-composer-mic { ...mismos estilos que attach-btn... }`.
   - Asegurar `padding-right` extra del textarea para que el counter no tape.

## Dependencies and Considerations

- **Lucide Icons:** `Menu` y `Mic` se usan; ya existen importaciones parciales, solo agregar a las existentes en los imports. No instalar nueva dependencia.
- **Responsive breakpoints:** usar clases `md:` Tailwind (≥768px = desktop). Coincide con layout App.tsx `hidden md:flex`.
- **No perder draft/funciones del composer:** se añade botón mic pero NO se toca la lógica de autoresize/draft/contador del commit anterior (c1-c5).
- **Saludo 1 mensaje Dify:** el mensaje assistant CORTO sigue existiendo en el array `messages`. Solo se OCULTA VISUALMENTE cuando isEmptyState. Esto es IMPORTANTE para no romper Dify (algunos endpoints usan conversationId inicial y el history empieza con al menos 1 mensaje). Al recibir respuesta del bot o enviar user msg, isEmptyState se hace `false` y el 1er mensaje CORTO reaparece automáticamente arriba de los chats normales.
- **Variables CSS tema:** usar `--bg`, `--text`, `--text-muted`, `--brand-accent`, `--bg-elev-1`, `--border` (todas ya definidas en tema claro/oscuro). Good legibilidad asegurada.
- **Botón Menú mobile:** Hace lo mismo que el botón TopBar "Abrir menú" que en este momento estaba `hideMenu` para LucIAna. Ahora el usuario puede acceder al menú global desde dentro del chat de LucIAna Bot en móvil (Settings, Créditos, etc.).

## Validation

1. **Build producción:** `npm.cmd run build` → exit 0. Sin errores TypeScript/JSX.
2. **Mobile empty state:** Reducir navegador a 390px (iPhone Pro), navegar a `/copiloto` → ver el logo grande, título, autor, tagline, botón menú izq visible, botones hist/tema/nuevo der visible, composer abajo con [clip][textarea + counter][mic][enviar].
3. **Desktop ≥ 1024px:** 3 columnas intactas (sidebar | estudio | LucIAna Bot). Dentro de columna derecha: logo más pequeño, textos compactos. No romper layout padre.
4. **Fade out:** Enviar el 1er mensaje → Welcome screen se desvanece suavemente (opacidad 0, translate-y) y reaparecen arriba el saludo corto del bot + mensaje user.
5. **Botón Menú mobile:** Pulsar → abre el panel de Ajustes (SettingsView modal). FUNCIONAL.
6. **Botón Micrófono permanente:** Pulsar → abre la grabadora (mismo flujo que clip > grabar). FUNCIONAL.
7. **Nuevo chat:** Presionar Nuevo chat → confirmar descartar → chat vacío y VUELVE a aparecer la pantalla bienvenida con logo oficial.
8. **Tema claro/oscuro:** Pulsar botón sol/luna → logo, textos y botones tienen buena legibilidad, colores usan `--brand-accent` correcto.
9. **Composer no se rompió:** borrador localStorage, autoresize, contador 20k, adjuntar foto/audio siguen funcionando (no se tocó la lógica, solo añadí botón mic).
10. **Saludo no repite:** Verificar que el texto corto del bot ("¡Hola! 🎶 …") NO aparezca DENTRO del WelcomeEmptyState (ya que la bienvenida visual reemplaza su propósito) y sí aparezca después de enviar el primer mensaje del usuario como 1er mensaje en la conversación normal.

## Risks

- **Riesgo 1:** Filtrar messages rompa alguna referencia al primer mensaje assistant. → **Mitigación:** solo ocultamos con `!isEmptyState && ...` cuando renderizamos; el objeto `messages[0]` sigue existiendo, no se modifica `setMessages`, solo filter visual.
- **Riesgo 2:** Mobile layout con TopBar global arriba + chat shell. Posible overflow. → **Mitigación:** WelcomeEmptyState usa `flex flex-col` dentro de `luciana-chat-messages` que ya es `flex-1 min-h-0 overflow-y-auto`. Composer sticky bottom se mantiene intacto.
- **Riesgo 3:** Nuevo botón mic en composer no alinea bien. → **Mitigación:** Usar mismas clases y CSS que `luciana-attach-btn` con nombre `luciana-composer-mic`; altura fija igual al botón Enviar. Si no encaja, reducir tamaño del botón mic (36px).
- **Riesgo 4:** `onMenuClick` prop ropa la otra instancia de DifyCopilotView que no tiene ese prop. → **Mitigación:** opcional `?..()` y en App.tsx se lo pasamos a AMBAS instancias; TS permite `onMenuClick?: () => void`.
- **Riesgo 5:** 1er mensaje corto genera algún problema de idempotencia en Supabase historial save. → **Mitigación:** texto más corto pero MISMOS campos (id, role, createdAt) que el mensaje anterior; se guarda igual sin cambios en esquema.
