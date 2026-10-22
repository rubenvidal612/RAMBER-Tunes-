// Convertidor de audio a MP3 que corre en el navegador (sin servidor y sin salir de la app).
// Usa lamejs, el mismo codificador que ya usa la app para el recorte de canciones.

let lameFactoryPromise: Promise<any> | null = null;

async function getLameFactory(): Promise<any> {
  if (!lameFactoryPromise) {
    lameFactoryPromise = import('lamejs/lame.all.js?raw').then((mod: any) => {
      const source = String(mod?.default || '').trim();
      if (!source) throw new Error('No pude cargar el convertidor MP3.');
      return new Function(`${source}; return lamejs;`)();
    });
  }
  return lameFactoryPromise;
}

/** Codifica un AudioBuffer ya decodificado a MP3. */
export async function encodeBufferToMp3(buffer: AudioBuffer, kbps = 192): Promise<Blob> {
  const lame: any = await getLameFactory();
  const Mp3Encoder = lame?.Mp3Encoder;
  if (!Mp3Encoder) throw new Error('No pude cargar el convertidor MP3.');

  const sr = Number(buffer.sampleRate || 44100) || 44100;
  const channels = Math.min(2, Math.max(1, Number(buffer.numberOfChannels || 2) || 2));
  const encoder = new Mp3Encoder(channels, sr, Math.max(64, Math.min(320, Math.floor(kbps))));

  const getCh = (i: number) => buffer.getChannelData(Math.min(i, buffer.numberOfChannels - 1));
  const left = getCh(0);
  const right = channels > 1 ? getCh(1) : left;

  const toInt16 = (f32: Float32Array) => {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i += 1) {
      const s = Math.max(-1, Math.min(1, f32[i] || 0));
      out[i] = s < 0 ? Math.floor(s * 32768) : Math.floor(s * 32767);
    }
    return out;
  };

  const frameSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += frameSize) {
    const l = toInt16(left.subarray(i, i + frameSize));
    const r = channels > 1 ? toInt16(right.subarray(i, i + frameSize)) : l;
    const mp3buf = encoder.encodeBuffer(l as any, r as any);
    if (mp3buf && mp3buf.length > 0) chunks.push(new Uint8Array(mp3buf));
  }
  const end = encoder.flush();
  if (end && end.length > 0) chunks.push(new Uint8Array(end));
  return new Blob(chunks, { type: 'audio/mpeg' });
}

/** Devuelve true si el archivo ya es MP3 y por lo tanto no hay nada que convertir. */
export function isAlreadyMp3(file: File | null | undefined): boolean {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return name.endsWith('.mp3') || type === 'audio/mpeg' || type === 'audio/mp3';
}

/**
 * Contexto para decodificar. Se prefiere OfflineAudioContext porque:
 *  - no depende del gesto del usuario (en Android el AudioContext puede quedar
 *    suspendido y decodeAudioData falla),
 *  - no cuenta contra el limite de contextos de audio abiertos (el Clonador y el
 *    reproductor ya tienen los suyos).
 */
function createDecodeContext(): BaseAudioContext {
  const Offline =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (Offline) {
    try {
      return new Offline(1, 1, 44100);
    } catch {
      /* si falla, se intenta con AudioContext normal */
    }
  }
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) throw new Error('Tu navegador no puede convertir audio.');
  return new Ctx();
}

/**
 * Convierte cualquier audio que el navegador sepa leer a un File MP3.
 * Si ya es MP3, devuelve el mismo archivo sin tocarlo.
 */
export async function convertAudioFileToMp3(file: File, kbps = 192): Promise<File> {
  if (!file) throw new Error('No hay archivo para convertir.');
  if (isAlreadyMp3(file)) return file;

  const raw = await file.arrayBuffer();
  if (!raw || raw.byteLength === 0) throw new Error('El archivo está vacío.');

  const ctx = createDecodeContext();
  try {
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(raw.slice(0));
    } catch (decodeErr) {
      const detail = decodeErr instanceof Error ? decodeErr.message : String(decodeErr || '');
      throw new Error(
        `Tu navegador no pudo leer este formato${detail ? ` (${detail})` : ''}.`,
      );
    }
    const blob = await encodeBufferToMp3(decoded, kbps);
    const base = String(file.name || 'audio').replace(/\.[^.]+$/, '').trim() || 'audio';
    return new File([blob], `${base}.mp3`, { type: 'audio/mpeg' });
  } finally {
    // OfflineAudioContext no necesita cerrarse; solo el AudioContext real.
    const maybeClosable = ctx as any;
    if (typeof maybeClosable.close === 'function' && typeof (window as any).OfflineAudioContext === 'undefined') {
      try {
        await maybeClosable.close();
      } catch {
        /* cerrar el contexto no debe romper la conversión */
      }
    }
  }
}
