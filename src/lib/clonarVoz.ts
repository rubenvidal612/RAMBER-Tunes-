// Flujo "bien hecho" para poner una voz clonada a una canción:
// separar voz/instrumental → clonar SOLO la voz → mezclar con la música → guardar.
// Se usa desde Biblioteca ("Cambiar voz (clon)").

export type ClonarProgreso = (mensaje: string) => void;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buscarStems(provider: any): { vocal: string; instrumental: string } {
  const out: { vocal: string; instrumental: string } = { vocal: "", instrumental: "" };
  const caminar = (nodo: any, depth: number) => {
    if (!nodo || typeof nodo !== "object" || depth > 6) return;
    for (const [k, v] of Object.entries(nodo)) {
      if (typeof v === "string" && /^https?:\/\//i.test(v)) {
        const key = k.toLowerCase();
        if (!out.vocal && key.includes("vocal") && !key.includes("backing")) out.vocal = v;
        if (!out.instrumental && key.includes("instrumental")) out.instrumental = v;
      } else if (v && typeof v === "object") {
        caminar(v, depth + 1);
      }
    }
  };
  caminar(provider, 0);
  return out;
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.max(1, Math.min(2, buffer.numberOfChannels || 1));
  const sampleRate = Math.max(8000, Math.min(96000, Math.floor(buffer.sampleRate || 44100)));
  const length = Math.max(1, buffer.length || 1);
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const wstr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  const w16 = (o: number, v: number) => view.setUint16(o, v, true);
  const w32 = (o: number, v: number) => view.setUint32(o, v, true);
  wstr(0, "RIFF");
  w32(4, 36 + dataSize);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  w32(16, 16);
  w16(20, 1);
  w16(22, numChannels);
  w32(24, sampleRate);
  w32(28, byteRate);
  w16(32, blockAlign);
  w16(34, 16);
  wstr(36, "data");
  w32(40, dataSize);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

async function decodificar(ctx: AudioContext, buf: ArrayBuffer): Promise<AudioBuffer> {
  return await new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(buf.slice(0));
    if (p && typeof (p as any).then === "function") (p as any).then(resolve).catch(reject);
    else ctx.decodeAudioData(buf.slice(0), resolve, reject);
  });
}

async function mezclar(instUrl: string, vocalUrl: string): Promise<Blob> {
  const r1 = await fetch(instUrl);
  if (!r1.ok) throw new Error(`No pude descargar el instrumental (HTTP ${r1.status}).`);
  const r2 = await fetch(vocalUrl);
  if (!r2.ok) throw new Error(`No pude descargar la voz clonada (HTTP ${r2.status}).`);
  const b1 = await r1.arrayBuffer();
  const b2 = await r2.arrayBuffer();
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) throw new Error("Tu navegador no soporta mezclar audio.");
  const ctx = new AudioCtx();
  try {
    const a1 = await decodificar(ctx, b1);
    const a2 = await decodificar(ctx, b2);
    const sr = a1.sampleRate || 44100;
    const length = Math.max(a1.length, a2.length);
    const oc = new OfflineAudioContext(2, Math.max(1, length), sr);
    const s1 = oc.createBufferSource();
    s1.buffer = a1;
    s1.connect(oc.destination);
    const s2 = oc.createBufferSource();
    s2.buffer = a2;
    s2.connect(oc.destination);
    s1.start(0);
    s2.start(0);
    const rendered = await oc.startRendering();
    return audioBufferToWavBlob(rendered);
  } finally {
    try {
      await ctx.close();
    } catch {}
  }
}

export type ClonarParams = {
  token: string;
  voiceId: string;
  baseName: string;
  description?: string;
  coverUrl?: string;
  taskId?: string;
  audioId?: string;
  onProgress?: ClonarProgreso;
};

export async function clonarVozEnCancion(params: ClonarParams): Promise<void> {
  const { token, voiceId, baseName } = params;
  const auth = { authorization: `Bearer ${token}` };
  const jsonAuth = { "content-type": "application/json", authorization: `Bearer ${token}` };
  const progreso = (m: string) => params.onProgress?.(m);
  const nombre = (baseName || "Canción").toString().trim().slice(0, 100);

  if (!params.taskId && !params.audioId) {
    throw new Error("Esta canción no se puede separar (no tiene taskId/audioId de Suno).");
  }

  // 1) separar voz e instrumental
  progreso("Separando la voz de la música…");
  const sep = await fetch("/api/suno/separate", {
    method: "POST",
    headers: jsonAuth,
    body: JSON.stringify({ taskId: params.taskId || "", audioId: params.audioId || "", type: "split_stem" }),
  });
  const sepOut = await sep.json().catch(() => ({}));
  if (!sep.ok) throw new Error(((sepOut as any)?.detail || (sepOut as any)?.error || "No pude separar la canción.").toString());
  const sepTaskId = String((sepOut as any)?.taskId || "").trim();
  if (!sepTaskId) throw new Error("No recibí el id de la separación.");

  let stems = { vocal: "", instrumental: "" };
  const t0 = Date.now();
  while (Date.now() - t0 < 30 * 60 * 1000) {
    await esperar(5000);
    const tr = await fetch(`/api/suno/task?kind=split_stem&taskId=${encodeURIComponent(sepTaskId)}`, { headers: auth });
    const tout = await tr.json().catch(() => ({}));
    if (!tr.ok) continue;
    const st = String((tout as any)?.status || (tout as any)?.state || "").toLowerCase();
    if (st.includes("fail") || st.includes("error")) throw new Error("La separación falló. Intenta de nuevo.");
    const found = buscarStems(tout);
    if (found.vocal && found.instrumental) {
      stems = found;
      break;
    }
    if (st.includes("complete") || st.includes("success") || st.includes("done")) {
      const f2 = buscarStems(tout);
      if (f2.vocal && f2.instrumental) {
        stems = f2;
        break;
      }
    }
  }
  if (!stems.vocal || !stems.instrumental) throw new Error("No recibí la voz y el instrumental separados.");

  // 2) clonar solo la voz
  progreso("Clonando solo la voz…");
  const cover = await fetch("/api/suno/create-cover", {
    method: "POST",
    headers: jsonAuth,
    body: JSON.stringify({
      uploadUrl: stems.vocal,
      voiceId,
      title: `${nombre} - voz clonada`.slice(0, 120),
      outputFormat: "wav",
    }),
  });
  const coverOut = await cover.json().catch(() => ({}));
  if (!cover.ok) throw new Error(((coverOut as any)?.error || (coverOut as any)?.detail || "No pude clonar la voz.").toString());
  const predictionId = String((coverOut as any)?.predictionId || (coverOut as any)?.coverId || "").trim();
  if (!predictionId) throw new Error("No recibí el id del clonado.");

  let vozClonada = "";
  const t1 = Date.now();
  while (Date.now() - t1 < 45 * 60 * 1000) {
    await esperar(5000);
    progreso("Clonando tu voz… (2-5 min)");
    const sr = await fetch(`/api/rvc/cover-status?predictionId=${encodeURIComponent(predictionId)}&nocache=1`, { headers: auth });
    const sout = await sr.json().catch(() => ({}));
    if (!sr.ok) continue;
    const st = String((sout as any)?.replicateStatus || (sout as any)?.status || "").toLowerCase();
    if (st === "failed" || st === "canceled" || st === "error") {
      throw new Error(String((sout as any)?.importError || (sout as any)?.replicateFetchError || "El clonado falló."));
    }
    const u = String((sout as any)?.outputUrl || "").trim();
    if (u && (st === "succeeded" || st === "completed" || st === "ready")) {
      vozClonada = u;
      break;
    }
  }
  if (!vozClonada) throw new Error("El clonado está tardando demasiado.");

  // 3) mezclar con la música
  progreso("Mezclando tu voz con la música…");
  const mezcla = await mezclar(stems.instrumental, vozClonada);

  // 4) subir y guardar
  progreso("Guardando la canción…");
  const up = await fetch("/api/upload-audio", {
    method: "POST",
    headers: jsonAuth,
    body: JSON.stringify({ title: `${nombre} (voz clonada)`.slice(0, 120), contentType: "audio/wav" }),
  });
  const upOut = await up.json().catch(() => ({}));
  if (!up.ok || (upOut as any)?.ok !== true || !(upOut as any)?.uploadUrl || !(upOut as any)?.key) {
    throw new Error(((upOut as any)?.error || "No pude preparar la subida del audio final.").toString());
  }
  const put = await fetch(String((upOut as any).uploadUrl), {
    method: "PUT",
    headers: { "content-type": "audio/wav" },
    body: mezcla,
  });
  if (!put.ok) throw new Error("No pude subir el audio final.");

  const crear = await fetch("/api/library/create-from-r2", {
    method: "POST",
    headers: jsonAuth,
    body: JSON.stringify({
      key: String((upOut as any).key),
      title: `${nombre} (voz clonada)`.slice(0, 120),
      description: params.description || "",
      coverUrl: params.coverUrl || "",
      isCover: true,
      externalId: `rvc_mix_${predictionId}`.slice(0, 200),
    }),
  });
  const crearOut = await crear.json().catch(() => ({}));
  if (!crear.ok) throw new Error(((crearOut as any)?.detail || (crearOut as any)?.error || "No pude guardar la canción.").toString());
}
