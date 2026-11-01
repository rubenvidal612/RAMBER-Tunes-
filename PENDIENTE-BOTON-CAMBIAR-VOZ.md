# PENDIENTE: botón "Aplicar mi voz clonada" (cover RVC sin frase)

## El problema que resuelve

Hoy, para usar una voz clonada, hay que pasar por:
`Crear → Clonar voz (Suno V6)` → **pasos 1-5, incluida la FRASE**
→ el cliente tiene que cantar una frase al azar (Suno lo exige para
autorizar la voz) → videollamadas, fingir la voz, etc.

Rubén quiere usar el **Clonador (Replicate)**, que NO pide frase, y aplicarlo
a una canción ya generada. Eso ya existe en el backend, solo falta el botón.

## Lo que YA existe (verificado, no hay que crearlo)

| Pieza | Detalle |
|---|---|
| `POST /api/suno/create-cover` | **verificado en producción: responde 401 sin login (existe)** |
| Payload | `{ songId, voiceId }` — también acepta `voiceModelUrl`, `pitchChange`, `indexRate`, `protect`, `outputFormat` |
| `handleCreateCover()` | `api/[...route].ts:5008` — resuelve el audio de la canción por `songId`, firma R2, llama a Replicate con el modelo RVC |
| `GET /api/kits/voices` | devuelve las voces del Clonador: `{ id, voice_id, voice_name, status, model_url }` |
| Auth | `requireUser(req)` → hay que mandar `Authorization: Bearer <token>` (lo mismo que usa el resto de la app) |

**Ojo:** solo las voces con `status === 'ready'` sirven.

## Lo que falta (la pantalla)

### 1. Opción en el menú de cada canción (Mis canciones)

En `src/views/LibraryView.tsx`, en el menú de opciones de cada canción
(el que ya tiene "Compartir"), agregar:

```
Cambiar voz (clon)
```

- Solo visible si el usuario tiene al menos una voz `ready` en `/api/kits/voices`.
- Al pulsarla: abre un modal (patrón a copiar: el modal `sharePickerSong`, que
  ya existe en el mismo archivo).

### 2. Modal "Cambiar voz"

```
┌─ Cambiar la voz de esta canción ─────────┐
│ Canción: SALGUEIRO A                     │
│                                          │
│ Elige una voz:                           │
│  ○ YO RUBEN              (lista)         │
│  ○ JUAN QUIÑONEZ (3)     (lista)         │
│                                          │
│ Ajustes (opcional, colapsados):          │
│   Tono:        [ -12 .. +12 ]           │
│   Similitud:   [ 0.5 ]                  │
│                                          │
│ [ Aplicar ]            [ Cancelar ]      │
└──────────────────────────────────────────┘
```

- Lista desde `GET /api/kits/voices` filtrando `status === 'ready'`.
- Si no hay voces: mensaje *"Primero clona una voz en el Clonador"* con botón
  que lleve a esa pantalla.

### 3. La llamada

```ts
await fetch('/api/suno/create-cover', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ songId: song.id, voiceId: voz.voice_id }),
});
```

- **Confirmar con un curl real** qué devuelve (probablemente un estado
  `processing` y luego una canción nueva en la biblioteca, o el mismo `songId`
  actualizado). Ajustar la UI al resultado real.
- Mientras procesa: botón deshabilitado con "Procesando…"; al terminar,
  refrescar la lista (la función que ya usa la vista para recargar canciones).

### 4. Texto de la pantalla (sin promesas falsas)

Dejar claro que es una **conversión de voz sobre una canción ya hecha**
(no es la voz nativa de Suno), para que Rubén no espere el mismo timbre exacto.

## Reglas

1. **No tocar** el flujo de "Crear voz" de Suno (pasos 1-5). Ese se queda como
   está, para quien lo quiera usar.
2. **No tocar** el Clonador.
3. La descarga de la canción original no se modifica.
4. Si la conversión falla, mostrar el error tal cual (no "algo salió mal").
5. Antes de tocar `LibraryView.tsx` (7,930 líneas): `git pull` y anotar el
   commit de respaldo. Es la pantalla más usada; si se rompe, revertir.

## Pruebas obligatorias

```
1. npm run build
2. npx tsc --noEmit        (baseline: 131 errores, no debe subir)
3. Playwright a 390x780:
   - menú de una canción → "Cambiar voz (clon)"
   - el modal lista las voces ready
   - aplicar → aparece "Procesando…"
   - al terminar, la canción convertida aparece en la lista
4. Usuario sin voces → el modal muestra el mensaje, no una lista vacía
5. curl real a /api/suno/create-cover con token válido para ver el shape real
```

## Cómo probar el endpoint sin la UI (para el agente)

```bash
# 1. token de un usuario de prueba (service role + password grant, patrón ya
#    usado para probar el clonador — ver CONOCIMIENTO-LUCIANA.md §5)
# 2. voces disponibles
curl -H "authorization: Bearer $TOKEN" https://lucianamusic.app/api/kits/voices
# 3. convertir
curl -X POST https://lucianamusic.app/api/suno/create-cover \
  -H "content-type: application/json" -H "authorization: Bearer $TOKEN" \
  -d '{"songId":"<id>","voiceId":"<voice_id>"}'
```

## Contexto

- Repo: `C:\Users\DELL\Documents\Codex\2026-08-03\ch\work\RAMBER-Tunes-real`
- Leer **`CONOCIMIENTO-LUCIANA.md`** primero.
- Deploy: `git push` a `fix/voice-traceability-20261008:main` (nunca vercel CLI).
- El otro flujo (Suno personas con frase) **se queda intacto**: no es un
  reemplazo, es una alternativa.
