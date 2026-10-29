# PENDIENTE: editar formularios desde el panel

## Objetivo

Desde el panel de pedidos, Rubén puede **editar los datos** de un formulario que
ya envió el cliente y **subir el audio a capela** que el cliente le mandó
después por WhatsApp (cuando se le olvidó subirlo o lo mandó mal).

Lo que Rubén edite **lo ve también el vendedor** al recibir el pedido
transferido, incluido el audio.

## Lo que YA existe y hay que reusar (no reinventar)

- `POST /api/form/sign?t=...&n=archivo.mp3` → devuelve `signedUrl` + `path`
  (ya lo usa el formulario del cliente para subir audio).
- `POST /api/form/convert { path }` → convierte a MP3 (opcional, ya existe).
- `orderView()` ya expone: `name, whatsapp, style, vocal_gender, lyrics_mode,
  observations, title, story, lyrics, audio_path, notes`.
- `formAudio(req,res)` sirve `audio_path` con `&dl=1` para descargar.
- La lista (`/api/form/list`) ya devuelve `audio_path`, así que el vendedor
  ve el audio automáticamente en cuanto exista.
- La nota interna (`data-savenote` / `/api/form/notes`) es el patrón exacto a
  copiar para el guardado.

## Lo que falta

### 1. Servidor: `POST /api/form/update`

```
body: { t, id, name?, whatsapp?, style?, observations?, title?, story?,
        lyrics?, lyrics_mode?, audio_path?, audio_original? }

- valida token (sameToken)
- solo acepta los campos de la lista blanca (ignora el resto)
- lee `extra` actual, mezcla, guarda con update
- devuelve 200 { ok: true }
```

Regla: **nunca** dejar que el cliente (público) use este endpoint — solo con el
token del dueño. Aceptable, igual que `/api/form/notes`.

### 2. Panel: bloque "Editar" en cada pedido

Dentro de `item()` en `panelPage()` (api/[...route].ts), agregar un
`<details>` (como "Ver su formulario") con:

- inputs: nombre, whatsapp, estilo, título, observaciones
- textarea: historia, letra
- `<input type="file" accept="audio/*">` → sube con el flujo ya existente:
  1. `POST /api/form/sign?n=<archivo>`  → signedUrl + path
  2. `PUT signedUrl` con el archivo
  3. (opcional) `POST /api/form/convert { path }` → path convertido
  4. guardar `audio_path` con `/api/form/update`
- botón **Guardar cambios** → llama `/api/form/update` y recarga la lista

### 3. Aviso al vendedor (opcional, recomendado)

Cuando se edita un pedido **ya transferido**, agregar al mensaje de WhatsApp
del vendedor un texto: `ACTUALIZADO: revisa el pedido, cambió <campo>`.
No es obligatorio para que funcione; el vendedor ya ve los datos nuevos al
abrir el panel.

## Reglas que NO se deben romper

- La **descarga** del audio siempre apunta al archivo original (nunca al
  watermarked).
- El vendedor **no** puede editar (solo el dueño): validar con el mismo criterio
  que `/api/form/notes`, o simplemente no mostrar el bloque si no es owner
  (`IS_OWNER` ya existe en el panel).
- No tocar el flujo del formulario público del cliente.

## Cómo probar (obligatorio antes de decir "listo")

1. `npm run build` + `npx tsc --noEmit` (baseline actual: **131** errores; no
   debe subir).
   - Si el build falla con "Access is denied" en el temp de esbuild, apuntar
     `TEMP` al workspace: `$env:TEMP="$PWD\.build-tmp"; $env:TMP=$env:TEMP`
2. Deploy (git push, nunca vercel CLI) y esperar
   `https://lucianamusic.app/api/app?action=version`.
3. Prueba real con `curl`:
   - crear pedido sin audio
   - `/api/form/update` cambiando `name` → verificar en `/api/form/list`
   - subir un MP3 por sign + PUT + update de `audio_path` → verificar que
     `audio_path` aparece y que `/api/form/audio?id=...` responde 200
4. Prueba en el panel: editar y ver el cambio reflejado.
5. Transferir a un vendedor y comprobar que ve los datos nuevos y el audio.

## Contexto

- Repo: `C:\Users\DELL\Documents\Codex\2026-08-03\ch\work\RAMBER-Tunes-real`
- Rama de deploy: `fix/voice-traceability-20261008` → push a `main`
- Panel: función `panelPage()` en `api/[...route].ts` (~línea 20600)
- Nunca usar PowerShell para escribir acentos en `api/[...route].ts`
  (rompe el encoding). Usar scripts `.cjs` de node.
- Validar siempre el `<script>` servido con `node --check` antes de decir "listo".
- El panel es HTML generado en el servidor con JS inline: los errores de
  comillas/`\n` lo rompen entero. Ir con cuidado.
