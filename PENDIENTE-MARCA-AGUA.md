# PENDIENTE: marca de agua en "Mis canciones" → Compartir

## Objetivo

Al compartir una canción de la biblioteca (con o sin cuenta regresiva), que el
cliente escuche el preview **con la voz de Rubén cada 30 segundos**, y que la
**descarga salga siempre limpia** (sin marca).

Interruptor en el modal "Compartir", **prendido por defecto**.

## Lo que YA está hecho y funcionando (no tocar)

- Marca de agua en la sección de **pedidos** (`/api/form/song-wm`) — funciona.
- WAV de la voz subido a Supabase Storage: `ramber-tunes/form/watermark.wav`
  (mono, 24 kHz, 16-bit, 3.48 s).
- Comando ffmpeg de mezcla **probado y funcionando** (suena en 0s, 30s, 60s):

```
ffmpeg -y -i <cancion> -i <watermark.wav> -f lavfi -t 26.52 -i anullsrc=r=44100:cl=mono \
 -filter_complex "[1:a]aresample=44100,volume=0.45[v];\
[v][2:a]concat=n=2:v=0:a=1[bed];\
[bed]aloop=loop=-1:size=1323000[w];\
[0:a][w]amix=inputs=2:duration=first:dropout_transition=0,volume=2[a]" \
 -map "[a]" -b:a 192k <salida.mp3>
```

Notas importantes de este ffmpeg (build viejo de `@ffmpeg-installer`):
- `apad=whole_dur` y `apad=pad_dur` **NO** funcionan → usar `anullsrc` + `concat`.
- `amix=...,normalize=0` **NO** existe → usar `volume=2` después del amix.

## Lo que FALTA (5 cambios)

1. **`api/[...route].ts` ~línea 12522** — `shareSongAudioHandler`:
   si `pickQuery(req,"wm")` es "1", descargar el audio original, mezclarlo con
   el watermark usando el comando de arriba y responder ese buffer
   (`content-type: audio/mpeg`, `cache-control: public, max-age=86400`).
   Referencia: el endpoint `songWatermarked` (~línea 20700) ya hace exactamente
   esto para pedidos; se puede copiar la lógica.

2. **`src/App.tsx` ~línea 5475** — al construir
   `audioUrl: '/api/share/song/audio?id=' + id`, agregar `&wm=1` cuando la URL
   de la página traiga `?wm=1`.

3. **`src/App.tsx` ~línea 4804** — el link de compartir
   `https://lucianamusic.app/share/<id>` debe llevar `?wm=1` cuando el
   interruptor esté prendido.

4. **`src/views/LibraryView.tsx` ~línea 3305** — modal "Compartir":
   agregar el interruptor "Marca de agua" (prendido por defecto) ARRIBA de los
   dos botones, para que aplique a AMBAS formas:
   - "Compartir con Cuenta Regresiva" (`openCountdownShare`, línea 744)
   - "Sin Cuenta Regresiva" (`shareSongCard`, línea 831)

5. **Descarga** — el endpoint ya distingue `?dl=1`. Asegurar que la descarga
   NUNCA pase por la mezcla: siempre el archivo original.

## Regla de seguridad obligatoria

**Fail-open**: si la mezcla falla (ffmpeg, descarga, lo que sea), responder el
audio ORIGINAL. El link del cliente nunca debe quedar en silencio.

## Cómo probar antes de decir que está listo

1. `npm run build` + `npx tsc --noEmit` (baseline: 130-131 errores, no debe subir)
2. Push a `fix/voice-traceability-20261008` → esperar deploy
3. Abrir una canción real de la biblioteca:
   - con marca: debe oírse la voz a los 0/30/60 s
   - descarga: debe salir SIN la voz
   - apagar el interruptor: debe sonar limpio
4. Probar en navegador móvil (Playwright con viewport 390x780)

## Contexto del repo

- Repo: `C:\Users\DELL\Documents\Codex\2026-08-03\ch\work\RAMBER-Tunes-real`
- Deploy: push a `fix/voice-traceability-20261008:main`, esperar
  `https://lucianamusic.app/api/app?action=version`
- **Nunca** usar PowerShell para escribir acentos en `api/[...route].ts`
  (rompe el encoding). Usar scripts `.cjs` de node.
- Siempre validar el `<script>` servido con `node --check` antes de decir "listo".
