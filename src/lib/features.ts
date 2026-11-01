// Interruptor del camino RVC (Replicate).
// Rubén lo probó con canciones reales y no le convenció: se oculta TODA la interfaz,
// pero el motor (endpoints /api/suno/clone-voice, /api/suno/create-cover,
// /api/rvc/cover-status, /api/kits/voices y las tablas kits_voices / rvc_covers)
// se queda intacto. Para reactivar todo: poner true.
export const MOSTRAR_RVC = false;
