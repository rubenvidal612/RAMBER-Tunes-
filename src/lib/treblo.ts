// Cliente del motor propio "LucIAna V1" (proveedor Sonauto, alias "Treblo").
//
// Contrato verificado contra el API real (2026-11-15):
//  - POST /v1/uploads                      multipart "file" -> { audio_upload_id }
//  - POST /v1/generations/v3/reference     -> { task_id }
//  - GET  /v1/generations/{task_id}        -> { status, song_paths[], lyrics, ... }
//  - GET  /v1/credits/balance              -> { num_credits }
//
// Reglas aprendidas a golpes (no cambiar sin volver a probar):
//  * `tags` es una lista y su vocabulario está validado: "male vocals"/"balada" NO valen.
//    Para evitar 422 se manda `prompt` (texto libre) y se omiten las etiquetas.
//  * `voice_from_song` SOLO aplica con reference_mode "voice"; con "cover" da 422.
//  * `reference_scale` máximo 5.0 en "cover".
//  * `output_format` por defecto es "ogg" -> hay que pedir "mp3" explícito.
//  * Devuelve SIEMPRE 1 sola toma en `song_paths` (nunca 2).
//  * Lo que manda la voz es el AUDIO; el modo "cover" usa una voz de estudio.

export type TrebloTask = {
  status: "pending" | "generating" | "success" | "failure" | "unknown";
  rawStatus: string;
  songPaths: string[];
  lyrics: string;
  error: string;
};

const BASE = process.env.TREBLO_BASE_URL || "https://api.sonauto.ai";
const LIMITE_SEGUNDOS_V3 = 4 * 60 + 45;

export function trebloEnabled(): boolean {
  return String(process.env.TREBLO_ENABLED || "").toLowerCase() === "1" ||
    String(process.env.TREBLO_ENABLED || "").toLowerCase() === "true";
}

export function trebloApiKey(): string {
  return String(process.env.TREBLO_API_KEY || "").trim();
}

export function trebloListo(): boolean {
  return trebloEnabled() && Boolean(trebloApiKey());
}

export function limiteSegundos(modelo?: string): number {
  return modelo === "V2" ? 95 : LIMITE_SEGUNDOS_V3;
}

async function llamar(ruta: string, init: RequestInit = {}, ms = 30000): Promise<any> {
  const key = trebloApiKey();
  if (!key) throw new Error("Falta TREBLO_API_KEY");
  const r = await fetch(`${BASE}${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(ms),
  });
  const txt = await r.text();
  let json: any = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    json = null;
  }
  if (!r.ok) {
    const detalle = json?.detail;
    const msg = Array.isArray(detalle)
      ? detalle.map((d: any) => d?.msg || JSON.stringify(d)).join(" · ")
      : typeof detalle === "string"
        ? detalle
        : txt.slice(0, 200);
    const e: any = new Error(msg || `HTTP ${r.status}`);
    e.httpStatus = r.status;
    e.providerBody = json;
    throw e;
  }
  return json;
}

/** Sube el audio del cliente y devuelve el id temporal del proveedor. */
export async function subirAudio(bytes: Buffer | Uint8Array, nombre: string, mime = "audio/mpeg"): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([bytes as any], { type: mime }), nombre || "voz.mp3");
  const j = await llamar("/v1/uploads", { method: "POST", body: form }, 120000);
  const id = String(j?.audio_upload_id || "").trim();
  if (!id) throw new Error("El proveedor no devolvió audio_upload_id");
  return id;
}

/**
 * Crea la canción con la voz del cliente.
 * mode "voice" = canción nueva con su timbre (lo único que usamos).
 */
export async function crearCancionConVoz(params: {
  audioUploadId: string;
  prompt: string;
  lyrics?: string;
  instrumental?: boolean;
  modelo?: string;
}): Promise<string> {
  const body: Record<string, any> = {
    audio_upload_id: params.audioUploadId,
    reference_mode: "voice",
    prompt: String(params.prompt || "").slice(0, 900) || "pop latin",
    output_format: "mp3",
    instrumental: Boolean(params.instrumental),
  };
  const letra = String(params.lyrics || "").trim();
  if (letra && !params.instrumental) body.lyrics = letra.slice(0, 6000);
  const j = await llamar("/v1/generations/v3/reference", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, 60000);
  const id = String(j?.task_id || "").trim();
  if (!id) throw new Error("El proveedor no devolvió task_id");
  return id;
}

export async function estadoTarea(taskId: string): Promise<TrebloTask> {
  const j = await llamar(`/v1/generations/${encodeURIComponent(taskId)}`, { method: "GET" }, 25000);
  const raw = String(j?.status || "").toUpperCase();
  const status: TrebloTask["status"] =
    raw === "SUCCESS" ? "success"
      : raw === "FAILURE" || raw === "FAILED" || raw === "ERROR" ? "failure"
        : raw === "GENERATING" || raw === "TASK_SENT" || raw === "RECEIVED" ? "generating"
          : raw === "PENDING" || raw === "QUEUED" ? "pending"
            : "unknown";
  const paths = Array.isArray(j?.song_paths) ? j.song_paths.filter((p: any) => typeof p === "string" && p) : [];
  return {
    status,
    rawStatus: raw,
    songPaths: paths,
    lyrics: String(j?.lyrics || ""),
    error: String(j?.error_message || ""),
  };
}

export async function saldo(): Promise<number | null> {
  try {
    const j = await llamar("/v1/credits/balance", { method: "GET" }, 15000);
    const n = Number(j?.num_credits);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Descarga una pista generada (para archivarla en R2). */
export async function descargarPista(url: string): Promise<Buffer> {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`No pude descargar la pista (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}
