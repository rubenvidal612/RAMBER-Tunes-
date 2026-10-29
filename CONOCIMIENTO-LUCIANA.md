# CONOCIMIENTO DEL PROYECTO — Luciana Music (RAMBER-Tunes)

Documento para que cualquier agente nuevo arranque sin adivinar.
Última actualización: 2026-10-29.

---

## 1. Infraestructura y deploy

| Pieza | Dato |
|---|---|
| Hosting | Vercel (cuenta **Pro**) |
| Repo | `github.com/rubenvidal612/RAMBER-Tunes-` |
| Rama de trabajo | `fix/voice-traceability-20261008` |
| Deploy | `git push origin fix/voice-traceability-20261008:main` |
| Verificar deploy | `https://lucianamusic.app/api/app?action=version` |
| **Nunca** | `vercel deploy`, `vercel login` (el deploy es por git) |

### Límites de la función (`vercel.json`)
```json
"api/[...route].ts": { "maxDuration": 300, "memory": 3008 }
```
Ya están puestos. `FUNCTION_INVOCATION_FAILED` = **memoria**, no tiempo.

---

## 2. El archivo principal

`api/[...route].ts` — **~29,000 líneas, 1 MB, CRLF**. Router manual en un
catch-all. Un solo `<script>` inline genera las páginas HTML (formulario del
cliente y panel del dueño).

### Trampas que ya rompieron producción
1. **Nunca** escribir acentos con PowerShell (rompe el encoding). Usar scripts
   `.cjs` de node.
2. El archivo tiene **CRLF**: los parches con `\n` no matchean. Usar regex
   `\r?\n` o anclas de una sola línea.
3. **`const inner = \`` aparece VARIAS veces** (openPage y panelPage). Anclar
   siempre dentro de la función correcta o se borran cientos de líneas
   (pasó: se perdieron 593 líneas).
4. Quotes anidadas en el JS inline rompen el panel entero. Validar SIEMPRE con
   `node --check` sobre el `<script>` servido.
5. `api/[...route].ts` **no** se debe leer completo (300k tokens por lectura).

### Comandos de verificación obligatorios
```
npm run build      → si falla con "Access is denied" en el temp de esbuild:
                     $env:TEMP="$PWD\.build-tmp"; $env:TMP=$env:TEMP
npx tsc --noEmit   → baseline actual: 131 errores (NO debe subir)
```
Validar el JS servido:
```powershell
$t = (curl la pagina)
$m = [regex]::Match($t,'(?s)<script>\s*(.*?)\s*</script>')
node --check archivo.js
```

---

## 3. Subsistema de formularios / pedidos

Todo vive en **`suno_tasks`** con `kind='form-order'` y un JSON `extra`.

Campos de `extra`: `name, whatsapp, style, vocal_gender, lyrics_mode,
observations, title, story, lyrics, audio_path, audio_original, notes, stage,
shared_with, transferred_to, paid, paid_amount, paid_manual, paid_at,
paid_method, price_mxn, plan, owner_email, songs, error`.

### Auth
Token único compartido: `LUCIANA_FORM_TOKEN` (default `luciana-form-2026`),
comparado en tiempo constante. **No hay roles reales**:
- dueño vs vendedor se distingue por el parámetro `me` comparado con
  `LUCIANA_OWNER_EMAIL` (default `rubenfiverr612@gmail.com`).
- El vendedor solo ve `*****` + últimos 4 dígitos del WhatsApp.
- El botón de WhatsApp al cliente es solo del dueño.

### Endpoints del formulario
| Endpoint | Qué hace |
|---|---|
| `POST /api/form/submit` | crea pedido (público, con token) |
| `GET /api/form/list` | lista (filtra por `me`) |
| `POST /api/form/update` | **edita** campos (solo dueño, lista blanca) |
| `POST /api/form/notes` | nota interna del dueño |
| `POST /api/form/stage` | mueve etapa (`pendiente/por_pagar/pagado/transferido`) |
| `POST /api/form/share` | transfiere (reemplaza `shared_with`, no acumula) |
| `POST /api/form/delete` | borra el pedido **y su audio del storage** |
| `GET /api/form/audio` | sirve/descarga el audio a capela |
| `POST /api/form/sign` | URL firmada para subir audio |
| `POST /api/form/convert` | ffmpeg → MP3 |
| `POST /api/form/transcribe` | Gemini (vía `/api/ai/transcribe-lyrics` con `x-internal-secret`) |
| `GET /api/form/sale` | ventas manuales (CRUD) |
| `GET /api/form/report` | totales (hoy/mes/por método/por vendedor) |
| `GET /api/form/panel` | panel del dueño (HTML) |
| `GET /api/form/open` | formulario del cliente (HTML) |

### Ciclo del pedido
`pendiente → por_pagar → pagado → transferido`

Colores en el panel:
- 🔴 rojo = nuevo sin asignar
- 🔵 azul = asignado a otro
- 🟡 amarillo = asignado a ti
- 🟣 morado = pendiente de pago
- 🟢 verde = pagado

### Panel (`panelPage()`)
HTML con JS inline, sin framework. Secciones por **links del servidor**
(`?vista=ventas|link|vendedores|pedidos`), no por JS. `render()`/`item()`
repintan la lista. Patrón de guardado: `b.dataset.X` + `fetch` + `load()`.

---

## 4. Marca de agua del preview (implementada 2026-10-29)

### Cómo funciona
```
Cliente abre /share/<id>?wm=1
   ↓
GET /api/share/song/audio?id=<id>&wm=1
   ↓
¿existe share-watermark/song-<id>.mp3 en R2?
   ├─ SÍ → 302 al CDN  (0.7 s)
   └─ NO → se genera ahí mismo y se guarda (11-18 s)
```

- **Descarga (`?dl=1`) siempre sale limpia**: nunca usa el archivo con marca.
- **Precalentado**: al compartir, el cliente de la app llama
  `&warm=1` para generar antes de mandar el link. El cliente final no espera.
- `warm=1` devuelve JSON `{ok, reason, ms, key}` en vez de audio.

### Detalles técnicos del mezclado
- Watermark guardado en Supabase Storage: `ramber-tunes/form/watermark.wav`
  (mono, 24 kHz, 16-bit, 3.48 s).
- Filtro ffmpeg (probado, funciona con el build de `@ffmpeg-installer`):
  ```
  [1:a]aresample=44100,volume=4.5[v];
  [v][2:a]concat=n=2:v=0:a=1[bed];
  [bed]aloop=loop=-1:size=1323000[w];
  [0:a][w]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.95[a]
  ```
  con `-f lavfi -t 26.52 -i anullsrc=r=44100:cl=mono` como tercera entrada.
- **Restricciones del ffmpeg incluido** (build viejo):
  - `apad=whole_dur` y `apad=pad_dur` **NO** existen → usar `anullsrc`+`concat`.
  - `amix=...,normalize=0` **NO** existe → usar `volume=2` después.
- La voz suena en 0 s, 30 s, 60 s…
- **Procesar por pedazos de 60 s** (`-ss`/`-t` + `concat -c copy`) porque la
  canción completa de un jalón agota la memoria de la función.
- **El "segundo plano" no existe en Vercel**: al responder, la función se
  congela y la generación muere. Hay que `await` la generación.

---

## 5. Bug conocido sin resolver

### Clonador de voz atorado en "Procesando…"
- El usuario sube un audio, la voz aparece en la lista con "Procesando…"
  para siempre.
- **Dato**: en `kits_voices` solo hay 2 voces (mayo 2026), ambas `ready`.
  La clonación nueva **no crea fila** → se traba antes del insert.
- El Clonador convierte el audio **en el navegador** antes de subir; es la
  parte frágil (formatos m4a/ogg/wav pesados).
- Siguiente paso: reproducir con F12 → Network y ver qué petición falla.

---

## 6. Scripts locales (opcionales)

`tools/watermark-local.cjs` — genera la marca de agua desde la PC usando R2.
- Requiere claves R2 reales en `.env` (las de Vercel están con candado; hay que
  crear un token en Cloudflare).
- Usa `-threads 1` y prioridad idle porque **la laptop de Rubén se apaga** con
  ffmpeg a full (calor/energía). Mejor no correrlo.
- `--check` valida credenciales. `--limit=N`, `--only=<id>`, `--seconds=N`,
  `--force`.

`tools/pegar-claves.cjs` — asistente para pegar las claves R2 en `.env`.

---

## 7. Documentación de SunoAPI

Base: `https://api.sunoapi.org` (definida en el código, `normalizeSunoBaseUrl`).
Docs oficiales: **https://docs.sunoapi.org/**

Endpoints que usa el proyecto (buscar `sunoapi` en el código):
- generar canción / consultar tarea
- voz (persona) / validar voz
- separar stems / masterizar / karaoke
- `vocalGender` acepta **solo** `m` o `f`.

---

## 8. Cómo trabajar en este proyecto (reglas aprendidas a golpes)

1. **Una tarea por sesión.** Las sesiones largas se caen (memoria) y cuestan
   ~10× más tokens.
2. **No leer el archivo completo.** Usar `offset`/`limit`.
3. Parchear con **scripts `.cjs` de node**, nunca PowerShell con acentos.
4. **`node --check`** al `<script>` servido antes de decir "listo".
5. **Probar en producción con curl** los endpoints tocados.
6. **Playwright** para flujos de UI (viewport 390×780 para móvil).
7. Verificar la versión publicada al final.
