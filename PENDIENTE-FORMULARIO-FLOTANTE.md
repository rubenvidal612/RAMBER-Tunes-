# PENDIENTE: "Hacer manual" + formulario flotante en Crear

## El problema que resuelve

Hoy, para hacer una canción desde un pedido, Rubén tiene que:

```
Crear → (le falta la letra) → sale a Pedidos → abre el formulario
      → copia → vuelve a Crear → pega     (30-60 s perdidos CADA vez)
```

Quiere copiar los datos del cliente **sin salir de Crear**, con una ventanita
flotante encima.

---

## 1. Panel de pedidos: botón nuevo

En cada pedido, **junto al botón "Hacer" que ya existe**, agregar:

```
[ Hacer ]          ← se queda igual (genera la canción desde el panel)
[ Hacer manual ]   ← NUEVO: navega a Crear con el formulario del cliente
```

Comportamiento del nuevo botón:

- No genera nada. Solo navega a la app en la vista de **Crear** con el id del
  pedido: `/crear?pedido=<id>`  (confirmar el path real de Crear en `src/App.tsx`).
- El pedido se identifica por su `id` tal como lo devuelve `/api/form/list`
  (viene **con** prefijo `form_`).

**Ojo:** el panel vive en un `<iframe>` dentro de la app. Para navegar el padre
desde el iframe usar `window.top.location.href = '/crear?pedido=...'`
(o el mecanismo que ya use la app para cambiar de vista; revisar `App.tsx`).

---

## 2. Vista Crear: widget flotante

### 2.1 Icono flotante (siempre presente)

Un botón circular flotante en una esquina (esquina inferior derecha, sobre el
contenido, `z-index` alto):

```
     ( 📋 )
```

- Solo aparece si la URL trae `?pedido=<id>` **o** si hay un pedido activo.
- Al pulsarlo abre/cierra la ventanita.
- **Nunca desaparece** aunque se cierre la ventanita: sirve para reabrirla.

### 2.2 La ventanita

```
┌─ 📋 Jesús Ramos ──────────────┐
│ 🎤 Voz clonada                │  ← chip según `plan` (SIN precios)
│    o                          │
│ 🎵 Voz del sistema            │
├───────────────────────────────┤
│ Estilo        Norteño [Copiar]│
│ Voz           hombre  [Copiar]│
│ Letra         [Copiar]        │
│ Historia      [Copiar]        │
│ Observaciones [Copiar]        │
│ ▶ audio a capela              │
├───────────────────────────────┤
│ [–]  [□]  [✕]                 │
└───────────────────────────────┘
```

Requisitos:

| Función | Detalle |
|---|---|
| **Arrastrable** | se mueve con el dedo/ratón por toda la pantalla |
| **Minimizar** | la reduce a una barra con el nombre (o al icono) |
| **Maximizar** | la agranda (casi pantalla completa) y vuelve a su tamaño |
| **Cerrar** | pide confirmación: *"¿Seguro que quieres quitar el formulario?"* |
| **Persistente** | al cerrarla, el **icono sigue ahí** para reabrirla |
| **Copiar** | un botón por campo; copia ese campo al portapapeles |
| **Audio** | reproductor del audio a capela (si tiene) |

- **Sin precios** en ningún texto. Solo el tipo de voz: clonada / del sistema
  (según `plan === 'rola_voz'`).
- El chip de voz debe reflejar lo que el cliente eligió en el formulario.

### 2.3 De dónde salen los datos

**Opción A (recomendada)**: endpoint nuevo `GET /api/form/order?id=<id>` que
devuelve **un solo pedido** con los campos que expone `orderView()`
(reusar `orderView`, no duplicar lógica).
- Auth: aceptar el token del formulario (`sameToken`) **o** una sesión Supabase
  del dueño (`requireUser` + `is_admin`/`LUCIANA_OWNER_EMAIL`), porque la app
  React no tiene el token del formulario en el cliente.
- Devolver `audio_path` ya resuelto o la URL de `/api/form/audio?id=...`.

**Opción B (más rápida, menor calidad)**: la ventanita es un `<iframe>` del
panel con un modo compacto (`?vista=pedidos&solo=<id>`). Menos trabajo, pero
carga todo el panel y se ve pesado.

---

## 3. Reglas que NO se pueden romper

1. **No romper el formulario público del cliente** (`openPage`).
2. **No romper el panel**: es HTML con JS inline; un error de comillas lo mata.
   Validar el `<script>` servido con `node --check`.
3. El botón **"Hacer"** actual debe seguir funcionando igual.
4. La **descarga** del audio siempre apunta al original (no al watermarked).
5. El vendedor **no** debe poder ver el botón "Hacer manual" (solo el dueño),
   igual que el bloque "Editar pedido".

---

## 4. Pruebas obligatorias antes de decir "listo"

```
1. npm run build        (si falla por "Access is denied" en temp:
                         $env:TEMP="$PWD\.build-tmp"; $env:TMP=$env:TEMP)
2. npx tsc --noEmit     (baseline: 131 errores, NO debe subir)
3. node --check al <script> servido del panel
4. Playwright a 390x780 (móvil):
   - pulsar "Hacer manual" → debe abrir Crear con el icono flotante
   - abrir la ventanita → ver datos, chip de voz, audio
   - arrastrarla, minimizar, maximizar
   - pulsar Copiar en la letra → verificar portapapeles
   - cerrar → debe confirmar y el icono debe seguir
5. Transferir el pedido a un vendedor → NO debe ver "Hacer manual"
```

## 5. Deploy

- `git push` a `fix/voice-traceability-20261008:main` (**nunca** vercel CLI).
- Verificar `https://lucianamusic.app/api/app?action=version`.
- Antes de empezar: `git pull` para no pisar trabajo de otra sesión.

---

## 6. Contexto del proyecto

Leer **`CONOCIMIENTO-LUCIANA.md`** (mismo repo). Ahí está:
infra, endpoints del formulario, marca de agua, trampas del archivo grande y
reglas de trabajo.

- Repo: `C:\Users\DELL\Documents\Codex\2026-08-03\ch\work\RAMBER-Tunes-real`
- Panel: `panelPage()` en `api/[...route].ts` (~línea 20,600)
- `item()` construye cada tarjeta del pedido
- `orderView()` normaliza los datos del pedido
- Crear: `src/App.tsx` + `src/views/` (confirmar el path de la vista)
