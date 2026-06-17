# [OPEN] Debug Session: song-generation-failure

## Síntoma
- El usuario reporta: "NO ME ESTA GENERANDO LAS CANCIONES".

## Comportamiento esperado
- La app debe aceptar la solicitud de generación y crear la canción sin error.

## Hipótesis iniciales
- La llamada del frontend al endpoint de generación está fallando antes de llegar al backend.
- El backend recibe la solicitud pero falla por variables de entorno o credenciales de proveedor.
- La creación falla por validación, créditos o parámetros requeridos faltantes.
- La generación sí inicia, pero el webhook o el guardado del resultado está fallando.
- Un cambio reciente en `api/[...route].ts` introdujo una regresión en el flujo de creación.

## Evidencia pendiente
- Logs del frontend y del backend al intentar generar.
- Estado de diagnósticos en archivos tocados recientemente.
- Punto exacto del flujo donde deja de avanzar.

## Evidencia recopilada
- El usuario confirmó que falla en producción y en localhost.
- El usuario confirmó que al generar "se queda cargando".
- En `api/[...route].ts`, la llamada `fetch` de `sunoFetchJson()` no tenía timeout.
- En `.env` y `.env.local` sí existen `SUNO_API_KEY` y `SUNO_BASE_URL` / `SUNO_API_BASE_URL`.
- Se agregó instrumentación en `handleGenerate()` para registrar entrada, consumo de créditos, llamada al proveedor, respuesta y errores.

## Análisis
- Se debilita la hipótesis de credenciales faltantes porque las variables existen en ambos entornos.
- Se fortalece la hipótesis de espera indefinida al proveedor porque el síntoma es carga infinita y la llamada crítica no tenía timeout.
- Se mantiene abierta la revisión del proveedor y del guardado de tareas con la instrumentación agregada.

## Fix aplicado
- Se agregó timeout de 45 segundos en `sunoFetchJson()`.
- Si el proveedor no responde a tiempo, ahora el backend devuelve un error claro en vez de quedarse esperando indefinidamente.

## Estado
- Abierto. Pendiente de validación del usuario con el fix y revisión de logs post-fix si sigue fallando.
