const CREDIT_COSTS = {
  generate_music: 12,
  extend_music: 12,
  upload_and_cover: 12,
  upload_and_extend: 12,
  add_instrumental: 12,
  add_vocals: 12,
  sounds: 2.5,
  separate_vocal: 10,
  split_stem: 50,
  music_video: 2,
  mastering: 12,
  replace_section: 5,
  wav: 0.4,
  lyrics: 0.4,
  timestamped_lyrics: 0.5,
  boost_style: 0.4,
  midi: 0,
  generate_persona: 0,
  music_cover: 0,
  clone_voice: 15,
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const MAX_ACCUMULATED_CREDITS = 2000;

function stripInternalReasoning(raw: any): string {
  let s = typeof raw === "string" ? raw : String(raw == null ? "" : raw);
  if (!s) return "";
  try {
    s = s.replace(/<\s*think\b[^>]*>[\s\S]*?<\s*\/\s*think\s*>/gi, "");
    s = s.replace(/<\s*think\s*\/\s*>/gi, "");
    s = s.replace(/<!--\s*dify[-_]?deepseek[-_]?reasoning\s*-->[\s\S]*?<!--\s*\/\s*dify[-_]?deepseek[-_]?reasoning\s*-->/gi, "");
    s = s.replace(/<!--\s*dify[-_]?deepseek[-_]?reasoning\s*\/\s*-->/gi, "");
    s = s.replace(/<!--\s*reasoning[\s\S]*?-->/gi, "");
    s = s.replace(/^\s*<[?!][^>]*>/m, "");
    s = s.replace(/\n{3,}/g, "\n\n");
    return s.replace(/^[ \t]+|[ \t]+$/gm, (m) => m).replace(/^\s+|\s+$/g, "");
  } catch {
    return s;
  }
}

function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString();
}

function isIsoInPast(iso: any) {
  const s = String(iso || "").trim();
  if (!s) return false;
  const ms = new Date(s).getTime();
  if (!Number.isFinite(ms)) return false;
  return ms < Date.now();
}

function toCounts(credits: number) {
  const c = Number.isFinite(credits) ? Math.max(0, credits) : 0;
  const safeFloor = (div: number) => (div > 0 ? Math.floor(c / div) : 0);
  return {
    songs: safeFloor(CREDIT_COSTS.generate_music),
    voice_separate: safeFloor(CREDIT_COSTS.separate_vocal),
    split_stem: safeFloor(CREDIT_COSTS.split_stem),
    music_video: safeFloor(CREDIT_COSTS.music_video),
    sounds: safeFloor(CREDIT_COSTS.sounds),
    replace_section: safeFloor(CREDIT_COSTS.replace_section),
    wav: safeFloor(CREDIT_COSTS.wav),
    lyrics: safeFloor(CREDIT_COSTS.lyrics),
    timestamped_lyrics: safeFloor(CREDIT_COSTS.timestamped_lyrics),
    boost_style: safeFloor(CREDIT_COSTS.boost_style),
    midi: safeFloor(CREDIT_COSTS.midi),
  };
}

function creditsFromProfile(profile: any): number {
  const p = profile ?? {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k);

  // Verificar si los créditos han vencido
  const creditsExpiresAt = p.credits_expires_at;
  if (creditsExpiresAt) {
    const expiresDate = new Date(creditsExpiresAt);
    const now = new Date();
    
    if (expiresDate < now) {
      // Créditos vencidos, devolver 0
      return 0;
    }
  }

  for (const k of ["ramber_credits", "zingy_credits", "credits"]) {
    if (!has(k)) continue;
    const v = (p as any)[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Number(v));
  }

  if (has("song_balance")) {
    const songBal = typeof p?.song_balance === "number" && Number.isFinite(p.song_balance) ? Number(p.song_balance) : 0;
    if (songBal > 0) return Math.max(0, songBal) * CREDIT_COSTS.generate_music;
  }

  return 0;
}

function pickWritableCreditsColumn(profile: any): "zingy_credits" | "ramber_credits" | "credits" | "song_balance" | null {
  const p = profile ?? {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k);
  if (has("ramber_credits")) return "ramber_credits";
  if (has("zingy_credits")) return "zingy_credits";
  if (has("credits")) return "credits";
  if (has("song_balance")) return "song_balance";
  return null;
}

function isMissingColumnError(err: any) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    (msg.includes("column") && msg.includes("does not exist")) ||
    msg.includes("unknown column") ||
    (msg.includes("columna") && msg.includes("no existe"))
  );
}

function extractOutputUrl(output: any): string | null {
  if (!output) return null;

  const clean = (raw: any) =>
    String(raw || "")
      .trim()
      .replaceAll("`", "")
      .trim();

  const isHttp = (s: string) => /^https?:\/\//i.test(s);

  const score = (url: string) => {
    const u = url.toLowerCase();
    let s = 0;
    if (u.includes("replicate.delivery")) s += 50;
    if (u.endsWith(".pth") || u.endsWith(".pt") || u.endsWith(".zip") || u.endsWith(".tar") || u.endsWith(".tar.gz")) s += 30;
    if (u.includes("model")) s += 10;
    if (u.includes("weights")) s += 8;
    if (u.includes("audio")) s -= 5;
    if (u.endsWith(".mp3") || u.endsWith(".wav") || u.endsWith(".m4a") || u.endsWith(".ogg")) s -= 20;
    return s;
  };

  const urls: string[] = [];
  const pushUrl = (raw: any) => {
    const s = clean(raw);
    if (!s) return;
    if (isHttp(s)) urls.push(s);
  };

  if (typeof output === "string") {
    pushUrl(output);
  } else if (Array.isArray(output)) {
    for (const item of output) pushUrl(item);
  } else if (typeof output === "object") {
    const primary = [
      output?.model_url,
      output?.modelUrl,
      output?.model,
      output?.weights,
      output?.weight_url,
      output?.weightUrl,
      output?.file_url,
      output?.fileUrl,
      output?.download_url,
      output?.downloadUrl,
      output?.result_url,
      output?.resultUrl,
      output?.output_url,
      output?.outputUrl,
      output?.output,
      output?.url,
    ];
    for (const c of primary) pushUrl(c);
    if (urls.length === 0) {
      for (const v of Object.values(output)) {
        if (Array.isArray(v)) {
          for (const item of v) pushUrl(item);
        } else {
          pushUrl(v);
        }
      }
    }
  }

  if (urls.length === 0) return null;
  let best = urls[0];
  let bestScore = score(best);
  for (const u of urls.slice(1)) {
    const sc = score(u);
    if (sc > bestScore) {
      best = u;
      bestScore = sc;
    }
  }
  return best;
}

async function fetchUrlToBuffer(url: string): Promise<{ buf: Buffer; contentType: string }> {
  const headers: any = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    accept: "*/*",
  };
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) throw new Error(`No pude descargar el audio (HTTP ${res.status})`);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  if (!buf || buf.length === 0) throw new Error("No pude descargar el audio (vacío)");
  const contentType = (res.headers.get("content-type") || "audio/mpeg").toString().split(";")[0].trim() || "audio/mpeg";
  return { buf, contentType };
}

type R2Env = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  publicBaseUrl: string;
};

let cachedR2Env: R2Env | null = null;
let cachedR2Client: any | null = null;
let cachedR2Aws: any | null = null;
let cachedR2Presigner: any | null = null;

const voiceValidateIdempotencyCache = new Map();
const VOICE_VALIDATE_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

function cleanupVoiceValidateIdempotencyCache(now) {
  if (voiceValidateIdempotencyCache.size <= 220) return;
  for (const [k, v] of voiceValidateIdempotencyCache.entries()) {
    if (!v || !v.expiresAt || v.expiresAt <= now) voiceValidateIdempotencyCache.delete(k);
  }
  if (voiceValidateIdempotencyCache.size <= 220) return;
  const keys = Array.from(voiceValidateIdempotencyCache.keys());
  for (let i = 0; i < keys.length && voiceValidateIdempotencyCache.size > 220; i += 1) {
    voiceValidateIdempotencyCache.delete(keys[i]);
  }
}

function getR2Env(): R2Env {
  if (cachedR2Env) return cachedR2Env;
  const accountId = (process.env.R2_ACCOUNT_ID || "").toString().trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").toString().trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").toString().trim();
  const bucketName = (process.env.R2_BUCKET_NAME || "").toString().trim();
  const normalizeEndpoint = (raw: string) => {
    const s = (raw || "").toString().trim();
    if (!s) return "";
    try {
      const u = new URL(s);
      const bucket = (bucketName || "").toString().trim();
      const p = (u.pathname || "").replace(/\/+$/, "");
      if (bucket && p.toLowerCase() === `/${bucket.toLowerCase()}`) u.pathname = "/";
      return u.toString().replace(/\/$/, "");
    } catch {
      return s;
    }
  };
  const normalizePublicBaseUrl = (raw: string) => {
    const s = (raw || "").toString().trim();
    if (!s) return "";
    try {
      return new URL(s).toString().replace(/\/$/, "");
    } catch {
      return s.replace(/\/+$/, "");
    }
  };
  const endpoint = normalizeEndpoint(((process.env.R2_ENDPOINT || "") as string).toString()) || `https://${accountId}.r2.cloudflarestorage.com`;
  const publicBaseUrl =
    normalizePublicBaseUrl(
      ((process.env.R2_PUBLIC_BASE_URL ||
        process.env.R2_PUBLIC_URL ||
        process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL ||
        process.env.CLOUDFLARE_R2_PUBLIC_URL ||
        process.env.R2_CUSTOM_DOMAIN) as string).toString(),
    ) || `https://${bucketName}.${accountId}.r2.cloudflarestorage.com`;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error("Missing required R2 environment variables");
  }
  cachedR2Env = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
    publicBaseUrl,
  };
  return cachedR2Env;
}

async function getR2AwsSdk() {
  if (cachedR2Aws) return cachedR2Aws;
  cachedR2Aws = await import("@aws-sdk/client-s3");
  return cachedR2Aws;
}

async function getR2Presigner() {
  if (cachedR2Presigner) return cachedR2Presigner;
  cachedR2Presigner = await import("@aws-sdk/s3-request-presigner");
  return cachedR2Presigner;
}

async function getR2Client() {
  if (cachedR2Client) return cachedR2Client;
  const env = getR2Env();
  const { S3Client } = await getR2AwsSdk();
  const hostname = (() => {
    try {
      return new URL(env.endpoint).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const shouldForcePathStyle = hostname ? !hostname.startsWith(`${env.bucketName.toLowerCase()}.`) : true;
  cachedR2Client = new S3Client({
    region: "auto",
    endpoint: env.endpoint,
    forcePathStyle: shouldForcePathStyle,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
  return cachedR2Client;
}

async function uploadToR2(key: string, body: any, contentType: string): Promise<string> {
  const env = getR2Env();
  const client = await getR2Client();
  const { PutObjectCommand } = await getR2AwsSdk();
  const command = new PutObjectCommand({
    Bucket: env.bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await client.send(command);
  return `${env.publicBaseUrl}/${key}`;
}

// TEMP-LOGGING: quitar despues de diagnostico
async function insertR2CopyLog(admin: any, input: {
  taskId: string;
  userId?: string;
  kind: string;
  sunoAudioId?: string;
  sourceUrl?: string;
  fetchStatus?: number | null;
  downloadMs?: number | null;
  sizeBytes?: number | null;
  contentType?: string | null;
  fallbackUsed: boolean;
  errorStep?: string | null;
  errorMessage?: string | null;
}) {
  try {
    let sourceHost = "";
    try {
      sourceHost = new URL(String(input.sourceUrl || "").trim()).host.toLowerCase();
    } catch {
      sourceHost = "";
    }

    await admin.from("r2_copy_logs").insert({
      task_id: String(input.taskId || "").slice(0, 200),
      user_id: input.userId ? String(input.userId).slice(0, 200) : null,
      kind: String(input.kind || "").slice(0, 120),
      suno_audio_id: input.sunoAudioId ? String(input.sunoAudioId).slice(0, 200) : null,
      source_host: sourceHost ? sourceHost.slice(0, 255) : null,
      source_url: input.sourceUrl ? String(input.sourceUrl).slice(0, 2000) : null,
      fetch_status: Number.isFinite(Number(input.fetchStatus)) ? Number(input.fetchStatus) : null,
      download_ms: Number.isFinite(Number(input.downloadMs)) ? Number(input.downloadMs) : null,
      size_bytes: Number.isFinite(Number(input.sizeBytes)) ? Number(input.sizeBytes) : null,
      content_type: input.contentType ? String(input.contentType).slice(0, 255) : null,
      fallback_used: Boolean(input.fallbackUsed),
      error_step: input.errorStep ? String(input.errorStep).slice(0, 40) : null,
      error_message: input.errorMessage ? String(input.errorMessage).slice(0, 2000) : null,
    });
  } catch (e) {
    try {
      console.error(
        "[R2_COPY_LOG][FAILED]",
        JSON.stringify(
          {
            taskId: input && input.taskId ? String(input.taskId).slice(0, 200) : "",
            kind: input && input.kind ? String(input.kind).slice(0, 120) : "",
            sunoAudioId: input && input.sunoAudioId ? String(input.sunoAudioId).slice(0, 200) : "",
            error: e instanceof Error ? e.message : String(e),
          },
          null,
          2
        )
      );
    } catch {
    }
  }
}

/**
 * Copia un archivo desde una URL temporal (ej: Replicate) a R2 con una URL permanente
 * @param sourceUrl URL temporal del archivo (ej: de replicate.delivery)
 * @param userId ID del usuario para la ruta en R2
 * @param prefix Prefijo para la ruta en R2 (ej: "voice-models/")
 * @param fileName Nombre del archivo (sin extensión)
 * @returns URL permanente en R2
 */
async function copyUrlToR2(sourceUrl: string, userId: string, prefix: string, fileName: string): Promise<string> {
  console.log(`📦 Copiando archivo a R2: ${sourceUrl.substring(0, 80)}...`);
  
  try {
    // Descargar el archivo desde la URL temporal
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar el archivo (HTTP ${response.status})`);
    }
    
    // Obtener el tipo de contenido
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Determinar la extensión del archivo
    let ext = 'bin';
    if (contentType.includes('audio')) {
      ext = contentType.includes('wav') ? 'wav' : 'mp3';
    } else if (contentType.includes('zip')) {
      ext = 'zip';
    } else if (contentType.includes('json')) {
      ext = 'json';
    }
    
    // Crear la ruta en R2
    const key = `${prefix}${userId}/${Date.now()}_${fileName}.${ext}`;
    
    // Leer el contenido
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Subir a R2
    const permanentUrl = await uploadToR2(key, buffer, contentType);
    
    console.log(`✅ Archivo copiado a R2: ${permanentUrl}`);
    return permanentUrl;
    
  } catch (error) {
    console.error(`❌ Error al copiar archivo a R2:`, error);
    throw error;
  }
}

async function getSignedR2Url(key: string, expiresIn: number = 3600): Promise<string> {
  const env = getR2Env();
  const client = await getR2Client();
  const { GetObjectCommand } = await getR2AwsSdk();
  const { getSignedUrl } = await getR2Presigner();
  const command = new GetObjectCommand({
    Bucket: env.bucketName,
    Key: key,
  });
  return await getSignedUrl(client, command, { expiresIn });
}

// Suno y otros proveedores externos pueden tardar bastante en entrar a la cola
// antes de intentar descargar el archivo de origen. Para estos casos no usamos
// la firma corta por defecto.
const PROVIDER_SOURCE_AUDIO_URL_TTL_SECONDS = 60 * 60 * 24;

async function getSignedR2PutUrl(key: string, contentType: string, expiresIn: number = 600): Promise<string> {
  const env = getR2Env();
  const client = await getR2Client();
  const { PutObjectCommand } = await getR2AwsSdk();
  const { getSignedUrl } = await getR2Presigner();
  const ct = (contentType || "application/octet-stream").toString().trim() || "application/octet-stream";
  const command = new PutObjectCommand({
    Bucket: env.bucketName,
    Key: key,
    ContentType: ct,
    CacheControl: "max-age=604800, immutable",
  });
  const signed = await getSignedUrl(client, command, { expiresIn, unhoistableHeaders: new Set(["content-type"]) });
  try {
    const u = new URL(signed);
    const hasAmzHeaders =
      u.searchParams.has("X-Amz-Algorithm") ||
      u.searchParams.has("X-Amz-Credential") ||
      u.searchParams.has("X-Amz-Signature");
    if (hasAmzHeaders) {
      u.searchParams.delete("X-Amz-SignedHeaders");
      u.searchParams.set("X-Amz-SignedHeaders", "host");
    }
    return u.toString();
  } catch {
    return signed;
  }
}

async function deleteFromR2(paths: string[]): Promise<number> {
  const env = getR2Env();
  const client = await getR2Client();
  const { DeleteObjectsCommand } = await getR2AwsSdk();
  const list = Array.isArray(paths) ? paths.map((x) => String(x || "").trim()).filter(Boolean) : [];
  if (list.length === 0) return 0;
  const batches: string[][] = [];
  for (let i = 0; i < list.length; i += 1000) batches.push(list.slice(i, i + 1000));
  let deletedCount = 0;
  for (const batch of batches) {
    const objects = batch.map((p) => ({ Key: p }));
    const command = new DeleteObjectsCommand({
      Bucket: env.bucketName,
      Delete: { Objects: objects },
    });
    try {
      await client.send(command);
      deletedCount += batch.length;
    } catch {
    }
  }
  return deletedCount;
}

function normalizeWatermarkVersion(raw: any) {
  const value = String(raw || "").trim().toLowerCase();
  return value === "v2" ? "v2" : "v1";
}

function getWatermarkAssetKey(versionRaw: any) {
  const version = normalizeWatermarkVersion(versionRaw);
  return `system-assets/watermark-${version}.mp3`;
}

async function runPreviewWatermarkWithWorker(params: {
  workerUrl: string;
  originalInputUrl: string;
  watermarkInputUrl: string;
  outputPutUrl: string;
  introDelayMs?: number;
}) {
  const workerUrl = params.workerUrl.replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10 * 60 * 1000);
  const r = await fetch(`${workerUrl}/preview-watermark`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      originalInputUrl: params.originalInputUrl,
      watermarkInputUrl: params.watermarkInputUrl,
      outputUploadUrl: params.outputPutUrl,
      introDelayMs: Number.isFinite(Number(params.introDelayMs)) ? Number(params.introDelayMs) : 2000,
    }),
    signal: ctrl.signal as any,
  }).finally(() => clearTimeout(timer));
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out?.ok === false) {
    const msg = String(out?.error || out?.detail || `HTTP ${r.status}`);
    throw new Error(msg || "No pude generar el preview protegido en el worker");
  }
  return out;
}

async function ensureProfileExists(admin: any, userId: string) {
  const r = await admin.from("profiles").upsert({ id: userId }, { onConflict: "id" });
  if (!r?.error) return { ok: true };
  return { ok: false, error: String(r.error?.message || "No pude crear el perfil.") };
}

async function updateCreditsAnyColumn(admin: any, userId: string, nextCredits: number) {
  const next = round2(Math.max(0, Number(nextCredits)));
  if (!Number.isFinite(next)) return { ok: false, error: "Créditos inválidos" };

  const candidates: Array<"ramber_credits" | "zingy_credits" | "credits" | "song_balance"> = [
    "ramber_credits",
    "zingy_credits",
    "credits",
    "song_balance",
  ];

  for (const col of candidates) {
    const patch: any = {};
    if (col === "song_balance") patch[col] = toCounts(next).songs;
    else patch[col] = next;
    const { error } = await admin.from("profiles").update(patch).eq("id", userId);
    if (!error) return { ok: true as const, credits: next, col };
    if (isMissingColumnError(error)) continue;
    return { ok: false as const, error: String(error.message || "No pude actualizar créditos.") };
  }

  return { ok: false as const, error: "Falta columna de créditos en profiles." };
}

async function applyCreditRolloverWithCap(
  admin: any,
  input: {
    userId: string;
    monthlyCredits: number;
    subscriptionActive: boolean;
    renewalPaidSuccessfully: boolean;
    isUnlimitedAccount?: boolean;
  },
) {
  const { userId, monthlyCredits, subscriptionActive, renewalPaidSuccessfully, isUnlimitedAccount = false } = input;

  // Solo se acumulan créditos cuando la suscripción/plan está activa
  // y el pago de renovación fue aprobado exitosamente.
  if (!subscriptionActive) {
    return { ok: false as const, error: "Suscripción inactiva: no se acumulan créditos." };
  }
  if (!renewalPaidSuccessfully) {
    return { ok: false as const, error: "Pago no aprobado: no se acumulan créditos." };
  }

  // Normalizamos los créditos mensuales del plan.
  // Ejemplo: si el plan da 2000, monthly será 2000.
  const monthly = round2(Number(monthlyCredits));
  if (!Number.isFinite(monthly) || monthly <= 0) {
    return { ok: false as const, error: "Créditos mensuales inválidos." };
  }

  const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (readErr) return { ok: false as const, error: readErr.message };

  // Leemos el saldo actual no utilizado del usuario.
  // Si no existe o viene raro, tomamos 0 para no romper el cálculo.
  const current = round2(creditsFromProfile(profile));
  let batchCredits = 0;
  try {
    batchCredits = await getActiveBatchCredits(admin, userId);
  } catch {
    batchCredits = 0;
  }

  // Regla 1: suma de créditos = saldo actual no usado + créditos nuevos del mes.
  // Ejemplo: 1500 actuales + 2000 nuevos = 3500.
  const sum = round2(current + monthly);

  // Regla 2: tope máximo fijo de saldo acumulado = 2000 créditos.
  const cap = round2(MAX_ACCUMULATED_CREDITS);

  // Excepción para cuentas admin/ilimitadas:
  // si el usuario es admin, no aplicamos tope y puede conservar/acumular todo.
  // Para el resto sí se limita al equivalente de 2 meses.
  const profileEmail = String((profile as any)?.email || "").trim().toLowerCase();
  const unlimited = isUnlimitedAccount || isAdminEmail(profileEmail);

  // Regla 3: para usuarios normales, el saldo final nunca puede pasar del cap.
  // Ejemplo: si sum da 4500 y cap es 4000, guardamos 4000 exactos.
  // Para admin: si sum da 4500, se guarda 4500.
  const maxProfileAllowed = round2(Math.max(0, cap - round2(batchCredits)));
  const next = round2(unlimited ? sum : Math.min(sum, maxProfileAllowed));

  // Actualizar créditos y fecha de vencimiento
  const patch: any = {};
  const col = pickWritableCreditsColumn(profile);
  if (col === "song_balance") {
    patch.song_balance = toCounts(next).songs;
  } else if (col) {
    patch[col] = next;
  }
  
  patch.credits_expires_at = addDaysIso(60);
  
  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) return { ok: false as const, error: String(error.message || "No pude actualizar créditos.") };
  
  return { ok: true as const, previous: current, added: monthly, cap, next, unlimited };
}

async function ensureMonthlyCreditsCycle(admin: any, userId: string) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const cycleMs = 30 * dayMs;

  const insertCycle = async (atMs: number) => {
    try {
      await admin.from("mp_transactions").insert({
        user_id: userId,
        kind: "credits_cycle",
        pack_key: "cycle",
        amount_mxn: 0,
        payment_id: `credits_cycle:${userId}:${atMs}`,
      });
    } catch {
    }
  };

  const readStartIso = async () => {
    try {
      const { data } = await admin
        .from("mp_transactions")
        .select("created_at, payment_id")
        .eq("user_id", userId)
        .eq("kind", "credits_cycle")
        .order("created_at", { ascending: false })
        .limit(1);
      const row = Array.isArray(data) ? data[0] : null;
      const iso = String((row as any)?.created_at || "").trim();
      return iso || "";
    } catch {
      return "";
    }
  };

  let startIso = await readStartIso();
  if (!startIso) {
    await insertCycle(now);
    startIso = new Date(now).toISOString();
  }

  let startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs) || startMs <= 0) startMs = now;
  let expiresMs = startMs + cycleMs;

  let didReset = false;
  if (now >= expiresMs) {
    // Ya no reseteamos créditos a cero en el corte mensual.
    // El saldo se conserva y la recarga ocurre cuando entra el pago aprobado.
    await insertCycle(now);
    startMs = now;
    expiresMs = now + cycleMs;
  }

  return {
    ok: true as const,
    cycle_start_at: new Date(startMs).toISOString(),
    cycle_expires_at: new Date(expiresMs).toISOString(),
    cycle_seconds_left: Math.max(0, Math.floor((expiresMs - now) / 1000)),
    did_reset: didReset,
  };
}

function parseProviderCreditsValue(raw: any) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const cleaned = raw
      .trim()
      .replaceAll("Credits", "")
      .replaceAll("credits", "")
      .replaceAll(" ", "")
      .replaceAll(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function normalizeSunoBaseUrl(rawBase: string) {
  let base = (rawBase || "").toString().trim();
  base = base.replace(/^[`"' ]+/, "").replace(/[`"' ]+$/, "").trim();
  if (!base) return "";
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  while (base.endsWith("/")) base = base.slice(0, -1);
  if (base.toLowerCase().endsWith("/api/v1")) base = base.slice(0, -"/api/v1".length);
  while (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

async function providerFetchJson(path: string, init?: RequestInit) {
  const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
  const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";

  const apiKeyRaw = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
  const apiKey = String(apiKeyRaw || "").trim().replace(/^[`"' ]+/, "").replace(/[`"' ]+$/, "").trim();
  if (!apiKey) throw new Error("Falta SUNO_API_KEY en variables de entorno");

  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  if (apiKey && !headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);

  const url = new URL(path, base).toString();
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res, data, text };
}

function audioExtensionFromContentType(rawContentType: any) {
  const contentType = String(rawContentType || "").trim().toLowerCase().split(";")[0].trim();
  if (contentType === "audio/wav" || contentType === "audio/x-wav") return "wav";
  if (contentType === "audio/ogg") return "ogg";
  if (contentType === "audio/aac") return "aac";
  if (contentType === "audio/flac") return "flac";
  if (contentType === "audio/mp4" || contentType === "audio/x-m4a" || contentType === "audio/m4a") return "m4a";
  return "mp3";
}

function originFromReq(req: any) {
  const proto = (req?.headers?.["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
  const host = (req?.headers?.["x-forwarded-host"] || req?.headers?.host || "").toString().split(",")[0].trim();
  return `${proto}://${host}`;
}

function absoluteUrlFromReq(req: any, pathname: string) {
  return new URL(pathname, originFromReq(req)).toString();
}

function normalizeBackendSourceUrl(req: any, rawUrl: any) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (value.startsWith("/")) return absoluteUrlFromReq(req, value);
  if (/^https?:\/\//i.test(value)) return value;
  return "";
}

function isSourceObjectNotFoundError(error: any) {
  const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return message.includes("http 404") || message.includes("not found") || message.includes("no such key");
}

async function uploadBufferToSunoTempFile(buf: Buffer, contentType: string, fileName: string, uploadPath: string) {
  const apiKeyRaw = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
  const apiKey = String(apiKeyRaw || "").trim().replace(/^[`"' ]+/, "").replace(/[`"' ]+$/, "").trim();
  if (!apiKey) throw new Error("Falta SUNO_API_KEY en variables de entorno");

  const safeUploadPath = String(uploadPath || "ramber-cover-source").trim().replace(/^\/+/, "").replace(/\/+$/, "") || "ramber-cover-source";
  const safeFileName = String(fileName || `cover_${Date.now()}.mp3`).trim().replace(/[\\/:*?"<>|]+/g, "_") || `cover_${Date.now()}.mp3`;
  const mime = String(contentType || "").trim() || "audio/mpeg";

  const form = new FormData();
  form.append("file", new Blob([buf], { type: mime }), safeFileName);
  form.append("uploadPath", safeUploadPath);
  form.append("fileName", safeFileName);

  const res = await fetch("https://sunoapiorg.redpandaai.co/api/file-stream-upload", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  const downloadUrl = String(data?.data?.downloadUrl || "").trim();
  const filePath = String(data?.data?.filePath || "").trim();
  if (!(res.ok && data?.success && Number(data?.code || 0) === 200 && downloadUrl)) {
    const detail = String(data?.msg || data?.error || text || `HTTP ${res.status}`).trim();
    throw new Error(detail || "No se pudo subir el audio temporal a Suno.");
  }

  return { downloadUrl, filePath };
}

async function prepareCoverUploadUrlForSuno(req: any, uploadUrlRaw: string, uploadPathRaw: string, userId: string, titleRaw: string) {
  const fallbackSourceUrl = normalizeBackendSourceUrl(req, uploadUrlRaw);
  const uploadPath = String(uploadPathRaw || "").trim();
  if (!uploadPath && !fallbackSourceUrl) {
    throw new Error("No recibí una URL final válida del audio.");
  }

  let sourceUrl = fallbackSourceUrl;
  let fetchedAudio: { buf: Buffer; contentType: string } | null = null;

  if (uploadPath) {
    const signedUrl = await getSignedR2Url(uploadPath, PROVIDER_SOURCE_AUDIO_URL_TTL_SECONDS);
    if (typeof signedUrl === "string" && signedUrl.trim()) {
      try {
        fetchedAudio = await fetchUrlToBuffer(signedUrl.trim());
        sourceUrl = signedUrl.trim();
      } catch (error) {
        if (!(isSourceObjectNotFoundError(error) && fallbackSourceUrl)) {
          throw error;
        }
      }
    }
  }

  if (!fetchedAudio) {
    if (!fallbackSourceUrl) throw new Error("No recibí una URL HTTP/HTTPS válida del audio.");
    fetchedAudio = await fetchUrlToBuffer(fallbackSourceUrl);
    sourceUrl = fallbackSourceUrl;
  }

  const { buf, contentType } = fetchedAudio;
  const ext = audioExtensionFromContentType(contentType);
  const safeStem = String(titleRaw || "cover").trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "-").slice(0, 60) || "cover";
  const safeUserId = String(userId || "user").trim().replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 60) || "user";
  const fileName = `${safeStem}_${Date.now()}.${ext}`;
  const uploaded = await uploadBufferToSunoTempFile(buf, contentType, fileName, `ramber-cover-source/${safeUserId}`);
  if (!uploaded?.downloadUrl) throw new Error("Suno no devolvió una URL temporal descargable para el audio.");

  return {
    uploadUrl: uploaded.downloadUrl,
    sourceUrl,
    tempFilePath: uploaded.filePath || "",
    contentType,
  };
}

async function adjustUserCredits(admin: any, userId: string, deltaCredits: number) {
  const delta = Number(deltaCredits);
  if (!Number.isFinite(delta) || !delta) return { ok: true as const };

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (readErr) return { ok: false as const, error: readErr.message };
    if (!profile) {
      const created = await ensureProfileExists(admin, userId);
      if (!created.ok) return { ok: false as const, error: created.error };
      continue;
    }

    const current = creditsFromProfile(profile);
    const profileEmail = String((profile as any)?.email || "").trim().toLowerCase();
    const unlimited = isAdminEmail(profileEmail);

    let next = round2(Math.max(0, current + delta));
    if (delta > 0 && !unlimited) {
      let batchCredits = 0;
      try {
        batchCredits = await getActiveBatchCredits(admin, userId);
      } catch {
        batchCredits = 0;
      }
      const cap = round2(MAX_ACCUMULATED_CREDITS);
      const maxProfileAllowed = round2(Math.max(0, cap - round2(batchCredits)));
      next = round2(Math.min(next, maxProfileAllowed));
    }
    
    // Actualizar créditos y fecha de vencimiento si se están agregando créditos
    if (delta > 0) {
      const expiresIso = addDaysIso(60);
      const patch: any = {};
      const col = pickWritableCreditsColumn(profile);
      if (col === "song_balance") {
        patch.song_balance = toCounts(next).songs;
      } else if (col) {
        patch[col] = next;
      }
      
      // Agregar campo credits_expires_at
      patch.credits_expires_at = expiresIso;
      
      const { error } = await admin.from("profiles").update(patch).eq("id", userId);
      if (!error) return { ok: true as const, credits: next };
      return { ok: false as const, error: String(error.message || "No pude actualizar créditos.") };
    } else {
      // Para restar créditos, usar la función existente
      const upd = await updateCreditsAnyColumn(admin, userId, next);
      if (upd.ok) return { ok: true as const, credits: next };
      return { ok: false as const, error: upd.error };
    }
  }

  return { ok: false as const, error: "No pude actualizar créditos (intenta otra vez)." };
}

async function consumeUserCredits(admin: any, userId: string, costCredits: number) {
  const cost = round2(Number(costCredits));
  if (!Number.isFinite(cost) || cost <= 0) return { ok: true as const };

  try {
    await ensureMonthlyCreditsCycle(admin, userId);
  } catch {
  }

  let cachedPlan: any = null;
  let planRejection: any = null;
  try {
    const plan = await getUserPlan(admin, userId);
    cachedPlan = plan;
    const key = String((plan as any)?.plan_key || "").toLowerCase();
    const exp = (plan as any)?.plan_expires_at;
    const active = Boolean((plan as any)?.plan_active);
    if ((key === "inicio" || key === "productor") && exp && !active) {
      planRejection = { ok: false as const, error: "Tu paquete venció. Para seguir usando, renueva tu plan.", plan_expires_at: exp };
    }
  } catch {
  }

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (readErr) return { ok: false as const, error: readErr.message };
    if (!profile) {
      const created = await ensureProfileExists(admin, userId);
      if (!created.ok) return { ok: false as const, error: created.error };
      continue;
    }

    const batchCredits = await getActiveBatchCredits(admin, userId);
    const profileCreditsRaw = creditsFromProfile(profile);
    const globalExpired = isIsoInPast((profile as any)?.credits_expires_at);
    const profileCredits = globalExpired ? 0 : profileCreditsRaw;
    const totalAvailable = round2(profileCredits + batchCredits);

    if (globalExpired && batchCredits <= 0) {
      if (planRejection) return planRejection;
      return {
        ok: false as const,
        error: "Tus créditos han vencido, adquiere un nuevo paquete para continuar."
      };
    }

    if (totalAvailable < cost) {
      if (planRejection) return planRejection;
      return { ok: false as const, error: "Créditos insuficientes. Recarga para continuar.", credits: totalAvailable };
    }

    const pendingAfterBatches = await consumeBatchCreditsFifo(admin, userId, cost);

    if (pendingAfterBatches <= 0) {
      const remainingTotal = await getUserAvailableCredits(admin, userId, profile);
      return { ok: true as const, credits: remainingTotal };
    }

    const currentProfile = globalExpired ? 0 : creditsFromProfile(profile);
    if (currentProfile < pendingAfterBatches) {
      if (planRejection) return planRejection;
      return { ok: false as const, error: "Créditos insuficientes. Recarga para continuar.", credits: totalAvailable };
    }
    const next = round2(Math.max(0, currentProfile - pendingAfterBatches));
    const upd = await updateCreditsAnyColumn(admin, userId, next);
    if (upd.ok) {
      const remainingTotal = await getUserAvailableCredits(admin, userId, profile);
      return { ok: true as const, credits: remainingTotal };
    }
    return { ok: false as const, error: upd.error };
  }

  if (planRejection) return planRejection;
  return { ok: false as const, error: "No pude consumir créditos (intenta otra vez)." };
}

async function ensureUserHasCreditsAvailable(admin: any, userId: string, costCredits: number) {
  const cost = round2(Number(costCredits));
  if (!Number.isFinite(cost) || cost <= 0) return { ok: true as const };

  try {
    await ensureMonthlyCreditsCycle(admin, userId);
  } catch {
  }

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (readErr) return { ok: false as const, error: readErr.message };
    if (!profile) {
      const created = await ensureProfileExists(admin, userId);
      if (!created.ok) return { ok: false as const, error: created.error };
      continue;
    }

    const batchCredits = await getActiveBatchCredits(admin, userId);
    const profileCredits = creditsFromProfile(profile);
    const globalExpired = isIsoInPast((profile as any)?.credits_expires_at);
    const effectiveProfileCredits = globalExpired ? 0 : profileCredits;
    const totalAvailable = round2(effectiveProfileCredits + batchCredits);

    if (globalExpired && batchCredits <= 0) {
      return {
        ok: false as const,
        error: "Tus créditos han vencido, adquiere un nuevo paquete para continuar."
      };
    }

    if (totalAvailable >= cost) {
      return { ok: true as const, credits: totalAvailable };
    }
  }

  try {
    const plan = await getUserPlan(admin, userId);
    const key = String((plan as any)?.plan_key || "").toLowerCase();
    const exp = (plan as any)?.plan_expires_at;
    const active = Boolean((plan as any)?.plan_active);
    if ((key === "inicio" || key === "productor") && exp && !active) {
      return { ok: false as const, error: "Tu paquete venció. Para seguir usando, renueva tu plan.", plan_expires_at: exp };
    }
  } catch {
  }

  return { ok: false as const, error: "Créditos insuficientes. Recarga para continuar." };
}

function isAdminEmail(email?: string | null) {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;

  const hardcoded = ["rubenfiverr612@gmail.com", "rubenvidal612@gmail.com"];

  const raw = (typeof process !== "undefined" && (process as any)?.env && ((process as any).env.ADMIN_EMAILS || (process as any).env.ADMIN_EMAIL)) || "";
  const list = String(raw)
    .split(/[,\s]+/g)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  if (list.length === 0) {
    return hardcoded.includes(e);
  }
  return list.includes(e) || hardcoded.includes(e);
}

function buildUserPlanFromTransactions(rows: any[], nowMs = Date.now()) {
  const list = Array.isArray(rows) ? rows : [];

  const pickPlanKey = (raw: any) => {
    const k = String(raw || "").trim().toLowerCase();
    return k === "inicio" || k === "productor" || k === "ninguno" ? k : "";
  };

  const latestPlanEvent =
    list.find((t: any) => {
      const planKey = pickPlanKey(t?.pack_key);
      if (!planKey) return false;
      const paymentId = String(t?.payment_id || "").trim();
      if (paymentId.startsWith("claim:")) return false;
      if (paymentId.startsWith("admin_plan:")) return true;
      return planKey === "inicio" || planKey === "productor";
    }) || null;

  const plan_key = pickPlanKey(latestPlanEvent?.pack_key) || "ninguno";
  const planStartIso =
    plan_key === "inicio" || plan_key === "productor"
      ? String(latestPlanEvent?.created_at || "").trim() || null
      : null;

  const plan_expires_at = (() => {
    if (!planStartIso) return null;
    const t = new Date(planStartIso).getTime();
    if (!Number.isFinite(t) || t <= 0) return null;
    return new Date(t + 30 * 24 * 60 * 60 * 1000).toISOString();
  })();

  const plan_active = (() => {
    if (!plan_expires_at) return false;
    const t = new Date(plan_expires_at).getTime();
    if (!Number.isFinite(t) || t <= 0) return false;
    return nowMs < t;
  })();

  const downloads_allowed = plan_active && (plan_key === "inicio" || plan_key === "productor");
  const hasProductor = list.some((t: any) => String(t?.pack_key || "").trim().toLowerCase() === "productor");
  const has_paid_ever = list.some((t: any) => {
    const pk = String(t?.pack_key || "").trim().toLowerCase();
    if (!(pk === "inicio" || pk === "productor")) return false;
    const paymentId = String(t?.payment_id || "").trim();
    if (paymentId.startsWith("claim:")) return false;
    const amt = Number(t?.amount_mxn);
    if (Number.isFinite(amt) && amt > 0) return true;
    if (paymentId && !paymentId.startsWith("free:")) return true;
    return false;
  });

  return { plan_key, downloads_allowed, plan_active, plan_expires_at, hasProductor, has_paid_ever };
}

async function getUserPlan(admin: any, userId: string) {
  const { data: tx } = await admin
    .from("mp_transactions")
    .select("payment_id, pack_key, kind, created_at, amount_mxn")
    .eq("user_id", userId)
    .eq("kind", "songs")
    .order("created_at", { ascending: false })
    .limit(200);
  return buildUserPlanFromTransactions(Array.isArray(tx) ? tx : []);
}

async function randomHex(bytes: number) {
  try {
    const mod: any = await import("crypto");
    const buf: Buffer = mod.randomBytes(bytes);
    return buf.toString("hex");
  } catch {
    return Math.random().toString(16).slice(2).padEnd(bytes * 2, "0").slice(0, bytes * 2);
  }
}

function normalizeAffiliateCode(raw: any) {
  return (raw || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

async function ensureAffiliateAccount(admin: any, userId: string) {
  const { data: rows } = await admin.from("affiliate_accounts").select("*").eq("user_id", userId).limit(1);
  const existing = Array.isArray(rows) ? rows[0] : null;
  if (existing?.code) return { ok: true as const, account: existing };
  for (let i = 0; i < 6; i++) {
    const code = `r${await randomHex(6)}`.slice(0, 13);
    const ins = await admin.from("affiliate_accounts").insert({
      user_id: userId,
      code,
      payout_email: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (!ins?.error) {
      const { data: next } = await admin.from("affiliate_accounts").select("*").eq("user_id", userId).limit(1);
      const acc = Array.isArray(next) ? next[0] : null;
      return { ok: true as const, account: acc || { user_id: userId, code } };
    }
  }
  return { ok: false as const, error: "No pude crear tu código de afiliado" };
}

async function tryAttachAffiliateReferral(admin: any, referredUserId: string, referralCodeRaw: any) {
  const referralCode = normalizeAffiliateCode(referralCodeRaw);
  if (!referralCode) return { ok: true as const, attached: false as const };

  const { data: exists } = await admin.from("affiliate_referrals").select("id").eq("referred_user_id", referredUserId).limit(1);
  if (Array.isArray(exists) && exists.length > 0) return { ok: true as const, attached: false as const, already: true as const };

  const { data: accRows } = await admin.from("affiliate_accounts").select("user_id, code").eq("code", referralCode).limit(1);
  const acc = Array.isArray(accRows) ? accRows[0] : null;
  const affiliateUserId = String(acc?.user_id || "").trim();
  if (!affiliateUserId) return { ok: true as const, attached: false as const, missing: true as const };
  if (affiliateUserId === referredUserId) return { ok: true as const, attached: false as const, self: true as const };

  let fullName = "";
  try {
    const u = await admin.auth.admin.getUserById(referredUserId);
    const meta: any = u?.data?.user?.user_metadata || {};
    const n = (meta?.full_name || meta?.name || "").toString().trim();
    const ln = (meta?.last_name || "").toString().trim();
    fullName = (n && ln ? `${n} ${ln}` : n || ln).toString().trim();
  } catch {}

  const ins = await admin.from("affiliate_referrals").insert({
    affiliate_user_id: affiliateUserId,
    referred_user_id: referredUserId,
    referred_full_name: fullName || null,
    created_at: new Date().toISOString(),
  });
  if (ins?.error) return { ok: false as const, error: String(ins.error?.message || "No pude guardar el referido") };
  return { ok: true as const, attached: true as const, affiliate_user_id: affiliateUserId };
}

async function getSupabaseCreateClient() {
  const mod = await import("@supabase/supabase-js");
  return mod.createClient;
}

// ==========================================================================
// SISTEMA DE LOTES DE CRÉDITOS (mini paquetes) - NUEVO, SEPARADO
// Lotes FIFO: al consumir, primero se gasta el lote que vence más pronto.
// ==========================================================================

/**
 * Suma los créditos disponibles de todos los lotes activos y no vencidos del usuario.
 * Si la tabla credit_batches no existe (aún no aplicada la migración), retorna 0
 * para no romper el flujo existente.
 */
async function getActiveBatchCredits(admin: any, userId: string): Promise<number> {
  try {
    const { data, error } = await admin
      .from("credit_batches")
      .select("remaining_credits, expires_at, is_expired")
      .eq("user_id", userId)
      .eq("is_expired", false);
    if (error) {
      if (isMissingColumnError(error) || /relation.*credit_batches.*does not exist/i.test(String(error?.message || error || ""))) {
        return 0;
      }
      return 0;
    }
    const now = Date.now();
    let total = 0;
    const rows = Array.isArray(data) ? data : [];
    for (const r of rows) {
      const remaining = Number((r as any).remaining_credits ?? 0);
      if (!Number.isFinite(remaining) || remaining <= 0) continue;
      const expIso = String((r as any).expires_at || "").trim();
      if (expIso) {
        const expMs = new Date(expIso).getTime();
        if (Number.isFinite(expMs) && expMs <= now) continue;
      }
      total += remaining;
    }
    return round2(total);
  } catch {
    return 0;
  }
}

/**
 * Devuelve el crédito TOTAL disponible del usuario:
 *  - Créditos en la columna global del perfil (sistema Pack Inicio / Productor)
 *    SIN SUMAR si vence antes.
 *    Usamos creditsFromProfile (que ya valida credits_expires_at global).
 *  - Créditos de lotes activos y no vencidos.
 *
 * Esta es la función que debería usarse para mostrar saldo y validar si puede gastar.
 */
async function getUserAvailableCredits(admin: any, userId: string, profile?: any): Promise<number> {
  let profileCredits = 0;
  if (profile) {
    profileCredits = creditsFromProfile(profile);
  } else {
    try {
      const { data } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
      profileCredits = creditsFromProfile(data);
    } catch {
      profileCredits = 0;
    }
  }
  const batchCredits = await getActiveBatchCredits(admin, userId);
  return round2(profileCredits + batchCredits);
}

/**
 * Consume créditos de los lotes activos siguiendo orden FIFO:
 * primero agota el lote cuya fecha de expiración es más próxima.
 * Retorna la cantidad que NO pudo cubrir de los lotes (0 = todo cubierto).
 * Si la tabla no existe, retorna costNeeded completo.
 */
async function consumeBatchCreditsFifo(admin: any, userId: string, costNeeded: number): Promise<number> {
  const cost = round2(Number(costNeeded));
  if (!Number.isFinite(cost) || cost <= 0) return 0;

  try {
    const nowMs = Date.now();
    const { data, error } = await admin
      .from("credit_batches")
      .select("id, remaining_credits, expires_at")
      .eq("user_id", userId)
      .eq("is_expired", false)
      .gt("remaining_credits", 0)
      .order("expires_at", { ascending: true })
      .order("purchased_at", { ascending: true });
    if (error) {
      if (isMissingColumnError(error) || /relation.*credit_batches.*does not exist/i.test(String(error?.message || error || ""))) {
        return cost;
      }
      return cost;
    }

    const batches = (Array.isArray(data) ? data : [])
      .filter((r: any) => {
        const remaining = Number((r as any).remaining_credits ?? 0);
        if (!Number.isFinite(remaining) || remaining <= 0) return false;
        const expIso = String((r as any).expires_at || "").trim();
        if (expIso) {
          const expMs = new Date(expIso).getTime();
          if (Number.isFinite(expMs) && expMs <= nowMs) return false;
        }
        return true;
      })
      .map((r: any) => ({
        id: Number((r as any).id ?? 0),
        remaining: round2(Number((r as any).remaining_credits ?? 0)),
      }))
      .filter((b: any) => b.id > 0);

    let pending = cost;
    for (const b of batches) {
      if (pending <= 0) break;
      const take = round2(Math.min(b.remaining, pending));
      const nextRemaining = round2(Math.max(0, b.remaining - take));
      const { error: updErr } = await admin
        .from("credit_batches")
        .update({ remaining_credits: nextRemaining })
        .eq("id", b.id);
      if (!updErr) {
        pending = round2(Math.max(0, pending - take));
      }
    }
    return round2(pending);
  } catch {
    return cost;
  }
}

/**
 * Inserta un lote de créditos nuevo cuando se aprueba el pago de un mini paquete.
 * No falla si la tabla no existe (aún no migrada), retorna ok:false en ese caso.
 */
async function insertCreditBatch(admin: any, input: {
  userId: string;
  packId?: number;
  packKey?: string;
  paymentId?: string;
  credits: number;
  validityDays: number;
  amountMxn?: number;
  note?: string;
}): Promise<{ ok: boolean; error?: string; batchId?: number }> {
  const credits = round2(Number(input.credits ?? 0));
  const days = Number(input.validityDays ?? 0);
  if (!Number.isFinite(credits) || credits <= 0) return { ok: false, error: "Créditos inválidos" };
  if (!Number.isFinite(days) || days <= 0) return { ok: false, error: "Vigencia inválida" };
  if (!input.userId) return { ok: false, error: "Falta usuario" };

  const purchasedAt = new Date();
  const expiresAt = new Date(purchasedAt.getTime() + days * 24 * 60 * 60 * 1000);
  const row: any = {
    user_id: input.userId,
    pack_id: Number.isFinite(Number(input.packId)) && Number(input.packId) > 0 ? Number(input.packId) : null,
    pack_key: input.packKey ? String(input.packKey).slice(0, 120) : null,
    payment_id: input.paymentId ? String(input.paymentId).slice(0, 255) : null,
    original_credits: credits,
    remaining_credits: credits,
    purchased_at: purchasedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    is_expired: false,
    amount_mxn: Number.isFinite(Number(input.amountMxn)) ? round2(Number(input.amountMxn)) : 0,
    note: input.note ? String(input.note).slice(0, 500) : null,
  };

  try {
    const { data, error } = await admin.from("credit_batches").insert(row).select("id").limit(1);
    if (error) {
      if (isMissingColumnError(error) || /relation.*credit_batches.*does not exist/i.test(String(error?.message || error || ""))) {
        return { ok: false, error: "La tabla credit_batches aún no existe en Supabase. Aplica la migración primero." };
      }
      return { ok: false, error: String(error?.message || error || "No pude guardar el lote de créditos") };
    }
    const rows = Array.isArray(data) ? data : [];
    const id = Number((rows[0] as any)?.id ?? 0);
    return { ok: true, batchId: id > 0 ? id : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Marca como expirados todos los lotes cuya fecha pasó y aún no están marcados.
 * Retorna la cantidad de lotes marcados. Usado por el job diario (cron).
 */
async function expireOverdueBatches(admin: any): Promise<{ ok: boolean; expired: number; error?: string }> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("credit_batches")
      .update({ is_expired: true })
      .eq("is_expired", false)
      .lte("expires_at", now)
      .select("id");
    if (error) {
      if (isMissingColumnError(error) || /relation.*credit_batches.*does not exist/i.test(String(error?.message || error || ""))) {
        return { ok: true, expired: 0 };
      }
      return { ok: false, expired: 0, error: String(error?.message || error || "No pude expirar lotes") };
    }
    const count = Array.isArray(data) ? data.length : 0;
    return { ok: true, expired: count };
  } catch (e) {
    return { ok: false, expired: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * SISTEMA GRANDE (Pack Inicio / Productor):
 * Elimina (pone en 0) el saldo congelado de perfiles donde pasaron 2 MÁS meses
 * desde que se venció su fecha de créditos. Es decir:
 *   Pagó el día 0 → créditos válidos 60 días → congelados 60 días más → BORRADOS.
 * Total 120 días (≈ 4 meses) desde el último pago aprobado.
 * También pone credits_expires_at = NULL para que no se procese otra vez.
 * Retorna la cantidad de perfiles borrados.
 */
async function wipeOverdueFrozenCredits(admin: any): Promise<{ ok: boolean; wiped: number; error?: string }> {
  try {
    const { data: profiles, error: selectErr } = await admin
      .from("profiles")
      .select("id, credits_expires_at, ramber_credits, zingy_credits, credits, song_balance")
      .not("credits_expires_at", "is", null);
    if (selectErr) return { ok: false, wiped: 0, error: String(selectErr.message || selectErr) };

    const rows = Array.isArray(profiles) ? profiles : [];
    const nowMs = Date.now();
    const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
    const wipeThreshold = nowMs - SIXTY_DAYS_MS; // credits_expires_at tiene que ser ANTES de esto

    let wiped = 0;
    for (const p of rows) {
      const expIso = String((p as any).credits_expires_at || "").trim();
      if (!expIso) continue;
      const expMs = new Date(expIso).getTime();
      if (!Number.isFinite(expMs)) continue;
      if (expMs > wipeThreshold) continue; // aún no cumplen 60 días congelados

      const userId = String((p as any).id || "");
      if (!userId) continue;

      const patch: any = { credits_expires_at: null };
      for (const col of ["ramber_credits", "zingy_credits", "credits"] as const) {
        const current = Number((p as any)[col] ?? 0);
        if (typeof (p as any)[col] === "number" && Number.isFinite(current) && current > 0) {
          patch[col] = 0;
        }
      }
      const sb = Number((p as any).song_balance ?? 0);
      if (typeof (p as any).song_balance === "number" && Number.isFinite(sb) && sb > 0) {
        patch.song_balance = 0;
      }

      try {
        const { error: updErr } = await admin.from("profiles").update(patch).eq("id", userId);
        if (!updErr) wiped++;
      } catch {
      }
    }

    return { ok: true, wiped };
  } catch (e) {
    return { ok: false, wiped: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

const CANONICAL_CREDIT_PACKS = [
  {
    id: 1,
    pack_key: "mini_3",
    name: "Mini",
    songs: 6,
    credits_amount: 36,
    price_mxn: 25,
    validity_days: 30,
    sort_order: 1,
    description: "6 canciones (36 créditos) · pago único",
    is_active: true,
  },
  {
    id: 2,
    pack_key: "chico_10",
    name: "Chico",
    songs: 20,
    credits_amount: 120,
    price_mxn: 70,
    validity_days: 30,
    sort_order: 2,
    description: "20 canciones (120 créditos) · pago único",
    is_active: true,
  },
  {
    id: 3,
    pack_key: "mediano_30",
    name: "Mediano",
    songs: 60,
    credits_amount: 360,
    price_mxn: 180,
    validity_days: 30,
    sort_order: 3,
    description: "60 canciones (360 créditos) · pago único",
    is_active: true,
  },
  {
    id: 4,
    pack_key: "pack_grande_250",
    name: "Grande",
    songs: 100,
    credits_amount: 600,
    price_mxn: 250,
    validity_days: 30,
    sort_order: 4,
    description: "100 canciones (600 créditos) · pago único · Agente Bot 24/7",
    is_active: true,
  },
];

function canonicalCreditPackByKey(packKey: string): any | null {
  const key = String(packKey || "").trim().toLowerCase();
  if (!key) return null;
  return CANONICAL_CREDIT_PACKS.find((p) => String(p.pack_key).toLowerCase() === key) || null;
}

function canonicalCreditPackById(packId: any): any | null {
  const id = Number(packId);
  if (!Number.isFinite(id)) return null;
  return CANONICAL_CREDIT_PACKS.find((p) => p.id === id) || null;
}

/**
 * Lista los paquetes de créditos activos (combina la tabla credit_packs con la fuente canónica local).
 * Si la tabla no existe o tiene huecos, retorna los paquetes canónicos para no romper.
 */
async function listActiveCreditPacks(admin: any): Promise<any[]> {
  let rows: any[] = [];
  try {
    const { data, error } = await admin
      .from("credit_packs")
      .select("id, pack_key, name, songs, credits_amount, price_mxn, validity_days, sort_order, description, is_active")
      .order("sort_order", { ascending: true })
      .order("price_mxn", { ascending: true });
    if (!error) rows = Array.isArray(data) ? data : [];
  } catch {
    rows = [];
  }
  const byKey = new Map<string, any>();
  for (const p of CANONICAL_CREDIT_PACKS) byKey.set(String(p.pack_key).toLowerCase(), { ...p });
  for (const r of rows) {
    const key = String((r as any)?.pack_key || "").toLowerCase();
    if (!key) continue;
    const isActive = (r as any).is_active === false ? false : true;
    const merged: any = {
      id: Number((r as any).id ?? (byKey.get(key)?.id ?? 0)),
      pack_key: String((r as any).pack_key ?? key),
      name: String((r as any).name ?? byKey.get(key)?.name ?? key),
      songs: Number((r as any).songs ?? byKey.get(key)?.songs ?? 0),
      credits_amount: Number((r as any).credits_amount ?? byKey.get(key)?.credits_amount ?? 0),
      price_mxn: Number((r as any).price_mxn ?? byKey.get(key)?.price_mxn ?? 0),
      validity_days: Number((r as any).validity_days ?? byKey.get(key)?.validity_days ?? 30),
      sort_order: Number((r as any).sort_order ?? byKey.get(key)?.sort_order ?? 99),
      description:
        String((r as any).description ?? byKey.get(key)?.description ?? "").trim() ||
        String(byKey.get(key)?.description ?? "").trim(),
      is_active: isActive,
    };
    byKey.set(key, merged);
  }
  const list = Array.from(byKey.values())
    .filter((p: any) => (p as any).is_active !== false && Number((p as any).price_mxn || 0) > 0)
    .sort((a: any, b: any) => {
      const s = Number((a as any).sort_order || 0) - Number((b as any).sort_order || 0);
      if (s !== 0) return s;
      return Number((a as any).price_mxn || 0) - Number((b as any).price_mxn || 0);
    });
  return list;
}

async function buildRealUserIdSet(admin: any) {
  const ids = new Set<string>();
  try {
    const { data: songs } = await admin
      .from("library_items")
      .select("user_id")
      .eq("type", "song")
      .is("deleted_at", null)
      .limit(20000);
    const rows = Array.isArray(songs) ? songs : [];
    for (const r of rows) {
      const uid = String((r as any)?.user_id || "").trim();
      if (uid) ids.add(uid);
    }
  } catch {
  }

  try {
    const { data: tx } = await admin.from("mp_transactions").select("user_id, kind, pack_key, amount_mxn").limit(20000);
    const rows = Array.isArray(tx) ? tx : [];
    for (const r of rows) {
      const uid = String((r as any)?.user_id || "").trim();
      if (!uid) continue;
      const kind = String((r as any)?.kind || "").trim().toLowerCase();
      const pack = String((r as any)?.pack_key || "").trim().toLowerCase();
      const amt = Number((r as any)?.amount_mxn ?? 0) || 0;
      const isPaidSongs = kind === "songs" && amt > 0;
      const isPlan = kind === "songs" && (pack === "inicio" || pack === "productor");
      if (isPaidSongs || isPlan) ids.add(uid);
    }
  } catch {
  }

  return ids;
}

const sunoHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function originFromReq(req: any) {
    const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
    return `${proto}://${host}`;
  }

  function absoluteUrlFromReq(req: any, pathname: string) {
    return new URL(pathname, originFromReq(req)).toString();
  }

  function sunoErrorMessage(data: any, fallback: string) {
    const msg =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      (typeof data?.msg === "string" && data.msg) ||
      fallback;
    const lower = String(msg).toLowerCase();
    const looksLikeCopyright =
      lower.includes('copyright') ||
      lower.includes('copyrighted') ||
      lower.includes('dmca') ||
      lower.includes('rights') ||
      lower.includes('infring');
    if (looksLikeCopyright) {
      return 'Error por Copyright.\n\nEse audio parece ser de una canción protegida. Sube un audio original o usa otro audio.';
    }
    return String(msg);
  }

  function parseCreditsValue(raw: any) {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const cleaned = raw
        .trim()
        .replaceAll("Credits", "")
        .replaceAll("credits", "")
        .replaceAll(" ", "")
        .replaceAll(",", ".");
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  async function sunoFetchJson(path: string, init?: RequestInit) {
    const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
    const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";

    const apiKeyRaw = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
    const apiKey = String(apiKeyRaw || "").trim().replace(/^[`"' ]+/, "").replace(/[`"' ]+$/, "").trim();
    if (!apiKey) throw new Error("Falta SUNO_API_KEY en variables de entorno");

    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (apiKey && !headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);

    const url = new URL(path, base).toString();
    const ctrl = new AbortController();
    const timeoutMs = 45_000;
    const timer = setTimeout(() => ctrl.abort(new Error("SUNO_FETCH_TIMEOUT")), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers, signal: ctrl.signal });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("SUNO_FETCH_TIMEOUT") || msg.toLowerCase().includes("abort")) {
        throw new Error(`El proveedor tardó demasiado en responder (${Math.round(timeoutMs / 1000)}s).`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { res, data, text };
  }

  async function sunoFetchJsonWithRetry(path: string, init?: RequestInit) {
    const maxAttempts = 3;
    let last: any = null;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const r = await sunoFetchJson(path, init);
        last = r;
        const status = Number(r?.res?.status || 0);
        const msg = sunoErrorMessage(r?.data, r?.text || "").toLowerCase();
        const shouldRetry =
          (status >= 500 && status <= 599) ||
          msg.includes("internal error") ||
          msg.includes("try again later") ||
          msg.includes("please try again later");
        if (!shouldRetry) return r;
      } catch (e) {
        last = e;
        const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
        const shouldRetry =
          m.includes("fetch") ||
          m.includes("timeout") ||
          m.includes("econnreset") ||
          m.includes("etimedout") ||
          m.includes("socket") ||
          m.includes("network");
        if (!shouldRetry || i === maxAttempts - 1) throw e;
      }
      const delayMs = 350 * (i + 1) * (i + 1);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
    if (last && typeof last?.res?.status === "number") return last;
    throw last instanceof Error ? last : new Error("No pude contactar al proveedor");
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  function pickQuery(req: any, key: string) {
    try {
      const u = new URL(req.url, "http://localhost");
      return (u.searchParams.get(key) || "").toString();
    } catch {
      return "";
    }
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin, supabaseUrl, supabaseAnon, supabaseService };
  }

  function normalizeModel(mvOrModel: string) {
    const v = (mvOrModel || "").trim().toUpperCase();
    const isV6Mini =
      v === "V4_5ALL" ||
      v === "V4.5ALL" ||
      v === "V45ALL" ||
      v === "V3_5" ||
      v === "V3.5" ||
      v === "V35" ||
      v === "V6_MINI" ||
      v === "V6MINI" ||
      v === "V6-MINI";
    if (isV6Mini) return "V6_MINI";
    if (v === "V6" || v === "V6_WILD" || v === "V6WILD" || v === "V6-WILD") return v === "V6_WILD" || v === "V6WILD" || v === "V6-WILD" ? "V6_WILD" : "V6";
    return "V6";
  }

  function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
  }

  function firstString(obj: any, keys: string[]) {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  async function handleGenerate(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    const style = typeof payload?.style === "string" ? payload.style.trim() : "";
    const instrumental = Boolean(payload?.instrumental);
    const mv = typeof payload?.mv === "string" ? payload.mv.trim() : "";
    const modelRaw = typeof payload?.model === "string" ? payload.model.trim() : "";
    const personaModelHint = typeof payload?.personaModel === "string" ? payload.personaModel.trim() : "";
    let model = normalizeModel(modelRaw || mv);
    const title = typeof payload?.title === "string" ? payload.title.trim() : "";
    if (!prompt) return send(res, 400, { error: "Falta prompt" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");

    const body: any = { model, callBackUrl, instrumental };
    const wantsCustomMode = typeof payload?.customMode === "boolean" ? payload.customMode : null;
    const customMode = wantsCustomMode ?? (Boolean(style) || Boolean(title));
    body.customMode = customMode;

    if (!customMode) {
      if (prompt.length > 500) return send(res, 400, { error: "En modo Simple el prompt máximo es 500 caracteres." });
      body.prompt = prompt.slice(0, 500);
    } else {
      if (!style) return send(res, 400, { error: "En modo Personalizado falta style." });
      if (style.length > 1000) return send(res, 400, { error: "El style máximo es 1,000 caracteres." });
      if (!title) return send(res, 400, { error: "En modo Personalizado falta title." });
      if (title.length > 100) return send(res, 400, { error: "El title máximo es 100 caracteres." });
      if (!instrumental) {
        if (!prompt.trim()) return send(res, 400, { error: "Si no es instrumental, el prompt (letras) es obligatorio." });
        if (prompt.length > 5000) return send(res, 400, { error: "El prompt (letras) máximo es 5,000 caracteres." });
      } else {
        if (prompt.length > 5000) return send(res, 400, { error: "El prompt máximo es 5,000 caracteres." });
      }
      body.prompt = (prompt || " ").slice(0, 5000);
      body.style = (style || "General").slice(0, 1000);
      body.title = title.slice(0, 100);

      const negativeTags = typeof payload?.negativeTags === "string" ? payload.negativeTags.trim() : "";
      if (negativeTags) body.negativeTags = negativeTags.slice(0, 1000);

      const personaId = typeof payload?.personaId === "string" ? payload.personaId.trim() : "";
      if (personaId) {
        body.personaId = personaId.slice(0, 200);
      }

      const personaModel = typeof payload?.personaModel === "string" ? payload.personaModel.trim() : "";
      if (personaModel) body.personaModel = personaModel.slice(0, 200);

      const vocalGender = typeof payload?.vocalGender === "string" ? payload.vocalGender.trim().toLowerCase() : "";
      if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender;

      const styleWeight = Number(payload?.styleWeight);
      if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
      const weirdnessConstraint = Number(payload?.weirdnessConstraint);
      if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
      const audioWeight = Number(payload?.audioWeight);
      if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);
    }

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.generate_music;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/generate", "/api/v1/suno/generate"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJsonWithRetry(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r?.res?.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando música", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando música", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando música", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      const baseTaskRow = { task_id: taskId, user_id: user.id, kind: "generate", cost, consumed: true };
      const withModel = { ...baseTaskRow, requested_model: model };
      const ins1 = await auth.admin.from("suno_tasks").insert(withModel);
      if (ins1?.error && isMissingColumnError(ins1.error)) {
        await auth.admin.from("suno_tasks").insert(baseTaskRow);
      }
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error creando música", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleExtend(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    const style = typeof payload?.style === "string" ? payload.style.trim() : "";
    const mv = typeof payload?.mv === "string" ? payload.mv.trim() : "";
    const modelRaw = typeof payload?.model === "string" ? payload.model.trim() : "";
    const personaModelHint = typeof payload?.personaModel === "string" ? payload.personaModel.trim() : "";
    let model = normalizeModel(modelRaw || mv);
    const title = typeof payload?.title === "string" ? payload.title.trim() : "";
    if (!audioId) return send(res, 400, { error: "Falta audioId" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");

    const defaultParamFlag = Boolean(payload?.defaultParamFlag);
    const body: any = { defaultParamFlag, audioId, model, callBackUrl };
    const wantsCustomMode = typeof payload?.customMode === "boolean" ? payload.customMode : null;
    const customMode = wantsCustomMode ?? (Boolean(style) || Boolean(title));
    body.customMode = customMode;

    if (!customMode) {
      if (prompt.length > 500) return send(res, 400, { error: "En modo Simple el prompt máximo es 500 caracteres." });
      body.prompt = (prompt || " ").slice(0, 500);
    } else {
      if (!style) return send(res, 400, { error: "En modo Personalizado falta style." });
      if (style.length > 1000) return send(res, 400, { error: "El style máximo es 1,000 caracteres." });
      if (!title) return send(res, 400, { error: "En modo Personalizado falta title." });
      if (title.length > 100) return send(res, 400, { error: "El title máximo es 100 caracteres." });
      if (!prompt.trim()) return send(res, 400, { error: "En modo Personalizado falta prompt." });
      if (prompt.length > 5000) return send(res, 400, { error: "El prompt máximo es 5,000 caracteres." });
      body.prompt = (prompt || " ").slice(0, 5000);
      body.style = (style || "General").slice(0, 1000);
      body.title = title.slice(0, 100);

      const negativeTags = typeof payload?.negativeTags === "string" ? payload.negativeTags.trim() : "";
      if (negativeTags) body.negativeTags = negativeTags.slice(0, 1000);

      const personaId = typeof payload?.personaId === "string" ? payload.personaId.trim() : "";
      if (personaId) {
        body.personaId = personaId.slice(0, 200);
      }

      const personaModel = typeof payload?.personaModel === "string" ? payload.personaModel.trim() : "";
      if (personaModel) body.personaModel = personaModel.slice(0, 200);

      const vocalGender = typeof payload?.vocalGender === "string" ? payload.vocalGender.trim().toLowerCase() : "";
      if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender;

      const styleWeight = Number(payload?.styleWeight);
      if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
      const weirdnessConstraint = Number(payload?.weirdnessConstraint);
      if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
      const audioWeight = Number(payload?.audioWeight);
      if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);
    }

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.extend_music;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const { res: r, data, text } = await sunoFetchJson("/api/v1/extend", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error extendiendo música", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error extendiendo música", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      const baseTaskRow = { task_id: taskId, user_id: user.id, kind: "extend", cost, consumed: true };
      const withModel = { ...baseTaskRow, requested_model: model };
      const ins1 = await auth.admin.from("suno_tasks").insert(withModel);
      if (ins1?.error && isMissingColumnError(ins1.error)) {
        await auth.admin.from("suno_tasks").insert(baseTaskRow);
      }
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error extendiendo música", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleUploadCover(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const uploadUrl = firstString(payload, ["uploadUrl", "upload_url"]);
    const uploadPath = firstString(payload, ["uploadPath", "upload_path"]);
    const instrumental = Boolean(payload?.instrumental);
    const prompt = firstString(payload, ["prompt", "lyrics", "text"]) || " ";
    const style = firstString(payload, ["style", "tags", "genre"]) || "General";
    const title = firstString(payload, ["title"]) || "Cover";
    const mv = firstString(payload, ["mv"]);
    const modelRaw = firstString(payload, ["model"]);
    const personaModelHint = firstString(payload, ["personaModel", "persona_model"]);
    let model = normalizeModel(modelRaw || mv);
    if (!uploadUrl && !uploadPath) return send(res, 400, { error: "Falta uploadUrl o uploadPath" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.upload_and_cover;

    try {
      if (!isAdmin) {
        const available = await ensureUserHasCreditsAvailable(auth.admin, user.id, cost);
        if (!available.ok) return send(res, 402, { error: available.error || "Créditos insuficientes. Recarga para continuar." });
      }

      let preparedAudio: any = null;
      try {
        preparedAudio = await prepareCoverUploadUrlForSuno(req, uploadUrl, uploadPath, user.id, title);
      } catch (e) {
        return send(res, 502, {
          error: "No se pudo preparar el audio para el cover.",
          detail: e instanceof Error ? e.message : String(e),
        });
      }

      const body: any = {
        model,
        callBackUrl,
        uploadUrl: String(preparedAudio?.uploadUrl || "").trim(),
        prompt: (prompt || " ").slice(0, 5000),
        title: title.slice(0, 100),
        style: style.slice(0, 1000),
        tags: style.slice(0, 1000),
        instrumental,
        customMode: true,
      };

      const styleWeight = Number(payload?.styleWeight);
      if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
      const weirdnessConstraint = Number(payload?.weirdnessConstraint);
      if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
      const audioWeight = Number(payload?.audioWeight);
      if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);

      const negativeTags = firstString(payload, ["negativeTags", "negative_tags"]);
      if (negativeTags) body.negativeTags = negativeTags.slice(0, 1000);
      const vocalGender = firstString(payload, ["vocalGender", "vocal_gender"]);
      if (vocalGender) body.vocalGender = vocalGender.slice(0, 10);

      const personaId = firstString(payload, ["personaId", "persona_id"]);
      if (personaId) {
        body.personaId = personaId.slice(0, 200);
      }
      const personaModel = personaModelHint;
      if (personaModel) body.personaModel = personaModel.slice(0, 200);

      const paths = [
        "/api/v1/generate/upload-cover",
        "/api/v1/upload-cover",
        "/api/v1/suno/generate/upload-cover",
        "/api/v1/suno/upload-cover",
      ];

      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJsonWithRetry(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "No se pudo hacer el cover.", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "No se pudo hacer el cover.", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "No se pudo hacer el cover.", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      const baseTaskRow = { task_id: taskId, user_id: user.id, kind: "upload-cover", cost, consumed: false };
      const withModel = { ...baseTaskRow, requested_model: model };
      const ins1 = await auth.admin.from("suno_tasks").insert(withModel);
      if (ins1?.error && isMissingColumnError(ins1.error)) {
        await auth.admin.from("suno_tasks").insert(baseTaskRow);
      }
      return send(res, 200, { taskId });
    } catch (e) {
      return send(res, 502, { error: "No se pudo hacer el cover.", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleAddInstrumental(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const uploadUrl = firstString(payload, ["uploadUrl", "upload_url"]);
    const uploadPath = firstString(payload, ["uploadPath", "upload_path"]);
    const title = firstString(payload, ["title"]) || "Instrumental";
    const tags = firstString(payload, ["tags", "style"]) || "Instrumental";
    const negativeTags = firstString(payload, ["negativeTags", "negative_tags"]) || "None";

    const modelRaw = firstString(payload, ["model", "mv"]);
    const model = normalizeModel(modelRaw);

    if (!uploadUrl && !uploadPath) return send(res, 400, { error: "Falta uploadUrl o uploadPath" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body: any = {
      uploadUrl,
      title: title.slice(0, 100),
      tags: tags.slice(0, 1000),
      negativeTags: negativeTags.slice(0, 1000),
      callBackUrl,
      model,
    };

    if (uploadPath) {
      try {
        const signedUrl = await getSignedR2Url(uploadPath, 60 * 60 * 2);
        if (typeof signedUrl === "string" && signedUrl.trim()) body.uploadUrl = signedUrl.trim();
      } catch {
      }
    }

    if (typeof body.uploadUrl === "string" && body.uploadUrl.trim().startsWith("/")) {
      body.uploadUrl = absoluteUrlFromReq(req, body.uploadUrl.trim());
    }

    const vocalGender = firstString(payload, ["vocalGender", "vocal_gender"]).toLowerCase();
    if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender;

    const styleWeight = Number(payload?.styleWeight);
    if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
    const weirdnessConstraint = Number(payload?.weirdnessConstraint);
    if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
    const audioWeight = Number(payload?.audioWeight);
    if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.add_instrumental;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/generate/add-instrumental", "/api/v1/suno/generate/add-instrumental"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJsonWithRetry(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando instrumental", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando instrumental", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando instrumental", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "add-instrumental", cost, consumed: true });
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error agregando instrumental", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleAddVocals(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const uploadUrl = firstString(payload, ["uploadUrl", "upload_url"]);
    const uploadPath = firstString(payload, ["uploadPath", "upload_path"]);
    const prompt = firstString(payload, ["prompt", "lyrics", "text"]) || " ";
    const style = firstString(payload, ["style", "tags"]) || "General";
    const title = firstString(payload, ["title"]) || "Voces";
    const negativeTags = firstString(payload, ["negativeTags", "negative_tags"]) || "None";

    const modelRaw = firstString(payload, ["model", "mv"]);
    const model = normalizeModel(modelRaw);

    if (!uploadUrl && !uploadPath) return send(res, 400, { error: "Falta uploadUrl o uploadPath" });
    if (!prompt.trim()) return send(res, 400, { error: "Falta prompt" });
    if (!style.trim()) return send(res, 400, { error: "Falta style" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body: any = {
      uploadUrl,
      prompt: prompt.slice(0, 5000),
      style: style.slice(0, 1000),
      title: title.slice(0, 100),
      negativeTags: negativeTags.slice(0, 1000),
      callBackUrl,
      model,
    };

    if (uploadPath) {
      try {
        const signedUrl = await getSignedR2Url(uploadPath, 60 * 60 * 2);
        if (typeof signedUrl === "string" && signedUrl.trim()) body.uploadUrl = signedUrl.trim();
      } catch {
      }
    }

    const vocalGender = firstString(payload, ["vocalGender", "vocal_gender"]).toLowerCase();
    if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender;

    const styleWeight = Number(payload?.styleWeight);
    if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
    const weirdnessConstraint = Number(payload?.weirdnessConstraint);
    if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
    const audioWeight = Number(payload?.audioWeight);
    if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.add_vocals;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/generate/add-vocals", "/api/v1/suno/generate/add-vocals"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando voces", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando voces", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando voces", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "add-vocals", cost, consumed: true });
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error agregando voces", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleSeparate(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
    const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
    const type = typeof payload?.type === "string" ? payload.type.trim() : "";
    if (!taskId && !audioId) return send(res, 400, { error: "Falta taskId o audioId" });
    if (!(type === "separate_vocal" || type === "split_stem")) return send(res, 400, { error: "type inválido. Usa 'separate_vocal' o 'split_stem'." });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body = { taskId, audioId, type, callBackUrl };

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = type === "split_stem" ? CREDIT_COSTS.split_stem : CREDIT_COSTS.separate_vocal;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = [
        "/api/v1/vocal-removal/generate",
        "/api/v1/suno/vocal-removal/generate",
        "/api/v1/separate",
        "/api/v1/suno/separate",
      ];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error separando", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error separando", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error separando", code, detail: String(msg).slice(0, 1200) });
      }

      const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!outTaskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: outTaskId, user_id: user.id, kind: `vocal-removal:${type}`, cost, consumed: true });
      return send(res, 200, { taskId: outTaskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error separando", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleGeneratePersona(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
    const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
    const personaName = typeof payload?.name === "string" ? payload.name.trim() : "";
    const description = typeof payload?.description === "string" ? payload.description.trim() : "";
    const style = typeof payload?.style === "string" ? payload.style.trim() : "";
    const vocalStart = Number(payload?.vocalStart);
    const vocalEnd = Number(payload?.vocalEnd);
    if (!taskId || !audioId || !personaName) return send(res, 400, { error: "Falta taskId, audioId o name" });

    try {
      try {
        const enc = encodeURIComponent(taskId);
        const { res: sr, data: sd } = await sunoFetchJson(`/api/v1/generate/record-info?taskId=${enc}`, { method: "GET" });
        if (sr?.ok) {
          const statusRaw = sd?.data?.status ?? sd?.data?.data?.status ?? "";
          const status = String(statusRaw || "").toUpperCase();
          if (status && status !== "SUCCESS") {
            return send(res, 409, { error: "La canción aún no termina. Espera a que esté lista y vuelve a intentar." });
          }
        }
      } catch {
      }

      const body: any = {
        taskId,
        audioId,
        name: personaName.slice(0, 80),
        description: (description || personaName).slice(0, 2000),
      };
      if (style) body.style = style.slice(0, 200);
      if (Number.isFinite(vocalStart) && Number.isFinite(vocalEnd)) {
        const start = Math.max(0, vocalStart);
        const end = Math.max(0, vocalEnd);
        const len = end - start;
        if (len >= 10 && len <= 30) {
          body.vocalStart = start;
          body.vocalEnd = end;
        } else {
          return send(res, 400, { error: "El segmento de voz debe durar entre 10 y 30 segundos." });
        }
      }

      const paths = [
        "/api/v1/generate/generate-persona",
        "/api/v1/suno/generate/generate-persona",
        "/api/v1/generate-persona",
        "/api/v1/suno/generate-persona",
      ];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        return send(res, 502, { error: "Error creando Persona", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        return send(res, 502, { error: "Error creando Persona", code, detail: String(msg).slice(0, 1200) });
      }

      const personaId = typeof data?.data?.personaId === "string" ? data.data.personaId.trim() : "";
      return send(res, 200, {
        ok: true,
        personaId,
        data: data?.data ?? null,
      });
    } catch (e) {
      return send(res, 502, { error: "Error creando Persona", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleMp4(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
    const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
    const author = typeof payload?.author === "string" ? payload.author.trim() : "";
    const domainName = typeof payload?.domainName === "string" ? payload.domainName.trim() : "";
    if (!taskId && !audioId) return send(res, 400, { error: "Falta taskId o audioId" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.music_video;

    try {
      if (!isAdmin) {
        const plan = await getUserPlan(auth.admin, user.id).catch(() => ({ downloads_allowed: false }));
        if (!plan.downloads_allowed) return send(res, 403, { error: "Tu plan no incluye descargas. Compra un plan para poder descargar." });
      }

      let hasProductor = false;
      try {
        const { data: tx } = await auth.admin
          .from("mp_transactions")
          .select("pack_key")
          .eq("user_id", user.id)
          .eq("kind", "songs")
          .limit(200);
        hasProductor = Array.isArray(tx) && tx.some((t: any) => String(t?.pack_key || "").toLowerCase() === "productor");
      } catch {
        hasProductor = false;
      }

      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const body: any = { taskId, audioId, callBackUrl };
      if (author) body.author = author.slice(0, 50);
      if (hasProductor) {
        if (domainName) body.domainName = domainName.slice(0, 50);
      } else {
        body.domainName = "LucIAna | Music";
      }

      const paths = ["/api/v1/mp4/generate", "/api/v1/suno/mp4/generate", "/api/v1/mp4", "/api/v1/suno/mp4"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando video", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando video", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando video", code, detail: String(msg).slice(0, 1200) });
      }

      const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!outTaskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: outTaskId, user_id: user.id, kind: "mp4", cost, consumed: true });
      return send(res, 200, { taskId: outTaskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error creando video", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleTask(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const taskId = (pickQuery(req, "taskId") || "").trim();
    if (!taskId) return send(res, 400, { error: "Falta taskId" });
    const kind = (pickQuery(req, "kind") || "").trim().toLowerCase() || "generate";

    try {
      const enc = encodeURIComponent(taskId);
      const paths =
        kind === "lyrics"
          ? [
              `/api/v1/lyrics/record-info?taskId=${enc}`,
              `/api/v1/suno/lyrics/record-info?taskId=${enc}`,
            ]
          : kind === "midi"
          ? [
              `/api/v1/midi/record-info?taskId=${enc}`,
              `/api/v1/suno/midi/record-info?taskId=${enc}`,
            ]
          : kind === "mp4" || kind === "video" || kind === "music-video"
          ? [
              `/api/v1/mp4/record-info?taskId=${enc}`,
              `/api/v1/suno/mp4/record-info?taskId=${enc}`,
            ]
          : kind === "vocal-removal" || kind === "separate" || kind === "separate_vocal" || kind === "split_stem"
          ? [
              `/api/v1/vocal-removal/record-info?taskId=${enc}`,
              `/api/v1/suno/vocal-removal/record-info?taskId=${enc}`,
            ]
          : kind === "wav"
          ? [
              `/api/v1/wav/record-info?taskId=${enc}`,
              `/api/v1/suno/wav/record-info?taskId=${enc}`,
            ]
          : [
              `/api/v1/generate/record-info?taskId=${enc}`,
              `/api/v1/suno/generate/record-info?taskId=${enc}`,
              `/api/v1/task/${enc}`,
              `/api/v1/suno/task/${enc}`,
            ];

      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "GET" });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) return send(res, 502, { error: "Error consultando task", detail: "No pude contactar al proveedor" });

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        return send(res, 502, { error: "Error consultando task", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        return send(res, 502, { error: "Error consultando task", code, detail: String(msg).slice(0, 1200) });
      }

      const statusRaw = data?.data?.status ?? data?.data?.successFlag ?? data?.data?.data?.status ?? data?.data?.data?.successFlag ?? "";
      const status =
        kind === "midi" || kind === "wav"
          ? (() => {
              const n = typeof statusRaw === "number" ? statusRaw : Number(String(statusRaw || "").trim());
              if (n === 0) return "PENDING";
              if (n === 1) return "SUCCESS";
              if (n === 2) return "CREATE_TASK_FAILED";
              if (n === 3) return kind === "wav" ? "GENERATE_WAV_FAILED" : "GENERATE_MIDI_FAILED";
              return String(statusRaw || "").toUpperCase();
            })()
          : String(statusRaw || "").toUpperCase();
      const user = auth.user;
      const isAdmin = isAdminEmail(user.email);

      if (
        status === "FAILED" ||
        status === "CREATE_TASK_FAILED" ||
        status === "GENERATE_AUDIO_FAILED" ||
        status === "GENERATE_LYRICS_FAILED" ||
        status === "GENERATE_MIDI_FAILED" ||
        status === "GENERATE_MP4_FAILED" ||
        status === "GENERATE_WAV_FAILED" ||
        status === "CALLBACK_EXCEPTION" ||
        status === "SENSITIVE_WORD_ERROR"
      ) {
        if (!isAdmin) {
          const { data: rows } = await auth.admin.from("suno_tasks").select("cost, consumed").eq("task_id", taskId).limit(1);
          const row = Array.isArray(rows) ? rows[0] : null;
          const cost = Number(row?.cost ?? 0);
          const consumed = Boolean(row?.consumed);
          if (consumed && Number.isFinite(cost) && cost > 0) {
            await adjustUserCredits(auth.admin, user.id, cost);
            await auth.admin.from("suno_tasks").update({ consumed: false }).eq("task_id", taskId).eq("user_id", user.id);
          }
        }
      }

      if (status === "SUCCESS" && !isAdmin) {
        const { data: rows } = await auth.admin.from("suno_tasks").select("cost, consumed, kind").eq("task_id", taskId).limit(1);
        const row = Array.isArray(rows) ? rows[0] : null;
        const cost = Number(row?.cost ?? 0);
        const consumed = Boolean(row?.consumed);
        const taskKind = String(row?.kind || "").trim().toLowerCase();
        if (taskKind === "upload-cover" && !consumed && Number.isFinite(cost) && cost > 0) {
          const charged = await consumeUserCredits(auth.admin, user.id, cost);
          if (charged.ok) {
            await auth.admin.from("suno_tasks").update({ consumed: true }).eq("task_id", taskId).eq("user_id", user.id);
          }
        }
      }

      return send(res, 200, { data, kind });
    } catch (e) {
      return send(res, 502, { error: "Error consultando task", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleTimestampedLyrics(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
    const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
    if (!taskId && !audioId) return send(res, 400, { error: "Falta taskId o audioId" });

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.timestamped_lyrics;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = [
        "/api/v1/generate/get-timestamped-lyrics",
        "/api/v1/suno/generate/get-timestamped-lyrics",
        "/api/v1/get-timestamped-lyrics",
        "/api/v1/suno/get-timestamped-lyrics",
        "/api/v1/timestamped-lyrics",
        "/api/v1/suno/timestamped-lyrics",
      ];

      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify({ taskId, audioId }) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando letras", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando letras", code, detail: String(msg).slice(0, 1200) });
      }

      return send(res, 200, { ok: true, data: data?.data ?? null });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error creando letras", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleLyrics(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    if (!prompt) return send(res, 400, { error: "Falta prompt" });
    if (prompt.length > 200) return send(res, 400, { error: "El prompt máximo para letras es 200 caracteres." });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body = { prompt, callBackUrl };

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.lyrics;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/lyrics", "/api/v1/suno/lyrics"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando letra", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando letra", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando letra", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "lyrics", cost, consumed: true });
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error generando letra", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleWav(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = firstString(payload, ["taskId", "task_id"]);
    const audioId = firstString(payload, ["audioId", "audio_id"]);
    if (!taskId) return send(res, 400, { error: "Falta taskId" });
    if (!audioId) return send(res, 400, { error: "Falta audioId" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body = { taskId, audioId, callBackUrl };

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.wav;

    try {
      // #region debug-point D:handle-wav-start
      // #endregion
      if (!isAdmin) {
        const plan = await getUserPlan(auth.admin, user.id).catch(() => ({ downloads_allowed: false }));
        if (!plan.downloads_allowed) return send(res, 403, { error: "Tu plan no incluye descargas. Compra un plan para poder descargar." });
      }

      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/wav/generate", "/api/v1/suno/wav/generate"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      // #region debug-point D:handle-wav-provider
      // #endregion
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error convirtiendo a WAV", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error convirtiendo a WAV", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";

      if (code !== 200 && code !== 409) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error convirtiendo a WAV", code, detail: String(msg).slice(0, 1200) });
      }

      if (!outTaskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({
        task_id: outTaskId,
        user_id: user.id,
        kind: `wav:${taskId.slice(0, 120)}:${audioId.slice(0, 120)}`,
        cost,
        consumed: true,
      });
      return send(res, 200, { taskId: outTaskId, already: code === 409 });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error convirtiendo a WAV", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleMidi(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = firstString(payload, ["taskId", "task_id"]);
    const audioId = firstString(payload, ["audioId", "audio_id"]);
    if (!taskId) return send(res, 400, { error: "Falta taskId" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body: any = { taskId, callBackUrl };
    if (audioId) body.audioId = audioId;

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.midi;

    try {
      if (!isAdmin) {
        const plan = await getUserPlan(auth.admin, user.id).catch(() => ({ downloads_allowed: false }));
        if (!plan.downloads_allowed) return send(res, 403, { error: "Tu plan no incluye descargas. Compra un plan para poder descargar." });
      }

      if (!isAdmin && cost > 0) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/midi/generate", "/api/v1/suno/midi/generate"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin && cost > 0) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando MIDI", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin && cost > 0) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando MIDI", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin && cost > 0) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando MIDI", code, detail: String(msg).slice(0, 1200) });
      }

      const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!outTaskId) {
        if (!isAdmin && cost > 0) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({
        task_id: outTaskId,
        user_id: user.id,
        kind: `midi:${taskId.slice(0, 120)}:${audioId ? audioId.slice(0, 120) : ""}`,
        cost,
        consumed: cost > 0,
      });

      return send(res, 200, { taskId: outTaskId });
    } catch (e) {
      if (!isAdmin && cost > 0) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error generando MIDI", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleBoostStyle(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const content = typeof payload?.content === "string" ? payload.content.trim() : "";
    if (!content) return send(res, 400, { error: "Falta content" });
    if (content.length > 5000) return send(res, 400, { error: "El content máximo es 5,000 caracteres." });

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.boost_style;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/style/generate", "/api/v1/suno/style/generate"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify({ content }) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error optimizando estilo", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error optimizando estilo", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error optimizando estilo", code, detail: String(msg).slice(0, 1200) });
      }

      const result = typeof data?.data?.result === "string" ? data.data.result.trim() : "";
      return send(res, 200, { result, data: data?.data ?? null });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error optimizando estilo", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleMusicCover(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
    if (!taskId) return send(res, 400, { error: "Falta taskId" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body = { taskId, callBackUrl };

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.music_cover;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/suno/cover/generate", "/api/v1/cover/generate", "/api/v1/suno/cover-suno", "/api/v1/suno/cover"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando portada", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando portada", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (code === 200) {
        if (!outTaskId) return send(res, 502, { error: "Respuesta inválida del proveedor" });
        await auth.admin.from("suno_tasks").insert({ task_id: outTaskId, user_id: user.id, kind: `music-cover:${taskId.slice(0, 120)}`, cost, consumed: true });
        return send(res, 200, { taskId: outTaskId });
      }

      if (code === 400 && outTaskId) {
        await auth.admin
          .from("suno_tasks")
          .insert({ task_id: outTaskId, user_id: user.id, kind: `music-cover:${taskId.slice(0, 120)}`, cost, consumed: true });
        return send(res, 200, { taskId: outTaskId, already: true });
      }

      const msg = sunoErrorMessage(data, "Error del proveedor");
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error generando portada", code, detail: String(msg).slice(0, 1200) });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error generando portada", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleCredits(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    try {
      const paths = [
        "/api/v1/generate/credit",
        "/api/v1/get-credits",
        "/api/v1/suno/get-credits",
        "/api/v1/suno/generate/credit",
        "/api/v1/suno/credits",
        "/api/v1/suno/credit",
      ];

      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "GET" });
        last = r;
        if (r.res.status !== 404) break;
      }
      const r = last;

      if (!r?.res?.ok) {
        const msg = sunoErrorMessage(r?.data, r?.text || `HTTP ${r?.res?.status || 0}`);
        return send(res, 502, { error: "Error consultando créditos", code: r?.res?.status || 0, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(r.data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(r.data, "Error del proveedor");
        return send(res, 502, { error: "Error consultando créditos", code, detail: String(msg).slice(0, 1200) });
      }

      const raw = r.data?.data?.credits ?? r.data?.data;
      const parsed = parseCreditsValue(raw);
      const credits = Number.isFinite(parsed) ? parsed : 0;
      return send(res, 200, { credits, data: credits });
    } catch (e) {
      return send(res, 502, { error: "Error consultando créditos", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleVoiceValidate(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    function cleanExternalUrl(raw: any) {
      return (raw || "")
        .toString()
        .trim()
        .replaceAll("`", "")
        .replace(/^[\"' ]+/, "")
        .replace(/[\"' ]+$/, "")
        .trim();
    }

    const voiceUrlRaw = firstString(payload, ["voiceUrl", "voice_url", "uploadUrl", "upload_url"]);
    const voiceUrl = cleanExternalUrl(voiceUrlRaw);
    const vocalStartSRaw = Number(payload?.vocalStartS ?? payload?.vocal_start_s ?? payload?.vocalStart ?? payload?.vocal_start);
    const vocalEndSRaw = Number(payload?.vocalEndS ?? payload?.vocal_end_s ?? payload?.vocalEnd ?? payload?.vocal_end);
    const language = firstString(payload, ["language"]) || "es";
    const callBackUrl = firstString(payload, ["callBackUrl", "call_back_url"]) || absoluteUrlFromReq(req, "/api/webhooks/suno");

    if (!voiceUrl) return send(res, 400, { error: "Falta voiceUrl" });
    if (!Number.isFinite(vocalStartSRaw) || !Number.isFinite(vocalEndSRaw)) {
      return send(res, 400, { error: "vocalStartS y vocalEndS deben ser números (segundos)" });
    }

    const vocalStartS = Math.max(0, Math.floor(vocalStartSRaw));
    const vocalEndS = Math.max(0, Math.floor(vocalEndSRaw));
    if (vocalEndS <= vocalStartS) return send(res, 400, { error: "vocalEndS debe ser mayor que vocalStartS" });

    const clientAttemptId = firstString(payload, ["clientAttemptId", "client_attempt_id"]);
    const cleanAttemptId = (clientAttemptId || "").toString().trim().slice(0, 140);
    const fingerprint = `${voiceUrl}|${vocalStartS}|${vocalEndS}|${language}`;
    const idemKey = cleanAttemptId ? `${auth.user.id}|${cleanAttemptId}` : "";

    if (cleanAttemptId) {
      try {
        const existing = await auth.admin
          .from("suno_tasks")
          .select("task_id")
          .eq("user_id", auth.user.id)
          .eq("kind", "voice-validate")
          .eq("client_attempt_id", cleanAttemptId)
          .limit(1);
        const rowTaskId = String(existing?.data?.[0]?.task_id || "").trim();
        if (!existing?.error && rowTaskId) return send(res, 200, { taskId: rowTaskId });
      } catch {
      }
    }

    if (idemKey) {
      const now = Date.now();
      cleanupVoiceValidateIdempotencyCache(now);
      const existing = voiceValidateIdempotencyCache.get(idemKey);
      if (existing && existing.expiresAt && existing.expiresAt > now) {
        if (existing.fingerprint && existing.fingerprint !== fingerprint) {
          return send(res, 409, { error: "Ese intento ya fue usado para otra validación. Genera una frase nueva e inténtalo otra vez." });
        }
        if (existing.taskId) {
          return send(res, 200, { taskId: String(existing.taskId || "").trim() });
        }
        if (existing.promise) {
          try {
            const awaited = await existing.promise;
            const existingTaskId = String(awaited || "").trim();
            if (existingTaskId) return send(res, 200, { taskId: existingTaskId });
          } catch {
          }
        }
      }

      let resolveFn = null;
      let rejectFn = null;
      const promise = new Promise((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
      });
      voiceValidateIdempotencyCache.set(idemKey, {
        expiresAt: now + VOICE_VALIDATE_IDEMPOTENCY_TTL_MS,
        fingerprint,
        taskId: "",
        promise,
        resolveFn,
        rejectFn,
      });
    }

    try {
      // Si Suno falla descargando URLs externas (aun siendo accesibles), subimos el archivo a su
      // servicio temporal (File Upload API) y usamos ese downloadUrl.
      let voiceUrlForSuno = voiceUrl;
      try {
        const base = "https://sunoapiorg.redpandaai.co";
        const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
        if (apiKey) {
          const u = new URL("/api/file-url-upload", base).toString();
          const up = await fetch(u, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              fileUrl: voiceUrl,
              uploadPath: "ramber-voice",
              fileName: `voice_${Date.now()}.mp3`,
            }),
          });
          const upText = await up.text().catch(() => "");
          let upData: any = null;
          try {
            upData = upText ? JSON.parse(upText) : null;
          } catch {
            upData = null;
          }
          const downloadUrl = cleanExternalUrl(upData?.data?.downloadUrl);
          if (up.ok && upData?.success && upData?.code === 200 && downloadUrl) {
            voiceUrlForSuno = downloadUrl;
          }
        }
      } catch {
      }

      const body: any = {
        voiceUrl: voiceUrlForSuno,
        voice_url: voiceUrlForSuno,
        uploadUrl: voiceUrlForSuno,
        vocalStartS,
        vocal_start_s: vocalStartS,
        vocalEndS,
        vocal_end_s: vocalEndS,
        language,
        callBackUrl,
        call_back_url: callBackUrl,
        calBackUrl: callBackUrl,
        cal_back_url: callBackUrl,
      };
      const { res: r, data, text } = await sunoFetchJson("/api/v1/voice/validate", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        return send(res, 502, {
          error: "Error iniciando validación de voz",
          code: r.status,
          detail: {
            msg: String(msg).slice(0, 1200),
            attemptedUrl: voiceUrlForSuno,
          },
        });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        return send(res, 502, {
          error: "Error iniciando validación de voz",
          code,
          detail: {
            msg: String(msg).slice(0, 1200),
            attemptedUrl: voiceUrlForSuno,
          },
        });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) return send(res, 502, { error: "Respuesta inválida del proveedor" });

      try {
        const row = {
          task_id: taskId,
          user_id: auth.user.id,
          kind: "voice-validate",
          cost: 0,
          consumed: false,
          client_attempt_id: cleanAttemptId || null,
        };
        const ins1 = await auth.admin.from("suno_tasks").insert(row);
        if (ins1?.error) {
          if (isMissingColumnError(ins1.error)) {
            await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: auth.user.id, kind: "voice-validate", cost: 0, consumed: false });
          } else if (String(ins1.error.code || "") === "23505" && cleanAttemptId) {
            const existing = await auth.admin
              .from("suno_tasks")
              .select("task_id")
              .eq("user_id", auth.user.id)
              .eq("kind", "voice-validate")
              .eq("client_attempt_id", cleanAttemptId)
              .limit(1);
            const existingTaskId = String(existing?.data?.[0]?.task_id || "").trim();
            if (existingTaskId) return send(res, 200, { taskId: existingTaskId });
          }
        }
      } catch {
      }

      if (idemKey) {
        const row = voiceValidateIdempotencyCache.get(idemKey);
        if (row && row.fingerprint === fingerprint) {
          row.taskId = taskId;
          if (row.resolveFn) {
            try {
              row.resolveFn(taskId);
            } catch {
            }
          }
          voiceValidateIdempotencyCache.set(idemKey, row);
        }
      }
      return send(res, 200, { taskId });
    } catch (e) {
      if (idemKey) {
        const row = voiceValidateIdempotencyCache.get(idemKey);
        if (row && row.fingerprint === fingerprint) {
          if (row.rejectFn) {
            try {
              row.rejectFn(e instanceof Error ? e.message : String(e));
            } catch {
            }
          }
          voiceValidateIdempotencyCache.delete(idemKey);
        }
      }
      return send(res, 502, { error: "Error iniciando validación de voz", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleVoiceValidateInfo(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const taskId = (pickQuery(req, "taskId") || pickQuery(req, "task_id") || "").toString().trim();
    if (!taskId) return send(res, 400, { error: "Falta taskId" });

    try {
      const enc = encodeURIComponent(taskId);
      const { res: r, data, text } = await sunoFetchJson(`/api/v1/voice/validate-info?taskId=${enc}`, { method: "GET" });

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        return send(res, 502, { error: "Error consultando validación de voz", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        return send(res, 502, { error: "Error consultando validación de voz", code, detail: String(msg).slice(0, 1200) });
      }

      const d = data?.data ?? {};
      const out = {
        ok: true,
        taskId: String(d?.taskId || taskId).trim() || taskId,
        validateInfo: typeof d?.validateInfo === "string" ? d.validateInfo : "",
        status: typeof d?.status === "string" ? d.status : "",
        errorCode: Number.isFinite(Number(d?.errorCode)) ? Number(d.errorCode) : null,
        errorMessage: typeof d?.errorMessage === "string" ? d.errorMessage : "",
        data: d,
      };
      return send(res, 200, out);
    } catch (e) {
      return send(res, 502, { error: "Error consultando validación de voz", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleVoiceRegenerate(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = firstString(payload, ["taskId", "task_id"]);
    const calBackUrl =
      firstString(payload, ["calBackUrl", "cal_back_url", "callBackUrl", "call_back_url"]) || absoluteUrlFromReq(req, "/api/webhooks/suno");

    if (!taskId) return send(res, 400, { error: "Falta taskId" });

    try {
      const body: any = { taskId, calBackUrl };
      const { res: r, data, text } = await sunoFetchJson("/api/v1/voice/regenerate", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        return send(res, 502, { error: "Error regenerando frase de validación", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        return send(res, 502, { error: "Error regenerando frase de validación", code, detail: String(msg).slice(0, 1200) });
      }

      const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!outTaskId) return send(res, 502, { error: "Respuesta inválida del proveedor" });

      try {
        await auth.admin.from("suno_tasks").insert({ task_id: outTaskId, user_id: auth.user.id, kind: "voice-regenerate", cost: 0, consumed: false });
      } catch {
      }

      return send(res, 200, { taskId: outTaskId });
    } catch (e) {
      return send(res, 502, { error: "Error regenerando frase de validación", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleVoiceGenerate(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const validationTaskId = firstString(payload, ["taskId", "task_id"]);
    const verifyUrl = firstString(payload, ["verifyUrl", "verify_url"]);
    const voiceName = firstString(payload, ["voiceName", "voice_name"]);
    const description = firstString(payload, ["description"]);
    const style = firstString(payload, ["style"]);
    const singerSkillLevel = firstString(payload, ["singerSkillLevel", "singer_skill_level"]);
    const callBackUrl = firstString(payload, ["callBackUrl", "call_back_url"]) || absoluteUrlFromReq(req, "/api/webhooks/suno");

    if (!validationTaskId) return send(res, 400, { error: "Falta taskId" });
    if (!verifyUrl) return send(res, 400, { error: "Falta verifyUrl" });

    try {
      const body: any = {
        taskId: validationTaskId,
        verifyUrl,
        callBackUrl,
      };
      if (voiceName) body.voiceName = voiceName.slice(0, 120);
      if (description) body.description = description.slice(0, 2000);
      if (style) body.style = style.slice(0, 1000);
      if (singerSkillLevel) body.singerSkillLevel = singerSkillLevel.slice(0, 40);

      const { res: r, data, text } = await sunoFetchJson("/api/v1/voice/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        return send(res, 502, { error: "Error creando voz personalizada", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        return send(res, 502, { error: "Error creando voz personalizada", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) return send(res, 502, { error: "Respuesta inválida del proveedor" });

      try {
        await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: auth.user.id, kind: "voice-generate", cost: 0, consumed: false });
      } catch {
      }

      return send(res, 200, { taskId });
    } catch (e) {
      return send(res, 502, { error: "Error creando voz personalizada", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleVoiceRecordInfo(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const taskId = (pickQuery(req, "taskId") || pickQuery(req, "task_id") || "").toString().trim();
    if (!taskId) return send(res, 400, { error: "Falta taskId" });

    try {
      const enc = encodeURIComponent(taskId);
      const { res: r, data, text } = await sunoFetchJson(`/api/v1/voice/record-info?taskId=${enc}`, { method: "GET" });

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        return send(res, 502, { error: "Error consultando estado de voz", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        return send(res, 502, { error: "Error consultando estado de voz", code, detail: String(msg).slice(0, 1200) });
      }

      const d = data?.data ?? {};
      return send(res, 200, {
        ok: true,
        taskId: String(d?.taskId || taskId).trim() || taskId,
        voiceId: typeof d?.voiceId === "string" ? d.voiceId : "",
        status: typeof d?.status === "string" ? d.status : "",
        errorCode: Number.isFinite(Number(d?.errorCode)) ? Number(d.errorCode) : null,
        errorMessage: typeof d?.errorMessage === "string" ? d.errorMessage : "",
        data: d,
      });
    } catch (e) {
      return send(res, 502, { error: "Error consultando estado de voz", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleVoiceCheckVoice(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = firstString(payload, ["task_id", "taskId"]);
    if (!taskId) return send(res, 400, { error: "Falta task_id" });

    try {
      const body: any = { task_id: taskId };
      const { res: r, data, text } = await sunoFetchJson("/api/v1/voice/check-voice", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        return send(res, 502, { error: "Error consultando disponibilidad de voz", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        return send(res, 502, { error: "Error consultando disponibilidad de voz", code, detail: String(msg).slice(0, 1200) });
      }

      const d = data?.data ?? {};
      const isAvailable = Boolean(d?.isAvailable);
      return send(res, 200, { ok: true, taskId, isAvailable, data: d });
    } catch (e) {
      return send(res, 502, { error: "Error consultando disponibilidad de voz", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleCloneVoice(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const uploadUrl = firstString(payload, ["uploadUrl", "upload_url"]);
    const uploadPath = firstString(payload, ["uploadPath", "upload_path"]);
    const voiceName = firstString(payload, ["voiceName", "voice_name"]) || "Mi Voz";
    const description = firstString(payload, ["description"]) || "Voz clonada desde LucIAna | Music";
    const profileImageUrl = firstString(payload, ["profileImageUrl", "profile_image_url"]);
    const voiceProfileName = firstString(payload, ["voiceProfileName", "voice_profile_name"]) || voiceName;
    const category = firstString(payload, ["category"]) || "personal";
    const language = firstString(payload, ["language"]) || "es";
    const gender = firstString(payload, ["gender"]) || "unknown";
    const tags = Array.isArray(payload?.tags) ? payload.tags.filter((t: any) => typeof t === "string" && t.trim()) : [];
    const isPublic = typeof payload?.isPublic === "boolean" ? payload.isPublic : false;

    if (!uploadUrl && !uploadPath) return send(res, 400, { error: "Falta uploadUrl o uploadPath" });

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = 0;

    try {
      let finalUploadUrl = uploadUrl;
      if (uploadPath) {
        try {
          finalUploadUrl = await getSignedR2Url(uploadPath, 60 * 60 * 2);
        } catch (e) {
          return send(res, 502, { error: "Error generando URL firmada para el audio", detail: e instanceof Error ? e.message : String(e) });
        }
      }

      // Descargar el audio para preparar el dataset
      console.log(`Descargando audio desde: ${finalUploadUrl}`);
      const audioResponse = await fetch(finalUploadUrl);
      if (!audioResponse.ok) {
        return send(res, 502, { 
          error: "Error descargando el audio", 
          detail: `HTTP ${audioResponse.status}: ${await audioResponse.text().catch(() => '')}` 
        });
      }
      
      const audioBuffer = await audioResponse.arrayBuffer();
      console.log(`Audio descargado: ${audioBuffer.byteLength} bytes`);
      
      // Verificar que el audio sea válido
      if (audioBuffer.byteLength === 0) {
        return send(res, 400, { error: "El archivo de audio está vacío" });
      }
      
      if (audioBuffer.byteLength > 50 * 1024 * 1024) { // 50 MB límite
        return send(res, 413, { error: "El archivo de audio es demasiado grande (máximo 50 MB)" });
      }

      const head = Buffer.from(audioBuffer.slice(0, 12));
      const isWav = head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WAVE";
      if (!isWav) {
        return send(res, 400, {
          error: "El audio debe ser WAV",
          detail: "Sube un WAV (o vuelve a subir el audio para que la app lo convierta a WAV automáticamente).",
        });
      }

      // Crear un archivo ZIP que contenga el dataset en la estructura que espera Replicate
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const sanitizeRvcName = (s: string) =>
        (s || "")
          .toString()
          .replace(/[\\/:*?"<>|]+/g, "_")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60);
      const rvcName = sanitizeRvcName(voiceProfileName || voiceName || "voz") || "voz";
      const wavBuf = Buffer.from(audioBuffer);
      const splitWavs = (() => {
        try {
          if (wavBuf.length < 44) return [wavBuf];
          const riff = wavBuf.subarray(0, 4).toString("ascii");
          const wave = wavBuf.subarray(8, 12).toString("ascii");
          if (riff !== "RIFF" || wave !== "WAVE") return [wavBuf];

          let fmtOffset = -1;
          let fmtSize = 0;
          let dataOffset = -1;
          let dataSize = 0;
          let off = 12;
          while (off + 8 <= wavBuf.length) {
            const id = wavBuf.subarray(off, off + 4).toString("ascii");
            const size = wavBuf.readUInt32LE(off + 4);
            const start = off + 8;
            if (id === "fmt ") {
              fmtOffset = start;
              fmtSize = size;
            } else if (id === "data") {
              dataOffset = start;
              dataSize = size;
            }
            const padded = size + (size % 2);
            off = start + padded;
            if (off > wavBuf.length) break;
          }

          if (fmtOffset < 0 || dataOffset < 0) return [wavBuf];
          if (fmtSize < 16) return [wavBuf];

          const audioFormat = wavBuf.readUInt16LE(fmtOffset + 0);
          const numChannels = wavBuf.readUInt16LE(fmtOffset + 2);
          const sampleRate = wavBuf.readUInt32LE(fmtOffset + 4);
          const bitsPerSample = wavBuf.readUInt16LE(fmtOffset + 14);
          if (audioFormat !== 1) return [wavBuf];
          if (bitsPerSample !== 16) return [wavBuf];
          if (!Number.isFinite(sampleRate) || sampleRate <= 0) return [wavBuf];
          if (!Number.isFinite(numChannels) || numChannels <= 0) return [wavBuf];

          const blockAlign = numChannels * 2;
          const byteRate = sampleRate * blockAlign;
          const safeDataSize = Math.max(0, Math.min(dataSize, wavBuf.length - dataOffset));
          if (safeDataSize <= 0) return [wavBuf];

          const makeWav = (pcm: Buffer) => {
            const out = Buffer.alloc(44 + pcm.length);
            out.write("RIFF", 0, "ascii");
            out.writeUInt32LE(36 + pcm.length, 4);
            out.write("WAVE", 8, "ascii");
            out.write("fmt ", 12, "ascii");
            out.writeUInt32LE(16, 16);
            out.writeUInt16LE(1, 20);
            out.writeUInt16LE(numChannels, 22);
            out.writeUInt32LE(sampleRate, 24);
            out.writeUInt32LE(byteRate, 28);
            out.writeUInt16LE(blockAlign, 32);
            out.writeUInt16LE(bitsPerSample, 34);
            out.write("data", 36, "ascii");
            out.writeUInt32LE(pcm.length, 40);
            pcm.copy(out, 44);
            return out;
          };

          const targetSeconds = 12;
          const minSeconds = 2;
          const maxChunks = 60;
          const rawChunkBytes = Math.floor(byteRate * targetSeconds);
          const chunkBytes = Math.max(blockAlign, rawChunkBytes - (rawChunkBytes % blockAlign));

          const outChunks: Buffer[] = [];
          let cursor = 0;
          while (cursor < safeDataSize && outChunks.length < maxChunks) {
            let len = Math.min(chunkBytes, safeDataSize - cursor);
            len = len - (len % blockAlign);
            if (len <= 0) break;
            const seconds = len / byteRate;
            if (seconds < minSeconds && outChunks.length > 0) break;
            const pcm = wavBuf.subarray(dataOffset + cursor, dataOffset + cursor + len);
            outChunks.push(makeWav(Buffer.from(pcm)));
            cursor += len;
          }
          return outChunks.length > 0 ? outChunks : [wavBuf];
        } catch {
          return [wavBuf];
        }
      })();

      for (let i = 0; i < splitWavs.length; i++) {
        zip.file(`dataset/${rvcName}/split_${i}.wav`, splitWavs[i]);
      }
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
      
      // Subir el archivo ZIP a R2
      const timestamp = Date.now();
      const rvcDatasetKey = `rvc_datasets/${user.id}/${timestamp}_dataset.zip`;
      
      console.log(`Subiendo archivo ZIP a R2: ${rvcDatasetKey}, tamaño: ${zipBuffer.length} bytes`);
      const env = getR2Env();
      const client = await getR2Client();
      const { PutObjectCommand } = await getR2AwsSdk();
      const putCommand = new PutObjectCommand({
        Bucket: env.bucketName,
        Key: rvcDatasetKey,
        Body: zipBuffer,
        ContentType: 'application/zip',
      });
      
      await client.send(putCommand);
      console.log(`Archivo ZIP subido a R2 exitosamente`);
      
      // Generar URL firmada para el dataset ZIP
      const datasetUrl = await getSignedR2Url(rvcDatasetKey, 60 * 60 * 24); // 24 horas
      console.log(`URL del dataset ZIP generada: ${datasetUrl}`);

      // Configurar la solicitud a Replicate API
      const replicateToken = process.env.REPLICATE_API_TOKEN;
      if (!replicateToken) {
        return send(res, 500, { error: "Replicate API token no configurado", detail: "Contacta al administrador del sistema" });
      }

      const replicateModel = process.env.REPLICATE_RVC_MODEL || 'replicate/train-rvc-model';
      const getLatestReplicateVersionId = async (modelSlug: string): Promise<string | null> => {
        try {
          const infoRes = await fetch(`https://api.replicate.com/v1/models/${modelSlug}`, {
            method: "GET",
            headers: { Authorization: `Token ${replicateToken}` },
          });
          if (!infoRes.ok) return null;
          const info = await infoRes.json().catch(() => null);
          const id = String(info?.latest_version?.id || "").trim();
          return id || null;
        } catch {
          return null;
        }
      };

      let replicateVersion = String(process.env.REPLICATE_RVC_VERSION || "").trim();
      if (!replicateVersion) {
        const latest = await getLatestReplicateVersionId(replicateModel);
        if (latest) replicateVersion = latest;
      }
      if (!replicateVersion) {
        replicateVersion = "0397d5e28c9b54665e1e5d29d5cf4f722a7b89ec20e9dbf31487235305b1a101";
      }

      // Parámetros para entrenamiento RVC
      const replicateInput = {
        dataset_zip: datasetUrl,
        sample_rate: "48k",
        version: "v2",
        f0method: "rmvpe_gpu",
        epoch: 80,
        batch_size: "7"
      };

      // Llamar a Replicate API
      console.log(`Llamando a Replicate API con modelo: ${replicateModel}, versión: ${replicateVersion}`);
      console.log(`Dataset URL: ${datasetUrl}`);
      console.log(`Replicate Input:`, JSON.stringify(replicateInput, null, 2));
      
      const callReplicate = async (versionId: string) => {
        const r = await fetch(`https://api.replicate.com/v1/models/${replicateModel}/versions/${versionId}/predictions`, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${replicateToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: replicateInput,
            webhook: absoluteUrlFromReq(req, "/api/webhooks/replicate")
          }),
        });
        const data = await r.json().catch(() => ({}));
        return { r, data };
      };

      let { r: replicateResponse, data: replicateData } = await callReplicate(replicateVersion);

      if (!replicateResponse.ok && replicateResponse.status === 422) {
        const d = String(replicateData?.detail || "").toLowerCase();
        const looksDisabled = d.includes("has been disabled") || d.includes("disabled") || d.includes("consistently fails");
        if (looksDisabled) {
          const latest = await getLatestReplicateVersionId(replicateModel);
          if (latest && latest !== replicateVersion) {
            console.log(`Versión deshabilitada en Replicate (${replicateVersion}). Reintentando con latest_version (${latest})`);
            replicateVersion = latest;
            const retry = await callReplicate(replicateVersion);
            replicateResponse = retry.r;
            replicateData = retry.data;
          }
        }
      }

      console.log(`Respuesta de Replicate:`, JSON.stringify(replicateData, null, 2));

      if (!replicateResponse.ok) {
        let errorMessage = "Error entrenando modelo RVC";
        let errorDetail = replicateData?.detail || `HTTP ${replicateResponse.status}`;
        
        if (replicateResponse.status === 401 || replicateResponse.status === 403) {
          errorMessage = "Error de autenticación con Replicate API";
          errorDetail = "El token de API no es válido o ha expirado";
        } else if (replicateResponse.status === 422) {
          errorMessage = "Datos de solicitud inválidos";
          const d = String(replicateData?.detail || "").trim();
          const lower = d.toLowerCase();
          if (lower.includes("has been disabled") || lower.includes("consistently fails") || lower.includes("disabled")) {
            errorDetail =
              "Replicate deshabilitó esa versión del modelo. " +
              "Solución: actualiza REPLICATE_RVC_VERSION en el servidor (Vercel → Settings → Environment Variables) o déjalo vacío para usar la última versión automáticamente.";
          } else {
            errorDetail = d || "El archivo de audio no cumple con los requisitos para RVC";
          }
          console.log(`Error 422 de Replicate: ${errorDetail}`);
        } else if (replicateResponse.status === 429) {
          errorMessage = "Límite de solicitudes excedido";
          errorDetail = "Has realizado demasiadas solicitudes a Replicate API. Intenta de nuevo en unos minutos";
        }
        
        const combined =
          errorDetail && String(errorDetail || "").trim()
            ? `${errorMessage}\n\n${String(errorDetail || "").trim()}`
            : errorMessage;
        return send(res, 502, { error: combined, detail: errorDetail, status: replicateResponse.status });
      }

      const predictionId = replicateData?.id;
      if (!predictionId) {
        return send(res, 502, { error: "Respuesta inválida de Replicate API" });
      }
      console.log(`Prediction ID obtenido: ${predictionId}`);

      // Guardar en la base de datos
      const sampleUrlToSave = (uploadUrl || "").toString().trim() || (finalUploadUrl || "").toString().trim() || null;
      const fullRow: any = {
        voice_id: predictionId,
        user_id: user.id,
        voice_name: voiceName,
        description: description,
        cost,
        created_at: new Date().toISOString(),
        status: 'processing',
        provider: 'replicate',
        replicate_id: predictionId,
        dataset_url: datasetUrl,
        model_name: replicateModel,
        sample_url: sampleUrlToSave,
        profile_image_url: profileImageUrl || null,
        voice_profile_name: voiceProfileName,
        category: category,
        language: language,
        gender: gender,
        tags: tags.length > 0 ? tags : null,
        is_public: isPublic,
      };

      const tryInsertWithFallback = async () => {
        let row: any = { ...fullRow };
        let lastErr: any = null;
        for (let i = 0; i < 8; i++) {
          const ins = await auth.admin.from("kits_voices").insert(row);
          if (!ins.error) return { ok: true as const };
          lastErr = ins.error;
          const msg = String(ins.error?.message || "");
          const m1 = msg.match(/column \"([^\"]+)\" of relation \"kits_voices\" does not exist/i);
          const m2 = msg.match(/Could not find the '([^']+)' column/i);
          const col = (m1?.[1] || m2?.[1] || "").toString().trim();
          if (col && Object.prototype.hasOwnProperty.call(row, col)) {
            delete row[col];
            continue;
          }
          const lower = msg.toLowerCase();
          if (row.tags != null && (lower.includes("invalid input syntax") || lower.includes("json") || lower.includes("array"))) {
            delete row.tags;
            continue;
          }
          break;
        }
        return { ok: false as const, error: lastErr };
      };

      const saved = await tryInsertWithFallback();
      if (!saved.ok) {
        let errorDetail = "";
        if (saved.error) {
          if (typeof saved.error === "object") {
            errorDetail = saved.error.message || saved.error.details || saved.error.hint || JSON.stringify(saved.error);
          } else {
            errorDetail = String(saved.error);
          }
        }

        const lower = errorDetail.toLowerCase();
        const missingTable = lower.includes("could not find the table") && lower.includes("kits_voices");
        const createTableSql = `create extension if not exists pgcrypto;

create table if not exists public.kits_voices (
  id uuid primary key default gen_random_uuid(),
  voice_id text,
  user_id uuid not null,
  voice_name text not null,
  description text,
  cost numeric default 0,
  status text default 'processing',
  provider text,
  replicate_id text,
  dataset_url text,
  model_name text,
  model_url text,
  sample_url text,
  profile_image_url text,
  voice_profile_name text,
  category text,
  language text,
  gender text,
  accent text,
  tags text[],
  is_public boolean default false,
  output jsonb,
  error jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.kits_voices enable row level security;

drop policy if exists "kits_voices_select_own" on public.kits_voices;
create policy "kits_voices_select_own"
on public.kits_voices for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "kits_voices_insert_own" on public.kits_voices;
create policy "kits_voices_insert_own"
on public.kits_voices for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "kits_voices_update_own" on public.kits_voices;
create policy "kits_voices_update_own"
on public.kits_voices for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "kits_voices_delete_own" on public.kits_voices;
create policy "kits_voices_delete_own"
on public.kits_voices for delete
to authenticated
using (auth.uid() = user_id);

notify pgrst, 'reload schema';`;

        return send(res, 500, {
          error: "No pude guardar la voz en la base de datos",
          detail: errorDetail,
          hint: missingTable
            ? "Falta la tabla kits_voices en Supabase. Crea la tabla y recarga el schema cache (incluyo el SQL)."
            : "Revisa la tabla kits_voices en Supabase (que exista y tenga las columnas básicas).",
          sql: missingTable ? createTableSql : undefined,
        });
      }

      return send(res, 200, { 
        predictionId, 
        message: "Modelo RVC en entrenamiento. Recibirás una notificación cuando esté listo.",
        status: 'processing',
        provider: 'replicate',
        note: "Cuando el entrenamiento se complete, el resultado estará disponible en la base de datos. Para obtener la URL del archivo resultante, consulta el campo 'output' en la tabla 'kits_voices' usando el replicate_id.",
        helperFunction: "Usa extractOutputUrl(output) para extraer la URL del resultado. Ejemplo: const url = extractOutputUrl(voiceRow.output);"
      });
    } catch (e) {
      return send(res, 502, { error: "Error entrenando modelo RVC", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleCreateCover(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const songId = firstString(payload, ["songId", "song_id"]);
    const uploadUrl = firstString(payload, ["uploadUrl", "upload_url"]);
    const uploadPath = firstString(payload, ["uploadPath", "upload_path"]);
    const voiceId = firstString(payload, ["voiceId", "voice_id"]);
    const voiceModelUrl = firstString(payload, ["voiceModelUrl", "voice_model_url"]);
    const rawTitle = firstString(payload, ["title"]);
    const pitchChange = Number(payload?.pitchChange) || 0;
    const indexRate = Number(payload?.indexRate) || 0.5;
    const protect = Number(payload?.protect) || 0.33;
    const outputFormat = firstString(payload, ["outputFormat", "output_format"]) || "mp3";

    if (!voiceId && !voiceModelUrl) return send(res, 400, { error: "Falta voiceId o voiceModelUrl" });

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = 0;

    try {
      let finalUploadUrl = "";
      let sourceAudioRef = "";
      let finalTitle = rawTitle || "Cover Personalizado";
      let baseSunoTaskId = "";
      let baseSunoAudioId = "";
      let baseSongDbId = "";
      if (songId) {
        const { data: baseSong, error: baseErr } = await auth.admin
          .from("library_items")
          .select("id, user_id, title, audio_url, deleted_at, type, suno_task_id, suno_audio_id")
          .eq("id", songId.slice(0, 200))
          .eq("user_id", user.id)
          .eq("type", "song")
          .maybeSingle();
        if (baseErr) return send(res, 500, { error: "No pude buscar la canción", detail: baseErr.message });
        if (!baseSong || (baseSong as any).deleted_at) return send(res, 404, { error: "Canción no encontrada" });
        baseSongDbId = String((baseSong as any).id || "").trim();
        baseSunoTaskId = String((baseSong as any).suno_task_id || "").trim();
        baseSunoAudioId = String((baseSong as any).suno_audio_id || "").trim();
        const aurl = String((baseSong as any).audio_url || "").trim();
        if (!aurl) return send(res, 404, { error: "La canción no tiene audio" });
        finalTitle = rawTitle || `${String((baseSong as any).title || "Canción").trim().slice(0, 90)} (Voz clonada)`;
        finalUploadUrl = aurl;
        sourceAudioRef = aurl;
        const isHttp = /^https?:\/\//i.test(finalUploadUrl);
        const isBlobOrData = /^blob:|^data:/i.test(finalUploadUrl);
        if (isBlobOrData) {
          return send(res, 400, {
            error: "El audio de esta canción no está en una URL pública todavía.",
            detail:
              "Esto pasa cuando el audio es temporal. Reproduce la canción una vez en Biblioteca para que se guarde la URL real y vuelve a intentar.",
          });
        }
        if (!isHttp) {
          try {
            const key = finalUploadUrl.replace(/^\/+/, "");
            finalUploadUrl = await getSignedR2Url(key, 60 * 60 * 2);
          } catch (e) {
            return send(res, 400, {
              error: "El audio de esta canción no está en una URL pública todavía.",
              detail: e instanceof Error ? e.message : String(e),
              hint: "Tip: Reproduce la canción una vez en Biblioteca y vuelve a intentar.",
            });
          }
        }

        const checkUrl = async (url: string) => {
          try {
            const r = await fetch(url, { method: "HEAD" });
            return { ok: r.ok, status: r.status };
          } catch {
            try {
              const r = await fetch(url, { method: "GET", headers: { range: "bytes=0-0" } as any });
              return { ok: r.ok, status: r.status };
            } catch {
              return { ok: false, status: 0 };
            }
          }
        };

        const check = await checkUrl(finalUploadUrl);
        const looksMissing = !check.ok && (check.status === 404 || check.status === 0);
        if (looksMissing && baseSunoTaskId) {
          try {
            const enc = encodeURIComponent(baseSunoTaskId);
            const paths = [
              `/api/v1/generate/record-info?taskId=${enc}`,
              `/api/v1/suno/generate/record-info?taskId=${enc}`,
              `/api/v1/task/${enc}`,
              `/api/v1/suno/task/${enc}`,
            ];
            let last: any = null;
            for (const p of paths) {
              const r = await sunoFetchJson(p, { method: "GET" });
              last = r;
              if (r.res.status !== 404) break;
            }
            const { res: tr, data } = last || {};
            if (tr && tr.ok) {
              const root = data?.data || data?.data?.data || data || {};
              const candidates: any[] = [];
              if (Array.isArray(root?.response?.data)) candidates.push(root.response.data);
              if (Array.isArray(root?.response?.sunoData)) candidates.push(root.response.sunoData);
              if (Array.isArray(root?.response)) candidates.push(root.response);
              if (Array.isArray(root?.data)) candidates.push(root.data);
              if (Array.isArray(root?.data?.data)) candidates.push(root.data.data);
              const list = (candidates.find((x) => Array.isArray(x) && x.length) as any[]) || [];
              const cleanStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim();
              const pickUrl = (track: any) =>
                cleanStr(
                  track?.audio_url ||
                    track?.audioUrl ||
                    track?.streamAudioUrl ||
                    track?.stream_audio_url ||
                    track?.stream_url ||
                    track?.url ||
                    ""
                );
              const pickAudioId = (track: any) =>
                cleanStr(track?.audio_id || track?.audioId || track?.id || track?.suno_audio_id || track?.sunoAudioId || "");
              const match = baseSunoAudioId
                ? list.find((t: any) => pickAudioId(t) && pickAudioId(t) === baseSunoAudioId)
                : null;
              const chosen = match || list[0];
              const refreshedUrl = pickUrl(chosen);
              const refreshedAudioId = pickAudioId(chosen);
              if (/^https?:\/\//i.test(refreshedUrl)) {
                finalUploadUrl = refreshedUrl;
                if (!sourceAudioRef) sourceAudioRef = refreshedUrl;
                try {
                  if (baseSongDbId) {
                    await auth.admin
                      .from("library_items")
                      .update({
                        audio_url: refreshedUrl,
                        suno_audio_id: refreshedAudioId || baseSunoAudioId || null,
                      })
                      .eq("id", baseSongDbId)
                      .eq("user_id", user.id);
                  }
                } catch {
                }
              }
            }
          } catch {
          }
        }
      } else if (uploadUrl || uploadPath) {
        finalUploadUrl = uploadUrl;
        sourceAudioRef = uploadUrl;
        if (uploadPath) {
          try {
            finalUploadUrl = await getSignedR2Url(uploadPath, 60 * 60 * 2);
            sourceAudioRef = uploadPath;
          } catch (e) {
            return send(res, 502, { error: "Error generando URL firmada para el audio", detail: e instanceof Error ? e.message : String(e) });
          }
        }
      }

      if (!finalUploadUrl) return send(res, 400, { error: "Falta songId o uploadUrl/uploadPath" });
      if (!sourceAudioRef) sourceAudioRef = finalUploadUrl;

      try {
        const u = new URL(finalUploadUrl);
        const host = (u.hostname || "").toLowerCase();
        const isR2 =
          host.includes(".r2.cloudflarestorage.com") ||
          host.endsWith(".r2.dev") ||
          host.includes(".r2");
        const isSigned = u.searchParams.has("X-Amz-Signature") || u.searchParams.has("x-amz-signature");
        const isAlreadyGood = isR2 && isSigned;
        if (!isAlreadyGood) {
          const { buf, contentType } = await fetchUrlToBuffer(finalUploadUrl);
          const ext =
            contentType === "audio/wav"
              ? "wav"
              : contentType === "audio/ogg"
              ? "ogg"
              : contentType === "audio/aac"
              ? "aac"
              : contentType === "audio/mp4"
              ? "m4a"
              : "mp3";
          const suffix = `${Date.now()}_${(songId || "").slice(0, 12) || "song"}`;
          const key = `covers/source-audio/${user.id}/${suffix}.${ext}`;
          await uploadToR2(key, buf, contentType);
          finalUploadUrl = await getSignedR2Url(key, 60 * 60 * 2);
        }
      } catch (e) {
        return send(res, 502, { error: "No pude preparar el audio para el cover", detail: e instanceof Error ? e.message : String(e) });
      }

      // Determinar la URL del modelo de voz
      let modelUrl = voiceModelUrl;
      if (voiceId && !voiceModelUrl) {
        // Buscar la voz en la base de datos
        const safeVoiceId = voiceId.replaceAll(",", "").slice(0, 200);
        const { data: voiceRows } = await auth.admin
          .from("kits_voices")
          .select("id, replicate_id, voice_id, output, model_url")
          .eq("user_id", user.id)
          .or(`id.eq.${safeVoiceId},voice_id.eq.${safeVoiceId},replicate_id.eq.${safeVoiceId}`)
          .limit(1);
        
        const voiceRow = Array.isArray(voiceRows) ? voiceRows[0] : null;
        const parseOutput = (raw: any) => {
          if (!raw) return null;
          if (typeof raw === "object") return raw;
          if (typeof raw === "string") {
            try {
              return JSON.parse(raw);
            } catch {
              return null;
            }
          }
          return null;
        };
        const modelFromCol =
          voiceRow && (voiceRow as any)?.model_url != null ? String((voiceRow as any).model_url || "").trim() : "";
        const outObj = parseOutput((voiceRow as any)?.output);
        const modelFromOutputField = typeof outObj?.model_url === "string" ? outObj.model_url.trim() : "";
        const modelFromOutput = modelFromOutputField || (outObj ? extractOutputUrl(outObj) || "" : "");
        if (!modelUrl) modelUrl = modelFromCol || modelFromOutput;

        const looksBadModelUrl = (raw: any) => {
          const s = String(raw || "").trim();
          if (!s) return true;
          if (!/^https?:\/\//i.test(s)) return true;
          const lower = s.toLowerCase();
          if (lower.includes("replicate.com/") && !lower.includes("replicate.delivery")) return true;
          return false;
        };

        if (modelUrl && looksBadModelUrl(modelUrl)) modelUrl = "";

        if ((!modelUrl || looksBadModelUrl(modelUrl)) && voiceRow?.replicate_id) {
          const replicateToken = process.env.REPLICATE_API_TOKEN;
          if (replicateToken) {
            const replicateResponse = await fetch(`https://api.replicate.com/v1/predictions/${voiceRow.replicate_id}`, {
              headers: { 'Authorization': `Token ${replicateToken}` },
            });
            if (replicateResponse.ok) {
              const replicateData = await replicateResponse.json();
              const fromOutput =
                (typeof replicateData?.output?.model_url === "string" ? replicateData.output.model_url.trim() : "") ||
                (replicateData?.output ? extractOutputUrl(replicateData.output) || "" : "");
              modelUrl = fromOutput;
            }
          }
        }

        if (modelUrl && voiceRow && !(voiceRow as any)?.model_url) {
          try {
            // Si es una URL temporal de Replicate, copiarla a R2 primero
            let finalModelUrl = modelUrl;
            const lowerUrl = modelUrl.toLowerCase();
            
            if (lowerUrl.includes('replicate.delivery') || 
                (lowerUrl.includes('replicate.com/') && !lowerUrl.includes('replicate.com/api/'))) {
              console.log(`📦 Detectada URL temporal de Replicate, copiando a R2: ${modelUrl.substring(0, 80)}...`);
              
              try {
                // Extraer un nombre seguro para el archivo
                const voiceName = String((voiceRow as any)?.voice_name || 'voice-model').replace(/[^a-zA-Z0-9_-]/g, '_');
                const userId = String(user.id);
                
                // Copiar a R2
                finalModelUrl = await copyUrlToR2(
                  modelUrl,
                  userId,
                  'voice-models/',
                  voiceName
                );
                
                console.log(`✅ URL temporal copiada a R2: ${finalModelUrl}`);
              } catch (copyError) {
                console.error(`❌ Error al copiar URL temporal a R2:`, copyError);
                // Continuar con la URL original como fallback
                console.log(`⚠️ Usando URL temporal original como fallback`);
              }
            }
            
            // Guardar la URL (permanente de R2 o la original si falló la copia)
            await auth.admin.from("kits_voices").update({ model_url: finalModelUrl }).eq("id", (voiceRow as any).id);
          } catch {
          }
        }
      }

      if (!modelUrl) {
        return send(res, 400, { error: "No se pudo obtener la URL del modelo de voz" });
      }

      try {
        const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: existingRows } = await auth.admin
          .from("rvc_covers")
          .select("prediction_id,status,created_at,updated_at")
          .eq("user_id", user.id)
          .eq("original_audio_url", sourceAudioRef)
          .eq("voice_id", voiceId || "")
          .order("created_at", { ascending: false })
          .limit(1);
        const existing = Array.isArray(existingRows) ? existingRows[0] : null;
        const status = String((existing as any)?.status || "").toString().trim().toLowerCase();
        const createdAt = String((existing as any)?.created_at || "").trim();
        const isRecent = createdAt && createdAt >= since;
        if (existing && isRecent && status === "processing" && (existing as any)?.prediction_id) {
          return send(res, 200, {
            coverId: String((existing as any).prediction_id),
            predictionId: String((existing as any).prediction_id),
            message: "Cover en proceso. Ya había uno creando. Se seguirá usando ese mismo.",
            status: "processing",
            reused: true,
            cost,
          });
        }
      } catch {
      }

      // Llamar a Replicate API para crear el cover
      const replicateToken = process.env.REPLICATE_API_TOKEN;
      if (!replicateToken) {
        return send(res, 500, { error: "Replicate API token no configurado", detail: "Contacta al administrador del sistema" });
      }

      const replicateCoverModel = (process.env.REPLICATE_VOICE_COVER_MODEL || "zsxkib/realistic-voice-cloning").toString().trim();
      const getLatestReplicateVersionId = async (modelSlug: string): Promise<string> => {
        const r = await fetch(`https://api.replicate.com/v1/models/${modelSlug}`, {
          method: "GET",
          headers: { Authorization: `Token ${replicateToken}` },
        });
        if (!r.ok) throw new Error(`No pude consultar Replicate model (HTTP ${r.status})`);
        const info = await r.json().catch(() => ({}));
        const id = String(info?.latest_version?.id || "").trim();
        if (!id) throw new Error("No recibí latest_version.id de Replicate");
        return id;
      };

      const callCover = async (versionId: string) => {
        const url = `https://api.replicate.com/v1/models/${replicateCoverModel}/versions/${encodeURIComponent(versionId)}/predictions`;
        const r = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Token ${replicateToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: {
              song_input: finalUploadUrl,
              rvc_model: "CUSTOM",
              custom_rvc_model_download_url: modelUrl,
              pitch_change: "no-change",
              index_rate: Math.max(0, Math.min(1, indexRate)),
              protect: Math.max(0, Math.min(1, protect)),
              output_format: outputFormat,
            },
            webhook: absoluteUrlFromReq(req, "/api/webhooks/replicate-cover"),
          }),
        });
        const data = await r.json().catch(() => ({}));
        return { r, data };
      };

      let replicateCoverVersion = (process.env.REPLICATE_VOICE_COVER_VERSION || "").toString().trim();
      if (!replicateCoverVersion) {
        try {
          replicateCoverVersion = await getLatestReplicateVersionId(replicateCoverModel);
        } catch {
          replicateCoverVersion = "";
        }
      }
      if (!replicateCoverVersion) replicateCoverVersion = "a0076ea1";

      let { r: replicateResponse, data: replicateData } = await callCover(replicateCoverVersion);
      if (!replicateResponse.ok && replicateResponse.status === 404) {
        try {
          const latest = await getLatestReplicateVersionId(replicateCoverModel);
          if (latest && latest !== replicateCoverVersion) {
            replicateCoverVersion = latest;
            const retry = await callCover(replicateCoverVersion);
            replicateResponse = retry.r;
            replicateData = retry.data;
          }
        } catch {
        }
      }

      if (!replicateResponse.ok) {
        let errorMessage = "Error creando cover";
        const normalizeDetail = (raw: any) => {
          if (typeof raw === "string") return raw;
          if (raw == null) return "";
          try {
            return JSON.stringify(raw);
          } catch {
            return String(raw);
          }
        };
        const rawDetail =
          replicateData?.detail ??
          replicateData?.error ??
          replicateData?.message ??
          replicateData?.title ??
          `HTTP ${replicateResponse.status}`;
        let errorDetail = normalizeDetail(rawDetail) || `HTTP ${replicateResponse.status}`;
        
        if (replicateResponse.status === 401 || replicateResponse.status === 403) {
          errorMessage = "Error de autenticación con Replicate API";
          errorDetail = "El token de API no es válido o ha expirado";
        } else if (replicateResponse.status === 422) {
          errorMessage = "Datos de solicitud inválidos";
          const base = "El archivo de audio o el modelo de voz no cumplen con los requisitos.";
          errorDetail = errorDetail ? `${base}\n\nDetalle: ${errorDetail}` : base;
        } else if (replicateResponse.status === 429) {
          errorMessage = "Límite de solicitudes excedido";
          errorDetail = "Has realizado demasiadas solicitudes a Replicate API. Intenta de nuevo en unos minutos";
        }
        
        return send(res, 502, { error: errorMessage, detail: errorDetail, status: replicateResponse.status });
      }

      const predictionId = replicateData?.id;
      if (!predictionId) {
        return send(res, 502, { error: "Respuesta inválida de Replicate API" });
      }

      let trackingWarning: string | null = null;
      try {
        const { error: insErr } = await auth.admin.from("rvc_covers").insert({
          user_id: user.id,
          title: finalTitle,
          original_audio_url: sourceAudioRef,
          voice_id: voiceId,
          voice_model_url: modelUrl,
          prediction_id: predictionId,
          cost: cost,
          pitch_change: pitchChange,
          index_rate: indexRate,
          protect: protect,
          output_format: outputFormat,
          status: "processing",
          created_at: new Date().toISOString(),
        });
        if (insErr) {
          const msg = String((insErr as any)?.message || "").trim();
          const lower = msg.toLowerCase();
          const missingTable = lower.includes("could not find the table") && lower.includes("rvc_covers");
          trackingWarning = missingTable
            ? "Falta la tabla rvc_covers en Supabase. El cover puede completarse, pero el seguimiento puede fallar."
            : msg || "No pude guardar el seguimiento del cover.";
        }
      } catch (e) {
        trackingWarning = e instanceof Error ? e.message : String(e);
      }

      return send(res, 200, { 
        coverId: predictionId,
        predictionId,
        message: "Cover en proceso. Recibirás una notificación cuando esté listo.",
        status: 'processing',
        warning: trackingWarning,
        cost: cost
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const combined = detail && String(detail || "").trim() ? `Error creando cover\n\n${String(detail || "").trim()}` : "Error creando cover";
      return send(res, 502, { error: combined, detail });
    }
  }

  async function handleKitsVoices(req: any, res: any) {
    if ((req.method || "").toUpperCase() === "GET") {
      const auth = await requireUser(req);
      if (!auth.ok) return send(res, auth.status, { error: auth.error });

      try {
        const { data: voices, error } = await auth.admin
          .from("kits_voices")
          .select("*")
          .eq("user_id", auth.user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        return send(res, 200, { voices: voices || [] });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        const lower = detail.toLowerCase();
        const missingTable = lower.includes("could not find the table") && lower.includes("kits_voices");
        return send(res, 500, {
          error: "Error obteniendo voces",
          detail,
          hint: missingTable
            ? "Falta la tabla kits_voices en Supabase. Crea la tabla y recarga el schema cache."
            : undefined,
        });
      }
    } else if ((req.method || "").toUpperCase() === "DELETE") {
      const auth = await requireUser(req);
      if (!auth.ok) return send(res, auth.status, { error: auth.error });

      const payload = parseJsonBody(req);
      const voiceId = firstString(payload, ["voiceId", "voice_id"]);

      if (!voiceId) return send(res, 400, { error: "Falta voiceId" });

      try {
        const { error } = await auth.admin
          .from("kits_voices")
          .delete()
          .eq("id", voiceId)
          .eq("user_id", auth.user.id);

        if (error) throw error;

        return send(res, 200, { ok: true, message: "Voz eliminada" });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        const lower = detail.toLowerCase();
        const missingTable = lower.includes("could not find the table") && lower.includes("kits_voices");
        return send(res, 500, {
          error: "Error eliminando voz",
          detail,
          hint: missingTable
            ? "Falta la tabla kits_voices en Supabase. Crea la tabla y recarga el schema cache."
            : undefined,
        });
      }
    } else {
      return send(res, 405, { error: "Método no permitido" });
    }
  }

  async function handleSunoVoices(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    if (method === "GET") {
      const auth = await requireUser(req);
      if (!auth.ok) return send(res, auth.status, { error: auth.error });

      try {
        const { data: voices, error } = await auth.admin
          .from("suno_voices")
          .select("*")
          .eq("user_id", auth.user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return send(res, 200, { voices: voices || [] });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        const lower = detail.toLowerCase();
        const missingTable = lower.includes("could not find the table") && lower.includes("suno_voices");
        const createTableSql = `create extension if not exists pgcrypto;

create table if not exists public.suno_voices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  suno_voice_id text not null,
  name text not null,
  status text default 'processing',
  last_task_id text,
  meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists suno_voices_user_suno_voice_id_key
on public.suno_voices (user_id, suno_voice_id);

alter table public.suno_voices enable row level security;

drop policy if exists "suno_voices_select_own" on public.suno_voices;
create policy "suno_voices_select_own"
on public.suno_voices for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "suno_voices_insert_own" on public.suno_voices;
create policy "suno_voices_insert_own"
on public.suno_voices for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "suno_voices_update_own" on public.suno_voices;
create policy "suno_voices_update_own"
on public.suno_voices for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "suno_voices_delete_own" on public.suno_voices;
create policy "suno_voices_delete_own"
on public.suno_voices for delete
to authenticated
using (auth.uid() = user_id);

notify pgrst, 'reload schema';`;

        return send(res, 500, {
          error: "Error obteniendo voces de Suno",
          detail,
          hint: missingTable
            ? "Falta la tabla suno_voices en Supabase. Crea la tabla y recarga el schema cache (incluyo el SQL)."
            : undefined,
          sql: missingTable ? createTableSql : undefined,
        });
      }
    }

    if (method === "POST") {
      const auth = await requireUser(req);
      if (!auth.ok) return send(res, auth.status, { error: auth.error });

      const payload = parseJsonBody(req);
      if (!payload) return send(res, 400, { error: "Body inválido" });

      const sunoVoiceId =
        firstString(payload, ["sunoVoiceId", "suno_voice_id", "voiceId", "voice_id"]) ||
        "";
      const name = firstString(payload, ["name", "voiceName", "voice_name"]) || "Voz";
      const status = firstString(payload, ["status"]) || "";
      const taskId = firstString(payload, ["taskId", "task_id"]) || "";
      const meta = typeof payload?.meta === "object" && payload?.meta && !Array.isArray(payload.meta) ? payload.meta : null;

      if (!sunoVoiceId) return send(res, 400, { error: "Falta sunoVoiceId" });

      try {
        const row: any = {
          user_id: auth.user.id,
          suno_voice_id: sunoVoiceId.slice(0, 200),
          name: name.slice(0, 160),
          updated_at: new Date().toISOString(),
        };
        if (status) row.status = status.slice(0, 60);
        if (taskId) row.last_task_id = taskId.slice(0, 200);
        if (meta) row.meta = meta;

        const { data: saved, error } = await auth.admin
          .from("suno_voices")
          .upsert(row, { onConflict: "user_id,suno_voice_id" })
          .select("*")
          .single();

        if (error) throw error;
        return send(res, 200, { ok: true, voice: saved });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        const lower = detail.toLowerCase();
        const missingTable = lower.includes("could not find the table") && lower.includes("suno_voices");
        return send(res, 500, {
          error: "Error guardando voz de Suno",
          detail,
          hint: missingTable
            ? "Falta la tabla suno_voices en Supabase. Crea la tabla y recarga el schema cache."
            : undefined,
        });
      }
    }

    if (method === "PATCH" || method === "PUT") {
      const auth = await requireUser(req);
      if (!auth.ok) return send(res, auth.status, { error: auth.error });

      const payload = parseJsonBody(req);
      if (!payload) return send(res, 400, { error: "Body inválido" });

      const sunoVoiceId = firstString(payload, ["sunoVoiceId", "suno_voice_id", "voiceId", "voice_id"]) || "";
      const name = firstString(payload, ["name", "voiceName", "voice_name"]) || "";

      if (!sunoVoiceId) return send(res, 400, { error: "Falta sunoVoiceId" });
      if (!name.trim()) return send(res, 400, { error: "Falta name" });

      try {
        const { data: saved, error } = await auth.admin
          .from("suno_voices")
          .update({
            name: name.trim().slice(0, 160),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", auth.user.id)
          .eq("suno_voice_id", sunoVoiceId.slice(0, 200))
          .select("*")
          .single();

        if (error) throw error;
        return send(res, 200, { ok: true, voice: saved });
      } catch (e) {
        return send(res, 500, { error: "Error actualizando voz de Suno", detail: e instanceof Error ? e.message : String(e) });
      }
    }

    if (method === "DELETE") {
      const auth = await requireUser(req);
      if (!auth.ok) return send(res, auth.status, { error: auth.error });

      const payload = parseJsonBody(req);
      if (!payload) return send(res, 400, { error: "Body inválido" });

      const sunoVoiceId = firstString(payload, ["sunoVoiceId", "suno_voice_id", "voiceId", "voice_id"]);
      if (!sunoVoiceId) return send(res, 400, { error: "Falta sunoVoiceId" });

      try {
        const { error } = await auth.admin
          .from("suno_voices")
          .delete()
          .eq("user_id", auth.user.id)
          .eq("suno_voice_id", sunoVoiceId);
        if (error) throw error;
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 500, { error: "Error eliminando voz de Suno", detail: e instanceof Error ? e.message : String(e) });
      }
    }

    return send(res, 405, { error: "Método no permitido" });
  }

  // ------------------------------------------------------------------
  // KARAOKE ASYNC 3-STEP FLOW (Vercel Hobby compatible)
  // ------------------------------------------------------------------

  async function handleKaraokeStart(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const uploadUrl = firstString(payload, ["uploadUrl", "upload_url"]);
    const uploadPath = firstString(payload, ["uploadPath", "upload_path"]);

    if (!uploadUrl && !uploadPath) return send(res, 400, { error: "Falta uploadUrl o uploadPath" });

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = 12.5;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      let sourceAudioUrl = uploadUrl;
      if (uploadPath) {
        try {
          const signedUrl = await getSignedR2Url(uploadPath, 7200);
          if (signedUrl) sourceAudioUrl = signedUrl;
        } catch {}
      }
      if (!sourceAudioUrl) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 400, { error: "Falta audio de origen" });
      }

      const replicateToken = (process.env.REPLICATE_API_TOKEN || "").trim();
      if (!replicateToken) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 500, { error: "Falta REPLICATE_API_TOKEN en el servidor" });
      }

      const replicateVersion =
        (process.env.REPLICATE_ALL_IN_ONE_AUDIO_VERSION || "").toString().trim() ||
        "f2a8516c9084ef460592deaa397acd4a97f60f18c3d15d273644c72500cdff0e";

      try {
        const probeRes = await fetch(sourceAudioUrl, {
          method: "GET",
          headers: {
            Range: "bytes=0-2047",
            Accept: "*/*",
          },
        });
        if (!probeRes.ok) {
          if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
          return send(res, 502, { error: `No pude leer el audio desde R2 (HTTP ${probeRes.status}).` });
        }
        const ct = (probeRes.headers.get("content-type") || "").toString().toLowerCase();
        const buf = Buffer.from(await probeRes.arrayBuffer());
        const headText = buf.slice(0, 256).toString("utf8").toLowerCase();
        const looksHtml = headText.includes("<html") || headText.includes("<!doctype html") || headText.includes("access denied");
        if (looksHtml || (ct && !ct.includes("audio") && !ct.includes("octet-stream"))) {
          if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
          return send(res, 502, { error: "El archivo en R2 no parece ser un audio válido. Revisa la subida y el tipo de archivo." });
        }
      } catch {
      }

      const initRes = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Token ${replicateToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: replicateVersion,
          input: {
            music_input: sourceAudioUrl,
            audioSeparator: true,
            audioSeparatorModel: "Kim_Vocal_2.onnx",
          },
        }),
      });

      const initData = await initRes.json().catch(() => ({}));
      if (!initRes.ok) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: initData?.detail || "Error iniciando separación en Replicate" });
      }

      const predictionId = initData?.id;
      const predictionUrl = initData?.urls?.get;
      if (!predictionId || !predictionUrl) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida de Replicate al iniciar" });
      }

      return send(res, 200, {
        ok: true,
        predictionId,
        predictionUrl,
        stage: "separating",
      });
    } catch (e: any) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost).catch(() => {});
      return send(res, 500, { error: "Error iniciando karaoke", detail: e?.message || String(e) });
    }
  }

  async function handleKaraokeStatus(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const predictionId = pickQuery(req, "predictionId");
    const stage = pickQuery(req, "stage") || "separating"; // "separating" | "backing"
    const vocalUrlForBacking = pickQuery(req, "vocalUrl"); // Only for "backing" stage
    const instrumentalUrlForBacking = pickQuery(req, "instrumentalUrl"); // Only for "backing" stage
    const skipBackingRaw = (pickQuery(req, "skipBacking") || "").toString().trim().toLowerCase();
    const skipBacking = skipBackingRaw === "1" || skipBackingRaw === "true" || skipBackingRaw === "yes";

    if (!predictionId) return send(res, 400, { error: "Falta predictionId" });

    const replicateToken = (process.env.REPLICATE_API_TOKEN || "").trim();
    if (!replicateToken) return send(res, 500, { error: "Falta REPLICATE_API_TOKEN" });
    const replicateVersion =
      (process.env.REPLICATE_ALL_IN_ONE_AUDIO_VERSION || "").toString().trim() ||
      "f2a8516c9084ef460592deaa397acd4a97f60f18c3d15d273644c72500cdff0e";

    try {
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(predictionId)}`, {
        headers: { Authorization: `Token ${replicateToken}` },
      });
      const pollData = await pollRes.json().catch(() => ({}));

      const status = pollData?.status; // starting | processing | succeeded | failed | canceled

      if (status === "succeeded") {
        const output = pollData?.output || {};

        if (stage === "separating") {
          // Main separation done — extract URLs and kick off BVE
          const vocalUrl = output?.mdx_vocals || output?.vocals || null;
          const instrumentalUrl = output?.mdx_other || output?.instrumental || output?.no_vocals || null;

          if (!vocalUrl || !instrumentalUrl) {
            return send(res, 200, { ok: false, error: "No se obtuvieron pistas separadas" });
          }

          if (skipBacking) {
            return send(res, 200, {
              ok: true,
              status: "ready_for_finalize",
              stage: "done",
              vocalUrl,
              instrumentalUrl,
              backingVocalUrl: null,
              message: "Separación lista.",
            });
          }

          // Start BVE (backing vocal extraction) as a new Replicate prediction
          const bveRes = await fetch("https://api.replicate.com/v1/predictions", {
            method: "POST",
            headers: {
              Authorization: `Token ${replicateToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              version: replicateVersion,
              input: {
                music_input: vocalUrl,
                audioSeparator: true,
                audioSeparatorModel: "UVR-BVE-4B_SN-44100-1.pth",
              },
            }),
          });

          const bveData = await bveRes.json().catch(() => ({}));
          if (bveRes.ok && bveData?.id) {
            return send(res, 200, {
              ok: true,
              status: "progressing",
              stage: "backing",
              predictionId: bveData.id,
              vocalUrl,
              instrumentalUrl,
              message: "Extrayendo segundas voces...",
            });
          } else {
            // BVE failed to start → skip it, go straight to finalize
            return send(res, 200, {
              ok: true,
              status: "ready_for_finalize",
              stage: "done",
              vocalUrl,
              instrumentalUrl,
              backingVocalUrl: null,
              message: "Separación lista.",
            });
          }
        }

        if (stage === "backing") {
          // BVE done
          const bveVocalUrl = output?.mdx_vocals || null;
          const backingVocalUrl = output?.mdx_other || null;
          return send(res, 200, {
            ok: true,
            status: "ready_for_finalize",
            stage: "done",
            vocalUrl: bveVocalUrl || vocalUrlForBacking || null,
            backingVocalUrl,
            instrumentalUrl: instrumentalUrlForBacking || null,
            message: "Listo para sincronizar.",
          });
        }
      }

      if (status === "failed" || status === "canceled") {
        const rawErr = String(pollData?.error || "").trim();
        const errLower = rawErr.toLowerCase();
        if (stage === "backing") {
          return send(res, 200, {
            ok: true,
            status: "ready_for_finalize",
            stage: "done",
            vocalUrl: vocalUrlForBacking || null,
            instrumentalUrl: instrumentalUrlForBacking || null,
            backingVocalUrl: null,
            message: errLower.includes("audio buffer is not finite")
              ? "Coros fallaron, continuando sin coros."
              : "Coros fallaron, continuando sin coros.",
          });
        }
        return send(res, 200, { ok: false, error: `Replicate: ${status}. ${rawErr}` });
      }

      // Still processing
      return send(res, 200, {
        ok: true,
        status: "processing",
        stage,
        message: stage === "separating" ? "Separando voz e instrumental..." : "Extrayendo segundas voces...",
      });
    } catch (e: any) {
      return send(res, 500, { error: "Error consultando estado", detail: e?.message || String(e) });
    }
  }

  async function syncLyricsWithGemini(audioBuf: ArrayBuffer, mimeType: string, lyrics: string) {
    const apiKey = String(
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      process.env.GEMINI_KEY ||
      process.env.GOOGLE_AI_STUDIO_KEY ||
      process.env.AI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY ||
      ""
    ).trim();
    if (!apiKey) {
      return { ok: false as const, error: "Falta GEMINI_API_KEY en Vercel" };
    }

    try {
      const mod: any = await import("@google/genai");
      const GoogleGenAI = mod?.GoogleGenAI || mod?.default?.GoogleGenAI;
      if (!GoogleGenAI) return { ok: false as const, error: "No pude cargar Gemini (@google/genai)" };

      const ai = new GoogleGenAI({ apiKey });
      const base64Audio = Buffer.from(audioBuf).toString("base64");

      const prompt =
        `Listen to the audio and read the following lyrics:\n\n${lyrics}\n\n` +
        `Return a JSON array representing the exact timing of each line of the lyrics in the audio. ` +
        `The start_time and end_time should be in seconds (float). Use this exact format:\n` +
        `[\n  { "text": "line of lyrics", "start_time": 0.0, "end_time": 2.5 }\n]\n` +
        `Output ONLY valid JSON without markdown wrapping.`;

      const baseModels = [
        "gemini-3.6-flash",
        "gemini-3-flash",
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-3.6-flash-preview",
        "gemini-3-flash-preview",
        "gemini-2.0-flash-lite-preview",
        "gemini-1.5-flash",
      ];

      let lastErr: any = null;
      for (const base of baseModels) {
        const modelsToTry = base.startsWith("models/") ? [base] : [base, `models/${base}`];
        for (const model of modelsToTry) {
          try {
            const r = await ai.models.generateContent({
              model,
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: base64Audio } }
                  ]
                }
              ],
              config: {
                responseMimeType: "application/json"
              }
            });

            const textOut = String(r?.text || "").trim();
            if (!textOut) continue;

            const parsed = JSON.parse(textOut);
            return { ok: true as const, data: parsed };
          } catch (e: any) {
            lastErr = e?.message || String(e);
          }
        }
      }

      return { ok: false as const, error: lastErr || "No se pudo sincronizar con ningún modelo de Gemini" };
    } catch (error: any) {
      return { ok: false as const, error: error?.message || String(error) };
    }
  }

  async function handleKaraokeFinalize(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const vocalUrl = firstString(payload, ["vocalUrl", "vocal_url"]);
    const instrumentalUrl = firstString(payload, ["instrumentalUrl", "instrumental_url"]);
    const backingVocalUrl = firstString(payload, ["backingVocalUrl", "backing_vocal_url"]);
    const lyrics = firstString(payload, ["lyrics", "text"]) || "";

    if (!vocalUrl) return send(res, 400, { error: "Falta vocalUrl" });
    if (!lyrics.trim()) return send(res, 400, { error: "Falta la letra para sincronizar" });

    try {
      // Download vocal track for Gemini (must fit in memory — vocal tracks are usually < 10MB)
      const vocalRes = await fetch(vocalUrl);
      if (!vocalRes.ok) return send(res, 502, { error: `No pude descargar la pista vocal (HTTP ${vocalRes.status})` });
      const vocalBuffer = await vocalRes.arrayBuffer();

      const syncResult = await syncLyricsWithGemini(vocalBuffer, "audio/mpeg", lyrics);
      if (!syncResult.ok) {
        return send(res, 500, { error: syncResult.error || "Error sincronizando con Gemini" });
      }

      return send(res, 200, {
        ok: true,
        syncData: syncResult.data,
        instrumentalUrl: instrumentalUrl || null,
        vocalUrl,
        backingVocalUrl: backingVocalUrl || null,
      });
    } catch (e: any) {
      return send(res, 500, { error: "Error finalizando karaoke", detail: e?.message || String(e) });
    }
  }

  return async function handler(req: any, res: any) {
    try {
      const action = (pickQuery(req, "action") || "").trim().toLowerCase() || "";
      const fallback = (() => {
        const pathname = new URL(req.url, "http://localhost").pathname;
        const parts = pathname.split("/").filter(Boolean);
        const i = parts.findIndex((p) => p === "suno");
        const next = i >= 0 ? parts[i + 1] : "";
        return (next || "").toLowerCase();
      })();
      const a = action || fallback;

      if (a === "generate") return handleGenerate(req, res);
      if (a === "extend") return handleExtend(req, res);
      if (a === "upload-cover") return handleUploadCover(req, res);
      if (a === "add-instrumental") return handleAddInstrumental(req, res);
      if (a === "add-vocals") return handleAddVocals(req, res);
      if (a === "separate") return handleSeparate(req, res);
      if (a === "generate-persona") return handleGeneratePersona(req, res);
      if (a === "mp4") return handleMp4(req, res);
      if (a === "task") return handleTask(req, res);
      if (a === "timestamped-lyrics") return handleTimestampedLyrics(req, res);
      if (a === "lyrics") return handleLyrics(req, res);
      if (a === "wav") return handleWav(req, res);
      if (a === "midi") return handleMidi(req, res);
      if (a === "boost-style") return handleBoostStyle(req, res);
      if (a === "music-cover") return handleMusicCover(req, res);
      if (a === "credits") return handleCredits(req, res);
      if (a === "voice-validate") return handleVoiceValidate(req, res);
      if (a === "voice-validate-info") return handleVoiceValidateInfo(req, res);
      if (a === "voice-regenerate") return handleVoiceRegenerate(req, res);
      if (a === "voice-generate") return handleVoiceGenerate(req, res);
      if (a === "voice-record-info") return handleVoiceRecordInfo(req, res);
      if (a === "voice-check-voice") return handleVoiceCheckVoice(req, res);
      if (a === "voices") return handleSunoVoices(req, res);
      if (a === "clone-voice") return handleCloneVoice(req, res);
      if (a === "kits-voices") return handleKitsVoices(req, res);
      if (a === "create-cover") return handleCreateCover(req, res);
      if (a === "karaoke-start") return handleKaraokeStart(req, res);
      if (a === "karaoke-status") return handleKaraokeStatus(req, res);
      if (a === "karaoke-finalize") return handleKaraokeFinalize(req, res);
      // Legacy compat (kept for localhost server.js which still has its own route)
      if (a === "karaoke-sync") return handleKaraokeStart(req, res);

      return send(res, 404, { error: "Ruta no encontrada", action: a || null });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const karaokeHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || req.headers.Authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  async function requireUser(req: any) {
    const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
    const supabaseAnon = (process.env.SUPABASE_ANON_KEY || "").toString().trim();
    if (!supabaseUrl || !supabaseAnon) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY)" };
    }
    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };
    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };
    return { ok: true as const, user };
  }

  return async function handler(req: any, res: any) {
    try {
      const u = new URL(req.url, "http://localhost");
      const parts = u.pathname.split("/").filter(Boolean);
      const isApi = parts[0] === "api";
      const head = isApi ? parts[1] : parts[0];
      const next = isApi ? parts[2] : parts[1];

      if (head !== "karaoke") return send(res, 404, { error: "Ruta no encontrada" });

      if (next === "upload-url") {
        const oldUrl = req.url;
        req.url = `/api/upload-audio${u.search || ""}`;
        try {
          return await uploadAudioHandler(req, res);
        } finally {
          req.url = oldUrl;
        }
      }

      if (next === "verify") {
        if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
        const auth = await requireUser(req);
        if (!auth.ok) return send(res, auth.status, { error: auth.error });

        const payload = parseJsonBody(req);
        if (!payload) return send(res, 400, { error: "Body inválido" });

        const key = String(payload?.key || "").trim().replace(/^\/+/, "");
        const expectedSizeRaw = payload?.expectedSize ?? payload?.size ?? null;
        const expectedSize = expectedSizeRaw == null ? null : Number(expectedSizeRaw);
        if (!key) return send(res, 400, { error: "Falta key" });

        const uid = String((auth as any).user?.id || "").trim();
        const allowedPrefixes = [`uploads/audio/${uid}/`, `karaoke/${uid}/`];
        if (!allowedPrefixes.some((p) => key.startsWith(p))) {
          return send(res, 403, { error: "No autorizado para verificar este archivo" });
        }

        try {
          const env = getR2Env();
          const client = await getR2Client();
          const { HeadObjectCommand } = await getR2AwsSdk();
          const head = await client.send(new HeadObjectCommand({ Bucket: env.bucketName, Key: key }));
          const contentLength = Number((head as any)?.ContentLength ?? NaN);
          const etag = String((head as any)?.ETag || "").replaceAll('"', "").trim() || null;
          if (!Number.isFinite(contentLength) || contentLength <= 0) {
            return send(res, 404, { ok: false, error: "No se encontró el archivo en R2", key });
          }
          if (expectedSize != null && Number.isFinite(expectedSize) && expectedSize > 0 && contentLength !== expectedSize) {
            return send(res, 409, {
              ok: false,
              error: "La subida a R2 quedó incompleta (tamaño no coincide). Reintenta la subida.",
              expectedSize,
              contentLength,
              key,
            });
          }
          return send(res, 200, { ok: true, key, contentLength, etag, matches: expectedSize == null ? null : contentLength === expectedSize });
        } catch (e: any) {
          return send(res, 404, { ok: false, error: "No se pudo verificar el archivo en R2", detail: e?.message || String(e) });
        }
      }

      if (next === "play-url") {
        if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
        const auth = await requireUser(req);
        if (!auth.ok) return send(res, auth.status, { error: auth.error });

        const key = pickQuery(req, "key").trim().replace(/^\/+/, "");
        if (!key) return send(res, 400, { ok: false, error: "Falta key" });

        const uid = String((auth as any).user?.id || "").trim();
        const allowedPrefixes = [`uploads/audio/${uid}/`, `karaoke/${uid}/`];
        if (!allowedPrefixes.some((p) => key.startsWith(p))) {
          return send(res, 403, { ok: false, error: "No autorizado para este archivo" });
        }

        try {
          const url = await getSignedR2Url(key, 3600);
          return send(res, 200, { ok: true, key, url });
        } catch (e: any) {
          return send(res, 500, { ok: false, error: "No pude generar URL de reproducción", detail: e?.message || String(e) });
        }
      }

      const encodeB64Url = (buf: Buffer) =>
        buf
          .toString("base64")
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replaceAll("=", "");

      const decodeB64UrlToBuf = (s: string) => {
        const clean = (s || "").toString().replaceAll("-", "+").replaceAll("_", "/");
        const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
        return Buffer.from(clean + pad, "base64");
      };

      const getProxySecret = () => {
        const direct = (process.env.KARAOKE_PROXY_SECRET || "").toString().trim();
        if (direct) return direct;
        const r2 = (process.env.R2_SECRET_ACCESS_KEY || "").toString().trim();
        if (r2) return r2;
        return (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
      };

      const signProxyToken = async (payload: any) => {
        const secret = getProxySecret();
        if (!secret) throw new Error("Falta KARAOKE_PROXY_SECRET (o R2_SECRET_ACCESS_KEY) para firmar");
        const cryptoMod: any = await import("crypto");
        const raw = Buffer.from(JSON.stringify(payload), "utf8");
        const body = encodeB64Url(raw);
        const sig = cryptoMod.createHmac("sha256", secret).update(body).digest("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
        return `${body}.${sig}`;
      };

      const verifyProxyToken = async (token: string) => {
        const t = (token || "").toString().trim();
        if (!t.includes(".")) return null;
        const [body, sig] = t.split(".", 2);
        if (!body || !sig) return null;
        const secret = getProxySecret();
        if (!secret) return null;
        const cryptoMod: any = await import("crypto");
        const expected = cryptoMod.createHmac("sha256", secret).update(body).digest("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
        const a = Buffer.from(expected);
        const b = Buffer.from(sig);
        if (a.length !== b.length) return null;
        if (!cryptoMod.timingSafeEqual(a, b)) return null;
        try {
          const json = JSON.parse(decodeB64UrlToBuf(body).toString("utf8"));
          const expMs = Number(json?.exp ?? 0);
          if (!Number.isFinite(expMs) || expMs <= Date.now()) return null;
          return json;
        } catch {
          return null;
        }
      };

      const isAllowedProxySrc = (rawUrl: string) => {
        let u: URL | null = null;
        try {
          u = new URL(rawUrl);
        } catch {
          u = null;
        }
        if (!u || u.protocol !== "https:") return { ok: false as const, error: "URL inválida" };
        const host = (u.hostname || "").toLowerCase();
        if (!host) return { ok: false as const, error: "URL inválida" };
        if (
          host === "localhost" ||
          host === "0.0.0.0" ||
          host === "::1" ||
          host.endsWith(".local") ||
          /^127\./.test(host) ||
          /^10\./.test(host) ||
          /^192\.168\./.test(host) ||
          /^169\.254\./.test(host)
        ) {
          return { ok: false as const, error: "Origen no permitido" };
        }
        const m172 = host.match(/^172\.(\d{1,3})\./);
        if (m172) {
          const n = Number(m172[1] || 0);
          if (n >= 16 && n <= 31) return { ok: false as const, error: "Origen no permitido" };
        }
        return { ok: true as const, url: u };
      };

      if (next === "proxy-url") {
        if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
        const auth = await requireUser(req);
        if (!auth.ok) return send(res, auth.status, { error: auth.error });

        const uid = String((auth as any).user?.id || "").trim();
        const allowedPrefixes = [`uploads/audio/${uid}/`, `karaoke/${uid}/`];
        const key = pickQuery(req, "key").trim().replace(/^\/+/, "");
        const src = pickQuery(req, "src").trim();

        if (!key && !src) return send(res, 400, { ok: false, error: "Falta key o src" });

        if (key) {
          if (!allowedPrefixes.some((p) => key.startsWith(p))) return send(res, 403, { ok: false, error: "No autorizado para este archivo" });
        }
        if (src) {
          const allowed = isAllowedProxySrc(src);
          if (!allowed.ok) return send(res, allowed.error === "URL inválida" ? 400 : 403, { ok: false, error: allowed.error });
        }

        try {
          const token = await signProxyToken({
            uid,
            exp: Date.now() + 60 * 60 * 1000,
            key: key || null,
            src: src || null,
          });
          const url = `/api/karaoke/audio-proxy?token=${encodeURIComponent(token)}`;
          return send(res, 200, { ok: true, url });
        } catch (e: any) {
          try {
            if (key) {
              const signed = await getSignedR2Url(key, 60 * 60);
              if (typeof signed === "string" && signed.trim()) return send(res, 200, { ok: true, url: signed.trim(), via: "signed_r2" });
            }
            if (src) return send(res, 200, { ok: true, url: src, via: "direct_src" });
          } catch {
          }
          return send(res, 500, { ok: false, error: "No pude crear URL proxy", detail: e?.message || String(e) });
        }
      }

      if (next === "audio-proxy") {
        const method = (req.method || "").toUpperCase();
        if (method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("access-control-allow-origin", "*");
          res.setHeader("access-control-allow-methods", "GET,HEAD,OPTIONS");
          res.setHeader("access-control-allow-headers", "range, content-type");
          res.setHeader("access-control-max-age", "86400");
          res.end();
          return;
        }
        if (method !== "GET" && method !== "HEAD") return send(res, 405, { error: "Método no permitido" });
        const tokenRaw = pickQuery(req, "token") || pickQuery(req, "t") || "";
        const token = (tokenRaw || "").toString().trim();
        const verified = await verifyProxyToken(token);
        if (!verified) {
          res.statusCode = 403;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "Token inválido" }));
          return;
        }

        const uid = String(verified?.uid || "").trim();
        const allowedPrefixes = [`uploads/audio/${uid}/`, `karaoke/${uid}/`];
        const src = typeof verified?.src === "string" ? verified.src.trim() : "";
        const keyRaw = typeof verified?.key === "string" ? verified.key.trim() : "";

        const range = (req.headers?.range || req.headers?.Range || "").toString().trim();

        const sendErr = (status: number, msg: string, detail?: string) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: false, error: msg, detail: detail || undefined }));
        };

        const pipeWebToNode = async (body: any, res: any) => {
          if (!body) return false;
          if (body?.pipe) {
            body.pipe(res);
            return true;
          }
          if (body?.transformToWebStream) {
            try {
              const mod = await import("stream");
              const Readable = (mod as any).Readable;
              if (Readable?.fromWeb) {
                Readable.fromWeb(body.transformToWebStream()).pipe(res);
                return true;
              }
            } catch {
            }
          }
          return false;
        };

        const setCommonHeaders = () => {
          res.setHeader("cache-control", "no-store, max-age=0, s-maxage=0, must-revalidate");
          res.setHeader("access-control-allow-origin", "*");
          res.setHeader("access-control-allow-headers", "range, content-type");
          res.setHeader("access-control-expose-headers", "accept-ranges, content-length, content-range, content-type");
          res.setHeader("accept-ranges", "bytes");
        };

        if (keyRaw) {
          const key = keyRaw.replace(/^\/+/, "");
          if (!allowedPrefixes.some((p) => key.startsWith(p))) return sendErr(403, "No autorizado para este archivo");
          try {
            const env = getR2Env();
            const client = await getR2Client();
            const { GetObjectCommand } = await getR2AwsSdk();
            const out: any = await client.send(
              new GetObjectCommand({
                Bucket: env.bucketName,
                Key: key,
                ...(range ? { Range: range } : {}),
              })
            );

            const isPartial = Boolean(range);
            res.statusCode = isPartial ? 206 : 200;
            setCommonHeaders();
            const ct = typeof out?.ContentType === "string" && out.ContentType.trim() ? out.ContentType.trim() : "audio/mpeg";
            res.setHeader("content-type", ct);
            if (out?.ContentLength != null) res.setHeader("content-length", String(out.ContentLength));
            if (out?.ContentRange) res.setHeader("content-range", String(out.ContentRange));
            if (method === "HEAD") {
              res.end();
              return;
            }
            const piped = await pipeWebToNode(out?.Body, res);
            if (piped) return;
            const ab = await (out?.Body?.arrayBuffer?.() ?? Promise.resolve(null)).catch(() => null);
            if (!ab) return sendErr(502, "No pude leer el audio");
            res.end(Buffer.from(ab));
            return;
          } catch (e: any) {
            return sendErr(502, "No pude cargar el audio", e?.message || String(e));
          }
        }

        if (!src) return sendErr(400, "Falta src");
        const allowed = isAllowedProxySrc(src);
        if (!allowed.ok) return sendErr(allowed.error === "URL inválida" ? 400 : 403, allowed.error);
        const u = allowed.url;

        try {
          const headers: Record<string, string> = { accept: "*/*" };
          if (range) headers.range = range;
          const upstream = await fetch(u.toString(), { method: "GET", headers }).catch(() => null as any);
          if (!upstream) return sendErr(502, "No pude descargar el audio");
          const status = Number((upstream as any).status || 502);
          if (status >= 400) {
            const txt = await (upstream as any).text?.().catch(() => "") || "";
            return sendErr(502, "No pude descargar el audio", txt.slice(0, 800) || `HTTP ${status}`);
          }
          res.statusCode = status;
          setCommonHeaders();
          const upstreamCt = (upstream as any).headers?.get?.("content-type") || "";
          if (upstreamCt) res.setHeader("content-type", upstreamCt);
          const cl = (upstream as any).headers?.get?.("content-length") || "";
          const cr = (upstream as any).headers?.get?.("content-range") || "";
          if (cl) res.setHeader("content-length", cl);
          if (cr) res.setHeader("content-range", cr);
          if (method === "HEAD") {
            res.end();
            return;
          }
          const body = (upstream as any).body;
          if (body) {
            try {
              const mod = await import("stream");
              const Readable = (mod as any).Readable;
              if (Readable?.fromWeb) {
                Readable.fromWeb(body).pipe(res);
                return;
              }
            } catch {
            }
          }
          const ab = await (upstream as any).arrayBuffer?.().catch(() => null);
          if (!ab) return sendErr(502, "No pude leer el audio");
          res.end(Buffer.from(ab));
          return;
        } catch (e: any) {
          return sendErr(502, "No pude descargar el audio", e?.message || String(e));
        }
      }

      if (next === "start") {
        const oldUrl = req.url;
        req.url = `/api/suno/karaoke-start${u.search || ""}`;
        try {
          return await sunoHandler(req, res);
        } finally {
          req.url = oldUrl;
        }
      }

      if (next === "status") {
        const oldUrl = req.url;
        req.url = `/api/suno/karaoke-status${u.search || ""}`;
        try {
          return await sunoHandler(req, res);
        } finally {
          req.url = oldUrl;
        }
      }

      if (next === "finalize") {
        const oldUrl = req.url;
        req.url = `/api/suno/karaoke-finalize${u.search || ""}`;
        try {
          return await sunoHandler(req, res);
        } finally {
          req.url = oldUrl;
        }
      }

      return send(res, 404, { error: "Ruta no encontrada" });
    } catch (e: any) {
      return send(res, 500, { error: "Error interno", detail: e?.message || String(e) });
    }
  };
})();

const mercadoPagoHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function originFromReq(req: any) {
    const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
    return `${proto}://${host}`;
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  function pickQuery(req: any, key: string) {
    try {
      const u = new URL(req.url, "http://localhost");
      return (u.searchParams.get(key) || "").toString();
    } catch {
      return "";
    }
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin, supabaseUrl, supabaseAnon, supabaseService };
  }

  type PackKey = "inicio" | "productor" | "masterizar";

  const PACKS: Record<PackKey, { title: string; amount_mxn: number; credits: number; songs: number }> = {
    inicio: { title: "Pack Inicio (mensual)", amount_mxn: 350, credits: 1200, songs: 200 },
    productor: { title: "Pack Productor", amount_mxn: 545, credits: 2000, songs: 166 },
    masterizar: { title: "Masterizar Ilimitado", amount_mxn: 150, credits: 0, songs: 0 },
  };

  const MINI_PACK_TX_KIND = "mini_pack";
  function resolveMiniPackFromMetadata(meta: any) {
    const pk = String(meta?.pack_key || meta?.packKey || "").trim().toLowerCase();
    const pid = meta?.pack_id ?? meta?.packId ?? null;
    const byKey = pk ? canonicalCreditPackByKey(pk) : null;
    const byId = !byKey && pid ? canonicalCreditPackById(pid) : null;
    const base: any = byKey || byId || null;
    if (!base) return null;
    return {
      pack_key: String(base.pack_key).toLowerCase(),
      pack_id: Number(base.id) || null,
      title: String(base.name || base.pack_key),
      amount_mxn: Number(base.price_mxn || 0),
      credits: Number(base.credits_amount || 0),
      songs: Number(base.songs || 0),
      validity_days: Number(base.validity_days || 30),
    };
  }
  function validateMiniPackMatchesAmountAndCredits(meta: any, paymentAmountMxn: any) {
    const resolved = resolveMiniPackFromMetadata(meta);
    if (!resolved) return { ok: false as const };
    const expectedAmount = Number(resolved.amount_mxn);
    const expectedCredits = Number(resolved.credits);
    const amountPaid = Number(paymentAmountMxn);
    const metaCredits = Number(meta?.credits ?? 0);
    const metaAmount = Number(meta?.amount_mxn ?? meta?.amountMxn ?? 0);
    const amountTolerance = 0.01;
    const amountOk =
      Number.isFinite(amountPaid) &&
      Number.isFinite(expectedAmount) &&
      expectedAmount > 0 &&
      Math.abs(amountPaid - expectedAmount) <= amountTolerance;
    const amountMetaOk = !Number.isFinite(metaAmount) || metaAmount <= 0
      ? true
      : Math.abs(metaAmount - expectedAmount) <= amountTolerance;
    const creditsOk =
      Number.isFinite(expectedCredits) &&
      expectedCredits >= 0 &&
      (!Number.isFinite(metaCredits) || metaCredits <= 0 || metaCredits === expectedCredits);
    if (!amountOk || !amountMetaOk || !creditsOk) {
      return { ok: false as const };
    }
    return { ok: true as const, ...resolved };
  }

  async function fetchPayment(mpToken: string, paymentId: string) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { authorization: `Bearer ${mpToken}` },
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  }

  async function tryPayAffiliateCommission(admin: any, mpToken: string, paymentId: string, referredUserId: string, packKey: string, amountMxn: number) {
    const amt = Number(amountMxn ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (!referredUserId) return;
    const commission = 100;

    let affiliateUserId = "";
    try {
      const { data: refRows } = await admin.from("affiliate_referrals").select("affiliate_user_id").eq("referred_user_id", referredUserId).limit(1);
      const ref = Array.isArray(refRows) ? refRows[0] : null;
      affiliateUserId = String((ref as any)?.affiliate_user_id || "").trim();
    } catch {
      return;
    }
    if (!affiliateUserId) return;

    try {
      const { data: exists } = await admin.from("affiliate_commissions").select("id").eq("payment_id", paymentId).limit(1);
      if (Array.isArray(exists) && exists.length > 0) return;
    } catch {
      return;
    }

    let affiliateActive = false;
    try {
      const u = await admin.auth.admin.getUserById(affiliateUserId);
      const email = (u as any)?.data?.user?.email || "";
      if (isAdminEmail(email)) {
        affiliateActive = true;
      } else {
        const plan = await getUserPlan(admin, affiliateUserId).catch(() => ({ plan_active: false }));
        affiliateActive = Boolean((plan as any)?.plan_active);
      }
    } catch {
      const plan = await getUserPlan(admin, affiliateUserId).catch(() => ({ plan_active: false }));
      affiliateActive = Boolean((plan as any)?.plan_active);
    }

    let commissionId = "";
    try {
      const ins = await admin.from("affiliate_commissions").insert({
        affiliate_user_id: affiliateUserId,
        referred_user_id: referredUserId,
        payment_id: paymentId,
        pack_key: packKey || null,
        amount_mxn: commission,
        status: affiliateActive ? "pending" : "blocked",
        detail: affiliateActive ? null : "affiliate_inactive",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (ins?.error) return;
      const { data: rows } = await admin.from("affiliate_commissions").select("id").eq("payment_id", paymentId).limit(1);
      commissionId = String((Array.isArray(rows) ? rows[0] : null)?.id || "").trim();
    } catch {
      return;
    }

    if (!affiliateActive) return;

    let payoutEmail = "";
    try {
      const { data: accRows } = await admin.from("affiliate_accounts").select("payout_email").eq("user_id", affiliateUserId).limit(1);
      payoutEmail = String((Array.isArray(accRows) ? accRows[0] : null)?.payout_email || "").trim();
    } catch {}

    if (!payoutEmail) {
      if (commissionId) {
        try {
          await admin.from("affiliate_commissions").update({ status: "pending_destination", updated_at: new Date().toISOString() }).eq("id", commissionId);
        } catch {}
      }
      return;
    }

    try {
      const idem = `aff_${paymentId}_${await randomHex(6)}`;
      const r = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          authorization: `Bearer ${mpToken}`,
          "content-type": "application/json",
          "x-idempotency-key": idem,
        },
        body: JSON.stringify({
          transaction_amount: commission,
          description: "Comisión Afiliados - LucIAna | Music",
          payment_method_id: "account_money",
          operation_type: "money_transfer",
          external_reference: `ramber_aff:${paymentId}`,
          payer: { email: payoutEmail },
        }),
      });
      const out = await r.json().catch(() => ({}));
      const payoutId = (out?.id || "").toString().trim();
      if (r.ok) {
        if (commissionId) {
          await admin
            .from("affiliate_commissions")
            .update({ status: "paid", payout_payment_id: payoutId || null, updated_at: new Date().toISOString(), detail: null })
            .eq("id", commissionId);
        }
        return;
      }
      const detail = (out?.message || out?.error || out?.status || `HTTP ${r.status}`).toString().slice(0, 800);
      if (commissionId) {
        await admin
          .from("affiliate_commissions")
          .update({ status: "failed", updated_at: new Date().toISOString(), detail })
          .eq("id", commissionId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (commissionId) {
        try {
          await admin.from("affiliate_commissions").update({ status: "failed", updated_at: new Date().toISOString(), detail: msg.slice(0, 800) }).eq("id", commissionId);
        } catch {}
      }
    }
  }

  async function handleCreatePreference(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
    if (!mpToken) return send(res, 500, { error: "Falta MERCADO_PAGO_ACCESS_TOKEN en Vercel" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const packKeyRaw = typeof payload?.packKey === "string" ? payload.packKey.trim().toLowerCase() : "";
    const packKey = (packKeyRaw === "inicio" || packKeyRaw === "productor" || packKeyRaw === "masterizar" ? packKeyRaw : "") as PackKey | "";
    if (!packKey) return send(res, 400, { error: "packKey inválido" });
    if (packKey === "productor") {
      return send(res, 400, { error: "El Pack Productor no está disponible por ahora." });
    }

    const pack = PACKS[packKey];
    const origin = originFromReq(req);

    const preferenceBody: any = {
      items: [{ title: "LucIAna Music", quantity: 1, currency_id: "MXN", unit_price: pack.amount_mxn }],
      external_reference: `ramber:${auth.user.id}:${packKey}`,
      metadata: { user_id: auth.user.id, kind: "songs", pack_key: packKey, amount_mxn: pack.amount_mxn, credits: pack.credits, songs: pack.songs },
      back_urls: { success: `${origin}/?mp=success`, failure: `${origin}/?mp=failure`, pending: `${origin}/?mp=pending` },
      auto_return: "approved",
      notification_url: `${origin}/api/mercadopago/webhook`,
    };

    try {
      const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { authorization: `Bearer ${mpToken}`, "content-type": "application/json" },
        body: JSON.stringify(preferenceBody),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) return send(res, 502, { error: "Error creando pago", detail: data || null });

      const initPoint = typeof data?.init_point === "string" ? data.init_point : "";
      if (!initPoint) return send(res, 502, { error: "Respuesta inválida de MercadoPago" });
      return send(res, 200, { init_point: initPoint, preference_id: data?.id || null });
    } catch (e) {
      return send(res, 502, { error: "Error creando pago", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleVerify(req: any, res: any) {
    if (!["GET", "POST"].includes((req.method || "").toUpperCase())) return send(res, 405, { error: "Método no permitido" });

    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
    if (!mpToken) return send(res, 500, { error: "Falta MERCADO_PAGO_ACCESS_TOKEN en Vercel" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req) || {};
    const paymentId =
      (typeof body?.payment_id === "string" ? body.payment_id : "") ||
      (typeof body?.paymentId === "string" ? body.paymentId : "") ||
      pickQuery(req, "payment_id") ||
      pickQuery(req, "paymentId");
    if (!paymentId) return send(res, 400, { error: "Falta payment_id" });

    const { ok, status, data } = await fetchPayment(mpToken, paymentId);
    if (!ok) return send(res, 502, { error: "No pude verificar el pago", code: status, detail: data || null });

    const paymentStatus = (data?.status || "").toString();
    const meta = data?.metadata || {};
    const metaUserId = (meta?.user_id || meta?.userId || "").toString();
    if (metaUserId && metaUserId !== auth.user.id) return send(res, 403, { error: "Pago no pertenece a este usuario" });

    if (paymentStatus !== "approved") return send(res, 200, { ok: true, status: paymentStatus, credited: false });

    const txKind = (meta?.kind || "songs").toString() || "songs";
    const packKey = (meta?.pack_key || meta?.packKey || "").toString();
    const amountMxn = Number(meta?.amount_mxn ?? meta?.amountMxn ?? 0);
    const credits = Number(meta?.credits ?? 0);
    const packIdRaw = meta?.pack_id ?? meta?.packId ?? null;
    const packId = Number.isFinite(Number(packIdRaw)) ? Number(packIdRaw) : null;
    const validityDaysRaw = Number(meta?.validity_days ?? meta?.validityDays);
    const validityDays = Number.isFinite(validityDaysRaw) && validityDaysRaw > 0 ? validityDaysRaw : 30;

    const { data: exists } = await auth.admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
    if (Array.isArray(exists) && exists.length > 0) return send(res, 200, { ok: true, status: paymentStatus, credited: true, already: true });

    const isPlanRenewal = txKind === "songs" && (packKey === "inicio" || packKey === "productor");
    const isMiniPack = txKind === "mini_pack";
    if (Number.isFinite(credits) && credits > 0) {
      if (isMiniPack) {
        await ensureProfileExists(auth.admin, auth.user.id);
        const { data: profile } = await auth.admin.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
        const profileEmail = String((profile as any)?.email || auth.user.email || "").trim().toLowerCase();
        const unlimited = isAdminEmail(profileEmail);
        const profileCredits = creditsFromProfile(profile);
        const batchCredits = await getActiveBatchCredits(auth.admin, auth.user.id);
        const totalBefore = round2(profileCredits + batchCredits);
        const cap = round2(MAX_ACCUMULATED_CREDITS);
        const allowed = unlimited ? round2(credits) : round2(Math.max(0, Math.min(round2(credits), cap - totalBefore)));

        const expiresIso = addDaysIso(60);
        await auth.admin.from("profiles").update({ credits_expires_at: expiresIso }).eq("id", auth.user.id);

        if (allowed > 0) {
          const effectiveDays = 60;
          const batchNote = allowed < credits ? `Compra Mercado Pago ${paymentId} (cap ${MAX_ACCUMULATED_CREDITS})` : `Compra Mercado Pago ${paymentId}`;
          const batchResult = await insertCreditBatch(auth.admin, {
            userId: auth.user.id,
            packId: packId || undefined,
            packKey: packKey || undefined,
            paymentId,
            credits: allowed,
            validityDays: effectiveDays,
            amountMxn,
            note: batchNote,
          });
          if (!batchResult.ok) {
            const upd = await adjustUserCredits(auth.admin, auth.user.id, allowed);
            if (!upd.ok) return send(res, 500, { error: batchResult.error || upd.error || "No pude acreditar créditos" });
          }
        }
      } else if (isPlanRenewal) {
        const upd = await applyCreditRolloverWithCap(auth.admin, {
          userId: auth.user.id,
          monthlyCredits: credits,
          subscriptionActive: true,
          renewalPaidSuccessfully: paymentStatus === "approved",
          isUnlimitedAccount: isAdminEmail(auth.user.email),
        });
        if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });
      } else {
        const upd = await adjustUserCredits(auth.admin, auth.user.id, credits);
        if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });
      }
    }

    await auth.admin.from("mp_transactions").insert({
      user_id: auth.user.id,
      kind: txKind,
      pack_key: packKey || "unknown",
      amount_mxn: Number.isFinite(amountMxn) ? amountMxn : 0,
      payment_id: paymentId,
    });

    await tryPayAffiliateCommission(auth.admin, mpToken, paymentId, auth.user.id, packKey || "", amountMxn);

    return send(res, 200, { ok: true, status: paymentStatus, credited: true });
  }

  async function handleWebhook(req: any, res: any) {
    if (!["POST", "GET"].includes((req.method || "").toUpperCase())) return send(res, 405, { error: "Método no permitido" });

    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
    if (!mpToken) return send(res, 500, { error: "Falta MERCADO_PAGO_ACCESS_TOKEN en Vercel" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });

    const body = parseJsonBody(req) || {};
    const paymentId =
      pickQuery(req, "data.id") ||
      pickQuery(req, "id") ||
      pickQuery(req, "payment_id") ||
      (typeof body?.data?.id === "string" ? body.data.id : "") ||
      (typeof body?.id === "string" ? body.id : "");
    if (!paymentId) return send(res, 200, { ok: true });

    const { ok, status, data } = await fetchPayment(mpToken, paymentId);
    if (!ok) return send(res, 200, { ok: true, code: status });

    const paymentStatus = (data?.status || "").toString();
    if (paymentStatus !== "approved") return send(res, 200, { ok: true, status: paymentStatus });

    const meta = data?.metadata || {};
    const txKind = (meta?.kind || "songs").toString() || "songs";
    const createClient = await getSupabaseCreateClient();
    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

    if (txKind === "share_unlock") {
      const shareId = (meta?.share_id || "").toString();
      const productType = (meta?.product_type || "cancion_generada").toString();
      
      if (!shareId) return send(res, 200, { ok: true, status: paymentStatus, skipped: true });

      const { data: existsTx } = await admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
      if (Array.isArray(existsTx) && existsTx.length > 0) return send(res, 200, { ok: true, status: paymentStatus, already: true });

      const { data: share, error: shareError } = await admin
        .from("preview_shares")
        .select("id, song_id, created_by, is_paid")
        .eq("id", shareId)
        .maybeSingle();
      if (shareError || !share) return send(res, 500, { error: "No pude encontrar el preview share" });
      if (share.is_paid) return send(res, 200, { ok: true, status: paymentStatus, already: true });

      // Mark share as paid
      const paidAt = new Date().toISOString();
      await admin
        .from("preview_shares")
        .update({ is_paid: true, paid_at: paidAt })
        .eq("id", shareId);

      // Get vendor settings for created_by
      const { data: vendorSettings } = await admin
        .from("vendor_settings")
        .select("role")
        .eq("user_id", share.created_by)
        .maybeSingle();
      const role = (vendorSettings as any)?.role || "vendor";

      // Get product pricing
      const { data: pricing } = await admin
        .from("product_pricing")
        .select("unlock_price_mxn, empleado_commission_mxn")
        .eq("product_type", productType)
        .maybeSingle();
      const unlockPrice = Number((pricing as any)?.unlock_price_mxn) || 250;
      const empleadoCommission = Number((pricing as any)?.empleado_commission_mxn) || 50;

      // Create share commission record if role is empleado
      if (role === "empleado") {
        await admin.from("share_commissions").insert({
          share_id: shareId,
          seller_user_id: share.created_by,
          role_at_time: role,
          product_type: productType,
          amount_mxn: empleadoCommission,
          status: "pending",
        });
      }

      // Record transaction
      await admin.from("mp_transactions").insert({
        user_id: null,
        kind: "share_unlock",
        pack_key: productType,
        amount_mxn: unlockPrice,
        payment_id: paymentId,
      });

      return send(res, 200, { ok: true, status: paymentStatus, shareUnlocked: true });
    }

    const userId = (meta?.user_id || meta?.userId || "").toString();
    if (!userId) return send(res, 200, { ok: true, status: paymentStatus, skipped: true });

    const transactionAmountMxn = Number(data?.transaction_amount ?? data?.transactionAmount ?? meta?.amount_mxn ?? meta?.amountMxn ?? NaN);
    const currencyId = String(data?.currency_id || data?.currencyId || "MXN").toUpperCase().trim();
    if (currencyId && currencyId !== "MXN") {
      return send(res, 200, { ok: true, status: paymentStatus, skipped: true, reason: "bad_currency" });
    }
    if (!Number.isFinite(transactionAmountMxn) || transactionAmountMxn <= 0) {
      return send(res, 200, { ok: true, status: paymentStatus, skipped: true, reason: "bad_amount" });
    }

    const { data: exists } = await admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
    if (Array.isArray(exists) && exists.length > 0) return send(res, 200, { ok: true, status: paymentStatus, already: true });

    const packKeyRaw = (meta?.pack_key || meta?.packKey || "").toString();
    const packKey = String(packKeyRaw || "").trim().toLowerCase();
    const metaAmountMxn = Number(meta?.amount_mxn ?? meta?.amountMxn ?? 0);
    const metaCredits = Number(meta?.credits ?? 0);
    const packIdRaw = meta?.pack_id ?? meta?.packId ?? null;
    const packId = Number.isFinite(Number(packIdRaw)) ? Number(packIdRaw) : null;
    const metaValidity = Number(meta?.validity_days ?? meta?.validityDays);
    const validityDays = Number.isFinite(metaValidity) && metaValidity > 0 ? metaValidity : 30;

    const isPlanRenewal = txKind === "songs" && (packKey === "inicio" || packKey === "productor");
    const isMasterizarSubscription = txKind === "songs" && packKey === "masterizar";
    const isMiniPack = txKind === MINI_PACK_TX_KIND;

    const miniValidation = isMiniPack
      ? validateMiniPackMatchesAmountAndCredits(meta, transactionAmountMxn)
      : { ok: false as const };
    if (isMiniPack && !miniValidation.ok) {
      return send(res, 200, { ok: true, status: paymentStatus, skipped: true, reason: "mini_pack_invalid_metadata" });
    }
    const finalMiniPack = isMiniPack && miniValidation.ok ? {
      pack_key: String((miniValidation as any).pack_key || packKey),
      pack_id: Number((miniValidation as any).pack_id || packId || 0) || packId,
      amount_mxn: Number((miniValidation as any).amount_mxn || metaAmountMxn || transactionAmountMxn || 0),
      credits: Number((miniValidation as any).credits || metaCredits || 0),
      songs: Number((miniValidation as any).songs || 0),
      validity_days: Number((miniValidation as any).validity_days || validityDays || 30),
    } : null;

    if (isMiniPack) {
      const credits = Number((finalMiniPack as any).credits || 0);
      const fixedPackKey = String((finalMiniPack as any).pack_key || packKey || "mini_pack");
      const fixedPackId = Number((finalMiniPack as any).pack_id || packId || 0) || null;
      const amountMxn = Number((finalMiniPack as any).amount_mxn || metaAmountMxn || transactionAmountMxn || 0);
      // ========== MINI PAQUETE: crear LOTE independiente con su propia expiración ==========
      if (!Number.isFinite(credits) || credits <= 0) {
        return send(res, 200, { ok: true, status: paymentStatus, skipped: true, reason: "no_credits" });
      }
      await ensureProfileExists(admin, userId);
      const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
      const profileEmail = String((profile as any)?.email || "").trim().toLowerCase();
      const unlimited = isAdminEmail(profileEmail);
      const profileCredits = creditsFromProfile(profile);
      const batchCredits = await getActiveBatchCredits(admin, userId);
      const totalBefore = round2(profileCredits + batchCredits);
      const cap = round2(MAX_ACCUMULATED_CREDITS);
      const allowed = unlimited ? round2(credits) : round2(Math.max(0, Math.min(round2(credits), cap - totalBefore)));

      const expiresIso = addDaysIso(60);
      await admin.from("profiles").update({ credits_expires_at: expiresIso }).eq("id", userId);

      if (allowed > 0) {
        const effectiveDays = 60;
        const batchNote = allowed < credits ? `Compra Mercado Pago ${paymentId} (cap ${MAX_ACCUMULATED_CREDITS})` : `Compra Mercado Pago ${paymentId}`;
        const batchResult = await insertCreditBatch(admin, {
          userId,
          packId: fixedPackId || undefined,
          packKey: fixedPackKey || undefined,
          paymentId,
          credits: allowed,
          validityDays: effectiveDays,
          amountMxn,
          note: batchNote,
        });
        if (!batchResult.ok) {
          const upd = await adjustUserCredits(admin, userId, allowed);
          if (!upd.ok) {
            console.error("[MP Webhook] mini_pack - crédito fallback falló:", batchResult.error || upd.error);
            return send(res, 500, { error: batchResult.error || upd.error || "No pude acreditar créditos" });
          }
        }
      }
    } else if (isPlanRenewal) {
      const planPack = (PACKS as any)[packKey];
      if (planPack && Number(planPack.amount_mxn)) {
        const expected = Number(planPack.amount_mxn);
        if (Math.abs(transactionAmountMxn - expected) > 0.01) {
          return send(res, 200, { ok: true, status: paymentStatus, skipped: true, reason: "plan_bad_amount" });
        }
      }
    } else if (isMasterizarSubscription) {
      if (Math.abs(transactionAmountMxn - Number(PACKS.masterizar.amount_mxn)) > 0.01) {
        return send(res, 200, { ok: true, status: paymentStatus, skipped: true, reason: "master_bad_amount" });
      }
    }

    void packKeyRaw;
    if (isMasterizarSubscription) {
      // Activar suscripción de masterización por 30 días
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 días desde hoy
      
      const { error: updateError } = await admin
        .from('profiles')
        .update({
          mastering_subscription_active: true,
          mastering_subscription_expires_at: expiresAt.toISOString(),
        })
        .eq('id', userId);
      
      if (updateError) {
        console.error('Error al activar suscripción de masterización:', updateError);
        return send(res, 500, { error: 'No pude activar la suscripción' });
      }
    } else if (Number.isFinite(credits) && credits > 0) {
      if (isPlanRenewal) {
        const upd = await applyCreditRolloverWithCap(admin, {
          userId,
          monthlyCredits: credits,
          subscriptionActive: true,
          renewalPaidSuccessfully: paymentStatus === "approved",
        });
        if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });
      } else {
        const upd = await adjustUserCredits(admin, userId, credits);
        if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });
      }
    }

    await admin.from("mp_transactions").insert({
      user_id: userId,
      kind: txKind,
      pack_key: packKey || "unknown",
      amount_mxn: Number.isFinite(amountMxn) ? amountMxn : 0,
      payment_id: paymentId,
    });

    // Solo pagar comisión de afiliado para planes grandes, no mini paquetes
    if (!isMiniPack) {
      await tryPayAffiliateCommission(admin, mpToken, paymentId, userId, packKey || "", amountMxn);
    }

    return send(res, 200, { 
      ok: true, 
      status: paymentStatus, 
      credited: true,
      subscriptionActivated: isMasterizarSubscription,
      mini_pack_created: isMiniPack
    });
  }

  async function handleClaimFree(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    return send(res, 410, { error: "El plan gratis fue desactivado." });
  }

  // =================== NUEVOS: MINI PAQUETES ===================

  /**
   * GET /api/mercadopago/packs
   * Lista los paquetes de créditos disponibles (leyendo de credit_packs).
   * No requiere autenticación para ver catálogo.
   */
  async function handleListPacks(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase." });
    }
    const createClient = await getSupabaseCreateClient();
    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

    try {
      const packs = await listActiveCreditPacks(admin);
      return send(res, 200, { ok: true, packs });
    } catch (e) {
      return send(res, 500, { error: "No pude listar los paquetes.", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  /**
   * POST /api/mercadopago/create-mini-pack-preference
   * Body: { packKey: "mini_3" | "chico_10" | "mediano_30" | "grande_80" }
   * Requiere usuario autenticado.
   * Lee el paquete desde la tabla credit_packs (no hardcodeado).
   */
  async function handleCreateMiniPackPreference(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
    if (!mpToken) return send(res, 500, { error: "Falta MERCADO_PAGO_ACCESS_TOKEN en Vercel" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const packKey = (typeof payload?.packKey === "string" ? payload.packKey.trim() : "") ||
                    (typeof payload?.pack_key === "string" ? payload.pack_key.trim() : "");
    if (!packKey) return send(res, 400, { error: "Falta packKey del paquete." });

    try {
      const canonical = canonicalCreditPackByKey(packKey);
      if (!canonical || Number(canonical.price_mxn || 0) <= 0 || Number(canonical.credits_amount || 0) < 0) {
        return send(res, 404, { error: "Paquete no encontrado o no disponible." });
      }
      const activePackList = await listActiveCreditPacks(auth.admin);
      const active = activePackList.find((p: any) => String((p as any).pack_key || "").trim().toLowerCase() === String(packKey).toLowerCase());
      if (active && (active as any).is_active === false) {
        return send(res, 404, { error: "Paquete no disponible en este momento." });
      }

      const packId = Number(canonical.id ?? 0);
      const credits = round2(Number(canonical.credits_amount ?? 0));
      const songs = Number(canonical.songs ?? 0);
      const validityDays = Number(canonical.validity_days ?? 30);
      const unitPrice = round2(Number(canonical.price_mxn ?? 0));
      const title = String(canonical.name || "Pack de Créditos").slice(0, 200);

      if (credits < 0 || unitPrice <= 0) return send(res, 400, { error: "El paquete tiene precio o créditos inválidos." });

      const origin = originFromReq(req);
      const preferenceBody: any = {
        items: [{ title, quantity: 1, currency_id: "MXN", unit_price: unitPrice }],
        external_reference: `ramber_mp:${auth.user.id}:${String(packKey).toLowerCase()}`,
        metadata: {
          user_id: auth.user.id,
          kind: MINI_PACK_TX_KIND,
          pack_key: String(packKey).toLowerCase(),
          pack_id: packId || null,
          songs: Number.isFinite(songs) ? songs : null,
          amount_mxn: unitPrice,
          credits,
          validity_days: validityDays,
        },
        back_urls: {
          success: `${origin}/?mp=success&pack=${encodeURIComponent(String(packKey).toLowerCase())}`,
          failure: `${origin}/?mp=failure&pack=${encodeURIComponent(String(packKey).toLowerCase())}`,
          pending: `${origin}/?mp=pending&pack=${encodeURIComponent(String(packKey).toLowerCase())}`,
        },
        auto_return: "approved",
        notification_url: `${origin}/api/mercadopago/webhook`,
      };

      const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { authorization: `Bearer ${mpToken}`, "content-type": "application/json" },
        body: JSON.stringify(preferenceBody),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) return send(res, 502, { error: "Error creando pago en Mercado Pago", detail: data || null });

      const initPoint = typeof data?.init_point === "string" ? data.init_point : "";
      if (!initPoint) return send(res, 502, { error: "Respuesta inválida de Mercado Pago" });
      return send(res, 200, {
        ok: true,
        init_point: initPoint,
        preference_id: typeof data?.id === "string" ? data.id : null,
        pack: {
          pack_key: String(packKey).toLowerCase(),
          name: title,
          credits,
          songs,
          validity_days: validityDays,
          price_mxn: unitPrice,
        },
      });
    } catch (e) {
      return send(res, 500, { error: "No pude crear la preferencia de pago.", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  /**
   * POST /api/mercadopago/expire-batches
   * Job diario: marca como expirados los lotes vencidos.
   * Se puede invocar desde un cron externo (Vercel Cron, GitHub Actions, etc).
   * Seguridad básica: requiere header X-Cron-Secret igual a CRON_JOB_SECRET env var,
   * o bien un token de admin con rol service en Supabase.
   */
  async function handleExpireBatches(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const secretFromEnv = (process.env.CRON_JOB_SECRET || process.env.CRON_SECRET || "").toString().trim();
    const providedSecret = (req.headers["x-cron-secret"] || req.headers["x-cron-token"] || "").toString().trim();

    // Seguridad básica: si hay secret configurado, debe coincidir.
    if (secretFromEnv && providedSecret !== secretFromEnv) {
      return send(res, 403, { error: "No autorizado." });
    }

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase." });
    }
    const createClient = await getSupabaseCreateClient();
    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

    try {
      const resultBatches = await expireOverdueBatches(admin);
      if (!resultBatches.ok) return send(res, 500, { error: resultBatches.error || "No pude expirar lotes." });
      const resultWipe = await wipeOverdueFrozenCredits(admin);
      if (!resultWipe.ok) return send(res, 500, { error: resultWipe.error || "No pude borrar saldos vencidos." });
      return send(res, 200, {
        ok: true,
        expired_batches: resultBatches.expired,
        wiped_profiles: resultWipe.wiped,
        at: new Date().toISOString(),
      });
    } catch (e) {
      return send(res, 500, { error: "No pude ejecutar la limpieza diaria.", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  // ===============================================================

  return async function handler(req: any, res: any) {
    const action = (pickQuery(req, "action") || "").trim().toLowerCase() || "";
    const fallback = (() => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const parts = pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => p === "mercadopago");
      const next = i >= 0 ? parts[i + 1] : "";
      return (next || "").toLowerCase();
    })();
    const a = action || fallback;

    if (a === "create-preference") return handleCreatePreference(req, res);
    if (a === "verify") return handleVerify(req, res);
    if (a === "webhook") return handleWebhook(req, res);
    if (a === "claim-free") return handleClaimFree(req, res);

    // Nuevos endpoints mini paquetes
    if (a === "packs") return handleListPacks(req, res);
    if (a === "create-mini-pack-preference") return handleCreateMiniPackPreference(req, res);
    if (a === "expire-batches") return handleExpireBatches(req, res);

    return send(res, 404, { error: "Ruta no encontrada", action: a || null });
  };
})();

const libraryHandler = (() => {
  const TABLE = "library_items";
  const ITEM_TYPE = "song";
  const BUCKET = "ramber-tunes";
  const COVERS_BUCKET = "covers";
  const PUBLIC_TABLE = "public_songs";

  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin, supabaseUrl };
  }

  async function hasPaid(admin: any, userId: string) {
    const { data } = await admin.from("mp_transactions").select("id").eq("user_id", userId).eq("kind", "songs").gt("amount_mxn", 0).limit(1);
    return Array.isArray(data) && data.length > 0;
  }

  function storagePathFromPublicUrl(supabaseUrl: string, bucket: string, url: string) {
    try {
      const u = new URL(url);
      
      // Primero verificar si es una URL de Cloudflare R2
      const r2Pattern = /\.r2\.cloudflarestorage\.com\//;
      if (r2Pattern.test(u.hostname)) {
        // Extraer la ruta después del dominio
        const path = u.pathname.slice(1); // Eliminar el slash inicial
        const decoded = decodeURIComponent(path);
        if (!decoded) return null;
        return decoded;
      }
      
      // Si no es R2, verificar si es una URL de Supabase Storage
      if (!supabaseUrl) return null;
      const supa = new URL(supabaseUrl);
      void supa;
      const marker = `/storage/v1/object/public/${bucket}/`;
      const idx = u.pathname.indexOf(marker);
      if (idx < 0) return null;
      const path = u.pathname.slice(idx + marker.length);
      const decoded = decodeURIComponent(path);
      if (!decoded) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  function shouldDeletePhysicalFile(path: string) {
    return path.startsWith("uploads/") || path.startsWith("personas/");
  }

  async function deletePhysicalFiles(admin: any, supabaseUrl: string, rows: any[]) {
    const r2Paths: string[] = [];
    const supabasePaths: string[] = [];
    
    for (const r of rows) {
      const a = typeof r?.audio_url === "string" ? r.audio_url : "";
      const c = typeof r?.cover_url === "string" ? r.cover_url : "";
      for (const url of [a, c]) {
        if (!url) continue;
        const p = storagePathFromPublicUrl(supabaseUrl, BUCKET, url);
        if (!p) continue;
        if (!shouldDeletePhysicalFile(p)) continue;
        
        // Verificar si es una URL de R2
        if (url.includes('.r2.cloudflarestorage.com')) {
          r2Paths.push(p);
        } else {
          supabasePaths.push(p);
        }
      }
    }
    
    let deletedCount = 0;
    
    // Eliminar archivos de R2
    if (r2Paths.length > 0) {
      const uniqueR2Paths = Array.from(new Set(r2Paths)).filter(Boolean);
      deletedCount += await deleteFromR2(uniqueR2Paths);
    }
    
    // Eliminar archivos de Supabase (para compatibilidad con archivos antiguos)
    if (supabasePaths.length > 0) {
      const uniqueSupabasePaths = Array.from(new Set(supabasePaths)).filter(Boolean);
      const { error } = await admin.storage.from(BUCKET).remove(uniqueSupabasePaths);
      if (!error) deletedCount += uniqueSupabasePaths.length;
    }
    
    return deletedCount;
  }

  function normalizeHttpUrl(url: string) {
    const u = (url || "").toString().trim();
    if (!u) return "";
    if (/^https:\/\//i.test(u)) return u;
    if (/^http:\/\//i.test(u)) return u.replace(/^http:\/\//i, "https://");
    if (/^\/\//.test(u)) return `https:${u}`;
    return u;
  }

  function looksExpiringUrl(url: string) {
    const u = (url || "").toString();
    if (!u) return false;
    if (!u.includes("?")) return false;
    return /[?&](x-amz-signature|x-amz-credential|x-amz-algorithm|x-amz-expires|x-amz-date|expires|signature|token)=/i.test(u);
  }

  function extractR2KeyFromUrlOrKey(raw: string) {
    const s = (raw || "").toString().trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        const host = (u.hostname || "").toLowerCase();
        const isR2 = host.includes(".r2.cloudflarestorage.com") || host.endsWith(".r2.dev");
        if (!isR2) return "";
        return (u.pathname || "").replace(/^\/+/, "");
      } catch {
        return "";
      }
    }
    return s.includes("/") ? s.replace(/^\/+/, "") : "";
  }

  async function sunoFetchJsonLocal(path: string, init?: RequestInit) {
    const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
    const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";
    const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (apiKey && !headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);
    const url = new URL(path, base).toString();
    const res = await fetch(url, { ...init, headers });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { res, data, text };
  }

  function extractBestTrackInfo(providerRaw: any, title: string) {
    const cleanStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim();
    const d = providerRaw?.data || providerRaw?.data?.data || providerRaw;
    const candidates: any[] = [];
    if (Array.isArray(d?.response?.data)) candidates.push(d.response.data);
    if (Array.isArray(d?.response?.sunoData)) candidates.push(d.response.sunoData);
    if (Array.isArray(d?.response)) candidates.push(d.response);
    if (Array.isArray(d?.data)) candidates.push(d.data);
    if (Array.isArray(d?.data?.data)) candidates.push(d.data.data);
    const list = (candidates.find((x) => Array.isArray(x) && x.length) as any[]) || [];

    const pickAudioUrl = (track: any) => {
      const raw =
        track?.audio_url ||
        track?.audioUrl ||
        track?.streamAudioUrl ||
        track?.stream_audio_url ||
        track?.stream_url ||
        track?.url ||
        track?.audio ||
        "";
      const s = cleanStr(raw);
      return /^https?:\/\//i.test(s) || /^\/\//.test(s) ? s : "";
    };
    const pickCoverUrl = (track: any) => {
      const raw =
        track?.image_url ||
        track?.imageUrl ||
        track?.cover_url ||
        track?.coverUrl ||
        track?.img_url ||
        track?.imgUrl ||
        "";
      const s = cleanStr(raw);
      return /^https?:\/\//i.test(s) || /^\/\//.test(s) ? s : "";
    };
    const pickAudioId = (track: any) => cleanStr(track?.id || track?.audio_id || track?.audioId || track?.audioID || "");

    const tracks = (Array.isArray(list) ? list : [])
      .map((track: any) => ({ audioUrl: pickAudioUrl(track), coverUrl: pickCoverUrl(track), audioId: pickAudioId(track) }))
      .filter((x: any) => x.audioUrl || x.coverUrl);
    if (tracks.length === 0) return { audioUrl: "", coverUrl: "", audioId: "" };
    const wantsB = /\sB$/i.test((title || "").toString().trim());
    const chosen = wantsB && tracks.length > 1 ? tracks[1] : tracks[0];
    return { audioUrl: cleanStr(chosen.audioUrl), coverUrl: cleanStr(chosen.coverUrl), audioId: cleanStr(chosen.audioId) };
  }

  async function resolveFreshFromSuno(taskId: string, title: string) {
    const enc = encodeURIComponent(taskId);
    const paths = [
      `/api/v1/generate/record-info?taskId=${enc}`,
      `/api/v1/suno/generate/record-info?taskId=${enc}`,
      `/api/v1/task/${enc}`,
      `/api/v1/suno/task/${enc}`,
    ];
    let last: any = null;
    for (const p of paths) {
      const r = await sunoFetchJsonLocal(p, { method: "GET" });
      last = r;
      if (r?.res?.status !== 404) break;
    }
    const { res: r, data, text } = last || {};
    if (!r || !r.ok) return { ok: false as const, audioUrl: "", coverUrl: "", audioId: "", error: (text || "").slice(0, 500) };
    const code = Number(data?.code);
    if (code && code !== 200) return { ok: false as const, audioUrl: "", coverUrl: "", audioId: "", error: String(data?.msg || "Error del proveedor").slice(0, 500) };
    const best = extractBestTrackInfo(data, title || "");
    const audioUrl = normalizeHttpUrl(best.audioUrl);
    const coverUrl = normalizeHttpUrl(best.coverUrl);
    return { ok: true as const, audioUrl, coverUrl, audioId: best.audioId || "" };
  }

  async function migrateSunoSongsToSunoLinks(admin: any, rows: any[]) {
    const list = Array.isArray(rows) ? rows : [];
    let changed = 0;
    for (const s of list.slice(0, 40)) {
      const sid = String(s?.id || "").trim();
      const taskId = String(s?.suno_task_id || "").trim();
      if (!sid || !taskId) continue;
      const current = String(s?.audio_url || "").trim();
      const currentIsR2 = Boolean(extractR2KeyFromUrlOrKey(current));
      const shouldRefresh = !current || currentIsR2 || looksExpiringUrl(current) || /^http:\/\//i.test(current);
      if (!shouldRefresh) continue;
      const title = String(s?.title || "").trim();
      const fresh = await resolveFreshFromSuno(taskId, title);
      if (!fresh.ok || !fresh.audioUrl) continue;
      const freshIsR2 = Boolean(extractR2KeyFromUrlOrKey(fresh.audioUrl));
      if (freshIsR2) continue;
      const patch: any = { audio_url: fresh.audioUrl.slice(0, 2000) };
      if (fresh.audioId) patch.suno_audio_id = fresh.audioId.slice(0, 200);
      if (fresh.coverUrl) patch.cover_url = fresh.coverUrl.slice(0, 2000);
      const { error } = await admin.from(TABLE).update(patch).eq("id", sid.slice(0, 200)).eq("type", ITEM_TYPE);
      if (error) continue;
      s.audio_url = patch.audio_url;
      if (patch.cover_url) s.cover_url = patch.cover_url;
      if (patch.suno_audio_id) s.suno_audio_id = patch.suno_audio_id;
      changed += 1;
    }
    return changed;
  }

  async function listSongs(admin: any, userId: string, deleted: boolean) {
    const q = admin.from(TABLE).select("*").eq("user_id", userId).eq("type", ITEM_TYPE).order(deleted ? "deleted_at" : "created_at", { ascending: false }).limit(200);
    if (deleted) q.not("deleted_at", "is", null);
    else q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, songs: Array.isArray(data) ? data : [] };
  }

  async function listSongsBasic(admin: any, userId: string, deleted: boolean) {
    const q = admin
      .from(TABLE)
      .select("id,title,description,lyrics,gender,suno_model,audio_url,cover_url,created_at,deleted_at,deleted_reason,suno_task_id,suno_audio_id,is_cover")
      .eq("user_id", userId)
      .eq("type", ITEM_TYPE)
      .order(deleted ? "deleted_at" : "created_at", { ascending: false })
      .limit(200);
    if (deleted) q.not("deleted_at", "is", null);
    else q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, songs: Array.isArray(data) ? data : [] };
  }

  async function getLibraryDebugSummary(admin: any, userId: string) {
    try {
      const activeQ = await admin
        .from(TABLE)
        .select("id,title,created_at", { count: "exact" })
        .eq("user_id", userId)
        .eq("type", ITEM_TYPE)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(3);
      const deletedQ = await admin
        .from(TABLE)
        .select("id,title,deleted_at", { count: "exact" })
        .eq("user_id", userId)
        .eq("type", ITEM_TYPE)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(3);
      const activeCount = Number((activeQ as any)?.count || 0);
      const deletedCount = Number((deletedQ as any)?.count || 0);
      const activeTitles = (Array.isArray((activeQ as any)?.data) ? (activeQ as any).data : []).map((x: any) => String(x?.title || "").slice(0, 40)).filter(Boolean);
      const deletedTitles = (Array.isArray((deletedQ as any)?.data) ? (deletedQ as any).data : []).map((x: any) => String(x?.title || "").slice(0, 40)).filter(Boolean);
      return {
        ok: true as const,
        summary: `Biblioteca debug: activas=${activeCount}, papelera=${deletedCount}${activeTitles.length ? `, recientes=${activeTitles.join(" | ")}` : ""}${deletedTitles.length ? `, borradas=${deletedTitles.join(" | ")}` : ""}`.slice(0, 400),
      };
    } catch (e) {
      return { ok: false as const, summary: `Biblioteca debug: no pude leer el resumen (${e instanceof Error ? e.message : String(e)})`.slice(0, 400) };
    }
  }

  async function handleList(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const deleted = ["1", "true", "yes"].includes((pickQuery(req, "deleted") || "").toLowerCase());
    let auth: any = null;
    try {
      auth = await requireUser(req);
      if (!auth.ok) return send(res, auth.status, { error: auth.error });

      const r = await listSongs(auth.admin, auth.user.id, deleted);
      if (!r.ok) throw new Error(r.error || "No pude listar canciones");

      let publishedBySongId: Record<string, { genre?: string; published_at?: string }> = {};
      try {
        const ids = (Array.isArray(r.songs) ? r.songs : []).map((s: any) => String(s?.id || "").trim()).filter(Boolean);
        if (ids.length > 0) {
          const { data: pubs, error: pubErr } = await auth.admin
            .from(PUBLIC_TABLE)
            .select("song_id, genre, published_at")
            .eq("user_id", auth.user.id)
            .in("song_id", ids)
            .limit(500);
          if (!pubErr && Array.isArray(pubs)) {
            publishedBySongId = pubs.reduce((acc: any, row: any) => {
              const sid = String(row?.song_id || "").trim();
              if (!sid) return acc;
              acc[sid] = {
                genre: typeof row?.genre === "string" ? row.genre : "",
                published_at: typeof row?.published_at === "string" ? row.published_at : "",
              };
              return acc;
            }, {});
          }
        }
      } catch {
        publishedBySongId = {};
      }

      const songs = (Array.isArray(r.songs) ? r.songs : []).map((s: any) => {
        const sid = String(s?.id || "").trim();
        const pub = sid ? publishedBySongId[sid] : null;
        return {
          ...s,
          is_public: Boolean(pub),
          public_genre: pub?.genre || null,
          published_at: pub?.published_at || null,
        };
      });

      const debug = songs.length === 0 ? await getLibraryDebugSummary(auth.admin, auth.user.id) : null;
      return send(res, 200, { songs, cleanup_deleted: 0, debug_summary: debug?.summary || null });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      try {
        const safeAuth = auth?.ok ? auth : await requireUser(req);
        if (!safeAuth?.ok) return send(res, safeAuth?.status || 500, { error: safeAuth?.error || "No autorizado" });
        const basic = await listSongsBasic(safeAuth.admin, safeAuth.user.id, deleted);
        const debug = await getLibraryDebugSummary(safeAuth.admin, safeAuth.user.id);
        if (basic.ok) {
          return send(res, 200, { songs: basic.songs, cleanup_deleted: 0, degraded: true, warning: "fallback_basic_list", detail: detail.slice(0, 300), debug_summary: debug.summary });
        }
        return send(res, 500, { error: "Error cargando canciones", detail: (basic.error || detail).slice(0, 400), debug_summary: debug.summary });
      } catch (fallbackErr) {
        const fallbackDetail = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        return send(res, 500, { error: "Error cargando canciones", detail: `${detail} | fallback: ${fallbackDetail}`.slice(0, 500) });
      }
    }
  }

  async function handleCreate(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "Nueva Canción";
    const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
    const lyrics = typeof body?.lyrics === "string" ? body.lyrics.trim().slice(0, 8000) : null;
    const gender = typeof body?.gender === "string" ? body.gender.trim().slice(0, 20) : null;
    const sunoModelRaw =
      typeof body?.sunoModel === "string"
        ? body.sunoModel
        : typeof body?.suno_model === "string"
          ? body.suno_model
          : null;
    const sunoModel = typeof sunoModelRaw === "string" ? sunoModelRaw.trim().slice(0, 20) : null;
    const audioUrl = typeof body?.audioUrl === "string" ? body.audioUrl.trim().slice(0, 2000) : null;
    const coverUrl = typeof body?.coverUrl === "string" ? body.coverUrl.trim().slice(0, 2000) : null;
    const sunoTaskId = typeof body?.sunoTaskId === "string" ? body.sunoTaskId.trim().slice(0, 200) : null;
    const sunoAudioId = typeof body?.sunoAudioId === "string" ? body.sunoAudioId.trim().slice(0, 200) : null;
    const isCover = Boolean(body?.isCover);

    if (sunoAudioId) {
      const { data: existing } = await auth.admin
        .from(TABLE)
        .select("*")
        .eq("user_id", auth.user.id)
        .eq("type", ITEM_TYPE)
        .eq("suno_audio_id", sunoAudioId)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (existing) {
        try {
          const patch: any = {};
          const prevLyrics = typeof (existing as any)?.lyrics === "string" ? String((existing as any).lyrics || "").trim() : "";
          const prevDesc = typeof (existing as any)?.description === "string" ? String((existing as any).description || "").trim() : "";
          const prevGender = typeof (existing as any)?.gender === "string" ? String((existing as any).gender || "").trim() : "";
          const prevTask = typeof (existing as any)?.suno_task_id === "string" ? String((existing as any).suno_task_id || "").trim() : "";
          const prevCover = typeof (existing as any)?.cover_url === "string" ? String((existing as any).cover_url || "").trim() : "";
          const prevModel = typeof (existing as any)?.suno_model === "string" ? String((existing as any).suno_model || "").trim() : "";

          if (lyrics && !prevLyrics) patch.lyrics = lyrics;
          if (description && !prevDesc) patch.description = description;
          if (gender && !prevGender) patch.gender = gender;
          if (sunoTaskId && !prevTask) patch.suno_task_id = sunoTaskId;
          if (coverUrl && !prevCover) patch.cover_url = coverUrl;
          if (sunoModel && !prevModel) patch.suno_model = sunoModel;

          if (Object.keys(patch).length > 0) {
            const { data: updated, error: upErr } = await auth.admin
              .from(TABLE)
              .update(patch)
              .eq("user_id", auth.user.id)
              .eq("type", ITEM_TYPE)
              .eq("suno_audio_id", sunoAudioId)
              .is("deleted_at", null)
              .select("*")
              .maybeSingle();
            if (upErr && !isMissingColumnError(upErr)) throw upErr;
            if (updated) {
              return send(res, 200, {
                song: updated,
                deleted_oldest: false,
                deleted_id: null,
                deleted_count: 0,
                deleted_titles: [],
                already: true,
              });
            }
          }
        } catch {
        }

        return send(res, 200, {
          song: existing,
          deleted_oldest: false,
          deleted_id: null,
          deleted_count: 0,
          deleted_titles: [],
          already: true,
        });
      }
    }

    // Función para verificar si una URL es de R2
    const isR2Url = (url: string) => {
      try {
        const u = new URL(url);
        const host = (u.hostname || "").toLowerCase();
        return host.includes(".r2.cloudflarestorage.com") || host.endsWith(".r2.dev");
      } catch {
        return false;
      }
    };

    let finalAudioUrl = audioUrl;
    
    // Copiar siempre a R2 cuando la URL original no sea ya de R2,
    // aunque venga firmada, para evitar que expire con el tiempo.
    if (audioUrl && !isR2Url(audioUrl)) {
      console.log(`📦 [handleCreate] Copiando audio a R2: "${title}" (${audioUrl.substring(0, 80)}...)`);
      
      try {
        // Descargar el audio
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 90_000);
        const response = await fetch(audioUrl, { signal: ctrl.signal as any });
        clearTimeout(timer);
        
        if (!response.ok) {
          console.error(`❌ [handleCreate] Error al descargar audio: HTTP ${response.status}`);
          // Continuar con la URL original como fallback
        } else {
          const contentType = (response.headers.get("content-type") || "audio/mpeg").toString().trim();
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // Crear path único en R2
          const safeBase = (sunoAudioId || title || "audio")
            .replace(/[\\/:*?"<>|]+/g, "_")
            .replace(/\s+/g, "_")
            .replace(/[^a-zA-Z0-9._-]+/g, "_")
            .slice(0, 80);
          const path = `imports/${auth.user.id}/${Date.now()}_${safeBase || "audio"}.mp3`;
          
          console.log(`⬆️  [handleCreate] Subiendo audio a R2: ${path} (${buffer.length} bytes, ${contentType})`);
          finalAudioUrl = await uploadToR2(path, buffer, contentType);
          console.log(`✅ [handleCreate] Audio subido a R2: ${finalAudioUrl.substring(0, 100)}...`);
        }
      } catch (uploadError) {
        console.error(`❌ [handleCreate] Error al subir audio a R2:`, uploadError);
        // Usar la URL original como fallback
        console.log(`🔄 [handleCreate] Usando URL original como fallback: ${audioUrl.substring(0, 100)}...`);
      }
    } else if (audioUrl && isR2Url(audioUrl)) {
      console.log(`✅ [handleCreate] Audio ya está en R2: "${title}" (${audioUrl.substring(0, 100)}...)`);
    }

    const insertRow: any = {
      user_id: auth.user.id,
      type: ITEM_TYPE,
      title,
      description: description || null,
      lyrics,
      gender,
      suno_model: sunoModel,
      audio_url: finalAudioUrl,
      cover_url: coverUrl,
      suno_task_id: sunoTaskId,
      suno_audio_id: sunoAudioId,
      is_cover: isCover,
    };

    const { data, error } = await auth.admin.from(TABLE).insert(insertRow).select("*").single();
    if (error) {
      console.error(`❌ [handleCreate] Error al guardar canción en base de datos:`, error);
      try {
        const findExisting = async (query: any) => {
          const { data: existing } = await query.limit(1).maybeSingle();
          return existing || null;
        };

        let recovered: any = null;

        if (sunoAudioId) {
          recovered = await findExisting(
            auth.admin
              .from(TABLE)
              .select("*")
              .eq("user_id", auth.user.id)
              .eq("type", ITEM_TYPE)
              .eq("suno_audio_id", sunoAudioId)
              .is("deleted_at", null)
          );
        }

        if (!recovered && sunoTaskId && finalAudioUrl) {
          recovered = await findExisting(
            auth.admin
              .from(TABLE)
              .select("*")
              .eq("user_id", auth.user.id)
              .eq("type", ITEM_TYPE)
              .eq("suno_task_id", sunoTaskId)
              .eq("audio_url", finalAudioUrl)
              .is("deleted_at", null)
          );
        }

        if (!recovered && finalAudioUrl) {
          recovered = await findExisting(
            auth.admin
              .from(TABLE)
              .select("*")
              .eq("user_id", auth.user.id)
              .eq("type", ITEM_TYPE)
              .eq("title", title)
              .eq("audio_url", finalAudioUrl)
              .is("deleted_at", null)
          );
        }

        if (recovered) {
          console.log(`ℹ️ [handleCreate] La canción ya existía, regresando el registro guardado: ${recovered.id}`);
          return send(res, 200, {
            song: recovered,
            deleted_oldest: false,
            deleted_id: null,
            deleted_count: 0,
            deleted_titles: [],
            already: true,
          });
        }
      } catch (recoverError) {
        console.error(`❌ [handleCreate] No pude recuperar la canción existente tras error de insert:`, recoverError);
      }
      return send(res, 500, { error: "No pude guardar la canción", detail: error.message });
    }

    console.log(`✅ [handleCreate] Canción guardada en base de datos: ${data.id}`);
    return send(res, 200, {
      song: data,
      deleted_oldest: false,
      deleted_id: null,
      deleted_count: 0,
      deleted_titles: [],
    });
  }

  async function handleCreateFromR2(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const keyRaw = typeof body?.key === "string" ? body.key.trim() : "";
    const key = keyRaw.replace(/^\/+/, "").slice(0, 500);
    if (!key) return send(res, 400, { error: "Falta key" });
    const mustPrefix = `uploads/audio/${auth.user.id}/`;
    if (!key.startsWith(mustPrefix)) return send(res, 403, { error: "Key inválida" });

    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "Audio";
    const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
    const coverUrl = typeof body?.coverUrl === "string" ? body.coverUrl.trim().slice(0, 2000) : "";
    const externalId = typeof body?.externalId === "string" ? body.externalId.trim().slice(0, 200) : "";
    const isCover = Boolean(body?.isCover);

    let audioUrl = "";
    try {
      const env = getR2Env();
      audioUrl = `${env.publicBaseUrl}/${key}`;
    } catch (e) {
      return send(res, 500, { error: "Falta configurar Cloudflare R2 en Vercel", detail: e instanceof Error ? e.message : String(e) });
    }

    if (externalId) {
      const { data: existing } = await auth.admin
        .from(TABLE)
        .select("*")
        .eq("user_id", auth.user.id)
        .eq("type", ITEM_TYPE)
        .eq("suno_audio_id", externalId)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (existing) return send(res, 200, { song: existing, already: true });
    }

    const insertRow: any = {
      user_id: auth.user.id,
      type: ITEM_TYPE,
      title,
      description: description || null,
      lyrics: null,
      gender: null,
      audio_url: audioUrl,
      cover_url: coverUrl || null,
      suno_task_id: null,
      suno_audio_id: externalId || null,
      is_cover: isCover,
    };
    const { data, error } = await auth.admin.from(TABLE).insert(insertRow).select("*").single();
    if (error) return send(res, 500, { error: "No pude guardar la canción", detail: error.message });
    return send(res, 200, { song: data, already: false });
  }

  async function handleUploadAudio(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const file = body?.file;
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "Audio";
    const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
    const contentType = typeof body?.contentType === "string" ? body.contentType.trim() : "audio/webm";

    if (!file || !Array.isArray(file)) return send(res, 400, { error: "Falta archivo de audio (array de bytes)" });

    const safeName = (title || "audio")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80);
    const path = `uploads/${auth.user.id}/${Date.now()}_${safeName}.webm`;

    try {
      const buf = Buffer.from(file);
      const audioUrl = await uploadToR2(path, buf, contentType);

      const insertRow: any = {
        user_id: auth.user.id,
        type: ITEM_TYPE,
        title,
        description: description || null,
        lyrics: null,
        gender: null,
        audio_url: audioUrl,
        cover_url: null,
        suno_task_id: null,
        suno_audio_id: null,
        is_cover: false,
      };
      const { data, error } = await auth.admin.from(TABLE).insert(insertRow).select("*").single();
      if (error) return send(res, 500, { error: "No pude guardar la canción", detail: error.message });

      return send(res, 200, { ok: true, url: audioUrl, song: data });
    } catch (e) {
      return send(res, 500, { error: "Error subiendo audio", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleImportAudio(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const sourceUrl = typeof body?.sourceUrl === "string" ? body.sourceUrl.trim().slice(0, 2000) : "";
    if (!/^https?:\/\//i.test(sourceUrl)) return send(res, 400, { error: "Falta sourceUrl (http/https)" });

    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "Audio";
    const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
    const lyrics = typeof body?.lyrics === "string" ? body.lyrics.trim().slice(0, 8000) : "";
    const gender = typeof body?.gender === "string" ? body.gender.trim().slice(0, 120) : "";
    const coverUrl = typeof body?.coverUrl === "string" ? body.coverUrl.trim().slice(0, 2000) : "";
    const externalId = typeof body?.externalId === "string" ? body.externalId.trim().slice(0, 200) : "";
    const sunoTaskId = typeof body?.sunoTaskId === "string" ? body.sunoTaskId.trim().slice(0, 200) : null;

    const looksExpiringUrl = (url: string) => {
      const u = (url || "").toString();
      if (!u) return false;
      if (!u.includes("?")) return false;
      return /[?&](x-amz-signature|x-amz-credential|x-amz-algorithm|x-amz-expires|x-amz-date|expires|signature|token)=/i.test(u);
    };
    const isR2Url = (url: string) => {
      try {
        const u = new URL(url);
        const host = (u.hostname || "").toLowerCase();
        return host.includes(".r2.cloudflarestorage.com") || host.endsWith(".r2.dev");
      } catch {
        return false;
      }
    };
    const shouldCopyToR2 = (() => {
      const u = sourceUrl.toLowerCase();
      
      // 1. Si ya es una URL de R2, no copiar
      if (isR2Url(sourceUrl)) return false;
      
      // 2. SIEMPRE copiar a R2 para garantizar almacenamiento permanente
      // Esto incluye:
      // - URLs de Suno (cdn.suno.ai, suno.ai, firebasestorage.googleapis.com)
      // - URLs de servicios temporales (tempfile.aiquickdraw.com, musicfile.removeai.ai)
      // - URLs de Supabase Storage (públicas o firmadas)
      // - URLs que parecen expirar
      // - Cualquier otra URL HTTP/HTTPS
      
      console.log(`📦 Copiando audio a R2: "${title}" (${sourceUrl.substring(0, 80)}...)`);
      return true;
    })();

    if (externalId) {
      const { data: existing } = await auth.admin
        .from(TABLE)
        .select("*")
        .eq("user_id", auth.user.id)
        .eq("type", ITEM_TYPE)
        .eq("suno_audio_id", externalId)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (existing) return send(res, 200, { song: existing, already: true });
    }

    if (!shouldCopyToR2) {
      console.log(`✅ Audio ya está en R2: "${title}" (${sourceUrl.substring(0, 100)}...)`);
      
      const insertRow: any = {
        user_id: auth.user.id,
        type: ITEM_TYPE,
        title,
        description: description || null,
        lyrics: lyrics || null,
        gender: gender || null,
        audio_url: sourceUrl,
        cover_url: coverUrl || null,
        suno_task_id: sunoTaskId,
        suno_audio_id: externalId || null,
        is_cover: false,
      };
      const { data: created, error: createErr } = await auth.admin.from(TABLE).insert(insertRow).select("*").single();
      if (createErr) {
        console.error(`❌ Error al guardar canción en base de datos:`, createErr);
        return send(res, 500, { error: "No pude guardar la canción", detail: createErr.message });
      }
      console.log(`✅ Canción guardada en base de datos: ${created.id}`);
      return send(res, 200, { song: created, already: false, stored: "link" });
    }

    const safeBase = (externalId || title || "audio")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80);
    const path = `imports/${auth.user.id}/${Date.now()}_${safeBase || "audio"}.mp3`;

    let buf: any = null;
    let contentType = "audio/mpeg";
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90_000);
      const r = await fetch(sourceUrl, { signal: ctrl.signal as any });
      clearTimeout(timer);
      if (!r.ok) return send(res, 502, { error: "No pude descargar el audio", detail: `HTTP ${r.status}` });
      const ct = (r.headers.get("content-type") || "").toString().trim();
      if (ct) contentType = ct.slice(0, 120);
      const lenRaw = (r.headers.get("content-length") || "").toString().trim();
      const len = lenRaw ? Number(lenRaw) : NaN;
      if (Number.isFinite(len) && len > 35 * 1024 * 1024) return send(res, 413, { error: "El archivo es demasiado grande" });
      const ab = await r.arrayBuffer();
      if (ab.byteLength > 35 * 1024 * 1024) return send(res, 413, { error: "El archivo es demasiado grande" });
      buf = Buffer.from(ab);
    } catch (e) {
      return send(res, 502, { error: "No pude descargar el audio", detail: e instanceof Error ? e.message : String(e) });
    }

    let audioUrl = "";
    try {
      console.log(`⬆️  Subiendo audio a R2: ${path} (${buf.length} bytes, ${contentType})`);
      audioUrl = await uploadToR2(path, buf, contentType);
      console.log(`✅ Audio subido a R2: ${audioUrl.substring(0, 100)}...`);
    } catch (uploadError) {
      console.error(`❌ Error al subir audio a R2:`, uploadError);
      // Intentar guardar con la URL original como fallback
      console.log(`🔄 Usando URL original como fallback: ${sourceUrl.substring(0, 100)}...`);
      audioUrl = sourceUrl;
    }

    const insertRow: any = {
      user_id: auth.user.id,
      type: ITEM_TYPE,
      title,
      description: description || null,
      lyrics: lyrics || null,
      gender: gender || null,
      audio_url: audioUrl,
      cover_url: coverUrl || null,
      suno_task_id: sunoTaskId,
      suno_audio_id: externalId || null,
      is_cover: false,
    };
    const { data, error } = await auth.admin.from(TABLE).insert(insertRow).select("*").single();
    if (error) return send(res, 500, { error: "No pude guardar la canción", detail: error.message });
    return send(res, 200, { song: data, already: false });
  }

  async function handleZipStems(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
    const title = (rawTitle || "stems").slice(0, 120);
    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const items = rawItems
      .map((x: any) => ({
        label: typeof x?.label === "string" ? x.label.trim().slice(0, 120) : "",
        url: typeof x?.url === "string" ? x.url.trim().slice(0, 2000) : "",
      }))
      .filter((x: any) => x.label && /^https?:\/\//i.test(x.url));

    if (items.length === 0) return send(res, 400, { error: "No hay pistas para comprimir" });
    if (items.length > 40) return send(res, 413, { error: "Demasiadas pistas para comprimir" });

    const sanitize = (s: string) =>
      (s || "")
        .toString()
        .replace(/[\\/:*?"<>|]+/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);

    const extFromContentType = (ct: string) => {
      const v = (ct || "").toLowerCase();
      if (v.includes("wav")) return "wav";
      if (v.includes("mp3") || v.includes("mpeg")) return "mp3";
      if (v.includes("ogg")) return "ogg";
      if (v.includes("aac")) return "aac";
      if (v.includes("m4a") || v.includes("mp4")) return "m4a";
      return "mp3";
    };

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();

    let skipped = 0;
    let totalBytes = 0;
    const maxTotalBytes = 150 * 1024 * 1024;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 120_000);
        const r = await fetch(it.url, { signal: ctrl.signal as any });
        clearTimeout(timer);
        if (!r.ok) {
          skipped++;
          continue;
        }
        const ct = (r.headers.get("content-type") || "").toString().trim();
        const ab = await r.arrayBuffer();
        const size = ab.byteLength || 0;
        if (size <= 0) {
          skipped++;
          continue;
        }
        totalBytes += size;
        if (totalBytes > maxTotalBytes) return send(res, 413, { error: "El ZIP es demasiado grande" });
        const ext = extFromContentType(ct);
        const fileName = sanitize(`${title} - ${it.label}.${ext}`) || `stem_${i + 1}.${ext}`;
        zip.file(fileName, Buffer.from(ab));
      } catch {
        skipped++;
      }
    }

    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    res.statusCode = 200;
    res.setHeader("content-type", "application/zip");
    res.setHeader("content-disposition", `attachment; filename="${sanitize(title) || "stems"}.zip"`);
    res.setHeader("x-ramber-zip-skipped", String(skipped));
    res.end(buf);
  }

  async function handleDelete(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return send(res, 400, { error: "Falta id" });

    // Verificar si el usuario es administrador
    const isAdmin = isAdminEmail(auth.user.email);
    
    let existingQuery = auth.admin
      .from(TABLE)
      .select("id, deleted_at")
      .eq("id", id)
      .eq("type", ITEM_TYPE);

    if (!isAdmin) {
      existingQuery = existingQuery.eq("user_id", auth.user.id);
    }

    const { data: existing, error: findErr } = await existingQuery.maybeSingle();
    if (findErr) return send(res, 500, { error: "No pude validar la canción", detail: findErr.message });
    if (!existing) return send(res, 404, { error: "Canción no encontrada" });
    if ((existing as any).deleted_at) {
      return send(res, 200, { ok: true, already: true });
    }

    let query = auth.admin.from(TABLE).update({
      deleted_at: new Date().toISOString(),
      deleted_reason: "user_deleted"
    }).eq("id", id).eq("type", ITEM_TYPE);

    if (!isAdmin) {
      query = query.eq("user_id", auth.user.id);
    }

    const { error } = await query;
    if (error) return send(res, 500, { error: "No pude eliminar", detail: error.message });
    return send(res, 200, { ok: true });
  }

  async function handleRestore(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return send(res, 400, { error: "Falta id" });

    // Verificar si el usuario es administrador
    const isAdmin = isAdminEmail(auth.user.email);
    
    // Construir la consulta base
    let query = auth.admin.from(TABLE).update({ 
      deleted_at: null, 
      deleted_reason: null 
    }).eq("id", id).eq("type", ITEM_TYPE);
    
    // Si no es administrador, solo puede restaurar sus propias canciones
    if (!isAdmin) {
      query = query.eq("user_id", auth.user.id);
    }
    
    const { error } = await query;
    if (error) return send(res, 500, { error: "No pude recuperar", detail: error.message });

    return send(res, 200, {
      ok: true,
      deleted_oldest: false,
      deleted_id: null,
      deleted_count: 0,
      deleted_titles: [],
    });
  }

  async function handlePurge(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const id = typeof body?.id === "string" ? body.id.trim().slice(0, 200) : "";
    if (!id) return send(res, 400, { error: "Falta id" });

    const { data: song, error } = await auth.admin
      .from(TABLE)
      .select("id, user_id, deleted_at, type, audio_url, cover_url")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("type", ITEM_TYPE)
      .maybeSingle();
    if (error) return send(res, 500, { error: "No pude buscar la canción", detail: error.message });
    if (!song) return send(res, 404, { error: "Canción no encontrada" });
    if (!(song as any).deleted_at) return send(res, 400, { error: "Primero elimínala (Papelera) y luego elimínala definitivamente." });

    try {
      await auth.admin.from(PUBLIC_TABLE).delete().eq("user_id", auth.user.id).eq("song_id", id);
    } catch {
    }
    try {
      await auth.admin.from("profile_pins").delete().eq("user_id", auth.user.id).eq("song_id", id);
    } catch {
    }

    let filesDeleted = 0;
    try {
      filesDeleted = await deletePhysicalFiles(auth.admin, auth.supabaseUrl, [song]);
    } catch {
      filesDeleted = 0;
    }

    const { error: delErr } = await auth.admin.from(TABLE).delete().eq("id", id).eq("user_id", auth.user.id).eq("type", ITEM_TYPE);
    if (delErr) return send(res, 500, { error: "No pude eliminar definitivamente", detail: delErr.message });

    return send(res, 200, { ok: true, files_deleted: filesDeleted });
  }

  async function handleUpdateAudio(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const audioUrl = typeof body?.audioUrl === "string" ? body.audioUrl.trim().slice(0, 2000) : "";
    const sunoTaskId = typeof body?.sunoTaskId === "string" ? body.sunoTaskId.trim().slice(0, 200) : "";
    const sunoAudioId = typeof body?.sunoAudioId === "string" ? body.sunoAudioId.trim().slice(0, 200) : "";

    if (!id) return send(res, 400, { error: "Falta id" });
    if (!audioUrl || !(audioUrl.startsWith("http://") || audioUrl.startsWith("https://"))) {
      return send(res, 400, { error: "audioUrl inválido" });
    }

    const patch: any = { audio_url: audioUrl };
    if (sunoTaskId) patch.suno_task_id = sunoTaskId;
    if (sunoAudioId) patch.suno_audio_id = sunoAudioId;

    const { data, error } = await auth.admin
      .from(TABLE)
      .update(patch)
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("type", ITEM_TYPE)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) return send(res, 500, { error: "No pude actualizar audio", detail: error.message });
    if (!data) return send(res, 404, { error: "Canción no encontrada" });
    return send(res, 200, { ok: true, song: data });
  }

  async function handleUpdateLyrics(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const lyrics = typeof body?.lyrics === "string" ? body.lyrics.trim().slice(0, 8000) : "";
    if (!id) return send(res, 400, { error: "Falta id" });
    if (!lyrics) return send(res, 400, { error: "Falta lyrics" });

    const { data, error } = await auth.admin
      .from(TABLE)
      .update({ lyrics })
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("type", ITEM_TYPE)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) return send(res, 500, { error: "No pude actualizar letra", detail: error.message });
    if (!data) return send(res, 404, { error: "Canción no encontrada" });
    return send(res, 200, { ok: true, song: data });
  }

  async function handleUpdateTitle(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 100) : "";
    if (!id) return send(res, 400, { error: "Falta id" });
    if (!title) return send(res, 400, { error: "Falta title" });

    const { data, error } = await auth.admin
      .from(TABLE)
      .update({ title })
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("type", ITEM_TYPE)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) return send(res, 500, { error: "No pude actualizar nombre", detail: error.message });
    if (!data) return send(res, 404, { error: "Canción no encontrada" });
    return send(res, 200, { ok: true, song: data });
  }

  function safeFileBase(nameRaw: string) {
    const name = (nameRaw || "").toString().trim() || "cover";
    const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
    const cleaned = base.replaceAll(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
    return cleaned || "cover";
  }

  function isHttpUrl(url: string) {
    return /^https?:\/\//i.test((url || "").toString().trim());
  }

  function isDataImage(url: string) {
    return /^data:image\//i.test((url || "").toString().trim());
  }

  function isR2Url(url: string) {
    try {
      const u = new URL(url);
      const host = (u.hostname || "").toLowerCase();
      return host.includes(".r2.cloudflarestorage.com") || host.endsWith(".r2.dev");
    } catch {
      return false;
    }
  }

  function extFromCover(contentTypeRaw: string, urlHint: string) {
    const ct = (contentTypeRaw || "").toString().toLowerCase().trim();
    if (ct.includes("image/png")) return { ext: "png", contentType: "image/png" };
    if (ct.includes("image/webp")) return { ext: "webp", contentType: "image/webp" };
    if (ct.includes("image/jpeg") || ct.includes("image/jpg")) return { ext: "jpg", contentType: "image/jpeg" };
    const u = (urlHint || "").toString().toLowerCase();
    if (u.includes(".png")) return { ext: "png", contentType: "image/png" };
    if (u.includes(".webp")) return { ext: "webp", contentType: "image/webp" };
    return { ext: "jpg", contentType: "image/jpeg" };
  }

  async function mirrorCoverToR2(userId: string, songId: string, coverUrl: string, fileNameHint: string) {
    const u = (coverUrl || "").toString().trim();
    if (!userId || !songId || !u) return "";
    if (!isHttpUrl(u)) return "";
    if (isDataImage(u)) return "";
    if (isR2Url(u)) return "";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const r = await fetch(u, { method: "GET", signal: ctrl.signal as any });
      if (!r.ok) return "";
      const ctRaw = (r.headers.get("content-type") || "").toString().slice(0, 120);
      const { ext, contentType } = extFromCover(ctRaw, u);
      const lenRaw = (r.headers.get("content-length") || "").toString().trim();
      const len = lenRaw ? Number(lenRaw) : NaN;
      if (Number.isFinite(len) && len > 8 * 1024 * 1024) return "";
      const ab = await r.arrayBuffer();
      if ((ab?.byteLength || 0) <= 0) return "";
      if (ab.byteLength > 8 * 1024 * 1024) return "";
      const buf = Buffer.from(ab);
      const path = `covers/${userId}/${songId}/${Date.now()}_${safeFileBase(fileNameHint)}.${ext}`.slice(0, 500);
      const finalCt = ctRaw && ctRaw.toLowerCase().startsWith("image/") ? ctRaw : contentType;
      return await uploadToR2(path, buf, finalCt);
    } catch {
      return "";
    } finally {
      clearTimeout(timer);
    }
  }

  function parseBase64Data(raw: string) {
    const s = (raw || "").toString().trim();
    if (!s) return null;
    if (s.startsWith("data:")) {
      const comma = s.indexOf(",");
      if (comma < 0) return null;
      const meta = s.slice(5, comma);
      const b64 = s.slice(comma + 1);
      const mime = meta.split(";")[0] || "";
      return { base64: b64, mime: mime || "" };
    }
    return { base64: s, mime: "" };
  }

  async function ensureCoversBucket(admin: any) {
    try {
      if (!admin?.storage) return;
      const getBucket = (admin.storage as any).getBucket;
      const createBucket = (admin.storage as any).createBucket;
      if (typeof getBucket === "function") {
        const r = await getBucket.call(admin.storage, COVERS_BUCKET);
        if (!r?.error) return;
      }
      if (typeof createBucket === "function") {
        await createBucket.call(admin.storage, COVERS_BUCKET, { public: true });
      }
    } catch {
    }
  }

  async function handleSetCover(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const id = typeof body?.id === "string" ? body.id.trim() : "";
    let base64DataRaw = typeof body?.base64Data === "string" ? body.base64Data : "";
    let fileUrlRaw = typeof body?.fileUrl === "string" ? body.fileUrl.trim() : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "cover.jpg";
    if (!id) return send(res, 400, { error: "Falta id" });
    if (!base64DataRaw && !fileUrlRaw) return send(res, 400, { error: "Falta base64Data o fileUrl" });

    const { data: row, error: rowErr } = await auth.admin
      .from(TABLE)
      .select("id, user_id, type, deleted_at")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("type", ITEM_TYPE)
      .maybeSingle();
    if (rowErr) return send(res, 500, { error: "No pude validar la canción", detail: rowErr.message });
    if (!row || row.deleted_at) return send(res, 404, { error: "Canción no encontrada" });

    if (!base64DataRaw && fileUrlRaw && isDataImage(fileUrlRaw)) {
      base64DataRaw = fileUrlRaw;
      fileUrlRaw = "";
    }

    if (!base64DataRaw && fileUrlRaw && isR2Url(fileUrlRaw)) {
      const { error: updErr } = await auth.admin
        .from(TABLE)
        .update({ cover_url: fileUrlRaw })
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .eq("type", ITEM_TYPE);
      if (updErr) return send(res, 500, { error: "No pude actualizar la canción", detail: updErr.message });
      return send(res, 200, { ok: true, coverUrl: fileUrlRaw });
    }

    if (!base64DataRaw && fileUrlRaw) {
      if (!isHttpUrl(fileUrlRaw)) return send(res, 400, { error: "fileUrl inválido" });
      const mirrored = await mirrorCoverToR2(auth.user.id, id, fileUrlRaw, fileName || "cover.jpg");
      if (!mirrored) return send(res, 400, { error: "No pude descargar la imagen" });

      const { error: updErr } = await auth.admin
        .from(TABLE)
        .update({ cover_url: mirrored })
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .eq("type", ITEM_TYPE);
      if (updErr) return send(res, 500, { error: "No pude actualizar la canción", detail: updErr.message });

      return send(res, 200, { ok: true, coverUrl: mirrored });
    }

    const base64Parsed = parseBase64Data(base64DataRaw);
    if (!base64Parsed) return send(res, 400, { error: "base64Data inválido" });

    let buf: Buffer | null = null;
    try {
      const b = Buffer.from(base64Parsed.base64, "base64");
      if (b && b.length > 0) buf = b;
    } catch {
      buf = null;
    }
    if (!buf || buf.length === 0) return send(res, 400, { error: "No pude procesar la imagen" });
    if (buf.length > 25_000_000) return send(res, 413, { error: "La imagen está muy pesada. Usa una foto más pequeña." });

    const { ext, contentType } = extFromCover(base64Parsed.mime || "", fileName || "");
    const path = `covers/${auth.user.id}/${id}/${Date.now()}_${safeFileBase(fileName)}.${ext}`.slice(0, 500);
    const coverUrl = await uploadToR2(path, buf, contentType);

    const { error: updErr } = await auth.admin
      .from(TABLE)
      .update({ cover_url: coverUrl })
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("type", ITEM_TYPE);
    if (updErr) return send(res, 500, { error: "No pude actualizar la canción", detail: updErr.message });

    return send(res, 200, { ok: true, coverUrl });
  }

  async function handleChargeDownload(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const id = typeof body?.id === "string" ? body.id.trim().slice(0, 200) : "";
    if (!id) return send(res, 400, { error: "Falta id" });

    const { data: song, error } = await auth.admin
      .from(TABLE)
      .select("id, user_id, deleted_at, type, suno_audio_id")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("type", ITEM_TYPE)
      .maybeSingle();
    if (error) return send(res, 500, { error: "No pude buscar la canción", detail: error.message });
    if (!song || (song as any).deleted_at) return send(res, 404, { error: "Canción no encontrada" });

    const externalId = String((song as any).suno_audio_id || "").trim();
    const isVoiceCover = /^rvc_/i.test(externalId);
    if (!isVoiceCover) return send(res, 200, { ok: true, charged: false });

    const isAdmin = isAdminEmail(auth.user.email);
    if (isAdmin) return send(res, 200, { ok: true, charged: false, is_admin: true });

    const cost = CREDIT_COSTS.clone_voice || 10;
    const consumed = await consumeUserCredits(auth.admin, auth.user.id, cost);
    if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar.", charged: false });
    return send(res, 200, { ok: true, charged: true, cost, credits: consumed.credits });
  }

  return async function handler(req: any, res: any) {
    const action = (pickQuery(req, "action") || "").trim().toLowerCase() || "";
    const fallback = (() => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const parts = pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => p === "library");
      const next = i >= 0 ? parts[i + 1] : "";
      return (next || "").toLowerCase();
    })();
    const a = action || fallback || "list";

    if (a === "list") return handleList(req, res);
    if (a === "create") return handleCreate(req, res);
    if (a === "create-from-r2") return handleCreateFromR2(req, res);
    if (a === "import-audio") return handleImportAudio(req, res);
    if (a === "zip-stems") return handleZipStems(req, res);
    if (a === "delete") return handleDelete(req, res);
    if (a === "restore") return handleRestore(req, res);
    if (a === "purge") return handlePurge(req, res);
    if (a === "update-audio") return handleUpdateAudio(req, res);
    if (a === "update-lyrics") return handleUpdateLyrics(req, res);
    if (a === "update-title") return handleUpdateTitle(req, res);
    if (a === "set-cover") return handleSetCover(req, res);
    if (a === "charge-download") return handleChargeDownload(req, res);

    return send(res, 404, { error: "Ruta no encontrada", action: a || null });
  };
})();

const masteringHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function safeFileBase(name: string) {
    const s = (name || "").toString().trim().replaceAll("\\", "/").split("/").pop() || "audio";
    const noExt = s.includes(".") ? s.slice(0, s.lastIndexOf(".")) : s;
    return noExt.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 90) || "audio";
  }

  async function requireUser(req: any) {
    const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
    const supabaseAnon = (process.env.SUPABASE_ANON_KEY || "").toString().trim();
    const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = (req.headers.authorization || "").toString();
    const bearerToken = token.toLowerCase().startsWith("bearer ") ? token.slice(7).trim() : "";
    if (!bearerToken) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearerToken);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  async function headR2Object(key: string) {
    const env = getR2Env();
    const client = await getR2Client();
    const { HeadObjectCommand } = await getR2AwsSdk();
    const head = await client.send(new HeadObjectCommand({ Bucket: env.bucketName, Key: key }));
    const contentLength = Number((head as any)?.ContentLength ?? NaN);
    const contentType = String((head as any)?.ContentType || "").split(";")[0].trim();
    return { contentLength, contentType };
  }

  async function runMasteringLocal(inputSignedUrl: string, outKey: string) {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const ffmpegInstaller: any = await import("@ffmpeg-installer/ffmpeg");
    const ffmpegMod: any = await import("fluent-ffmpeg");
    const ffmpeg = ffmpegMod?.default || ffmpegMod;
    if (typeof ffmpeg?.setFfmpegPath === "function" && ffmpegInstaller?.path) {
      ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    }

    const tmpDir = os.tmpdir();
    const base = Math.random().toString(36).slice(2, 10);
    const inPath = path.join(tmpDir, `master_in_${Date.now()}_${base}.mp3`);
    const outPath = path.join(tmpDir, `master_out_${Date.now()}_${base}.mp3`);

    const downloaded = await fetchUrlToBuffer(inputSignedUrl);
    await fs.writeFile(inPath, downloaded.buf);

    await new Promise<void>((resolve, reject) => {
      try {
        ffmpeg(inPath)
          .outputOptions(["-af", "loudnorm=I=-14:TP=-1.0:LRA=11"])
          .format("mp3")
          .on("end", () => resolve())
          .on("error", (err: any) => reject(err instanceof Error ? err : new Error(String(err))))
          .save(outPath);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });

    const outBuf = await fs.readFile(outPath);
    await uploadToR2(outKey, outBuf, "audio/mpeg");
    try {
      await fs.unlink(inPath);
    } catch {
    }
    try {
      await fs.unlink(outPath);
    } catch {
    }
  }

  async function runMasteringWithWorker(params: { workerUrl: string; inputUrl: string; outputPutUrl: string }) {
    const workerUrl = params.workerUrl.replace(/\/+$/, "");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10 * 60 * 1000);
    const r = await fetch(workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inputUrl: params.inputUrl,
        outputUploadUrl: params.outputPutUrl,
        ffmpegArgs: ["-af", "loudnorm=I=-14:TP=-1.0:LRA=11"],
      }),
      signal: ctrl.signal as any,
    }).finally(() => clearTimeout(timer));
    const out = await r.json().catch(() => ({}));
    if (!r.ok || out?.ok === false) {
      const msg = String(out?.error || out?.detail || `HTTP ${r.status}`);
      throw new Error(msg || "No pude masterizar en el worker");
    }
    return true;
  }

  return async function handler(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    const u = new URL(req.url, "http://localhost");
    const parts = u.pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "mastering") return send(res, 404, { error: "Ruta no encontrada" });
    if (next !== "masterize") return send(res, 404, { error: "Ruta no encontrada" });
    if (method !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const inputKey = String(body?.inputKey || body?.key || "").trim().replace(/^\/+/, "").slice(0, 500);
    const uid = String(auth.user.id || "").trim();
    const mustPrefix = `uploads/audio/${uid}/`;
    if (!inputKey) return send(res, 400, { error: "Falta inputKey" });
    if (!inputKey.startsWith(mustPrefix)) return send(res, 403, { error: "Archivo inválido" });

    const titleRaw = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
    const titleBase = titleRaw || safeFileBase(inputKey);
    const cost = CREDIT_COSTS.mastering || 10;

    const isAdmin = isAdminEmail(auth.user.email);
    if (!isAdmin) {
      const prof = await auth.admin.from("profiles").select("*").eq("id", uid).maybeSingle();
      if (prof.error) return send(res, 500, { error: "No pude validar tus créditos", detail: prof.error.message });
      const current = creditsFromProfile(prof.data);
      if (current < cost) {
        return send(res, 402, { error: "Créditos insuficientes. Necesitas 10 créditos para masterizar.", credits: current, cost });
      }
    }

    const lowerKey = inputKey.toLowerCase();
    const looksMp3 = lowerKey.endsWith(".mp3");
    let headInfo: any = null;
    try {
      headInfo = await headR2Object(inputKey);
    } catch {
      headInfo = null;
    }
    const ct = String(headInfo?.contentType || "").toLowerCase();
    const isMp3ByType = ct.includes("audio/mpeg") || ct.includes("audio/mp3") || ct.includes("mpeg");
    if (!looksMp3 && !isMp3ByType) {
      return send(res, 400, {
        error: "El archivo debe ser MP3.",
        converterUrl: "https://online-audio-converter.com/sp/",
      });
    }

    const rand = Math.random().toString(36).slice(2, 10);
    const outKey = `uploads/audio/${uid}/${Date.now()}_${rand}_${safeFileBase(titleBase)}_masterizada.mp3`.slice(0, 500);

    try {
      const workerUrl = (process.env.MASTERING_WORKER_URL || "").toString().trim();
      const allowLocalFallback = ["1", "true", "yes", "on"].includes((process.env.MASTERING_ALLOW_LOCAL_FALLBACK || "").toString().trim().toLowerCase());
      const inputUrl = await getSignedR2Url(inputKey, 60 * 60);
      const outputPutUrl = await getSignedR2PutUrl(outKey, "audio/mpeg", 60 * 10);

      if (workerUrl) {
        try {
          await runMasteringWithWorker({ workerUrl, inputUrl, outputPutUrl });
        } catch (workerError) {
          if (!allowLocalFallback) {
            throw new Error(`Falló el worker de masterización del VPS. ${(workerError instanceof Error ? workerError.message : String(workerError)) || "Error desconocido"}`);
          }

          const contentLength = Number(headInfo?.contentLength ?? NaN);
          const maxInline = 15 * 1024 * 1024;
          if (Number.isFinite(contentLength) && contentLength > maxInline) {
            throw new Error("Falló el worker del VPS y el respaldo local en Vercel está limitado para archivos grandes.");
          }
          await runMasteringLocal(inputUrl, outKey);
        }
      } else {
        if (!allowLocalFallback) {
          return send(res, 503, {
            error: "Masterizar requiere tu worker del VPS.",
            detail: "Configura MASTERING_WORKER_URL en Vercel para usar el procesamiento en Hostinger. El modo local en Vercel está desactivado.",
          });
        }

        const contentLength = Number(headInfo?.contentLength ?? NaN);
        const maxInline = 15 * 1024 * 1024;
        if (Number.isFinite(contentLength) && contentLength > maxInline) {
          return send(res, 413, {
            error: "Ese MP3 está muy pesado para masterizar en Vercel.",
            detail: "Configura MASTERING_WORKER_URL en tu VPS (Hostinger) o deja activo el worker principal.",
            bytes: contentLength,
          });
        }
        await runMasteringLocal(inputUrl, outKey);
      }

      const env = getR2Env();
      const audioUrl = `${env.publicBaseUrl}/${outKey}`;
      const TABLE = "library_items";
      const insertRow: any = {
        user_id: uid,
        type: "song",
        title: `${titleBase} (Masterizada)`.slice(0, 120),
        description: "Audio masterizado",
        lyrics: null,
        gender: null,
        audio_url: audioUrl,
        cover_url: null,
        suno_task_id: null,
        suno_audio_id: `master_${Date.now()}`.slice(0, 200),
        is_cover: false,
      };
      const ins = await auth.admin.from(TABLE).insert(insertRow).select("*").single();
      if (ins.error) {
        await deleteFromR2([outKey]).catch(() => 0);
        return send(res, 500, { error: "No pude guardar en tu Biblioteca", detail: ins.error.message });
      }

      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, uid, cost);
        if (!consumed.ok) {
          await auth.admin.from(TABLE).delete().eq("id", (ins.data as any)?.id).eq("user_id", uid);
          await deleteFromR2([outKey]).catch(() => 0);
          return send(res, 402, { error: consumed.error || "No pude cobrar créditos", cost });
        }
        return send(res, 200, { ok: true, song: ins.data, cost, credits: consumed.credits ?? null, downloadUrl: audioUrl });
      }

      return send(res, 200, { ok: true, song: ins.data, cost: 0, credits: null, downloadUrl: audioUrl, is_admin: true });
    } catch (e) {
      await deleteFromR2([outKey]).catch(() => 0);
      return send(res, 500, { error: "No pude masterizar el audio", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const masterizarUnlimitedHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function safeFileBase(name: string) {
    const s = (name || "").toString().trim().replaceAll("\\", "/").split("/").pop() || "audio";
    const noExt = s.includes(".") ? s.slice(0, s.lastIndexOf(".")) : s;
    return noExt.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 90) || "audio";
  }

  async function getAuthContext(req: any) {
    const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
    const supabaseAnon = (process.env.SUPABASE_ANON_KEY || "").toString().trim();
    const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase" };
    }

    const token = (req.headers.authorization || "").toString();
    const bearerToken = token.toLowerCase().startsWith("bearer ") ? token.slice(7).trim() : "";
    if (!bearerToken) return { ok: false as const, status: 401, error: "No autorizado", anonymous: true };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearerToken);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado", anonymous: true };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin, anonymous: false };
  }

  async function checkMasteringSubscription(userId: string, admin: any) {
    const { data, error } = await admin
      .from('profiles')
      .select('mastering_subscription_active, mastering_subscription_expires_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error al verificar suscripción:', error);
      return { active: false, expires_at: null };
    }

    const active = data.mastering_subscription_active || false;
    const expires_at = data.mastering_subscription_expires_at;

    // Verificar si la suscripción ha expirado
    if (active && expires_at) {
      const now = new Date();
      const expiresDate = new Date(expires_at);
      
      if (now > expiresDate) {
        // Actualizar estado a inactivo
        await admin
          .from('profiles')
          .update({ 
            mastering_subscription_active: false,
            mastering_subscription_expires_at: null
          })
          .eq('id', userId);
        
        return { active: false, expires_at: null };
      }
    }

    return { active, expires_at };
  }
  async function headR2Object(key: string) {
    const env = getR2Env();
    const client = await getR2Client();
    const { HeadObjectCommand } = await getR2AwsSdk();
    const head = await client.send(new HeadObjectCommand({ Bucket: env.bucketName, Key: key }));
    const contentLength = Number((head as any)?.ContentLength ?? NaN);
    const contentType = String((head as any)?.ContentType || "").split(";")[0].trim();
    return { contentLength, contentType };
  }

  async function runMasteringLocal(inputSignedUrl: string, outKey: string) {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const ffmpegInstaller: any = await import("@ffmpeg-installer/ffmpeg");
    const ffmpegMod: any = await import("fluent-ffmpeg");
    const ffmpeg = ffmpegMod?.default || ffmpegMod;
    if (typeof ffmpeg?.setFfmpegPath === "function" && ffmpegInstaller?.path) {
      ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    }

    const tmpDir = os.tmpdir();
    const base = Math.random().toString(36).slice(2, 10);
    const inPath = path.join(tmpDir, `master_unlimited_in_${Date.now()}_${base}.mp3`);
    const outPath = path.join(tmpDir, `master_unlimited_out_${Date.now()}_${base}.mp3`);

    const downloaded = await fetchUrlToBuffer(inputSignedUrl);
    await fs.writeFile(inPath, downloaded.buf);

    await new Promise<void>((resolve, reject) => {
      try {
        ffmpeg(inPath)
          .outputOptions(["-af", "loudnorm=I=-14:TP=-1.0:LRA=11"])
          .format("mp3")
          .on("end", () => resolve())
          .on("error", (err: any) => reject(err instanceof Error ? err : new Error(String(err))))
          .save(outPath);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });

    const outBuf = await fs.readFile(outPath);
    await uploadToR2(outKey, outBuf, "audio/mpeg");
    try {
      await fs.unlink(inPath);
    } catch {
    }
    try {
      await fs.unlink(outPath);
    } catch {
    }
  }


  async function runMasteringWithWorker(params: {
    workerUrl: string;
    inputUrl: string;
    outputPutUrl: string;
  }) {
    const workerUrl = params.workerUrl.replace(/\/+$/, "");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10 * 60 * 1000);
    const r = await fetch(workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inputUrl: params.inputUrl,
        outputUploadUrl: params.outputPutUrl,
        ffmpegArgs: ["-af", "loudnorm=I=-14:TP=-1.0:LRA=11"],
      }),
      signal: ctrl.signal as any,
    }).finally(() => clearTimeout(timer));
    const out = await r.json().catch(() => ({}));
    if (!r.ok || out?.ok === false) {
      const msg = String(out?.error || out?.detail || `HTTP ${r.status}`);
      throw new Error(msg || "No pude masterizar en el worker");
    }
    return true;
  }

  return async function handler(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    const u = new URL(req.url, "http://localhost");
    const parts = u.pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    
    if (head !== "masterizar-unlimited") return send(res, 404, { error: "Ruta no encontrada" });
    if (method !== "POST") return send(res, 405, { error: "Método no permitido" });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const { action, filePath, isPreview = false, fileName, fileType } = body;
    
    if (!action) {
      return send(res, 400, { error: 'Falta el parámetro "action"' });
    }

    const auth = await getAuthContext(req);
    if (!auth.ok && !auth.anonymous) return send(res, auth.status, { error: auth.error });

    const userId = auth.ok ? auth.user.id : "anonymous";
    const workerUrl = (process.env.MASTERING_WORKER_URL || "").toString().trim();

    if (action === 'upload') {
      // Preparar subida de archivo
      if (!fileName || !fileType) {
        return send(res, 400, { error: 'Falta fileName o fileType' });
      }

      const normalizedFileName = String(fileName || "").trim().toLowerCase();
      const normalizedFileType = String(fileType || "").trim().toLowerCase();
      const isMp3Upload =
        normalizedFileType.includes("audio/mpeg") ||
        normalizedFileType.includes("audio/mp3") ||
        normalizedFileType.includes("audio/x-mp3") ||
        normalizedFileName.endsWith(".mp3");
      if (!isMp3Upload) {
        return send(res, 400, {
          error: "El archivo debe ser MP3.",
          converterUrl: "https://online-audio-converter.com/sp/",
        });
      }

      // Generar ruta única para el archivo
      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 10);
      const fileKey = `uploads/masterizar-unlimited/${userId}/${timestamp}_${random}_${safeFileBase(fileName)}.mp3`;

      // Obtener URL firmada para subir
      const uploadUrl = await getSignedR2PutUrl(fileKey, fileType);

      return send(res, 200, {
        uploadUrl,
        filePath: fileKey,
      });

    } else if (action === 'process') {
      // Procesar masterización
      if (!filePath) {
        return send(res, 400, { error: 'Falta filePath' });
      }

      const isAdmin = auth.ok && isAdminEmail(auth.user.email);
      const cost = CREDIT_COSTS.mastering;
      let creditsConsumed = false;

      if (!isPreview) {
        if (!auth.ok) {
          return send(res, 401, { error: 'Inicia sesión para descargar el archivo completo.' });
        }
        
        if (!isAdmin) {
          const consumed = await consumeUserCredits(auth.admin, userId, cost);
          if (!consumed.ok) {
            return send(res, 402, { error: consumed.error || "Créditos insuficientes para descargar." });
          }
          creditsConsumed = true;
        }
      }

      // Validar que el archivo sea MP3
      const lowerKey = filePath.toLowerCase();
      const looksMp3 = lowerKey.endsWith(".mp3");
      if (!looksMp3) {
        if (creditsConsumed) await adjustUserCredits(auth.admin, userId, cost);
        return send(res, 400, {
          error: "El archivo debe ser MP3.",
          converterUrl: "https://online-audio-converter.com/sp/",
        });
      }

      // Obtener URLs firmadas
      let headInfo: any = null;
      try {
        headInfo = await headR2Object(filePath);
      } catch {
        headInfo = null;
      }
      const inputUrl = await getSignedR2Url(filePath, 3600);
      const outputKey = `masterized-unlimited/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.mp3`;
      const outputPutUrl = await getSignedR2PutUrl(outputKey, 'audio/mpeg', 600);
      const allowLocalFallback = isPreview || ["1", "true", "yes", "on"].includes((process.env.MASTERING_ALLOW_LOCAL_FALLBACK || "").toString().trim().toLowerCase());

      // Ejecutar masterización
      try {
        if (workerUrl) {
          try {
            await runMasteringWithWorker({
              workerUrl,
              inputUrl,
              outputPutUrl,
            });
          } catch (workerError: any) {
            if (!allowLocalFallback) {
              throw new Error(`Falló el worker de masterización del VPS. ${(workerError instanceof Error ? workerError.message : String(workerError)) || "Error desconocido"}`);
            }
            const contentLength = Number(headInfo?.contentLength ?? NaN);
            const maxInline = 15 * 1024 * 1024;
            if (Number.isFinite(contentLength) && contentLength > maxInline) {
              throw new Error("Falló el worker del VPS y el respaldo local en Vercel está limitado para archivos grandes.");
            }
            await runMasteringLocal(inputUrl, outputKey);
          }
        } else {
          if (!allowLocalFallback) {
            return send(res, 503, {
              error: "Masterizar requiere tu worker del VPS.",
              detail: "Configura MASTERING_WORKER_URL en Vercel para usar el procesamiento en Hostinger. El modo local en Vercel está desactivado.",
            });
          }
          const contentLength = Number(headInfo?.contentLength ?? NaN);
          const maxInline = 15 * 1024 * 1024;
          if (Number.isFinite(contentLength) && contentLength > maxInline) {
            return send(res, 413, {
              error: "Ese MP3 está muy pesado para masterizar en Vercel.",
              detail: "Configura MASTERING_WORKER_URL en tu VPS (Hostinger) o deja activo el worker principal.",
              bytes: contentLength,
            });
          }
          await runMasteringLocal(inputUrl, outputKey);
        }
      } catch (error: any) {
        if (creditsConsumed) await adjustUserCredits(auth.admin, userId, cost);
        return send(res, 500, {
          error: "Error al masterizar",
          message: error.message || "Error desconocido",
        });
      }

      // Obtener URL para reproducir el resultado
      const finalUrl = await getSignedR2Url(outputKey, 3600);

      return send(res, 200, {
        previewUrl: finalUrl,
        downloadUrl: (!isPreview || isAdmin) ? finalUrl : null,
        creditsConsumed: creditsConsumed,
      });

    } else {
      return send(res, 400, { error: 'Acción no válida' });
    }
  };
})();

const balanceHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  function sunoErrorMessage(data: any, fallback: string) {
    const msg =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      (typeof data?.msg === "string" && data.msg) ||
      fallback;
    return String(msg);
  }

  function parseCreditsValue(raw: any) {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const cleaned = raw
        .trim()
        .replaceAll("Credits", "")
        .replaceAll("credits", "")
        .replaceAll("CR", "")
        .replaceAll(" ", "")
        .replaceAll(",", ".");
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  async function sunoFetchJson(path: string) {
    const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
    const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";

    const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
    if (!apiKey) throw new Error("Falta SUNO_API_KEY en variables de entorno");

    const r = await fetch(new URL(path, base).toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const text = await r.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { res: r, data, text };
  }

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const useProvider = (pickQuery(req, "source") || "").toLowerCase() === "provider";
    if (useProvider) {
      try {
        const paths = [
          "/api/v1/generate/credit",
          "/api/v1/get-credits",
          "/api/v1/generate/credit",
          "/api/v1/suno/get-credits",
          "/api/v1/suno/generate/credit",
          "/api/v1/suno/credits",
          "/api/v1/suno/credit",
        ];

        let last: any = null;
        for (const p of paths) {
          const r = await sunoFetchJson(p);
          last = r;
          if (r.res.status !== 404) break;
        }
        const r = last;

        if (!r?.res?.ok) {
          const msg = sunoErrorMessage(r?.data, r?.text || `HTTP ${r?.res?.status || 0}`);
          return send(res, 502, { error: "Error consultando saldo", code: r?.res?.status || 0, detail: String(msg).slice(0, 1200) });
        }

        const code = Number(r.data?.code);
        if (code && code !== 200) {
          const msg = sunoErrorMessage(r.data, "Error del proveedor");
          return send(res, 502, { error: "Error consultando saldo", code, detail: String(msg).slice(0, 1200) });
        }

        const raw = r.data?.data?.credits ?? r.data?.data;
        const parsed = parseCreditsValue(raw);
        const credits = round2(Number.isFinite(parsed) ? parsed : 0);
        const counts = toCounts(credits);
        return send(res, 200, { credits, song_balance: counts.songs, counts, downloads_allowed: true, free_claimed: false, source: "provider" });
      } catch (e) {
        return send(res, 502, { error: "Error consultando saldo", detail: e instanceof Error ? e.message : String(e) });
      }
    }

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    const authHeader = (req.headers.authorization || "").toString();
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return send(res, 401, { error: "No autorizado" });

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return send(res, 401, { error: "No autorizado" });
    const is_admin = isAdminEmail(user.email);

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

    const plan = await getUserPlan(admin, user.id).catch(() => ({
      plan_key: "ninguno",
      downloads_allowed: false,
      plan_active: false,
      plan_expires_at: null,
      hasProductor: false,
    }));
    const plan_key = String((plan as any)?.plan_key || "ninguno");
    const plan_expires_at = (plan as any)?.plan_expires_at ?? null;
    const plan_active = is_admin ? true : Boolean((plan as any)?.plan_active);
    const downloads_allowed = is_admin ? true : Boolean((plan as any)?.downloads_allowed || (plan as any)?.has_paid_ever);
    const free_claimed = false;
    const show_free_claim_popup = false;

    let { data: profile, error: profErr } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (profErr) return send(res, 500, { error: "Error consultando saldo", detail: profErr.message });

    if (!profile) {
      const created = await ensureProfileExists(admin, user.id);
      if (!created.ok) return send(res, 500, { error: "Error creando perfil", detail: created.error });
      const r2 = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
      profile = r2.data ?? null;
    }

    const globalExpired = isIsoInPast((profile as any)?.credits_expires_at);
    let profile_credits = round2(creditsFromProfile(profile));
    const batch_credits = globalExpired ? 0 : await getActiveBatchCredits(admin, user.id);
    if (globalExpired) profile_credits = 0;
    let internal_credits = globalExpired ? 0 : round2(profile_credits + batch_credits);
    const cycle = await ensureMonthlyCreditsCycle(admin, user.id).catch(() => null as any);
    if (cycle?.did_reset) internal_credits = round2(batch_credits); // reset solo afecta perfil, no lotes
    let provider_credits: number | null = null;
    let provider_error = "";

    if (is_admin) {
      try {
        const paths = [
          "/api/v1/generate/credit",
          "/api/v1/get-credits",
          "/api/v1/generate/credit",
          "/api/v1/suno/get-credits",
          "/api/v1/suno/generate/credit",
          "/api/v1/suno/credits",
          "/api/v1/suno/credit",
        ];
        let last: any = null;
        for (const p of paths) {
          const r = await sunoFetchJson(p);
          last = r;
          if (r.res.status !== 404) break;
        }
        const r = last;
        if (r?.res?.ok) {
          const code = Number(r.data?.code);
          if (!code || code === 200) {
            const raw = r.data?.data?.credits ?? r.data?.data;
            const parsed = parseCreditsValue(raw);
            const v = round2(Number.isFinite(parsed) ? parsed : 0);
            if (Number.isFinite(v) && v >= 0) provider_credits = v;
          } else {
            provider_error = "Error del proveedor";
          }
        } else {
          provider_error = "No pude consultar créditos del proveedor";
        }
      } catch (e) {
        provider_error = e instanceof Error ? e.message : String(e);
      }
    }

    const credits = is_admin && typeof provider_credits === "number" ? provider_credits : internal_credits;

    const counts = toCounts(credits);
    
    // Fecha de vencimiento: preferimos la más PRÓXIMA a vencer (para advertir al usuario),
    // comparando entre la del perfil global y la del lote más cercano.
    const global_exp = profile?.credits_expires_at ? new Date(String(profile.credits_expires_at)).getTime() : null;
    let next_batch_exp_ms: number | null = null;
    try {
      const { data: batRows } = await admin
        .from("credit_batches")
        .select("expires_at")
        .eq("user_id", user.id)
        .eq("is_expired", false)
        .gt("remaining_credits", 0)
        .order("expires_at", { ascending: true })
        .limit(1);
      const rows = Array.isArray(batRows) ? batRows : [];
      if (rows.length > 0) {
        const ms = new Date(String((rows[0] as any).expires_at)).getTime();
        if (Number.isFinite(ms)) next_batch_exp_ms = ms;
      }
    } catch {
      next_batch_exp_ms = null;
    }

    let credits_expires_at: string | null = profile?.credits_expires_at || null;
    if (global_exp != null && Number.isFinite(global_exp)) {
      if (next_batch_exp_ms != null && Number.isFinite(next_batch_exp_ms)) {
        credits_expires_at = new Date(Math.min(global_exp, next_batch_exp_ms)).toISOString();
      } else {
        credits_expires_at = new Date(global_exp).toISOString();
      }
    } else if (next_batch_exp_ms != null && Number.isFinite(next_batch_exp_ms)) {
      credits_expires_at = new Date(next_batch_exp_ms).toISOString();
    }

    return send(res, 200, {
      credits,
      song_balance: counts.songs,
      counts,
      downloads_allowed,
      free_claimed,
      show_free_claim_popup,
      plan_key,
      plan_active,
      plan_expires_at,
      credits_cycle_start_at: cycle?.cycle_start_at ?? null,
      credits_cycle_expires_at: cycle?.cycle_expires_at ?? null,
      credits_cycle_seconds_left: typeof cycle?.cycle_seconds_left === "number" ? cycle.cycle_seconds_left : null,
      mp4_watermark_disabled: is_admin ? true : Boolean((plan as any)?.hasProductor),
      is_admin,
      internal_credits,
      internal_profile_credits: profile_credits,
      internal_batch_credits: batch_credits,
      provider_credits,
      provider_error: provider_error || null,
      source: is_admin && typeof provider_credits === "number" ? "provider_admin" : "local",
      credits_expires_at,
    });
  };
})();

const bootstrapProfileHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    const authHeader = (req.headers.authorization || "").toString();
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return send(res, 401, { error: "No autorizado" });

    const body = parseJsonBody(req) || {};
    const referralCode = typeof body?.referralCode === "string" ? body.referralCode.trim() : "";

    try {
      const createClient = await getSupabaseCreateClient();
      const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      const user = userData?.user;
      if (userErr || !user) return send(res, 401, { error: "No autorizado" });

      const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
      const is_admin = isAdminEmail(user.email);
      let welcome_granted = false;
      let welcome_error: string | null = null;
      let referral_attached = false;
      let referral_error: string | null = null;
      const grantWelcomeIfEligible = async () => {
        if (is_admin) return;
        try {
          const paymentId = `welcome:${user.id}`;
          const { data: exists } = await admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
          if (Array.isArray(exists) && exists.length > 0) return;
          const created = await ensureProfileExists(admin, user.id);
          if (!created.ok) {
            welcome_error = created.error || "No pude crear tu perfil.";
            return;
          }
          const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
          const credits = CREDIT_COSTS.generate_music * 2;
          const upd = await adjustUserCredits(admin, user.id, credits);
          if (!upd.ok) {
            welcome_error = upd.error || "No pude acreditar créditos de bienvenida.";
            return;
          }
          await admin.from("mp_transactions").insert({
            user_id: user.id,
            kind: "welcome",
            pack_key: "welcome",
            amount_mxn: 0,
            payment_id: paymentId,
          });
          welcome_granted = true;
        } catch (e) {
          welcome_error = e instanceof Error ? e.message : String(e);
        }
      };
      const up = await ensureProfileExists(admin, user.id);
      if (!up.ok) return send(res, 500, { error: "No pude crear perfil", detail: up.error });

      await grantWelcomeIfEligible();

      if (referralCode) {
        try {
          const attached = await tryAttachAffiliateReferral(admin, user.id, referralCode);
          if (attached.ok && attached.attached) {
            referral_attached = true;
          } else if (!attached.ok) {
            referral_error = attached.error || "No pude guardar el referido.";
          }
        } catch (e) {
          referral_error = e instanceof Error ? e.message : String(e);
        }
      }

      return send(res, 200, { ok: true, created: true, welcome_granted, welcome_error, referral_attached, referral_error });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const uploadProfileImageHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function shouldModeratePath(path: string) {
    const p = (path || "").toString().trim().replace(/^\/+/, "");
    return p.startsWith("avatars/") || p.startsWith("profile-covers/");
  }

  function getGoogleVisionApiKey() {
    return (
      (process.env.GOOGLE_VISION_API_KEY || "").toString().trim() ||
      (process.env.GOOGLE_CLOUD_VISION_API_KEY || "").toString().trim() ||
      ""
    );
  }

  function levelToScore(level: string) {
    const v = (level || "").toString().trim().toUpperCase();
    if (v === "VERY_LIKELY") return 5;
    if (v === "LIKELY") return 4;
    if (v === "POSSIBLE") return 3;
    if (v === "UNLIKELY") return 2;
    if (v === "VERY_UNLIKELY") return 1;
    return 0;
  }

  async function moderateImageWithGoogleVision(buf: Buffer) {
    const key = getGoogleVisionApiKey();
    if (!key) return { ok: true as const, skipped: true as const };

    const b64 = buf.toString("base64");
    const body = {
      requests: [
        {
          image: { content: b64 },
          features: [{ type: "SAFE_SEARCH_DETECTION" }],
        },
      ],
    };

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const out = await r.json().catch(() => ({} as any));
    if (!r.ok) {
      const msg = (out?.error?.message || out?.error?.status || out?.error || `HTTP ${r.status}`).toString();
      return { ok: false as const, error: `Google Vision: ${msg}`.slice(0, 500) };
    }

    const ann = out?.responses?.[0]?.safeSearchAnnotation || {};
    const adult = levelToScore(ann?.adult);
    const racy = levelToScore(ann?.racy);
    const violence = levelToScore(ann?.violence);
    const ok = adult <= 2 && racy <= 2 && violence <= 2;
    if (ok) return { ok: true as const, skipped: false as const };

    const reasons: string[] = [];
    if (adult >= 3) reasons.push("desnudos");
    if (racy >= 3) reasons.push("contenido sexual");
    if (violence >= 3) reasons.push("violencia");
    const reason = reasons.length ? reasons.join(", ") : "contenido no permitido";
    return { ok: false as const, error: `Imagen no permitida: ${reason}`.slice(0, 200) };
  }

  function originFromReq(req: any) {
    const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
    return `${proto}://${host}`;
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  return async function handler(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    if (method !== "POST" && method !== "GET") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    if (method === "GET") {
      const key = pickQuery(req, "key").toString().trim().replace(/^\/+/, "");
      const action = (pickQuery(req, "action") || "").toString().trim().toLowerCase();
      if (action !== "sign" && action !== "play") return send(res, 400, { error: "Falta action=sign" });
      if (!key) return send(res, 400, { error: "Falta key" });
      const uid = String(auth.user.id || "").trim();
      const allowedPrefixes = [`uploads/audio/${uid}/`, `uploads/${uid}/`];
      if (!allowedPrefixes.some((p) => key.startsWith(p))) return send(res, 403, { error: "No autorizado para este archivo" });
      try {
        const url = await getSignedR2Url(key, 60 * 60 * 2);
        return send(res, 200, { ok: true, url, key });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return send(res, 500, { ok: false, error: "No pude firmar el audio", detail: String(detail || "").slice(0, 500) });
      }
    }

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const path = typeof payload?.path === "string" ? payload.path.trim() : "";
    const data = payload?.data;
    const contentType = typeof payload?.contentType === "string" ? payload.contentType.trim() : "image/webp";
    const userId = String(auth.user.id || "").trim();

    if (!path) return send(res, 400, { error: "Falta path" });

    const cleanedPath = path.replace(/^\/+/, "");
    const allowedPrefixes = [`uploads/audio/${userId}/`, `uploads/${userId}/`, `avatars/${userId}/`, `profiles/${userId}/`];
    const isAllowedPath = allowedPrefixes.some((p) => cleanedPath.startsWith(p));
    if (!isAllowedPath) {
      try { console.error(JSON.stringify({ kind: "UPLOAD_PROFILE_IMAGE", userId, mode: "path_rejected", path: (cleanedPath || "").slice(0, 300), contentType })); } catch {}
      return send(res, 403, { error: "No autorizado para escribir en este path" });
    }

    try {
      const url = `${originFromReq(req)}/api/r2/object?key=${encodeURIComponent(cleanedPath)}`;

      if (!data || !Array.isArray(data)) {
        try {
          const uploadUrl = await getSignedR2PutUrl(cleanedPath, contentType || "application/octet-stream", 60 * 10);
          try { console.log(JSON.stringify({ kind: "UPLOAD_PROFILE_IMAGE", userId, mode: "direct_prep_ok", path: (cleanedPath || "").slice(0, 300), contentType, via: "direct", signedPut: true })); } catch {}
          return send(res, 200, { ok: true, uploadUrl, url, key: cleanedPath, via: "direct" });
        } catch (r2Err) {
          const msg = r2Err instanceof Error ? r2Err.message : String(r2Err || "");
          try { console.error(JSON.stringify({ kind: "UPLOAD_PROFILE_IMAGE", userId, mode: "direct_prep_failed", path: (cleanedPath || "").slice(0, 300), contentType, error: String(msg || "").slice(0, 600) })); } catch {}
          throw r2Err;
        }
      }

      const buf = Buffer.from(data);
      if (shouldModeratePath(cleanedPath) && buf.length > 0) {
        const check = await moderateImageWithGoogleVision(buf);
        if (!check.ok) {
          const needsKey = String(check.error || "").toLowerCase().includes("api key");
          const hint = needsKey
            ? "Falta configurar GOOGLE_VISION_API_KEY en Vercel (Google Cloud Vision API)."
            : "";
          try { console.error(JSON.stringify({ kind: "UPLOAD_PROFILE_IMAGE", userId, mode: "server_moderation_rejected", path: (cleanedPath || "").slice(0, 300), sizeBytes: buf.length, error: String(check.error || "").slice(0, 600) })); } catch {}
          return send(res, 400, { error: check.error || "Imagen no permitida", hint: hint || undefined });
        }
      }
      const t0 = Date.now();
      await uploadToR2(cleanedPath, buf, contentType);
      const dt = Date.now() - t0;
      try { console.log(JSON.stringify({ kind: "UPLOAD_PROFILE_IMAGE", userId, mode: "server_ok", path: (cleanedPath || "").slice(0, 300), contentType, sizeBytes: buf.length, durationMs: dt, via: "server" })); } catch {}
      return send(res, 200, { ok: true, url, key: cleanedPath, via: "server" });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const msg = /Missing required R2 environment variables/i.test(detail || "")
        ? "Falta configurar Cloudflare R2 en Vercel"
        : "Error subiendo imagen";
      try { console.error(JSON.stringify({ kind: "UPLOAD_PROFILE_IMAGE", userId, mode: "global_catch", path: (cleanedPath || "").slice(0, 300), contentType, error: String(detail || "").slice(0, 1200) })); } catch {}
      return send(res, 500, { error: msg, detail: String(detail || "").slice(0, 1200) });
    }
  };
})();

const r2ObjectHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  function guessContentTypeFromKey(key: string) {
    const k = (key || "").toLowerCase();
    if (k.endsWith(".webp")) return "image/webp";
    if (k.endsWith(".png")) return "image/png";
    if (k.endsWith(".jpg") || k.endsWith(".jpeg")) return "image/jpeg";
    if (k.endsWith(".gif")) return "image/gif";
    return "application/octet-stream";
  }

  async function readBodyToBuffer(body: any): Promise<Buffer> {
    if (!body) return Buffer.from([]);
    if (Buffer.isBuffer(body)) return body;
    if (typeof body === "string") return Buffer.from(body);
    if (body instanceof Uint8Array) return Buffer.from(body);
    const chunks: Buffer[] = [];
    for await (const chunk of body as any) {
      if (!chunk) continue;
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const key = pickQuery(req, "key").trim().replace(/^\/+/, "");
    if (!key) return send(res, 400, { error: "Falta key" });

    const allowed = ["avatars/", "profile-covers/", "personas/", "covers/"];
    if (!allowed.some((p) => key.startsWith(p))) return send(res, 404, { error: "No encontrado" });

    try {
      const env = getR2Env();
      const client = await getR2Client();
      const { GetObjectCommand } = await getR2AwsSdk();
      const out = await client.send(
        new GetObjectCommand({
          Bucket: env.bucketName,
          Key: key,
        })
      );
      const ct = (out as any)?.ContentType ? String((out as any).ContentType) : guessContentTypeFromKey(key);
      const buf = await readBodyToBuffer((out as any)?.Body);
      if (!buf || buf.length === 0) return send(res, 404, { error: "No encontrado" });
      res.statusCode = 200;
      res.setHeader("content-type", ct);
      res.setHeader("cache-control", "public, max-age=31536000, immutable");
      res.end(buf);
    } catch (e) {
      return send(res, 404, { error: "No encontrado", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const replicateWebhookHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function originFromReq(req: any) {
    const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
    return `${proto}://${host}`;
  }

  function absoluteUrlFromReq(req: any, pathname: string) {
    return new URL(pathname, originFromReq(req)).toString();
  }

  return async function handler(req: any, res: any) {
    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
    
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) return send(res, 200, { ok: true });

    let body: any = null;
    try {
      if (typeof req.body === "string") body = JSON.parse(req.body);
      else body = req.body ?? null;
    } catch {
      body = null;
    }

    const predictionId = body?.id;
    const status = body?.status;
    const output = body?.output;
    const error = body?.error;

    if (!predictionId) {
      return send(res, 400, { error: "Falta prediction ID" });
    }

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService);

      // Buscar la voz en la base de datos usando replicate_id
      const { data: voiceRows } = await admin
        .from("kits_voices")
        .select("id, user_id, status, cost, sample_url")
        .eq("replicate_id", predictionId)
        .limit(1);
      
      const voiceRow = Array.isArray(voiceRows) ? voiceRows[0] : null;
      
      if (voiceRow) {
        const userId = voiceRow.user_id;
        const currentStatus = voiceRow.status;
        
        // Actualizar el estado de la voz
        let newStatus = currentStatus;
        if (status === 'succeeded' || status === 'completed') {
          newStatus = 'ready';
        } else if (status === 'failed' || status === 'canceled') {
          newStatus = 'failed';
        }
        
        let modelUrl = null;
        if (output) {
          modelUrl = extractOutputUrl(output);
        }
        
        // Actualizar la base de datos
        await admin
          .from("kits_voices")
          .update({ 
            status: newStatus,
            output: output ? JSON.stringify(output) : null,
            model_url: modelUrl,
            error: error ? JSON.stringify(error) : null,
            updated_at: new Date().toISOString()
          })
          .eq("replicate_id", predictionId);

        if (newStatus === "ready" && modelUrl && typeof modelUrl === "string") {
          const sourceAudioUrl = (voiceRow as any)?.sample_url ? String((voiceRow as any).sample_url).trim() : "";
          const replicateToken = process.env.REPLICATE_API_TOKEN;
          if (replicateToken && sourceAudioUrl) {
            try {
              await fetch("https://api.replicate.com/v1/models/zsxkib/realistic-voice-cloning/versions/a0076ea1/predictions", {
                method: "POST",
                headers: {
                  "Authorization": `Token ${replicateToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  input: {
                    song_input: sourceAudioUrl,
                    rvc_model: "CUSTOM",
                    custom_rvc_model_download_url: modelUrl,
                    pitch_change: 0,
                    index_rate: 0.5,
                    protect: 0.33,
                    output_format: "mp3",
                  },
                  webhook: absoluteUrlFromReq(req, `/api/webhooks/replicate-voice-sample?voiceId=${encodeURIComponent(String((voiceRow as any).id || ""))}`),
                }),
              }).catch(() => {});
            } catch {
            }
          }
        }
      }
    } catch (e) {
      console.error('Error procesando webhook de Replicate:', e);
    }

    return send(res, 200, { ok: true, received: true, predictionId, status });
  };
})();

const replicateCoverWebhookHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function normalizeHttpUrl(raw: any) {
    const s = (typeof raw === "string" ? raw : raw == null ? "" : String(raw)).trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s) || /^\/\//.test(s)) return s;
    return "";
  }

  function pickFirstUrl(output: any) {
    const direct = normalizeHttpUrl(output);
    if (direct) return direct;
    const candidates: any[] = [];
    if (output && typeof output === "object") {
      candidates.push(
        output?.audio,
        output?.audio_url,
        output?.audioUrl,
        output?.output,
        output?.output_url,
        output?.outputUrl,
        output?.url,
        output?.download,
        output?.download_url
      );
      if (Array.isArray(output)) candidates.push(...output);
    }
    for (const c of candidates) {
      const u = normalizeHttpUrl(c);
      if (u) return u;
    }
    return "";
  }

  function contentTypeForExt(ext: string) {
    const e = (ext || "").toString().trim().toLowerCase();
    if (e === "wav") return "audio/wav";
    if (e === "ogg") return "audio/ogg";
    if (e === "aac") return "audio/aac";
    if (e === "m4a") return "audio/mp4";
    return "audio/mpeg";
  }

  return async function handler(req: any, res: any) {
    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) return send(res, 200, { ok: true });

    let body: any = null;
    try {
      if (typeof req.body === "string") body = JSON.parse(req.body);
      else body = req.body ?? null;
    } catch {
      body = null;
    }

    const predictionId = (body?.id || "").toString().trim();
    const statusRaw = (body?.status || "").toString().trim().toLowerCase();
    const output = body?.output;
    const error = body?.error;
    if (!predictionId) return send(res, 400, { error: "Falta prediction ID" });

    const newStatus =
      statusRaw === "succeeded" || statusRaw === "completed"
        ? "ready"
        : statusRaw === "failed" || statusRaw === "canceled" || statusRaw === "error"
        ? "failed"
        : "processing";

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService);

      const { data: coverRows, error: coverErr } = await admin
        .from("rvc_covers")
        .select("*")
        .eq("prediction_id", predictionId)
        .limit(1);
      if (coverErr) return send(res, 500, { error: "No pude buscar el cover", detail: coverErr.message });
      const coverRow = Array.isArray(coverRows) ? coverRows[0] : null;
      if (!coverRow) return send(res, 200, { ok: true, received: true, predictionId, status: newStatus, missing: true });

      await admin
        .from("rvc_covers")
        .update({
          status: newStatus,
          output: output ? JSON.stringify(output) : null,
          error: error ? JSON.stringify(error) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("prediction_id", predictionId);

      if (newStatus !== "ready") return send(res, 200, { ok: true, received: true, predictionId, status: newStatus });

      const userId = (coverRow as any)?.user_id ? String((coverRow as any).user_id) : "";
      if (!userId) return send(res, 200, { ok: true, received: true, predictionId, status: newStatus });

      const externalId = `rvc_${predictionId}`.slice(0, 200);
      const { data: exists } = await admin
        .from("library_items")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "song")
        .eq("suno_audio_id", externalId)
        .is("deleted_at", null)
        .limit(1);
      if (Array.isArray(exists) && exists.length > 0) {
        return send(res, 200, { ok: true, received: true, predictionId, status: newStatus, imported: false, already: true });
      }

      const audioSourceUrl = pickFirstUrl(output);
      if (!audioSourceUrl) return send(res, 200, { ok: true, received: true, predictionId, status: newStatus, imported: false, missing_audio: true });

      let buf: any = null;
      let remoteCt = "";
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 120_000);
        const r = await fetch(audioSourceUrl, { signal: ctrl.signal as any });
        clearTimeout(timer);
        if (!r.ok) return send(res, 502, { error: "No pude descargar el audio del cover", detail: `HTTP ${r.status}` });
        remoteCt = (r.headers.get("content-type") || "").toString().trim().slice(0, 120);
        const ab = await r.arrayBuffer();
        if (!ab || !ab.byteLength) return send(res, 502, { error: "El audio del cover llegó vacío" });
        buf = Buffer.from(ab);
      } catch (e) {
        return send(res, 502, { error: "No pude descargar el audio del cover", detail: e instanceof Error ? e.message : String(e) });
      }

      const fmt = String((coverRow as any)?.output_format || "mp3").trim().toLowerCase();
      const ext = ["mp3", "wav", "ogg", "aac", "m4a"].includes(fmt) ? fmt : "mp3";
      const contentType = remoteCt || contentTypeForExt(ext);
      const safeId = predictionId.replaceAll(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 120) || "cover";
      const key = `covers/${userId}/${Date.now()}_${safeId}.${ext}`;
      const audioUrl = await uploadToR2(key, buf, contentType);

      const title = String((coverRow as any)?.title || "Cover (voz clonada)").trim().slice(0, 120) || "Cover (voz clonada)";
      const insertRow: any = {
        user_id: userId,
        type: "song",
        title,
        description: "Cover generado con voz clonada",
        lyrics: null,
        gender: null,
        audio_url: audioUrl,
        cover_url: null,
        suno_task_id: null,
        suno_audio_id: externalId,
        is_cover: true,
      };

      const { error: insErr } = await admin.from("library_items").insert(insertRow);
      if (insErr) return send(res, 500, { error: "No pude guardar el cover en tu biblioteca", detail: insErr.message });
      return send(res, 200, { ok: true, received: true, predictionId, status: newStatus, imported: true });
    } catch (e) {
      return send(res, 200, { ok: true, received: true, predictionId, status: newStatus });
    }
  };
})();

const replicateVoiceSampleWebhookHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function normalizeHttpUrl(raw: any) {
    const s = (typeof raw === "string" ? raw : raw == null ? "" : String(raw)).trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s) || /^\/\//.test(s)) return s;
    return "";
  }

  function pickFirstUrl(output: any) {
    const direct = normalizeHttpUrl(output);
    if (direct) return direct;
    const candidates: any[] = [];
    if (output && typeof output === "object") {
      candidates.push(
        output?.audio,
        output?.audio_url,
        output?.audioUrl,
        output?.output,
        output?.output_url,
        output?.outputUrl,
        output?.url,
        output?.download,
        output?.download_url
      );
      if (Array.isArray(output)) candidates.push(...output);
    }
    for (const c of candidates) {
      const u = normalizeHttpUrl(c);
      if (u) return u;
    }
    return "";
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  return async function handler(req: any, res: any) {
    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) return send(res, 200, { ok: true });

    const url = new URL(req.url, "http://localhost");
    const voiceId = (url.searchParams.get("voiceId") || "").toString().trim();
    if (!voiceId) return send(res, 200, { ok: true, received: true, missing_voice_id: true });

    const body = parseJsonBody(req) || {};
    const predictionId = (body?.id || "").toString().trim();
    const statusRaw = (body?.status || "").toString().trim().toLowerCase();
    const output = body?.output;
    const error = body?.error;

    const newStatus =
      statusRaw === "succeeded" || statusRaw === "completed"
        ? "ready"
        : statusRaw === "failed" || statusRaw === "canceled" || statusRaw === "error"
        ? "failed"
        : "processing";

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService);

      const { data: row, error: rowErr } = await admin
        .from("kits_voices")
        .select("id, output, error")
        .eq("id", voiceId)
        .maybeSingle();
      if (rowErr) return send(res, 500, { error: "No pude buscar la voz", detail: rowErr.message });
      if (!row) return send(res, 200, { ok: true, received: true, missing: true, voiceId });

      let outObj: any = null;
      const outRaw = (row as any)?.output;
      if (outRaw && typeof outRaw === "string") {
        try {
          outObj = JSON.parse(outRaw);
        } catch {
          outObj = null;
        }
      } else if (outRaw && typeof outRaw === "object") {
        outObj = outRaw;
      }
      if (!outObj || typeof outObj !== "object") outObj = {};

      const audioUrl = newStatus === "ready" ? pickFirstUrl(output) : "";
      if (audioUrl) outObj.sample_url = audioUrl;
      if (predictionId) outObj.sample_prediction_id = predictionId;

      const patch: any = {
        updated_at: new Date().toISOString(),
      };
      if (audioUrl) patch.sample_url = audioUrl;
      patch.output = JSON.stringify(outObj);
      if (error) patch.error = JSON.stringify(error);

      await admin
        .from("kits_voices")
        .update(patch)
        .eq("id", voiceId);
    } catch (e) {
      return send(res, 200, { ok: true, received: true, voiceId, predictionId, status: newStatus });
    }

    return send(res, 200, { ok: true, received: true, voiceId, predictionId, status: newStatus });
  };
})();

const sunoWebhookHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function requestedModelFromTaskOutput(raw: any) {
    try {
      const out = typeof raw === "string" ? JSON.parse(raw) : raw;
      const m = out && typeof out.requestedModel === "string" ? out.requestedModel.trim() : "";
      return m || "";
    } catch {
      return "";
    }
  }

  return async function handler(req: any, res: any) {
    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) return send(res, 200, { ok: true });

    let body: any = null;
    try {
      if (typeof req.body === "string") body = JSON.parse(req.body);
      else body = req.body ?? null;
    } catch {
      body = null;
    }

    const code = Number(body?.code);
    const msg = String(body?.msg || "");
    const data = body?.data ?? {};
    const callbackType = String(data?.callbackType || data?.callback_type || "").toLowerCase();
    const taskId = String(data?.task_id || data?.taskId || body?.taskId || body?.task_id || "").trim();
    const tracks = Array.isArray(data?.data) ? data.data : [];
    const coverImages = Array.isArray(data?.images) ? data.images : [];
    const audioWavUrl = String(data?.audioWavUrl || data?.audio_wav_url || "").trim();

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService);

      if (taskId) {
        const { data: taskRows } = await admin.from("suno_tasks").select("*").eq("task_id", taskId).limit(1);
        const taskRow = Array.isArray(taskRows) ? taskRows[0] : null;
        const userId = String(taskRow?.user_id || "").trim();
        const kind = String(taskRow?.kind || "").trim().toLowerCase();
        const requestedModel =
          typeof taskRow?.requested_model === "string" && taskRow.requested_model.trim()
            ? taskRow.requested_model.trim()
            : requestedModelFromTaskOutput(taskRow?.output);
        const isCover = kind.includes("cover");
        const isMusicCover = kind.startsWith("music-cover:");
        const isWav = kind.startsWith("wav:");
        const isVoiceTask = kind === "voice-validate" || kind === "voice-regenerate" || kind === "voice-generate";

        if (isVoiceTask && userId) {
          const status = String(data?.status || "").trim();
          const validateInfo = typeof data?.validateInfo === "string" ? data.validateInfo : "";
          const voiceId = typeof data?.voiceId === "string" ? data.voiceId : "";
          const errorCode = Number.isFinite(Number(data?.errorCode)) ? Number(data.errorCode) : null;
          const errorMessage = typeof data?.errorMessage === "string" ? data.errorMessage : "";

          const snapshot = {
            code: Number.isFinite(code) ? code : null,
            msg: msg ? msg.slice(0, 500) : "",
            data: {
              taskId,
              status,
              validateInfo,
              voiceId,
              errorCode,
              errorMessage,
            },
            raw: body,
          };

          try {
            const out = JSON.stringify(snapshot);
            const { error } = await admin
              .from("suno_tasks")
              .update({ output: out })
              .eq("task_id", taskId)
              .eq("user_id", userId);
            if (error && !isMissingColumnError(error)) {
              throw error;
            }
          } catch {
          }
        }

        if (isWav && userId) {
          if (Number.isFinite(code) && code !== 200) {
            const cost = Number(taskRow?.cost ?? 0);
            const consumed = Boolean(taskRow?.consumed);
            if (consumed && Number.isFinite(cost) && cost > 0) {
              await adjustUserCredits(admin, userId, cost);
              await admin.from("suno_tasks").update({ consumed: false }).eq("task_id", taskId).eq("user_id", userId);
            }
          }
        } else if (isMusicCover && userId) {
          const originalTaskId = kind.split("music-cover:").slice(1).join("music-cover:").trim();
          if (code === 200 && coverImages.length > 0 && originalTaskId) {
            const looksExpiringUrl = (url: string) => {
              const u = (url || "").toString();
              if (!u) return false;
              if (!u.includes("?")) return false;
              return /[?&](x-amz-signature|x-amz-credential|x-amz-algorithm|x-amz-expires|x-amz-date|expires|signature|token)=/i.test(u);
            };

            const stable = coverImages
              .map((x: any) => String(x || "").trim())
              .find((u: string) => u && /^https?:\/\//i.test(u) && !looksExpiringUrl(u));
            if (stable) {
              await admin
                .from("library_items")
                .update({ cover_url: stable.slice(0, 2000) })
                .eq("user_id", userId)
                .eq("type", "song")
                .eq("suno_task_id", originalTaskId.slice(0, 200))
                .is("deleted_at", null);
            }

            const tryDownloadAndStore = async (urlRaw: any, index: number) => {
              const url = String(urlRaw || "").trim();
              if (!url) return "";
              try {
                const r = await fetch(url, { method: "GET" });
                if (!r.ok) return "";
                const ct = (r.headers.get("content-type") || "").toString();
                const buf = Buffer.from(await r.arrayBuffer());
                if (!buf || buf.length === 0) return "";
                const ext = ct.includes("jpeg") ? "jpg" : ct.includes("webp") ? "webp" : "png";
                const path = `covers/${userId}/${originalTaskId.slice(0, 120)}/${taskId}_${index + 1}.${ext}`;
                const publicUrl = await uploadToR2(path, buf, ct || `image/${ext}`);
                return typeof publicUrl === "string" ? publicUrl.trim() : "";
              } catch {
                return "";
              }
            };

            let chosen = "";
            for (let i = 0; i < coverImages.length; i++) {
              chosen = await tryDownloadAndStore(coverImages[i], i);
              if (chosen) break;
            }

            const finalUrl = chosen.slice(0, 2000);
            if (finalUrl) {
              await admin
                .from("library_items")
                .update({ cover_url: finalUrl })
                .eq("user_id", userId)
                .eq("type", "song")
                .eq("suno_task_id", originalTaskId.slice(0, 200))
                .is("deleted_at", null);
            }
          } else if (Number.isFinite(code) && code !== 200) {
            const cost = Number(taskRow?.cost ?? 0);
            const consumed = Boolean(taskRow?.consumed);
            if (consumed && Number.isFinite(cost) && cost > 0) {
              await adjustUserCredits(admin, userId, cost);
              await admin.from("suno_tasks").update({ consumed: false }).eq("task_id", taskId).eq("user_id", userId);
            }
          }
        } else if (code === 200 && (callbackType === "first" || callbackType === "complete") && userId) {
          const normalized = tracks
            .map((t: any, idx: number) => ({
              idx,
              sunoAudioId: String(t?.id || "").trim(),
              audioUrl: String(t?.audio_url || t?.audioUrl || t?.stream_audio_url || t?.streamAudioUrl || "").trim(),
              coverUrl: String(t?.image_url || t?.imageUrl || "").trim(),
              title: String(t?.title || "").trim(),
              tags: String(t?.tags || "").trim(),
            }))
            .filter((t: any) => t.sunoAudioId && t.audioUrl);

          const ids = Array.from(new Set(normalized.map((x: any) => x.sunoAudioId)));
          if (ids.length > 0) {
            const { data: existing } = await admin
              .from("library_items")
              .select("id, suno_audio_id, audio_url, suno_model")
              .eq("user_id", userId)
              .eq("type", "song")
              .in("suno_audio_id", ids)
              .is("deleted_at", null);
            const existingRows = Array.isArray(existing) ? existing : [];
            const existingBySunoAudioId = new Map(
              existingRows
                .map((r: any) => {
                  const sid = String(r?.suno_audio_id || "").trim();
                  if (!sid) return null;
                  return [
                    sid,
                    {
                      id: r?.id,
                      audioUrl: typeof r?.audio_url === "string" ? String(r.audio_url || "").trim() : "",
                      sunoModel: typeof r?.suno_model === "string" ? String(r.suno_model || "").trim() : "",
                    },
                  ] as any;
                })
                .filter(Boolean) as any
            );

            // Función para verificar si una URL es de R2
            const isR2Url = (url: string) => {
              try {
                const u = new URL(url);
                const host = (u.hostname || "").toLowerCase();
                return host.includes(".r2.cloudflarestorage.com") || host.endsWith(".r2.dev");
              } catch {
                return false;
              }
            };

            // Procesar cada canción para copiar a R2 si es necesario
            const insertRows: any[] = [];
            await Promise.all(
              normalized.map(async (x: any) => {
                const existingRow = existingBySunoAudioId.get(x.sunoAudioId) || null;
                const hadExisting = Boolean(existingRow);
                  let finalAudioUrl = x.audioUrl;
                  
                  // Solo procesar si no es ya una URL de R2
                  if (!isR2Url(x.audioUrl)) {
                    console.log(`📦 [sunoWebhook] Copiando audio a R2: "${x.title}" (${x.audioUrl.substring(0, 80)}...)`);

                    let fetchStatus: number | null = null;
                    let downloadMs: number | null = null;
                    let sizeBytes: number | null = null;
                    let contentType: string | null = null;
                    let fallbackUsed = false;
                    let errorStep: string | null = null;
                    let errorMessage: string | null = null;
                    let response: Response | null = null;
                    let buffer: Buffer | null = null;

                    // TEMP-LOGGING: quitar despues de diagnostico
                    const startedAt = Date.now();

                    try {
                      const ctrl = new AbortController();
                      const timer = setTimeout(() => ctrl.abort(), 90_000);
                      response = await fetch(x.audioUrl, { signal: ctrl.signal as any });
                      clearTimeout(timer);
                      fetchStatus = Number((response as any)?.status || 0) || null;
                      downloadMs = Date.now() - startedAt;
                      if (!response.ok) {
                        fallbackUsed = true;
                        errorStep = "fetch";
                        errorMessage = `HTTP ${response.status}`;
                      }
                    } catch (fetchError) {
                      fallbackUsed = true;
                      errorStep = "fetch";
                      errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
                    }

                    if (!fallbackUsed && response) {
                      try {
                        contentType = (response.headers.get("content-type") || "audio/mpeg").toString().trim();
                        const arrayBuffer = await response.arrayBuffer();
                        buffer = Buffer.from(arrayBuffer);
                        sizeBytes = buffer.length;
                        if (!buffer.length) {
                          fallbackUsed = true;
                          errorStep = "arrayBuffer";
                          errorMessage = "Audio vacio al leer response.arrayBuffer()";
                        }
                      } catch (bufferError) {
                        fallbackUsed = true;
                        errorStep = "arrayBuffer";
                        errorMessage = bufferError instanceof Error ? bufferError.message : String(bufferError);
                      }
                    }

                    if (!fallbackUsed && buffer) {
                      try {
                        const safeBase = (x.sunoAudioId || x.title || "audio")
                          .replace(/[\\/:*?"<>|]+/g, "_")
                          .replace(/\s+/g, "_")
                          .replace(/[^a-zA-Z0-9._-]+/g, "_")
                          .slice(0, 80);
                        const path = `imports/${userId}/${Date.now()}_${safeBase || "audio"}.mp3`;

                        console.log(`⬆️  [sunoWebhook] Subiendo audio a R2: ${path} (${buffer.length} bytes, ${contentType || "audio/mpeg"})`);
                        finalAudioUrl = await uploadToR2(path, buffer, contentType || "audio/mpeg");
                        console.log(`✅ [sunoWebhook] Audio subido a R2: ${finalAudioUrl.substring(0, 100)}...`);
                      } catch (uploadError) {
                        fallbackUsed = true;
                        errorStep = "uploadToR2";
                        errorMessage = uploadError instanceof Error ? uploadError.message : String(uploadError);
                      }
                    }

                    // TEMP-LOGGING: quitar despues de diagnostico
                    await insertR2CopyLog(admin, {
                      taskId: taskId,
                      userId,
                      kind: String(kind || ""),
                      sunoAudioId: String(x.sunoAudioId || ""),
                      sourceUrl: String(x.audioUrl || ""),
                      fetchStatus,
                      downloadMs,
                      sizeBytes,
                      contentType,
                      fallbackUsed,
                      errorStep,
                      errorMessage,
                    });

                    if (fallbackUsed) {
                      console.log(`🔄 [sunoWebhook] Usando URL original como fallback: ${x.audioUrl.substring(0, 100)}...`);
                    }
                  } else {
                    console.log(`✅ [sunoWebhook] Audio ya está en R2: "${x.title}" (${x.audioUrl.substring(0, 100)}...)`);
                  }

                  const finalAudioUrlTrimmed = typeof finalAudioUrl === "string" ? finalAudioUrl.trim() : "";

                  if (hadExisting) {
                    const prevAudioUrl = existingRow && existingRow.audioUrl ? String(existingRow.audioUrl || "").trim() : "";
                    const shouldUpdate =
                      Boolean(finalAudioUrlTrimmed) &&
                      isR2Url(finalAudioUrlTrimmed) &&
                      (!prevAudioUrl || !isR2Url(prevAudioUrl) || prevAudioUrl !== finalAudioUrlTrimmed);

                    if (shouldUpdate) {
                      const updatePayload = { audio_url: finalAudioUrlTrimmed.slice(0, 2000) };
                      const prevModel = existingRow && existingRow.sunoModel ? String(existingRow.sunoModel || "").trim() : "";
                      if (requestedModel && !prevModel) updatePayload.suno_model = requestedModel.slice(0, 20);
                      const { error: updateErr } = await admin
                        .from("library_items")
                        .update(updatePayload)
                        .eq("user_id", userId)
                        .eq("type", "song")
                        .eq("suno_audio_id", x.sunoAudioId.slice(0, 200))
                        .is("deleted_at", null);

                      if (updateErr) {
                        console.error(
                          "[R2_AUDIO_URL_UPDATE][FAILED]",
                          JSON.stringify(
                            {
                              taskId: String(taskId || "").slice(0, 200),
                              userId: String(userId || "").slice(0, 80),
                              sunoAudioId: String(x.sunoAudioId || "").slice(0, 200),
                              prevAudioUrl: prevAudioUrl ? prevAudioUrl.slice(0, 200) : "",
                              nextAudioUrl: finalAudioUrlTrimmed ? finalAudioUrlTrimmed.slice(0, 200) : "",
                              error: updateErr.message,
                            },
                            null,
                            2
                          )
                        );

                        await insertR2CopyLog(admin, {
                          taskId: taskId,
                          userId,
                          kind: "library_items_audio_url_update",
                          sunoAudioId: String(x.sunoAudioId || ""),
                          sourceUrl: String(x.audioUrl || ""),
                          fetchStatus: null,
                          downloadMs: null,
                          sizeBytes: null,
                          contentType: null,
                          fallbackUsed: false,
                          errorStep: "update_audio_url",
                          errorMessage: updateErr.message,
                        });
                      } else {
                        console.log(
                          `✅ [sunoWebhook] Actualicé audio_url a R2 en library_items: ${String(x.sunoAudioId || "").slice(0, 80)}`
                        );
                      }
                    }
                    return;
                  }

                  insertRows.push({
                    user_id: userId,
                    type: "song",
                    title: (() => {
                      const base = (x.title || "Canción").toString().trim();
                      const suffix =
                        normalized.length === 2
                          ? x.idx === 0
                            ? "A"
                            : x.idx === 1
                              ? "B"
                              : String(x.idx + 1)
                          : normalized.length > 1
                            ? String(x.idx + 1)
                            : "";
                      if (!suffix) return base.slice(0, 120);
                      const hasSuffix = new RegExp(`\\s${suffix}$`, "i").test(base);
                      return (hasSuffix ? base : `${base} ${suffix}`).slice(0, 120);
                    })(),
                    description: null,
                    lyrics: null,
                    gender: null,
                    audio_url: finalAudioUrlTrimmed.slice(0, 2000),
                    cover_url: x.coverUrl ? x.coverUrl.slice(0, 2000) : null,
                    suno_task_id: taskId.slice(0, 200),
                    suno_audio_id: x.sunoAudioId.slice(0, 200),
                    suno_model: requestedModel ? requestedModel.slice(0, 20) : null,
                    is_cover: Boolean(isCover),
                  });
                })
            );

            if (insertRows.length > 0) {
              console.log(`📥 [sunoWebhook] Insertando ${insertRows.length} canciones en la base de datos`);
              const { error: insertErr } = await admin.from("library_items").insert(insertRows);
              if (insertErr) {
                console.error(
                  "[SUNO_WEBHOOK][LIBRARY_INSERT_FAILED]",
                  JSON.stringify(
                    {
                      taskId: String(taskId || "").slice(0, 200),
                      userId: String(userId || "").slice(0, 80),
                      error: insertErr.message,
                    },
                    null,
                    2
                  )
                );
              } else {
                console.log(`✅ [sunoWebhook] Canciones insertadas exitosamente`);
              }
            }
          }
        } else if (userId && (callbackType === "error" || (Number.isFinite(code) && code !== 200))) {
          const cost = Number(taskRow?.cost ?? 0);
          const consumed = Boolean(taskRow?.consumed);
          if (consumed && Number.isFinite(cost) && cost > 0) {
            await adjustUserCredits(admin, userId, cost);
            await admin.from("suno_tasks").update({ consumed: false }).eq("task_id", taskId).eq("user_id", userId);
          }
        }
      }
    } catch {
    }

    return send(res, 200, { ok: true, received: true, code: Number.isFinite(code) ? code : null, msg: msg ? msg.slice(0, 120) : null });
  };
})();

const shareHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const id = pickQuery(req, "id").trim();
    if (!id) return send(res, 400, { error: "Falta id" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
      const idRaw = id.slice(0, 200);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idRaw);
      const isNumeric = /^[0-9]+$/.test(idRaw);
      let query = admin
        .from("library_items")
        .select("id, user_id, title, description, lyrics, suno_model, audio_url, cover_url, created_at, deleted_at, type, suno_audio_id")
        .eq("type", "song");
      if (isNumeric) query = query.eq("id", idRaw);
      else if (isUuid) query = query.eq("suno_audio_id", idRaw);
      else return send(res, 404, { error: "No encontrada" });
      const { data, error } = await query.maybeSingle();
      if (error) return send(res, 500, { error: "No pude buscar la canción", detail: error.message });
      if (!data || data.deleted_at) return send(res, 404, { error: "No encontrada" });

      const audioUrl = typeof (data as any).audio_url === "string" ? (data as any).audio_url.trim() : "";
      const title = typeof (data as any).title === "string" ? (data as any).title.trim() : "";
      const coverUrl = typeof (data as any).cover_url === "string" ? (data as any).cover_url.trim() : "";
      let sellerName = "";
      let sellerPhone = "";
      try {
        const getUserById = (admin?.auth as any)?.admin?.getUserById;
        const userId = String((data as any)?.user_id || "").trim();
        if (userId && typeof getUserById === "function") {
          const uout = await getUserById.call((admin.auth as any).admin, userId);
          const user = uout?.data?.user || null;
          const meta: any = (user as any)?.user_metadata ?? (user as any)?.raw_user_meta_data ?? {};
          sellerName = String(meta?.full_name || meta?.name || meta?.display_name || "").trim();
          sellerPhone = String(meta?.contact_phone || "").trim();
        }
      } catch {
      }
      if (!audioUrl) return send(res, 404, { error: "No hay audio para compartir" });

      return send(res, 200, {
        id: String((data as any).id || ""),
        title,
        description: String((data as any).description || ""),
        lyrics: String((data as any).lyrics || ""),
        model: String((data as any).suno_model || ""),
        createdAt: (data as any).created_at || null,
        genre: "",
        isPublic: true,
        audioUrl,
        coverUrl: coverUrl || "",
        sellerName,
        sellerPhone,
      });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const sharePreviewHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  function originFromReq(req: any) {
    const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    return `${proto}://${host}`;
  }

  function sanitizeDispositionName(name: string, fallback: string) {
    const s = (name || "").toString().replaceAll("\r", " ").replaceAll("\n", " ").trim();
    const cleaned = s.replaceAll(/[^a-zA-Z0-9._ -]+/g, "_").replaceAll(/\s+/g, " ").trim().slice(0, 120);
    return cleaned || fallback;
  }

  async function serveR2Object(req: any, res: any, key: string, downloadName?: string) {
    const env = getR2Env();
    const client = await getR2Client();
    const { GetObjectCommand } = await getR2AwsSdk();
    const range = (req.headers?.range || req.headers?.Range || "").toString().trim();
    const command = new GetObjectCommand({
      Bucket: env.bucketName,
      Key: key,
      ...(range ? { Range: range } : {}),
    });
    const out: any = await client.send(command);

    const isPartial = Boolean(range);
    res.statusCode = isPartial ? 206 : 200;
    res.setHeader("cache-control", "no-store, max-age=0, s-maxage=0, must-revalidate");
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "range, content-type");
    res.setHeader("access-control-expose-headers", "accept-ranges, content-length, content-range, content-type");
    res.setHeader("accept-ranges", "bytes");
    res.setHeader("content-type", String(out?.ContentType || "audio/mpeg").trim() || "audio/mpeg");
    if (downloadName) {
      const safe = sanitizeDispositionName(downloadName, "preview.mp3");
      res.setHeader("content-disposition", `attachment; filename=\"${safe.replaceAll('\"', '')}\"`);
      res.setHeader("access-control-expose-headers", "accept-ranges, content-length, content-range, content-type, content-disposition");
    }
    if (out?.ContentLength != null) res.setHeader("content-length", String(out.ContentLength));
    if (out?.ContentRange) res.setHeader("content-range", String(out.ContentRange));

    if ((req.method || "").toUpperCase() === "HEAD") {
      res.end();
      return;
    }

    const body = out?.Body;
    if (body?.pipe) {
      body.pipe(res);
      return;
    }
    if (body?.transformToWebStream) {
      try {
        const mod = await import("stream");
        const Readable = (mod as any).Readable;
        if (Readable?.fromWeb) {
          Readable.fromWeb(body.transformToWebStream()).pipe(res);
          return;
        }
      } catch {
      }
    }
    const ab = await (body?.arrayBuffer?.() ?? Promise.resolve(null)).catch(() => null);
    if (!ab) {
      res.statusCode = 502;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "No pude leer el audio del preview" }));
      return;
    }
    res.end(Buffer.from(ab));
  }

  function missingTable(error: any) {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
  }

  async function handleGetPreview(req: any, res: any) {
    const id = pickQuery(req, "id").trim();
    if (!id) return send(res, 400, { error: "Falta id" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

      const pr = await admin
        .from("preview_shares")
        .select("id, song_id, created_by, client_label, has_countdown, expires_at, is_paid, paid_at, created_at")
        .eq("id", id.slice(0, 200))
        .maybeSingle();
      if (pr.error) {
        if (missingTable(pr.error)) {
          return send(res, 500, {
            error: "Falta configurar las tablas de previews",
            hint: "Ejecuta la migración nueva de Supabase para preview_shares y vendor_settings.",
            detail: pr.error.message,
          });
        }
        return send(res, 500, { error: "No pude buscar el preview", detail: pr.error.message });
      }

      const share = pr.data as any;
      if (!share) return send(res, 404, { error: "Preview no encontrado" });

      // Get creator contact info from profile/auth metadata
      const { data: creatorProfile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", share.created_by)
        .maybeSingle();
      const creatorEmail = (creatorProfile as any)?.email || "";
      let creatorName = "";
      let creatorPhone = "";
      try {
        const getUserById = (admin?.auth as any)?.admin?.getUserById;
        if (typeof getUserById === "function") {
          const uout = await getUserById.call((admin.auth as any).admin, String((share as any).created_by || ""));
          const user = uout?.data?.user || null;
          const meta: any = (user as any)?.user_metadata ?? (user as any)?.raw_user_meta_data ?? {};
          creatorName = String(meta?.full_name || meta?.name || meta?.display_name || "").trim();
          creatorPhone = String(meta?.contact_phone || "").trim();
        }
      } catch {
      }

      const songIdRaw = String((share as any).song_id || "").trim();
      const songIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(songIdRaw);
      const songIsNumeric = /^[0-9]+$/.test(songIdRaw);
      let songQuery = admin
        .from("library_items")
        .select("id, title, description, lyrics, suno_model, audio_url, cover_url, created_at, deleted_at, type, suno_audio_id")
        .eq("type", "song");
      if (songIsNumeric) songQuery = songQuery.eq("id", songIdRaw);
      else if (songIsUuid) songQuery = songQuery.eq("suno_audio_id", songIdRaw);
      else songQuery = songQuery.eq("id", songIdRaw);
      const sr = await songQuery.maybeSingle();
      if (sr.error) return send(res, 500, { error: "No pude buscar la canción", detail: sr.error.message });
      if (!sr.data || (sr.data as any).deleted_at) return send(res, 404, { error: "La canción ya no está disponible" });

      
      // Get product pricing
      const productType = "cancion_generada";
      const pp = await admin
        .from("product_pricing")
        .select("product_type, unlock_price_mxn, empleado_commission_mxn")
        .eq("product_type", productType)
        .maybeSingle();
      const unlockPrice = Number((pp.data as any)?.unlock_price_mxn) || 250;

const song = sr.data as any;
      const previewAudioUrl = `/api/share/preview/audio?id=${encodeURIComponent(String((share as any).id || ""))}`;
      return send(res, 200, {
        ok: true,
        id: String((share as any).id || ""),
        songId: String(song?.id || (share as any).song_id || ""),
        createdBy: creatorEmail || String((share as any).created_by || ""),
        clientLabel: String((share as any).client_label || ""),
        hasCountdown: Boolean((share as any).has_countdown),
        expiresAt: (share as any).expires_at || null,
        isPaid: Boolean((share as any).is_paid),
        paidAt: (share as any).paid_at || null,
        createdAt: (share as any).created_at || null,
        title: String(song?.title || "Canción"),
        description: String(song?.description || ""),
        lyrics: String(song?.lyrics || ""),
        genre: "",
        model: String(song?.suno_model || ""),
        songCreatedAt: (song as any)?.created_at || null,
        isPublic: false,
        audioUrl: previewAudioUrl,
        coverUrl: String(song?.cover_url || ""),
        unlockPrice: unlockPrice,
        sellerName: creatorName || "",
        sellerPhone: creatorPhone || "",
      });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handlePreviewAudio(req: any, res: any) {
    const id = pickQuery(req, "id").trim();
    if (!id) return send(res, 400, { error: "Falta id" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
      const pr = await admin
        .from("preview_shares")
        .select("id, song_id, has_countdown, expires_at, is_paid")
        .eq("id", id.slice(0, 200))
        .maybeSingle();
      if (pr.error) return send(res, 500, { error: "No pude buscar el preview", detail: pr.error.message });
      const share = pr.data as any;
      if (!share) return send(res, 404, { error: "Preview no encontrado" });

      const expiresAt = String(share?.expires_at || "").trim();
      const expiredByTime = Boolean(share?.has_countdown) && !Boolean(share?.is_paid) && expiresAt
        ? Date.now() >= new Date(expiresAt).getTime()
        : false;
      if (expiredByTime) return send(res, 410, { error: "Preview expirado" });

      const rawSongId = String(share?.song_id || "").trim();
      let resolvedSongId = rawSongId;
      const rawIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawSongId);
      const rawIsNumeric = /^[0-9]+$/.test(rawSongId);
      if (rawSongId && !rawIsNumeric) {
        try {
          let sq = admin.from("library_items").select("id, deleted_at, type").eq("type", "song");
          sq = rawIsUuid ? sq.eq("suno_audio_id", rawSongId) : sq.eq("id", rawSongId);
          const sr = await sq.maybeSingle();
          if (!sr.error && sr.data && !(sr.data as any)?.deleted_at) {
            resolvedSongId = String((sr.data as any)?.id || rawSongId).trim();
          }
        } catch {
        }
      }
      if (!resolvedSongId) return send(res, 404, { error: "La canción ya no está disponible" });

      res.statusCode = 307;
      res.setHeader("location", `/api/share/song/audio?id=${encodeURIComponent(resolvedSongId)}${pickQuery(req, "dl") ? "&dl=1" : ""}`);
      res.end();
      return;
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleCleanupExpired(req: any, res: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
      const nowIso = new Date().toISOString();
      const rr = await admin
        .from("preview_shares")
        .select("id, watermarked_audio_key")
        .not("watermarked_audio_key", "is", null)
        .lte("expires_at", nowIso)
        .limit(200);
      if (rr.error) return send(res, 500, { error: "No pude buscar previews expirados", detail: rr.error.message });

      const rows = Array.isArray(rr.data) ? rr.data : [];
      const ids = rows.map((row: any) => String(row?.id || "").trim()).filter(Boolean);
      const keys = rows.map((row: any) => String(row?.watermarked_audio_key || "").trim()).filter(Boolean);
      let deletedFromR2 = 0;
      if (keys.length > 0) {
        deletedFromR2 = await deleteFromR2(keys).catch(() => 0);
      }
      if (ids.length > 0) {
        await admin
          .from("preview_shares")
          .update({ watermarked_audio_key: null })
          .in("id", ids);
      }

      return send(res, 200, {
        ok: true,
        found: rows.length,
        deletedFromR2,
        cleanedRows: ids.length,
      });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleCreatePayment(req: any, res: any) {
    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
    if (!mpToken) return send(res, 500, { error: "Falta MERCADO_PAGO_ACCESS_TOKEN en Vercel" });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const shareId = typeof body?.shareId === "string" ? body.shareId.trim().slice(0, 200) : "";
    if (!shareId) return send(res, 400, { error: "Falta shareId" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

      const pr = await admin
        .from("preview_shares")
        .select("id, song_id, created_by, is_paid")
        .eq("id", shareId)
        .maybeSingle();
      if (pr.error) return send(res, 500, { error: "No pude buscar el preview", detail: pr.error.message });
      const share = pr.data as any;
      if (!share) return send(res, 404, { error: "Preview no encontrado" });
      if (share.is_paid) return send(res, 400, { error: "Este preview ya ha sido pagado" });

      // Get product type (default to cancion_generada for now)
      const productType = "cancion_generada";
      
      // Get pricing from product_pricing table
      const pp = await admin
        .from("product_pricing")
        .select("product_type, unlock_price_mxn, empleado_commission_mxn")
        .eq("product_type", productType)
        .maybeSingle();
      const price = Number((pp.data as any)?.unlock_price_mxn) || 250;

      const origin = originFromReq(req);
      const preferenceBody: any = {
        items: [{ 
          title: "Desbloquear Canción", 
          quantity: 1, 
          currency_id: "MXN", 
          unit_price: price 
        }],
        external_reference: `share:${shareId}`,
        metadata: { 
          share_id: shareId, 
          song_id: share.song_id,
          product_type: productType,
          kind: "share_unlock"
        },
        back_urls: { 
          success: `${origin}/preview/${encodeURIComponent(shareId)}?mp=success`, 
          failure: `${origin}/preview/${encodeURIComponent(shareId)}?mp=failure`, 
          pending: `${origin}/preview/${encodeURIComponent(shareId)}?mp=pending` 
        },
        auto_return: "approved",
        notification_url: `${origin}/api/mercadopago/webhook`,
      };

      const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { authorization: `Bearer ${mpToken}`, "content-type": "application/json" },
        body: JSON.stringify(preferenceBody),
      });
      const mpData = await mpRes.json().catch(() => null);
      if (!mpRes.ok) return send(res, 502, { error: "Error creando pago en Mercado Pago", detail: mpData || null });

      const initPoint = typeof mpData?.init_point === "string" ? mpData.init_point : "";
      if (!initPoint) return send(res, 502, { error: "Respuesta inválida de Mercado Pago" });

      return send(res, 200, { init_point: initPoint, preference_id: mpData?.id || null });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    const third = isApi ? parts[3] : parts[2];
    const action = (third || next || pickQuery(req, "action") || "").toString().trim().toLowerCase();

    if (action === "create-payment") {
      if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
      return handleCreatePayment(req, res);
    }

    if (action === "audio") {
      if ((req.method || "").toUpperCase() !== "GET" && (req.method || "").toUpperCase() !== "HEAD") {
        return send(res, 405, { error: "Método no permitido" });
      }
      return handlePreviewAudio(req, res);
    }

    if (action === "cleanup-expired") {
      if ((req.method || "").toUpperCase() !== "GET" && (req.method || "").toUpperCase() !== "POST") {
        return send(res, 405, { error: "Método no permitido" });
      }
      return handleCleanupExpired(req, res);
    }

    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    return handleGetPreview(req, res);
  };
})();

const vendorHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  function originFromReq(req: any) {
    const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    return `${proto}://${host}`;
  }

  function missingTable(error: any) {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
  }

  function normalizeHours(raw: any) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true, user, admin };
  }

  async function handleGetSettings(req: any, res: any) {
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    try {
      const r = await auth.admin
        .from("vendor_settings")
        .select("user_id, countdown_default_hours, role, commission_type, commission_value, force_countdown_only, can_show_payment_info, watermark_version")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (r.error) {
        if (missingTable(r.error)) {
          return send(res, 200, { 
            ok: true, 
            countdown_default_hours: 24, 
            missing_table: true,
            role: "vendor",
            commission_type: "percentage",
            commission_value: 0,
            force_countdown_only: false,
            can_show_payment_info: true,
            watermark_version: "v1"
          });
        }
        return send(res, 500, { error: "No pude leer la configuración", detail: r.error.message });
      }
      const data = r.data as any;
      return send(res, 200, {
        ok: true,
        countdown_default_hours: normalizeHours(data?.countdown_default_hours) || 24,
        role: data?.role || "vendor",
        commission_type: data?.commission_type || "percentage",
        commission_value: Number(data?.commission_value) || 0,
        force_countdown_only: Boolean(data?.force_countdown_only),
        can_show_payment_info: Boolean(data?.can_show_payment_info),
        watermark_version: normalizeWatermarkVersion(data?.watermark_version),
      });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleSaveSettings(req: any, res: any) {
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const hours = normalizeHours(body?.countdown_default_hours);
    if (hours < 1) return send(res, 400, { error: "La duración debe ser mayor a 0." });

    // First get current settings to see if user is employee (role should be set by admin only)
    const currentSettings = await auth.admin
      .from("vendor_settings")
      .select("role, commission_type, commission_value, force_countdown_only, can_show_payment_info, watermark_version")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    const currentRole = (currentSettings.data as any)?.role || "vendor";

    // If role is employee, enforce force_countdown_only = true and can_show_payment_info = false
    const isEmployee = currentRole === "empleado";

    try {
      const row = {
        user_id: auth.user.id,
        countdown_default_hours: hours,
        updated_at: new Date().toISOString(),
        // These should only be editable by admin, but we'll keep current values
        role: currentRole,
        commission_type: (currentSettings.data as any)?.commission_type || "percentage",
        commission_value: Number((currentSettings.data as any)?.commission_value) || 0,
        force_countdown_only: isEmployee ? true : Boolean((currentSettings.data as any)?.force_countdown_only),
        can_show_payment_info: isEmployee ? false : Boolean((currentSettings.data as any)?.can_show_payment_info),
        watermark_version: normalizeWatermarkVersion((currentSettings.data as any)?.watermark_version),
      };
      const r = await auth.admin.from("vendor_settings").upsert(row, { onConflict: "user_id" });
      if (r.error) {
        if (missingTable(r.error)) {
          return send(res, 500, {
            error: "Falta configurar vendor_settings",
            hint: "Ejecuta la migración nueva de Supabase.",
            detail: r.error.message,
          });
        }
        return send(res, 500, { error: "No pude guardar la configuración", detail: r.error.message });
      }
      return send(res, 200, { 
        ok: true, 
        countdown_default_hours: hours,
        role: currentRole,
        force_countdown_only: isEmployee,
        can_show_payment_info: !isEmployee,
        watermark_version: normalizeWatermarkVersion((currentSettings.data as any)?.watermark_version),
      });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleCreatePreview(req: any, res: any) {
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const songId = typeof body?.songId === "string" ? body.songId.trim().slice(0, 200) : "";
    const clientLabel = typeof body?.clientLabel === "string" ? body.clientLabel.trim().slice(0, 120) : "";
    const hours = normalizeHours(body?.countdown_hours);
    const countdownMinutes = Math.max(0, Math.floor(Number(body?.countdown_minutes) || 0));
    const countdownUnit = typeof body?.countdown_unit === "string" ? body.countdown_unit.trim().toLowerCase() : "";
    if (!songId) return send(res, 400, { error: "Falta songId" });

    // Get vendor settings to check force_countdown_only
    const vs = await auth.admin
      .from("vendor_settings")
      .select("force_countdown_only, role")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    const forceCountdown = Boolean((vs.data as any)?.force_countdown_only) || (vs.data as any)?.role === "empleado";
    
    // Enforce countdown if force_countdown_only is true
    const hasCountdown = forceCountdown ? true : Boolean(body?.hasCountdown);
    const durationMinutes = (() => {
      if (!hasCountdown) return 0;
      if (countdownUnit === "minutes" && countdownMinutes > 0) return countdownMinutes;
      return Math.max(0, hours) * 60;
    })();
    if (hasCountdown && durationMinutes < 1) return send(res, 400, { error: "La duración debe ser mayor a 0." });
    if (forceCountdown && !hasCountdown) return send(res, 400, { error: "Debes activar el temporizador." });

    try {
      const sr = await auth.admin
        .from("library_items")
        .select("id, user_id, title, audio_url, deleted_at, type")
        .eq("id", songId)
        .eq("user_id", auth.user.id)
        .eq("type", "song")
        .is("deleted_at", null)
        .maybeSingle();
      if (sr.error) return send(res, 500, { error: "No pude leer tu canción", detail: sr.error.message });
      if (!sr.data) return send(res, 404, { error: "No encontré esa canción" });
      if (!String((sr.data as any)?.audio_url || "").trim()) return send(res, 400, { error: "Esta canción no tiene audio" });

      const expiresAt = hasCountdown ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString() : null;
      const row = {
        song_id: songId,
        created_by: auth.user.id,
        client_label: clientLabel || null,
        has_countdown: hasCountdown,
        expires_at: expiresAt,
        is_paid: false,
        paid_at: null,
      };
      const ir = await auth.admin
        .from("preview_shares")
        .insert(row)
        .select("id, song_id, created_by, client_label, has_countdown, expires_at, is_paid, paid_at, created_at")
        .maybeSingle();
      if (ir.error) {
        if (missingTable(ir.error)) {
          return send(res, 500, {
            error: "Falta configurar preview_shares",
            hint: "Ejecuta la migración nueva de Supabase.",
            detail: ir.error.message,
          });
        }
        return send(res, 500, { error: "No pude crear el preview", detail: ir.error.message });
      }

      const share = ir.data as any;

      return send(res, 200, {
        ok: true,
        id: String(share?.id || ""),
        url: `${originFromReq(req)}/preview/${encodeURIComponent(String(share?.id || ""))}`,
        songId: String(share?.song_id || ""),
        clientLabel: String(share?.client_label || ""),
        hasCountdown: Boolean(share?.has_countdown),
        expiresAt: share?.expires_at || null,
        isPaid: Boolean(share?.is_paid),
        createdAt: share?.created_at || null,
        durationMinutes,
      });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleListPreviews(req: any, res: any) {
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    try {
      const rr = await auth.admin
        .from("preview_shares")
        .select("id, song_id, client_label, has_countdown, expires_at, is_paid, paid_at, created_at")
        .eq("created_by", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (rr.error) {
        if (missingTable(rr.error)) return send(res, 200, { ok: true, items: [], missing_table: true });
        return send(res, 500, { error: "No pude listar los previews", detail: rr.error.message });
      }

      const rows = Array.isArray(rr.data) ? rr.data : [];
      const songIds = rows.map((x: any) => String(x?.song_id || "").trim()).filter(Boolean);
      let songMap: Record<string, any> = {};
      if (songIds.length > 0) {
        const sr = await auth.admin.from("library_items").select("id, title, cover_url").in("id", songIds);
        if (!sr.error && Array.isArray(sr.data)) {
          songMap = sr.data.reduce((acc: any, row: any) => {
            const sid = String(row?.id || "").trim();
            if (!sid) return acc;
            acc[sid] = row;
            return acc;
          }, {});
        }
      }

      const items = rows.map((row: any) => {
        const song = songMap[String(row?.song_id || "").trim()] || {};
        return {
          id: String(row?.id || ""),
          songId: String(row?.song_id || ""),
          title: String(song?.title || "Canción"),
          coverUrl: String(song?.cover_url || ""),
          clientLabel: String(row?.client_label || ""),
          hasCountdown: Boolean(row?.has_countdown),
          expiresAt: row?.expires_at || null,
          isPaid: Boolean(row?.is_paid),
          paidAt: row?.paid_at || null,
          createdAt: row?.created_at || null,
          url: `${originFromReq(req)}/preview/${encodeURIComponent(String(row?.id || ""))}`,
        };
      });

      return send(res, 200, { ok: true, items });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleMarkPaid(req: any, res: any) {
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const id = typeof body?.id === "string" ? body.id.trim().slice(0, 200) : "";
    if (!id) return send(res, 400, { error: "Falta id" });

    try {
      const paidAt = new Date().toISOString();
      const ur = await auth.admin
        .from("preview_shares")
        .update({ is_paid: true, paid_at: paidAt })
        .eq("id", id)
        .eq("created_by", auth.user.id)
        .select("id, is_paid, paid_at")
        .maybeSingle();
      if (ur.error) {
        if (missingTable(ur.error)) {
          return send(res, 500, {
            error: "Falta configurar preview_shares",
            hint: "Ejecuta la migración nueva de Supabase.",
            detail: ur.error.message,
          });
        }
        return send(res, 500, { error: "No pude marcar como pagado", detail: ur.error.message });
      }
      if (!ur.data) return send(res, 404, { error: "Preview no encontrado" });
      return send(res, 200, { ok: true, id: String((ur.data as any).id || ""), is_paid: true, paid_at: (ur.data as any).paid_at || paidAt });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    const third = isApi ? parts[3] : parts[2];
    if (head !== "vendor") return send(res, 404, { error: "Ruta no encontrada" });

    const action = (third || next || pickQuery(req, "action") || "").toString().trim().toLowerCase();
    if (action === "settings") {
      if ((req.method || "").toUpperCase() === "GET") return handleGetSettings(req, res);
      if ((req.method || "").toUpperCase() === "POST") return handleSaveSettings(req, res);
      return send(res, 405, { error: "Método no permitido" });
    }
    if (action === "preview-shares") {
      if ((req.method || "").toUpperCase() === "GET") return handleListPreviews(req, res);
      return send(res, 405, { error: "Método no permitido" });
    }
    if (action === "create-preview") {
      if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
      return handleCreatePreview(req, res);
    }
    if (action === "mark-paid") {
      if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
      return handleMarkPaid(req, res);
    }
    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

const shareSongAudioHandler = (() => {
  function sendJson(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  function looksExpiringUrl(url: string) {
    const u = (url || "").toString();
    if (!u) return false;
    if (!u.includes("?")) return false;
    return /[?&](x-amz-signature|x-amz-credential|x-amz-algorithm|x-amz-expires|x-amz-date|expires|signature|token)=/i.test(u);
  }

  function normalizeHttpUrl(url: string) {
    const u = (url || "").toString().trim();
    if (!u) return "";
    if (/^https:\/\//i.test(u)) return u;
    if (/^http:\/\//i.test(u)) return u.replace(/^http:\/\//i, "https://");
    if (/^\/\//.test(u)) return `https:${u}`;
    return u;
  }

  function extractR2KeyFromUrlOrKey(raw: string) {
    const s = (raw || "").toString().trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) {
      const loc = parseR2LocationFromUrlString(s);
      return loc?.key || "";
    }
    return s.includes("/") ? s.replace(/^\/+/, "") : "";
  }

  function sanitizeDispositionName(name: string, fallback: string) {
    const s = (name || "").toString().replaceAll("\r", " ").replaceAll("\n", " ").trim();
    const cleaned = s.replaceAll(/[^a-zA-Z0-9._ -]+/g, "_").replaceAll(/\s+/g, " ").trim().slice(0, 120);
    return cleaned || fallback;
  }

  async function serveR2Object(req: any, res: any, key: string, downloadName?: string, bucketOverride?: string) {
    const env = getR2Env();
    const client = await getR2Client();
    const { GetObjectCommand } = await getR2AwsSdk();
    const range = (req.headers?.range || req.headers?.Range || "").toString().trim();
    const bucket = (bucketOverride || env.bucketName || "").toString().trim() || env.bucketName;
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(range ? { Range: range } : {}),
    });
    const out: any = await client.send(command);

    const isPartial = Boolean(range);
    res.statusCode = isPartial ? 206 : 200;
    res.setHeader("cache-control", "no-store, max-age=0, s-maxage=0, must-revalidate");
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "range, content-type");
    res.setHeader("access-control-expose-headers", "accept-ranges, content-length, content-range, content-type");
    res.setHeader("accept-ranges", "bytes");

    const ct = typeof out?.ContentType === "string" && out.ContentType.trim() ? out.ContentType.trim() : "audio/mpeg";
    res.setHeader("content-type", ct);
    if (downloadName) {
      const safe = sanitizeDispositionName(downloadName, "audio.mp3");
      res.setHeader("content-disposition", `attachment; filename=\"${safe.replaceAll('\"', '')}\"`);
      res.setHeader("access-control-expose-headers", "accept-ranges, content-length, content-range, content-type, content-disposition");
    }
    if (out?.ContentLength != null) res.setHeader("content-length", String(out.ContentLength));
    if (out?.ContentRange) res.setHeader("content-range", String(out.ContentRange));

    const method = (req.method || "").toUpperCase();
    if (method === "HEAD") {
      res.end();
      return;
    }

    const body = out?.Body;
    if (body?.pipe) {
      body.pipe(res);
      return;
    }
    if (body?.transformToWebStream) {
      try {
        const mod = await import("stream");
        const Readable = (mod as any).Readable;
        if (Readable?.fromWeb) {
          Readable.fromWeb(body.transformToWebStream()).pipe(res);
          return;
        }
      } catch {
      }
    }
    const ab = await (body?.arrayBuffer?.() ?? Promise.resolve(null)).catch(() => null);
    if (!ab) {
      res.statusCode = 502;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "No pude leer el audio" }));
      return;
    }
    res.end(Buffer.from(ab));
  }

  function isAudioLikeContentType(ct: string) {
    const v = (ct || "").toString().trim().toLowerCase();
    if (!v) return false;
    if (v.startsWith("audio/")) return true;
    if (v === "application/octet-stream") return true;
    if (v.includes("mpeg") || v.includes("mp3") || v.includes("mp4") || v.includes("aac") || v.includes("wav") || v.includes("ogg")) return true;
    return false;
  }

  function extractBestTrackInfo(providerRaw: any, title: string) {
    const cleanStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim();
    const d = providerRaw?.data || providerRaw?.data?.data || providerRaw;
    const candidates: any[] = [];
    if (Array.isArray(d?.response?.data)) candidates.push(d.response.data);
    if (Array.isArray(d?.response?.sunoData)) candidates.push(d.response.sunoData);
    if (Array.isArray(d?.response)) candidates.push(d.response);
    if (Array.isArray(d?.data)) candidates.push(d.data);
    if (Array.isArray(d?.data?.data)) candidates.push(d.data.data);
    const list = (candidates.find((x) => Array.isArray(x) && x.length) as any[]) || [];

    const pickAudioUrl = (track: any) => {
      const raw =
        track?.audio_url ||
        track?.audioUrl ||
        track?.streamAudioUrl ||
        track?.stream_audio_url ||
        track?.stream_url ||
        track?.url ||
        track?.audio ||
        "";
      const s = cleanStr(raw);
      return /^https?:\/\//i.test(s) || /^\/\//.test(s) ? s : "";
    };
    const pickCoverUrl = (track: any) => {
      const raw =
        track?.image_url ||
        track?.imageUrl ||
        track?.cover_url ||
        track?.coverUrl ||
        track?.img_url ||
        track?.imgUrl ||
        "";
      const s = cleanStr(raw);
      return /^https?:\/\//i.test(s) || /^\/\//.test(s) ? s : "";
    };
    const pickAudioId = (track: any) => cleanStr(track?.id || track?.audio_id || track?.audioId || track?.audioID || "");

    const tracks = (Array.isArray(list) ? list : [])
      .map((track: any) => ({ audioUrl: pickAudioUrl(track), coverUrl: pickCoverUrl(track), audioId: pickAudioId(track) }))
      .filter((x: any) => x.audioUrl || x.coverUrl);

    if (tracks.length === 0) return { audioUrl: "", coverUrl: "", audioId: "" };
    const wantsB = /\sB$/i.test((title || "").toString().trim());
    const chosen = wantsB && tracks.length > 1 ? tracks[1] : tracks[0];
    return { audioUrl: cleanStr(chosen.audioUrl), coverUrl: cleanStr(chosen.coverUrl), audioId: cleanStr(chosen.audioId) };
  }

  function sunoErrorMessagePublic(data: any, fallback: string) {
    const msg =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      (typeof data?.msg === "string" && data.msg) ||
      fallback;
    return String(msg);
  }

  async function sunoFetchJsonPublic(path: string, init?: RequestInit) {
    const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
    const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";
    const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";

    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (apiKey && !headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);

    const url = new URL(path, base).toString();
    const res = await fetch(url, { ...init, headers });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { res, data, text };
  }

  async function resolveFreshFromSuno(taskId: string, title: string) {
    const enc = encodeURIComponent(taskId);
    const paths = [
      `/api/v1/generate/record-info?taskId=${enc}`,
      `/api/v1/suno/generate/record-info?taskId=${enc}`,
      `/api/v1/task/${enc}`,
      `/api/v1/suno/task/${enc}`,
    ];
    let last: any = null;
    for (const p of paths) {
      const r = await sunoFetchJsonPublic(p, { method: "GET" });
      last = r;
      if (r?.res?.status !== 404) break;
    }
    const { res: r, data, text } = last || {};
    if (!r) return { ok: false as const, error: "No pude contactar al proveedor" };
    if (!r.ok) {
      const msg = sunoErrorMessagePublic(data, text || `HTTP ${r.status}`);
      return { ok: false as const, error: String(msg).slice(0, 1200) };
    }
    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessagePublic(data, "Error del proveedor");
      return { ok: false as const, error: String(msg).slice(0, 1200) };
    }
    const best = extractBestTrackInfo(data, title || "");
    const audioUrl = normalizeHttpUrl(best.audioUrl);
    const coverUrl = normalizeHttpUrl(best.coverUrl);
    return { ok: true as const, audioUrl, coverUrl, audioId: best.audioId || "" };
  }

  async function probeAudio(url: string) {
    try {
      const headers: Record<string, string> = { range: "bytes=0-1" };
      const r = await fetch(url, { method: "GET", headers });
      const status = Number(r.status || 0);
      const ct = (r.headers.get("content-type") || "").toString();
      return { ok: status >= 200 && status < 400, status, ct };
    } catch {
      return { ok: false, status: 0, ct: "" };
    }
  }

  function parseR2LocationFromUrlString(rawUrl: string): { bucket: string; key: string } | null {
    const env = getR2Env();
    const s = (rawUrl || "").toString().trim();
    if (!/^https?:\/\//i.test(s)) return null;
    try {
      const u = new URL(s);
      const host = (u.hostname || "").toLowerCase();
      const path = (u.pathname || "").replace(/^\/+/, "");
      const endsCloudflareStorage = host.endsWith(".r2.cloudflarestorage.com");
      const endsDev = host.endsWith(".r2.dev");
      const isR2 = endsCloudflareStorage || endsDev;
      if (!isR2) return null;

      const parts = path.split("/").filter(Boolean);
      if (endsCloudflareStorage) {
        const accountHost = `${String(env.accountId || "").toLowerCase()}.r2.cloudflarestorage.com`;
        if (host === accountHost) {
          const bucket = parts[0] || "";
          const key = parts.slice(1).join("/");
          if (!bucket || !key) return null;
          return { bucket, key };
        }
        const labels = host.split(".");
        const bucket = labels[0] || "";
        const key = path;
        if (!bucket || !key) return null;
        return { bucket, key };
      }

      if (endsDev) {
        const bucket = String(env.bucketName || "").trim();
        const key = path;
        if (!bucket || !key) return null;
        return { bucket, key };
      }

      return null;
    } catch {
      return null;
    }
  }

  return async function handler(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "GET,HEAD,OPTIONS");
      res.setHeader("access-control-allow-headers", "range, content-type");
      res.setHeader("access-control-max-age", "86400");
      res.end();
      return;
    }
    if (method !== "GET" && method !== "HEAD") return sendJson(res, 405, { error: "Método no permitido" });

    const id = pickQuery(req, "id").trim();
    if (!id) return sendJson(res, 400, { error: "Falta id" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) {
      return sendJson(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
      const idRaw = id.slice(0, 200);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idRaw);
      const isNumeric = /^[0-9]+$/.test(idRaw);
      let query = admin
        .from("library_items")
        .select("id, title, audio_url, cover_url, deleted_at, type, suno_task_id, suno_audio_id")
        .eq("type", "song");
      if (isNumeric) query = query.eq("id", idRaw);
      else if (isUuid) query = query.eq("suno_audio_id", idRaw);
      else return sendJson(res, 404, { error: "No encontrada" });
      const { data, error } = await query.maybeSingle();
      if (error) return sendJson(res, 500, { error: "No pude buscar la canción", detail: error.message });
      if (!data || (data as any).deleted_at) return sendJson(res, 404, { error: "No encontrada" });

      const title = typeof (data as any).title === "string" ? (data as any).title.trim() : "";
      let audioUrl = typeof (data as any).audio_url === "string" ? (data as any).audio_url.trim() : "";
      const sunoTaskId = typeof (data as any).suno_task_id === "string" ? (data as any).suno_task_id.trim() : "";

      const initialR2Key = extractR2KeyFromUrlOrKey(audioUrl);
      const initialR2Loc = /^https?:\/\//i.test((audioUrl || "").toString().trim())
        ? parseR2LocationFromUrlString(audioUrl)
        : null;
      const hasStoredR2Audio = Boolean(initialR2Loc?.key || initialR2Key);
      const shouldRefresh =
        !audioUrl ||
        (!hasStoredR2Audio && (looksExpiringUrl(audioUrl) || /^http:\/\//i.test(audioUrl)));
      if (shouldRefresh && sunoTaskId) {
        const fresh = await resolveFreshFromSuno(sunoTaskId, title || "");
        if (fresh.ok && fresh.audioUrl) {
          audioUrl = fresh.audioUrl;
        }
      }

      const wantDownload = (() => {
        const raw = pickQuery(req, "dl") || pickQuery(req, "download");
        const v = (raw || "").toString().trim().toLowerCase();
        return v === "1" || v === "true" || v === "yes" || v === "si";
      })();
      const dlName = wantDownload ? pickQuery(req, "filename") || pickQuery(req, "name") || "" : "";
      const fallbackName = sanitizeDispositionName((title || "Cancion").toString(), "Cancion");
      const downloadName = wantDownload ? sanitizeDispositionName(dlName, `${fallbackName}.mp3`) : "";

      const r2Key = extractR2KeyFromUrlOrKey(audioUrl);
      const r2Loc = /^https?:\/\//i.test((audioUrl || "").toString().trim()) ? parseR2LocationFromUrlString(audioUrl) : null;
      const audioLooksR2 = Boolean(r2Loc?.key || r2Key);
      if (audioLooksR2 && (r2Loc?.key || r2Key)) {
        try {
          const keyToServe = r2Loc?.key || r2Key;
          const bucketToServe = r2Loc?.bucket || undefined;
          await serveR2Object(req, res, keyToServe, downloadName || undefined, bucketToServe);
          return;
        } catch (e) {
          return sendJson(res, 502, { error: "No pude cargar el audio", detail: e instanceof Error ? e.message : String(e) });
        }
      }

      audioUrl = normalizeHttpUrl(audioUrl);
      if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) return sendJson(res, 404, { error: "No hay audio para compartir" });

      const probe = await probeAudio(audioUrl);
      const looksBad = !probe.ok || (probe.ct && !isAudioLikeContentType(probe.ct));
      if (looksBad && sunoTaskId) {
        const fresh = await resolveFreshFromSuno(sunoTaskId, title || "");
        if (fresh.ok && fresh.audioUrl) {
          audioUrl = normalizeHttpUrl(fresh.audioUrl);
        }
      }

      const range = (req.headers?.range || req.headers?.Range || "").toString().trim();
      const headers: Record<string, string> = {};
      if (range) headers.range = range;

      const upstream = await fetch(audioUrl, { method: "GET", headers }).catch(() => null as any);
      if (!upstream) return sendJson(res, 502, { error: "No pude descargar el audio" });

      const status = Number((upstream as any).status || 502);
      if (status >= 400) {
        const txt = await (upstream as any).text?.().catch(() => "") || "";
        return sendJson(res, 502, { error: "No pude reproducir el audio", detail: txt.slice(0, 800) || `HTTP ${status}` });
      }

      res.statusCode = status;
      res.setHeader("cache-control", "no-store, max-age=0, s-maxage=0, must-revalidate");
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-headers", "range, content-type");
      res.setHeader("access-control-expose-headers", "accept-ranges, content-length, content-range, content-type");
      res.setHeader("accept-ranges", "bytes");

      const upstreamCt = (upstream as any).headers?.get?.("content-type") || "";
      const ct = isAudioLikeContentType(upstreamCt) ? upstreamCt : "audio/mpeg";
      const cl = (upstream as any).headers?.get?.("content-length") || "";
      const cr = (upstream as any).headers?.get?.("content-range") || "";
      if (ct) res.setHeader("content-type", ct);
      if (cl) res.setHeader("content-length", cl);
      if (cr) res.setHeader("content-range", cr);
      if (wantDownload) {
        res.setHeader("content-disposition", `attachment; filename=\"${downloadName.replaceAll('\"', '')}\"`);
        res.setHeader("access-control-expose-headers", "accept-ranges, content-length, content-range, content-type, content-disposition");
      }

      if (method === "HEAD") {
        res.end();
        return;
      }

      const body = (upstream as any).body;
      if (body) {
        try {
          const mod = await import("stream");
          const Readable = (mod as any).Readable;
          if (Readable?.fromWeb) {
            Readable.fromWeb(body).pipe(res);
            return;
          }
        } catch {
        }
      }

      const ab = await (upstream as any).arrayBuffer?.().catch(() => null);
      if (!ab) return sendJson(res, 502, { error: "No pude leer el audio" });
      res.end(Buffer.from(ab));
    } catch (e) {
      return sendJson(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const shareSongCoverHandler = (() => {
  function sendJson(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  function looksExpiringUrl(url: string) {
    const u = (url || "").toString();
    if (!u) return false;
    if (!u.includes("?")) return false;
    return /[?&](x-amz-signature|x-amz-credential|x-amz-algorithm|x-amz-expires|x-amz-date|expires|signature|token)=/i.test(u);
  }

  function normalizeHttpUrl(url: string) {
    const u = (url || "").toString().trim();
    if (!u) return "";
    if (/^https:\/\//i.test(u)) return u;
    if (/^http:\/\//i.test(u)) return u.replace(/^http:\/\//i, "https://");
    if (/^\/\//.test(u)) return `https:${u}`;
    return u;
  }

  function extractBestCover(providerRaw: any, title: string) {
    const cleanStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim();
    const d = providerRaw?.data || providerRaw?.data?.data || providerRaw;
    const candidates: any[] = [];
    if (Array.isArray(d?.response?.data)) candidates.push(d.response.data);
    if (Array.isArray(d?.response?.sunoData)) candidates.push(d.response.sunoData);
    if (Array.isArray(d?.response)) candidates.push(d.response);
    if (Array.isArray(d?.data)) candidates.push(d.data);
    if (Array.isArray(d?.data?.data)) candidates.push(d.data.data);
    const list = (candidates.find((x) => Array.isArray(x) && x.length) as any[]) || [];

    const pickCoverUrl = (track: any) => {
      const raw =
        track?.image_url ||
        track?.imageUrl ||
        track?.cover_url ||
        track?.coverUrl ||
        track?.img_url ||
        track?.imgUrl ||
        "";
      const s = cleanStr(raw);
      return /^https?:\/\//i.test(s) || /^\/\//.test(s) ? s : "";
    };

    const covers = (Array.isArray(list) ? list : []).map((t: any) => cleanStr(pickCoverUrl(t))).filter(Boolean);
    if (covers.length === 0) return "";
    const wantsB = /\sB$/i.test((title || "").toString().trim());
    return wantsB && covers.length > 1 ? covers[1] : covers[0];
  }

  function sunoErrorMessagePublic(data: any, fallback: string) {
    const msg =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      (typeof data?.msg === "string" && data.msg) ||
      fallback;
    return String(msg);
  }

  async function sunoFetchJsonPublic(path: string, init?: RequestInit) {
    const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
    const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";
    const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";

    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (apiKey && !headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);

    const url = new URL(path, base).toString();
    const res = await fetch(url, { ...init, headers });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { res, data, text };
  }

  async function resolveFreshCoverFromSuno(taskId: string, title: string) {
    const enc = encodeURIComponent(taskId);
    const paths = [
      `/api/v1/generate/record-info?taskId=${enc}`,
      `/api/v1/suno/generate/record-info?taskId=${enc}`,
      `/api/v1/task/${enc}`,
      `/api/v1/suno/task/${enc}`,
    ];
    let last: any = null;
    for (const p of paths) {
      const r = await sunoFetchJsonPublic(p, { method: "GET" });
      last = r;
      if (r?.res?.status !== 404) break;
    }
    const { res: r, data, text } = last || {};
    if (!r) return { ok: false as const, error: "No pude contactar al proveedor" };
    if (!r.ok) {
      const msg = sunoErrorMessagePublic(data, text || `HTTP ${r.status}`);
      return { ok: false as const, error: String(msg).slice(0, 1200) };
    }
    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessagePublic(data, "Error del proveedor");
      return { ok: false as const, error: String(msg).slice(0, 1200) };
    }
    const coverUrl = normalizeHttpUrl(extractBestCover(data, title || ""));
    return { ok: true as const, coverUrl };
  }

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return sendJson(res, 405, { error: "Método no permitido" });

    const id = pickQuery(req, "id").trim();
    if (!id) return sendJson(res, 400, { error: "Falta id" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) {
      return sendJson(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
      const { data, error } = await admin
        .from("library_items")
        .select("id, title, cover_url, deleted_at, type, suno_task_id")
        .eq("id", id.slice(0, 200))
        .eq("type", "song")
        .maybeSingle();
      if (error) return sendJson(res, 500, { error: "No pude buscar la canción", detail: error.message });
      if (!data || (data as any).deleted_at) return sendJson(res, 404, { error: "No encontrada" });

      const title = typeof (data as any).title === "string" ? (data as any).title.trim() : "";
      let coverUrl = typeof (data as any).cover_url === "string" ? (data as any).cover_url.trim() : "";
      const sunoTaskId = typeof (data as any).suno_task_id === "string" ? (data as any).suno_task_id.trim() : "";

      const shouldRefresh = !coverUrl || looksExpiringUrl(coverUrl) || /^http:\/\//i.test(coverUrl);
      if (shouldRefresh && sunoTaskId) {
        const fresh = await resolveFreshCoverFromSuno(sunoTaskId, title || "");
        if (fresh.ok && fresh.coverUrl) {
          coverUrl = fresh.coverUrl;
          await admin
            .from("library_items")
            .update({ cover_url: coverUrl.slice(0, 2000) })
            .eq("id", id.slice(0, 200))
            .eq("type", "song");
        }
      }

      coverUrl = normalizeHttpUrl(coverUrl);
      if (!coverUrl || !/^https?:\/\//i.test(coverUrl)) return sendJson(res, 404, { error: "No hay portada para compartir" });

      res.statusCode = 302;
      res.setHeader("cache-control", "no-store, max-age=0, s-maxage=0, must-revalidate");
      res.setHeader("location", coverUrl);
      res.end();
    } catch (e) {
      return sendJson(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const shareProfileHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  function looksLikeUuid(s: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((s || "").trim());
  }

  async function findUserIdByUsername(admin: any, usernameRaw: string) {
    const target = (usernameRaw || "").toString().trim().toLowerCase();
    if (!target) return "";
    const listUsers = (admin?.auth as any)?.admin?.listUsers;
    if (typeof listUsers !== "function") return "";
    for (let page = 1; page <= 20; page++) {
      const out = await listUsers.call((admin.auth as any).admin, { page, perPage: 200 });
      const users = Array.isArray(out?.data?.users) ? out.data.users : [];
      for (const u of users) {
        const meta: any = (u as any)?.user_metadata ?? (u as any)?.raw_user_meta_data ?? {};
        const uname = String(meta?.username || "").trim().toLowerCase();
        if (uname && uname === target) return String((u as any)?.id || "").trim();
      }
      if (users.length < 200) break;
    }
    return "";
  }

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const id = pickQuery(req, "id").trim();
    if (!id) return send(res, 400, { error: "Falta id" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

      const userId = looksLikeUuid(id) ? id : await findUserIdByUsername(admin, id);
      if (!userId) return send(res, 404, { error: "No encontrado" });

      const getUserById = (admin?.auth as any)?.admin?.getUserById;
      if (typeof getUserById !== "function") return send(res, 500, { error: "No pude leer el perfil" });
      const uout = await getUserById.call((admin.auth as any).admin, userId);
      const user = uout?.data?.user || null;
      if (!user) return send(res, 404, { error: "No encontrado" });

      const meta: any = (user as any)?.user_metadata ?? (user as any)?.raw_user_meta_data ?? {};
      const fullName = String(meta?.full_name || meta?.name || meta?.display_name || "").trim();
      const username = String(meta?.username || "").trim();
      const avatarUrl = String(meta?.avatar_url || "").trim();
      const coverUrl = String(meta?.cover_url || "").trim();
      const bio = String(meta?.bio || "").trim();
      const country = String(meta?.country || "").trim();
      const city = String(meta?.city || "").trim();
      const contactEmail = String(meta?.contact_email || "").trim();
      const contactPhone = String(meta?.contact_phone || "").trim();

      const { data: pins, error: pinsErr } = await admin
        .from("profile_pins")
        .select("song_id, added_at")
        .eq("user_id", userId)
        .order("added_at", { ascending: false })
        .limit(200);
      if (pinsErr) {
        const msg = String(pinsErr.message || "").toLowerCase();
        const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
        if (missing) {
          return send(res, 500, {
            error: "Falta configurar el perfil público",
            hint: "Crea la tabla 'profile_pins' en Supabase (SQL Editor). Luego intenta de nuevo.\nSi quieres, te paso el SQL listo para pegar.",
          });
        }
        return send(res, 500, { error: "No pude leer las canciones del perfil", detail: pinsErr.message });
      }
      const rows = Array.isArray(pins) ? pins : [];
      const songIds = rows.map((r: any) => String(r?.song_id || "").trim()).filter(Boolean);

      let songs: any[] = [];
      if (songIds.length > 0) {
        const { data: items, error: itemsErr } = await admin
          .from("library_items")
          .select("id, title, audio_url, cover_url, deleted_at, type, user_id")
          .eq("user_id", userId)
          .eq("type", "song")
          .is("deleted_at", null)
          .in("id", songIds.map((x) => x.slice(0, 200)));
        if (itemsErr) return send(res, 500, { error: "No pude leer las canciones del perfil", detail: itemsErr.message });
        const list = Array.isArray(items) ? items : [];
        const byId = new Map(list.map((x: any) => [String(x?.id || ""), x]));
        songs = songIds
          .map((sid) => byId.get(sid))
          .filter(Boolean)
          .map((x: any) => ({
            id: String(x?.id || ""),
            title: String(x?.title || "Canción").trim(),
            audioUrl: String(x?.audio_url || "").trim(),
            coverUrl: String(x?.cover_url || "").trim() || null,
          }))
          .filter((x: any) => x.id && x.audioUrl);
      }

      return send(res, 200, {
        ok: true,
        profile: {
          id: userId,
          name: fullName || "Usuario",
          username: username || null,
          avatarUrl: avatarUrl || null,
          coverUrl: coverUrl || null,
          bio: bio || null,
          country: country || null,
          city: city || null,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
        },
        songs,
      });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const profileHandler = (() => {
  const PINS_TABLE = "profile_pins";
  const LIB_TABLE = "library_items";

  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  async function handlePins(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const { data, error } = await auth.admin
      .from(PINS_TABLE)
      .select("song_id, added_at")
      .eq("user_id", auth.user.id)
      .order("added_at", { ascending: false })
      .limit(200);
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
      if (missing) {
        return send(res, 500, {
          error: "Falta configurar el perfil",
          hint: "Crea la tabla 'profile_pins' en Supabase (SQL Editor). Luego intenta de nuevo.\nSi quieres, te paso el SQL listo para pegar.",
        });
      }
      return send(res, 500, { error: "No pude leer tu perfil", detail: error.message });
    }
    const list = Array.isArray(data) ? data : [];
    return send(res, 200, { ok: true, items: list.map((x: any) => ({ songId: String(x?.song_id || ""), addedAt: String(x?.added_at || "") })) });
  }

  async function handlePinsFull(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const { data, error } = await auth.admin
      .from(PINS_TABLE)
      .select("song_id, added_at")
      .eq("user_id", auth.user.id)
      .order("added_at", { ascending: false })
      .limit(200);
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
      if (missing) {
        return send(res, 500, {
          error: "Falta configurar el perfil",
          hint: "Crea la tabla 'profile_pins' en Supabase (SQL Editor). Luego intenta de nuevo.\nSi quieres, te paso el SQL listo para pegar.",
        });
      }
      return send(res, 500, { error: "No pude leer tu perfil", detail: error.message });
    }
    const pins = Array.isArray(data) ? data : [];
    const songIds = pins.map((x: any) => String(x?.song_id || "").trim()).filter(Boolean);
    if (songIds.length === 0) return send(res, 200, { ok: true, items: [] });

    const { data: items, error: itemsErr } = await auth.admin
      .from(LIB_TABLE)
      .select("id, title, audio_url, cover_url, deleted_at, type, user_id")
      .eq("user_id", auth.user.id)
      .eq("type", "song")
      .is("deleted_at", null)
      .in("id", songIds.map((x) => x.slice(0, 200)));
    if (itemsErr) return send(res, 500, { error: "No pude leer tus canciones", detail: itemsErr.message });
    const list = Array.isArray(items) ? items : [];
    const byId = new Map(list.map((x: any) => [String(x?.id || ""), x]));
    const out = songIds
      .map((sid) => byId.get(sid))
      .filter(Boolean)
      .map((x: any) => ({
        id: String(x?.id || ""),
        title: String(x?.title || "Canción").trim(),
        audioUrl: String(x?.audio_url || "").trim(),
        coverUrl: String(x?.cover_url || "").trim(),
      }))
      .filter((x: any) => x.id && x.audioUrl);
    return send(res, 200, { ok: true, items: out });
  }

  async function handlePin(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const songId = typeof body?.songId === "string" ? body.songId.trim().slice(0, 200) : "";
    const pin = Boolean(body?.pin ?? body?.pinned ?? true);
    if (!songId) return send(res, 400, { error: "Falta songId" });

    const { data: song, error: songErr } = await auth.admin
      .from(LIB_TABLE)
      .select("id, user_id, deleted_at, type")
      .eq("id", songId)
      .eq("user_id", auth.user.id)
      .eq("type", "song")
      .is("deleted_at", null)
      .maybeSingle();
    if (songErr) return send(res, 500, { error: "No pude leer tu canción", detail: songErr.message });
    if (!song) return send(res, 404, { error: "No encontré esa canción" });

    if (!pin) {
      const { error } = await auth.admin.from(PINS_TABLE).delete().eq("user_id", auth.user.id).eq("song_id", songId);
      if (error) return send(res, 500, { error: "No pude quitarla del perfil", detail: error.message });
      return send(res, 200, { ok: true, pinned: false });
    }

    const row: any = { user_id: auth.user.id, song_id: songId, added_at: new Date().toISOString() };
    const { error } = await auth.admin.from(PINS_TABLE).upsert(row, { onConflict: "user_id,song_id" });
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
      if (missing) {
        return send(res, 500, {
          error: "Falta configurar el perfil",
          hint: "Crea la tabla 'profile_pins' en Supabase (SQL Editor). Luego intenta de nuevo.\nSi quieres, te paso el SQL listo para pegar.",
        });
      }
      return send(res, 500, { error: "No pude guardarla en tu perfil", detail: error.message });
    }
    return send(res, 200, { ok: true, pinned: true });
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const next = isApi ? parts[2] : parts[1];
    if (next === "pins") return handlePins(req, res);
    if (next === "pins-full") return handlePinsFull(req, res);
    if (next === "pin") return handlePin(req, res);
    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

const likesHandler = (() => {
  const LIKES_TABLE = "song_likes";
  const LIB_TABLE = "library_items";

  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  async function handleLikes(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const { data, error } = await auth.admin
      .from(LIKES_TABLE)
      .select("song_id, liked_at")
      .eq("user_id", auth.user.id)
      .order("liked_at", { ascending: false })
      .limit(500);
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
      if (missing) {
        return send(res, 500, {
          error: "Falta configurar la tabla de likes",
          hint: "Crea la tabla 'song_likes' en Supabase (SQL Editor). Luego intenta de nuevo.\nSi quieres, te paso el SQL listo para pegar.",
        });
      }
      return send(res, 500, { error: "No pude leer tus likes", detail: error.message });
    }
    const list = Array.isArray(data) ? data : [];
    return send(res, 200, { 
      ok: true, 
      items: list.map((x: any) => ({ 
        songId: String(x?.song_id || ""), 
        likedAt: String(x?.liked_at || "") 
      })) 
    });
  }

  async function handleLike(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const songId = typeof body?.songId === "string" ? body.songId.trim().slice(0, 200) : "";
    const like = Boolean(body?.like ?? body?.liked ?? true);
    if (!songId) return send(res, 400, { error: "Falta songId" });

    const { data: song, error: songErr } = await auth.admin
      .from(LIB_TABLE)
      .select("id, user_id, deleted_at, type")
      .eq("id", songId)
      .eq("user_id", auth.user.id)
      .eq("type", "song")
      .is("deleted_at", null)
      .maybeSingle();
    if (songErr) return send(res, 500, { error: "No pude leer tu canción", detail: songErr.message });
    if (!song) return send(res, 404, { error: "No encontré esa canción" });

    if (!like) {
      const { error } = await auth.admin.from(LIKES_TABLE).delete().eq("user_id", auth.user.id).eq("song_id", songId);
      if (error) return send(res, 500, { error: "No pude quitar el like", detail: error.message });
      return send(res, 200, { ok: true, liked: false });
    }

    const row: any = { user_id: auth.user.id, song_id: songId, liked_at: new Date().toISOString() };
    const { error } = await auth.admin.from(LIKES_TABLE).upsert(row, { onConflict: "user_id,song_id" });
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
      if (missing) {
        return send(res, 500, {
          error: "Falta configurar la tabla de likes",
          hint: "Crea la tabla 'song_likes' en Supabase (SQL Editor). Luego intenta de nuevo.\nSi quieres, te paso el SQL listo para pegar.",
        });
      }
      return send(res, 500, { error: "No pude guardar el like", detail: error.message });
    }
    return send(res, 200, { ok: true, liked: true });
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const next = isApi ? parts[2] : parts[1];
    if (next === "likes") return handleLikes(req, res);
    if (next === "like") return handleLike(req, res);
    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

const socialHandler = (() => {
  const PUBLIC_TABLE = "public_songs";
  const LIB_TABLE = "library_items";

  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  async function getAdminOrError() {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) return { ok: false as const, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" };
    const createClient = await getSupabaseCreateClient();
    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, admin };
  }

  function computeDisplayName(user: any) {
    const email = (user?.email || "").toString().trim();
    const meta: any = user?.user_metadata || {};
    const name = (meta?.display_name || meta?.full_name || meta?.name || "").toString().trim();
    return (name || (email ? email.split("@")[0] : "") || "Usuario").slice(0, 60);
  }

  function computeAvatarUrl(user: any) {
    const meta: any = user?.user_metadata || {};
    const url = (meta?.avatar_url || meta?.avatarUrl || "").toString().trim();
    return url.slice(0, 2000);
  }

  async function handlePublish(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const songId = typeof body?.songId === "string" ? body.songId.trim().slice(0, 200) : "";
    const publish = Boolean(body?.publish);
    const genre = typeof body?.genre === "string" ? body.genre.trim().slice(0, 50) : "";
    if (!songId) return send(res, 400, { error: "Falta songId" });
    if (publish && !genre) return send(res, 400, { error: "Falta género" });

    try {
      const { data: song, error: songErr } = await auth.admin
        .from(LIB_TABLE)
        .select("id, user_id, title, audio_url, cover_url, deleted_at, type")
        .eq("id", songId)
        .eq("user_id", auth.user.id)
        .eq("type", "song")
        .is("deleted_at", null)
        .maybeSingle();
      if (songErr) return send(res, 500, { error: "No pude leer tu canción", detail: songErr.message });
      if (!song) return send(res, 404, { error: "No encontré esa canción" });
      const title = String((song as any).title || "Canción").trim().slice(0, 120);
      const audioUrl = String((song as any).audio_url || "").trim().slice(0, 2000);
      const coverUrl = String((song as any).cover_url || "").trim().slice(0, 2000);
      if (!audioUrl) return send(res, 400, { error: "Esta canción no tiene audio" });

      if (!publish) {
        const { error } = await auth.admin.from(PUBLIC_TABLE).delete().eq("song_id", songId).eq("user_id", auth.user.id);
        if (error) {
          const msg = error.message || "No pude quitarla de público.";
          return send(res, 500, { error: msg });
        }
        return send(res, 200, { ok: true, is_public: false });
      }

      const authorName = computeDisplayName(auth.user);
      const authorAvatarUrl = computeAvatarUrl(auth.user);
      const publishedAt = new Date().toISOString();
      const row: any = {
        song_id: songId,
        user_id: auth.user.id,
        title,
        audio_url: audioUrl,
        cover_url: coverUrl || null,
        genre,
        author_name: authorName,
        author_avatar_url: authorAvatarUrl || null,
        published_at: publishedAt,
      };

      const { error } = await auth.admin.from(PUBLIC_TABLE).upsert(row, { onConflict: "song_id" });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
        if (missing) {
          return send(res, 500, {
            error: "Falta configurar la tabla pública",
            hint:
              "Crea la tabla 'public_songs' en Supabase (SQL Editor). Luego intenta de nuevo.\n" +
              "Si quieres, te paso el SQL listo para pegar.",
            detail: error.message,
          });
        }
        return send(res, 500, { error: "No pude publicar la canción", detail: error.message });
      }

      return send(res, 200, { ok: true, is_public: true, public_genre: genre, published_at: publishedAt });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleRemoveFromFeed(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const songId = typeof body?.songId === "string" ? body.songId.trim().slice(0, 200) : "";
    if (!songId) return send(res, 400, { error: "Falta songId" });

    const isAdmin = isAdminEmail(auth.user.email);
    if (!isAdmin) return send(res, 403, { error: "Solo un administrador puede quitar canciones del inicio" });

    try {
      const { error } = await auth.admin.from(PUBLIC_TABLE).delete().eq("song_id", songId);
      if (error) {
        return send(res, 500, { error: "No pude quitar la canción del inicio", detail: error.message });
      }
      return send(res, 200, { ok: true, removed_from_feed: true });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleSearchUsers(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const query = (pickQuery(req, "q") || "").toString().trim();
    if (!query) return send(res, 400, { error: "Falta término de búsqueda" });

    try {
      const searchTerm = query.toLowerCase();
      const filteredUsers: any[] = [];
      
      // Buscar usuarios página por página
      for (let page = 1; page <= 10; page++) {
        const { data: users, error } = await auth.admin.auth.admin.listUsers({
          page,
          perPage: 100
        });

        if (error) break;
        
        const usersArray = Array.isArray(users?.users) ? users.users : [];
        if (!usersArray.length) break;
        
        for (const user of usersArray) {
          const meta = user?.user_metadata || {};
          const fullName = (meta?.full_name || "").toString().toLowerCase();
          const lastName = (meta?.last_name || "").toString().toLowerCase();
          const username = (meta?.username || "").toString().toLowerCase();
          const email = (user?.email || "").toString().toLowerCase();
          
          if (
            fullName.includes(searchTerm) ||
            lastName.includes(searchTerm) ||
            username.includes(searchTerm) ||
            email.includes(searchTerm)
          ) {
            filteredUsers.push({
              id: user.id,
              full_name: meta?.full_name || "",
              last_name: meta?.last_name || "",
              username: meta?.username || "",
              email: user.email,
              avatar_url: meta?.avatar_url || ""
            });
            
            // Limitar a 50 resultados
            if (filteredUsers.length >= 50) break;
          }
        }
        
        if (filteredUsers.length >= 50) break;
      }

      return send(res, 200, { ok: true, users: filteredUsers });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleFollowUser(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    
    const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
    const follow = Boolean(body?.follow);
    
    if (!targetUserId) return send(res, 400, { error: "Falta targetUserId" });
    if (targetUserId === auth.user.id) return send(res, 400, { error: "No puedes seguirte a ti mismo" });

    try {
      // Verificar si el usuario objetivo existe
      const { data: targetUser, error: targetError } = await auth.admin.auth.admin.getUserById(targetUserId);
      if (targetError || !targetUser) return send(res, 404, { error: "Usuario no encontrado" });

      // Crear o eliminar la relación de seguimiento
      if (follow) {
        const { error } = await auth.admin
          .from('user_follows')
          .upsert({
            follower_id: auth.user.id,
            following_id: targetUserId,
            created_at: new Date().toISOString()
          }, { onConflict: 'follower_id,following_id' });
        
        if (error) {
          const msg = (error.message || "").toLowerCase();
          const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
          if (missing) {
            return send(res, 500, {
              error: "Falta configurar la tabla de seguimientos",
              hint: "En Supabase: Database → SQL Editor → New query → pega el SQL → Run. Luego intenta de nuevo.",
              sql:
                "create table if not exists public.user_follows (\n" +
                "  follower_id uuid not null references auth.users(id) on delete cascade,\n" +
                "  following_id uuid not null references auth.users(id) on delete cascade,\n" +
                "  created_at timestamptz not null default now(),\n" +
                "  primary key (follower_id, following_id)\n" +
                ");\n" +
                "create index if not exists user_follows_follower_id_idx on public.user_follows (follower_id);\n" +
                "create index if not exists user_follows_following_id_idx on public.user_follows (following_id);\n",
              detail: error.message
            });
          }
          return send(res, 500, { error: "No pude seguir al usuario", detail: error.message });
        }
      } else {
        const { error } = await auth.admin
          .from('user_follows')
          .delete()
          .eq('follower_id', auth.user.id)
          .eq('following_id', targetUserId);
        
        if (error) {
          const msg = (error.message || "").toLowerCase();
          const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
          if (missing) {
            return send(res, 500, {
              error: "Falta configurar la tabla de seguimientos",
              hint: "En Supabase: Database → SQL Editor → New query → pega el SQL → Run. Luego intenta de nuevo.",
              sql:
                "create table if not exists public.user_follows (\n" +
                "  follower_id uuid not null references auth.users(id) on delete cascade,\n" +
                "  following_id uuid not null references auth.users(id) on delete cascade,\n" +
                "  created_at timestamptz not null default now(),\n" +
                "  primary key (follower_id, following_id)\n" +
                ");\n" +
                "create index if not exists user_follows_follower_id_idx on public.user_follows (follower_id);\n" +
                "create index if not exists user_follows_following_id_idx on public.user_follows (following_id);\n",
              detail: error.message
            });
          }
          return send(res, 500, { error: "No pude dejar de seguir al usuario", detail: error.message });
        }
      }

      return send(res, 200, { ok: true, following: follow });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleUserProfile(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const userId = (pickQuery(req, "id") || pickQuery(req, "userId") || "").toString().trim();
    if (!userId) return send(res, 400, { error: "Falta id" });

    try {
      const { data: targetUser, error: targetError } = await auth.admin.auth.admin.getUserById(userId);
      if (targetError || !targetUser?.user) return send(res, 404, { error: "Usuario no encontrado" });

      const u = targetUser.user;
      const meta: any = u?.user_metadata || {};

      const user = {
        id: String(u?.id || ""),
        full_name: String(meta?.full_name || ""),
        last_name: String(meta?.last_name || ""),
        username: String(meta?.username || ""),
        avatar_url: String(meta?.avatar_url || ""),
        cover_url: String(meta?.cover_url || ""),
        country: String(meta?.country || ""),
        city: String(meta?.city || ""),
        contact_email: String(meta?.contact_email || ""),
        contact_phone: String(meta?.contact_phone || ""),
        bio: String(meta?.bio || ""),
      };

      const { data: songsData, error: songsError } = await auth.admin
        .from(PUBLIC_TABLE)
        .select("*")
        .eq("user_id", userId)
        .order("published_at", { ascending: false })
        .limit(100);
      if (songsError) {
        const msg = (songsError.message || "").toLowerCase();
        const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
        if (missing) return send(res, 200, { ok: true, user, songs: [] });
        return send(res, 500, { error: "No pude cargar canciones públicas", detail: songsError.message });
      }

      const songs = (Array.isArray(songsData) ? songsData : [])
        .map((r: any) => ({
          id: String(r?.song_id || "").trim(),
          title: String(r?.title || "Canción").trim(),
          audioUrl: String(r?.audio_url || "").trim(),
          coverUrl: String(r?.cover_url || "").trim() || undefined,
          genre: typeof r?.genre === "string" ? r.genre : "",
          authorName: typeof r?.author_name === "string" ? r.author_name : "Usuario",
          authorAvatarUrl: typeof r?.author_avatar_url === "string" ? r.author_avatar_url : "",
          publishedAt: typeof r?.published_at === "string" ? r.published_at : undefined,
        }))
        .filter((x: any) => x.id && x.audioUrl);

      return send(res, 200, { ok: true, user, songs });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleFollowStatus(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const userId = (pickQuery(req, "userId") || pickQuery(req, "id") || "").toString().trim();
    if (!userId) return send(res, 400, { error: "Falta userId" });

    try {
      let isFollowing = false;
      let followersCount = 0;
      let followingCount = 0;

      if (userId !== auth.user.id) {
        const rel = await auth.admin
          .from("user_follows")
          .select("follower_id")
          .eq("follower_id", auth.user.id)
          .eq("following_id", userId)
          .maybeSingle();
        if (!rel.error && rel.data) isFollowing = true;
      }

      const followers = await auth.admin
        .from("user_follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", userId);
      if (typeof followers.count === "number") followersCount = followers.count;

      const following = await auth.admin
        .from("user_follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", userId);
      if (typeof following.count === "number") followingCount = following.count;

      return send(res, 200, { ok: true, is_following: isFollowing, followers_count: followersCount, following_count: followingCount });
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
      if (missing) return send(res, 200, { ok: true, is_following: false, followers_count: 0, following_count: 0 });
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleFeed(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const a = await getAdminOrError();
    if (!a.ok) return send(res, 500, { error: a.error });
    const admin = a.admin;

    const limitRaw = Number(pickQuery(req, "limit") || 30);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(60, Math.floor(limitRaw))) : 30;
    const genre = (pickQuery(req, "genre") || "").toString().trim().slice(0, 50);
    const cursor = (pickQuery(req, "cursor") || "").toString().trim();

    try {
      const cutoffMs = Date.now() - 15 * 24 * 60 * 60 * 1000;
      const cutoffIso = new Date(cutoffMs).toISOString();
      try {
        await admin.from(PUBLIC_TABLE).delete().lt("published_at", cutoffIso);
      } catch {
      }

      const q = admin.from(PUBLIC_TABLE).select("*").order("published_at", { ascending: false }).limit(limit).gte("published_at", cutoffIso);
      if (genre) q.eq("genre", genre);
      if (cursor) q.lt("published_at", cursor);
      const { data, error } = await q;
      if (error) {
        const msg = (error.message || "").toLowerCase();
        const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
        if (missing) return send(res, 200, { ok: true, items: [] });
        return send(res, 500, { error: "No pude cargar el inicio", detail: error.message });
      }

      const items = (Array.isArray(data) ? data : [])
        .map((r: any) => ({
          id: String(r?.song_id || "").trim(),
          title: String(r?.title || "Canción").trim(),
          audioUrl: String(r?.audio_url || "").trim(),
          coverUrl: String(r?.cover_url || "").trim(),
          publicGenre: typeof r?.genre === "string" ? r.genre : null,
          publishedAt: typeof r?.published_at === "string" ? r.published_at : null,
          authorName: typeof r?.author_name === "string" ? r.author_name : "Usuario",
          authorAvatarUrl: typeof r?.author_avatar_url === "string" ? r.author_avatar_url : "",
        }))
        .filter((x: any) => x.id && x.audioUrl);

      const nextCursor = items.length ? (items[items.length - 1].publishedAt || null) : null;
      return send(res, 200, { ok: true, items, next_cursor: nextCursor });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleGenres(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const a = await getAdminOrError();
    if (!a.ok) return send(res, 500, { error: a.error });
    const admin = a.admin;

    try {
      const cutoffMs = Date.now() - 15 * 24 * 60 * 60 * 1000;
      const cutoffIso = new Date(cutoffMs).toISOString();
      const { data, error } = await admin.from(PUBLIC_TABLE).select("genre, cover_url").order("published_at", { ascending: false }).limit(200).gte("published_at", cutoffIso);
      if (error) {
        const msg = (error.message || "").toLowerCase();
        const missing = msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache");
        if (missing) return send(res, 200, { ok: true, items: [] });
        return send(res, 500, { error: "No pude cargar géneros", detail: error.message });
      }

      const map = new Map<string, { genre: string; count: number; coverUrl: string }>();
      for (const r of Array.isArray(data) ? data : []) {
        const g = typeof (r as any)?.genre === "string" ? (r as any).genre.trim() : "";
        if (!g) continue;
        const cover = typeof (r as any)?.cover_url === "string" ? (r as any).cover_url.trim() : "";
        const prev = map.get(g);
        if (!prev) {
          map.set(g, { genre: g, count: 1, coverUrl: cover });
        } else {
          prev.count += 1;
          if (!prev.coverUrl && cover) prev.coverUrl = cover;
        }
      }
      const items = Array.from(map.values()).sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
      return send(res, 200, { ok: true, items });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "social") return send(res, 404, { error: "Ruta no encontrada" });

    let action = "";
    try {
      action = (new URL(req.url, "http://localhost").searchParams.get("action") || "").toString();
    } catch {
      action = "";
    }
    action = action.trim().toLowerCase();
    const a = action || (next || "").toLowerCase();
    if (a === "feed") return handleFeed(req, res);
    if (a === "genres") return handleGenres(req, res);
    if (a === "publish") return handlePublish(req, res);
    if (a === "remove") return handleRemoveFromFeed(req, res);
    if (a === "search") return handleSearchUsers(req, res);
    if (a === "follow") return handleFollowUser(req, res);
    if (a === "user") return handleUserProfile(req, res);
    if (a === "follow-status") return handleFollowStatus(req, res);
    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

const videosHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "videos") return send(res, 404, { error: "Ruta no encontrada" });

    const action = (next || "").toString().trim().toLowerCase();
    if (action !== "list") return send(res, 404, { error: "Ruta no encontrada" });
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const limitRaw = Number(pickQuery(req, "limit") || 50);
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 50, 200));

    try {
      const userId = String(auth.user.id || "").trim();
      const admin = auth.admin;
      let rows: any[] = [];
      const r1 = await admin
        .from("suno_tasks")
        .select("task_id, kind, created_at")
        .eq("user_id", userId)
        .eq("kind", "mp4")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!r1.error) {
        rows = Array.isArray(r1.data) ? r1.data : [];
      } else {
        const r2 = await admin.from("suno_tasks").select("task_id, kind").eq("user_id", userId).eq("kind", "mp4").limit(limit);
        if (r2.error) return send(res, 500, { error: "No pude listar videos", detail: r2.error.message });
        rows = Array.isArray(r2.data) ? r2.data : [];
      }

      const items = rows
        .map((x: any) => ({
          taskId: String(x?.task_id || "").trim(),
          created_at: typeof x?.created_at === "string" ? x.created_at : "",
        }))
        .filter((x: any) => x.taskId);

      return send(res, 200, { ok: true, items });
    } catch (e) {
      return send(res, 500, { error: "No pude listar videos", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const supportHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "support" || next !== "feedback") return send(res, 404, { error: "Ruta no encontrada" });
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    const token = getAuthToken(req);
    if (!token) return send(res, 401, { error: "No autorizado" });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const name = (payload?.name || "").toString().trim().slice(0, 120);
    const whatsapp = (payload?.whatsapp || "").toString().trim().slice(0, 80);
    const message = (payload?.message || "").toString().trim().slice(0, 4000);
    if (!name) return send(res, 400, { error: "Falta nombre" });
    if (!whatsapp) return send(res, 400, { error: "Falta WhatsApp" });
    if (!message) return send(res, 400, { error: "Falta mensaje" });

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return send(res, 401, { error: "No autorizado" });

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from("support_feedback")
      .insert({
        user_id: user.id,
        user_email: user.email || null,
        name,
        whatsapp,
        message,
        is_read: false,
      })
      .select("id")
      .maybeSingle();
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { ok: true, id: data?.id || null });
  };
})();

const adminHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  // ----------- Helpers administración (error_id + serverLog seguros) -----------
  function genAdminErrorId(prefix = "ADM") {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const d = new Date();
    const rnd = Math.floor(100000 + Math.random() * 900000).toString(36).slice(0, 6);
    return `${prefix}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}-${rnd}`;
  }
  function safeStringify(v: any, max = 4096) {
    try { const s = JSON.stringify(v); if (s && s.length > max) return s.slice(0, max) + "..."; return s; } catch { try { return String(v).slice(0, max); } catch { return ""; } }
  }
  function adminServerLog(eid: string, handler: string, detail: any) {
    try {
      // eslint-disable-next-line no-console
      console.error(`[${eid}] handler=${handler}`, safeStringify(detail));
    } catch {}
  }
  function adminSendError(res: any, httpStatus: number, userMsg: string, eid: string, extra?: any) {
    const payload: any = { error: userMsg, error_id: eid };
    if (extra && typeof extra === "object") {
      for (const k of Object.keys(extra)) {
        if (extra[k] !== undefined && extra[k] !== null) payload[k] = extra[k];
      }
    }
    return send(res, httpStatus, payload);
  }

  async function requireAdmin(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    if (isAdminEmail(user.email)) return { ok: true as const, user, admin, supabaseUrl, supabaseService };

    try {
      const vs = await admin.from("vendor_settings").select("role").eq("user_id", user.id).maybeSingle();
      const role = String(vs?.data?.role || "").trim().toLowerCase();
      if (role === "admin") return { ok: true as const, user, admin, supabaseUrl, supabaseService };
    } catch {
    }

    return { ok: false as const, status: 403, error: "No autorizado" };
  }

  async function handleGetCollaborators(req: any, res: any) {
    const eid = genAdminErrorId("ADMCOL");
    const safeHandler = "handleGetCollaborators";
    try {
      if ((req.method || "").toUpperCase() !== "GET") return adminSendError(res, 405, "Método no permitido", eid);
      const auth = await requireAdmin(req);
      if (!auth.ok) return adminSendError(res, auth.status, auth.error || "No autorizado", eid);
    try {
      const vr = await auth.admin
        .from("vendor_settings")
        .select("user_id, role, commission_type, commission_value, force_countdown_only, can_show_payment_info, updated_at, created_at")
        .order("updated_at", { ascending: false });
      if (vr.error) return adminSendError(res, 500, "No pude leer colaboradores", eid, { detail: vr.error.message });

      const rows = Array.isArray(vr.data) ? vr.data : [];
      const userIds = Array.from(new Set(rows.map((x: any) => String(x?.user_id || "").trim()).filter(Boolean)));
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const pr = await auth.admin.from("profiles").select("id, email, full_name").in("id", userIds);
        if (!pr.error && Array.isArray(pr.data)) {
          profilesMap = pr.data.reduce((acc: any, item: any) => {
            const id = String(item?.id || "").trim();
            if (id) acc[id] = item;
            return acc;
          }, {});
        }
      }

      const items = rows.map((row: any) => {
        const profile = profilesMap[String(row?.user_id || "").trim()] || {};
        return {
          user_id: String(row?.user_id || "").trim(),
          email: String(profile?.email || "").trim(),
          full_name: String(profile?.full_name || "").trim(),
          role: String(row?.role || "vendor").trim(),
          commission_type: String(row?.commission_type || "percentage").trim(),
          commission_value: Number(row?.commission_value ?? 0) || 0,
          force_countdown_only: Boolean(row?.force_countdown_only),
          can_show_payment_info: Boolean(row?.can_show_payment_info),
          updated_at: String(row?.updated_at || row?.created_at || "").trim(),
        };
      });

      return send(res, 200, { ok: true, items, error_id: eid });
    } catch (e) {
      adminServerLog(eid, safeHandler, {
        step: "catch_inner",
        errMessage: e instanceof Error ? e.message : String(e),
        errStack: e instanceof Error ? e.stack : undefined,
      });
      return adminSendError(res, 500, "Algo salió mal.", eid);
    }
    } catch (outer) {
      adminServerLog(eid, safeHandler, {
        step: "catch_outer",
        errMessage: outer instanceof Error ? outer.message : String(outer),
        errStack: outer instanceof Error ? outer.stack : undefined,
      });
      return adminSendError(res, 500, "Algo salió mal.", eid);
    }
  }

  async function handleAssignCollaborator(req: any, res: any) {
    const eid = genAdminErrorId("ADMCOL");
    const safeHandler = "handleAssignCollaborator";
    try {
      if ((req.method || "").toUpperCase() !== "POST") return adminSendError(res, 405, "Método no permitido", eid);
      const auth = await requireAdmin(req);
      if (!auth.ok) return adminSendError(res, auth.status, auth.error || "No autorizado", eid);

      const body = parseJsonBody(req);
      if (!body) return adminSendError(res, 400, "Body inválido", eid);

      const email = String(body?.email || "").trim().toLowerCase();
      const requestedRole = String(body?.role || "").trim().toLowerCase();
      const commissionValue = Number(body?.commission_value ?? 0);
      if (!email) return adminSendError(res, 400, "Falta email", eid);
      if (requestedRole !== "empleado") return adminSendError(res, 400, "En esta fase solo se permite role = empleado", eid);
      if (!Number.isFinite(commissionValue) || commissionValue < 0) return adminSendError(res, 400, "commission_value inválido", eid);

    try {
      let userId = "";

      const pr = await auth.admin.from("profiles").select("id, email").eq("email", email).limit(1);
      if (!pr.error && Array.isArray(pr.data) && pr.data[0]?.id) {
        userId = String(pr.data[0].id || "").trim();
      }

      if (!userId) {
        const found = await findUserIdByEmail(auth, email);
        if (!found.ok) return adminSendError(res, found.status || 404, found.error || "No encontré ese usuario por correo.", eid, { detail: found.detail || null });
        userId = String(found.userId || "").trim();
      }

      if (!userId) return adminSendError(res, 404, "No encontré ese usuario por correo.", eid);

      await ensureProfileExists(auth.admin, userId);
      const up = await auth.admin.from("profiles").upsert({ id: userId, email }, { onConflict: "id" });
      if (up?.error) return adminSendError(res, 500, "No pude asegurar el perfil del colaborador", eid, { detail: up.error.message });

      const row = {
        user_id: userId,
        role: "empleado",
        commission_type: "fixed",
        commission_value: commissionValue,
        force_countdown_only: true,
        can_show_payment_info: false,
        updated_at: new Date().toISOString(),
      };
      const wr = await auth.admin.from("vendor_settings").upsert(row, { onConflict: "user_id" }).select("user_id, role, commission_type, commission_value").maybeSingle();
      if (wr.error) return adminSendError(res, 500, "No pude guardar el colaborador", eid, { detail: wr.error.message });

      return send(res, 200, {
        ok: true,
        item: {
          user_id: userId,
          email,
          role: "empleado",
          commission_type: "fixed",
          commission_value: commissionValue,
          force_countdown_only: true,
          can_show_payment_info: false,
        },
        error_id: eid,
      });
    } catch (e) {
      adminServerLog(eid, safeHandler, {
        step: "catch_inner",
        errMessage: e instanceof Error ? e.message : String(e),
        errStack: e instanceof Error ? e.stack : undefined,
      });
      return adminSendError(res, 500, "Algo salió mal.", eid);
    }
    } catch (outer) {
      adminServerLog(eid, safeHandler, {
        step: "catch_outer",
        errMessage: outer instanceof Error ? outer.message : String(outer),
        errStack: outer instanceof Error ? outer.stack : undefined,
      });
      return adminSendError(res, 500, "Algo salió mal.", eid);
    }
  }

  async function handleCommissionsReport(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const period = String(pickQuery(req, "period") || "day").trim().toLowerCase();
    const now = new Date();
    let start = new Date(now);
    if (period === "day") {
      start.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(start.setDate(diff));
      start.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      start = new Date(start.getFullYear(), start.getMonth(), 1);
    } else {
      return send(res, 400, { error: "Periodo inválido. Usa day, week o month." });
    }

    try {
      const cr = await auth.admin
        .from("share_commissions")
        .select("seller_user_id, product_type, amount_mxn, status, created_at")
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: false });
      if (cr.error) return send(res, 500, { error: "No pude cargar el reporte de comisiones", detail: cr.error.message });

      const rows = Array.isArray(cr.data) ? cr.data : [];
      const sellerIds = Array.from(new Set(rows.map((x: any) => String(x?.seller_user_id || "").trim()).filter(Boolean)));
      let profilesMap: Record<string, any> = {};
      let settingsMap: Record<string, any> = {};

      if (sellerIds.length > 0) {
        const [pr, vr] = await Promise.all([
          auth.admin.from("profiles").select("id, email, full_name").in("id", sellerIds),
          auth.admin.from("vendor_settings").select("user_id, role, commission_type, commission_value").in("user_id", sellerIds),
        ]);
        if (!pr.error && Array.isArray(pr.data)) {
          profilesMap = pr.data.reduce((acc: any, item: any) => {
            const id = String(item?.id || "").trim();
            if (id) acc[id] = item;
            return acc;
          }, {});
        }
        if (!vr.error && Array.isArray(vr.data)) {
          settingsMap = vr.data.reduce((acc: any, item: any) => {
            const id = String(item?.user_id || "").trim();
            if (id) acc[id] = item;
            return acc;
          }, {});
        }
      }

      const grouped: Record<string, any> = {};
      for (const row of rows) {
        const sellerId = String(row?.seller_user_id || "").trim();
        const productType = String(row?.product_type || "").trim();
        if (!sellerId || !productType) continue;
        if (!grouped[sellerId]) {
          const profile = profilesMap[sellerId] || {};
          const settings = settingsMap[sellerId] || {};
          grouped[sellerId] = {
            seller_user_id: sellerId,
            email: String(profile?.email || "").trim(),
            full_name: String(profile?.full_name || "").trim(),
            role: String(settings?.role || "").trim(),
            commission_type: String(settings?.commission_type || "").trim(),
            commission_value: Number(settings?.commission_value ?? 0) || 0,
            total_mxn: 0,
            pending_mxn: 0,
            paid_mxn: 0,
            products: {},
          };
        }

        const amount = Number(row?.amount_mxn ?? 0) || 0;
        const status = String(row?.status || "").trim().toLowerCase();
        grouped[sellerId].total_mxn += amount;
        if (status === "paid") grouped[sellerId].paid_mxn += amount;
        else grouped[sellerId].pending_mxn += amount;

        if (!grouped[sellerId].products[productType]) {
          grouped[sellerId].products[productType] = {
            product_type: productType,
            total_mxn: 0,
            pending_mxn: 0,
            paid_mxn: 0,
          };
        }
        grouped[sellerId].products[productType].total_mxn += amount;
        if (status === "paid") grouped[sellerId].products[productType].paid_mxn += amount;
        else grouped[sellerId].products[productType].pending_mxn += amount;
      }

      const items = Object.values(grouped)
        .map((item: any) => ({
          ...item,
          products: Object.values(item.products || {}),
        }))
        .sort((a: any, b: any) => Number(b?.total_mxn ?? 0) - Number(a?.total_mxn ?? 0));

      return send(res, 200, {
        ok: true,
        period,
        from: start.toISOString(),
        to: now.toISOString(),
        items,
      });
    } catch (e) {
      return send(res, 500, { error: "No pude cargar el reporte de comisiones", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  function explainAuthAdminError(err: any) {
    const msg = err?.message ? String(err.message) : String(err || "");
    const lower = msg.toLowerCase();
    const hint =
      lower.includes("401") ||
      lower.includes("403") ||
      lower.includes("not authorized") ||
      lower.includes("forbidden") ||
      lower.includes("invalid jwt")
        ? " Revisa SUPABASE_SERVICE_ROLE_KEY en Vercel (debe ser la service_role key, no la anon key)."
        : "";
    return (msg || "Error de Supabase Auth Admin") + hint;
  }

  async function listUsersViaHttp(supabaseUrl: string, serviceKey: string, page: number, perPage: number) {
    const base = String(supabaseUrl || "").replace(/\/+$/, "");
    const url = `${base}/auth/v1/admin/users?page=${encodeURIComponent(String(page))}&per_page=${encodeURIComponent(String(perPage))}`;
    const r = await fetch(url, {
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
    });
    const text = await r.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!r.ok) {
      const msg =
        (data && (data?.msg || data?.message || data?.error)) ||
        `HTTP ${Number(r.status || 0) || 0}`;
      return { ok: false as const, status: Number(r.status || 500) || 500, error: String(msg), detail: String(text || "").slice(0, 600) };
    }
    const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
    let total: number | null = null;
    const cr = (r.headers.get("content-range") || r.headers.get("Content-Range") || "").toString();
    const m = cr.match(/\/(\d+)\s*$/);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) total = n;
    }
    return { ok: true as const, users, total };
  }

  async function deleteUserViaHttp(supabaseUrl: string, serviceKey: string, userId: string) {
    const base = String(supabaseUrl || "").replace(/\/+$/, "");
    const uid = String(userId || "").trim();
    if (!uid) return { ok: false as const, status: 400, error: "user_id inválido" };
    const url = `${base}/auth/v1/admin/users/${encodeURIComponent(uid)}`;
    const r = await fetch(url, {
      method: "DELETE",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
    });
    const text = await r.text().catch(() => "");
    if (!r.ok) return { ok: false as const, status: Number(r.status || 500) || 500, error: `HTTP ${Number(r.status || 0) || 0}`, detail: String(text || "").slice(0, 600) };
    return { ok: true as const };
  }

  async function findUserIdByEmail(authCtx: any, email: string) {
    const clean = (email || "").toString().trim().toLowerCase();
    if (!clean) return { ok: false as const, status: 400, error: "Email inválido" };

    const supabaseUrl = String(authCtx?.supabaseUrl || "").trim();
    const supabaseService = String(authCtx?.supabaseService || "").trim();
    if (supabaseUrl && supabaseService) {
      const perPage = 200;
      const maxPages = 25;
      for (let page = 1; page <= maxPages; page++) {
        const r = await listUsersViaHttp(supabaseUrl, supabaseService, page, perPage);
        if (!r.ok) {
          const hint = explainAuthAdminError({ message: r.error });
          return { ok: false as const, status: r.status, error: hint, detail: r.detail || "" };
        }
        const users = Array.isArray(r.users) ? r.users : [];
        if (!users.length) break;
        const found = users.find((u: any) => String(u?.email || "").trim().toLowerCase() === clean);
        const uid = String(found?.id || found?.user?.id || "").trim();
        if (uid) return { ok: true as const, userId: uid };
      }
    }

    const adminClient = authCtx?.admin;
    const v2 = adminClient?.auth?.admin;
    const v1 = adminClient?.auth?.api;

    const getByEmail = v2?.getUserByEmail || v1?.getUserByEmail;
    if (typeof getByEmail === "function") {
      const r = await getByEmail(clean);
      const err = r?.error;
      const uid = String(r?.data?.user?.id || "").trim();
      if (uid) return { ok: true as const, userId: uid };
      if (err) return { ok: false as const, status: 500, error: explainAuthAdminError(err), detail: String(err?.message || "").slice(0, 600) };
      return { ok: false as const, status: 404, error: "No encontré ese usuario por correo." };
    }

    const listUsers = v2?.listUsers || v1?.listUsers;
    if (typeof listUsers === "function") {
      const perPage = 200;
      const maxPages = 20;
      for (let page = 1; page <= maxPages; page++) {
        const r = await listUsers({ page, perPage });
        const err = r?.error;
        if (err) return { ok: false as const, status: 500, error: explainAuthAdminError(err), detail: String(err?.message || "").slice(0, 600) };
        const users = Array.isArray(r?.data?.users) ? r.data.users : [];
        if (!users.length) break;
        const found = users.find((u: any) => String(u?.email || "").trim().toLowerCase() === clean);
        const uid = String(found?.id || "").trim();
        if (uid) return { ok: true as const, userId: uid };
      }
      return { ok: false as const, status: 404, error: "No encontré ese usuario por correo." };
    }

    return { ok: false as const, status: 500, error: "Supabase Auth Admin no disponible (getUserByEmail/listUsers)" };
  }

  async function sumPayments(admin: any, sinceIso: string | null) {
    let q = admin.from("mp_transactions").select("amount_mxn, created_at").eq("kind", "songs").gt("amount_mxn", 0);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { data, error } = await q.limit(10000);
    if (error) return { ok: false as const, error: error.message, count: 0, mxn: 0 };
    const rows = Array.isArray(data) ? data : [];
    const mxn = rows.reduce((acc: number, r: any) => acc + (Number(r?.amount_mxn) || 0), 0);
    return { ok: true as const, count: rows.length, mxn };
  }

  async function handleStats(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const now = new Date();
    const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startWeek = new Date(startToday);
    startWeek.setUTCDate(startWeek.getUTCDate() - 7);
    const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const start30d = new Date(startToday);
    start30d.setUTCDate(start30d.getUTCDate() - 30);
    const startDaily7d = new Date(startToday);
    startDaily7d.setUTCDate(startDaily7d.getUTCDate() - 6);

    const admin = auth.admin;

    const supabaseUrl = String((auth as any)?.supabaseUrl || "").trim();
    const supabaseService = String((auth as any)?.supabaseService || "").trim();
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase Auth" });

    const realIds = await buildRealUserIdSet(admin);
    const safeTime = (s: any) => {
      const v = typeof s === "string" ? s : "";
      if (!v) return 0;
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const isSince = (iso: any, since: Date) => {
      const t = safeTime(iso);
      return t > 0 && t >= since.getTime();
    };

    let totalCount = 0;
    let active30dCount = 0;
    let new7dCount = 0;
    let realTotal = 0;
    let realActive30d = 0;
    let realNew7d = 0;
    const realUsers = new Map<
      string,
      {
        id: string;
        email: string;
        created_at: string;
        last_sign_in_at: string;
        full_name: string;
      }
    >();

    const perPage = 200;
    const maxPages = 10;
    for (let page = 1; page <= maxPages; page++) {
      const r = await listUsersViaHttp(supabaseUrl, supabaseService, page, perPage);
      if (!r.ok) return send(res, r.status, { error: explainAuthAdminError({ message: r.error }), detail: r.detail || null });
      const users = Array.isArray(r.users) ? r.users : [];
      if (!users.length) break;
      for (const u of users) {
        const email = (u?.email || "").toString().trim();
        if (!email) continue;
        if (isAdminEmail(email)) continue;
        totalCount += 1;
        const createdAt = String((u as any)?.created_at || "");
        const lastSignInAt = String((u as any)?.last_sign_in_at || "");
        const isNew7d = isSince(createdAt, startWeek);
        const isActive30d = isSince(lastSignInAt, start30d);
        if (isNew7d) new7dCount += 1;
        if (isActive30d) active30dCount += 1;
        const uid = String((u as any)?.id || "").trim();
        if (uid && realIds.has(uid)) {
          realTotal += 1;
          if (isNew7d) realNew7d += 1;
          if (isActive30d) realActive30d += 1;
          const meta = (u as any)?.user_metadata ?? (u as any)?.user_meta_data ?? (u as any)?.raw_user_meta_data ?? {};
          const full_name = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : "";
          realUsers.set(uid, {
            id: uid,
            email,
            created_at: createdAt,
            last_sign_in_at: lastSignInAt,
            full_name: String(full_name || "").slice(0, 120),
          });
        }
      }
      if (typeof r.total === "number" && Number.isFinite(r.total) && r.total <= perPage * page) break;
    }

    const [today, week, month, all] = await Promise.all([
      sumPayments(admin, startToday.toISOString()),
      sumPayments(admin, startWeek.toISOString()),
      sumPayments(admin, startMonth.toISOString()),
      sumPayments(admin, null),
    ]);

    const dailyMap = new Map<string, { mxn: number; count: number }>();
    try {
      const { data, error } = await admin
        .from("mp_transactions")
        .select("amount_mxn, created_at")
        .eq("kind", "songs")
        .gt("amount_mxn", 0)
        .gte("created_at", startDaily7d.toISOString())
        .limit(20000);
      if (!error) {
        const rows = Array.isArray(data) ? data : [];
        for (const r of rows) {
          const createdAt = typeof (r as any)?.created_at === "string" ? (r as any).created_at : "";
          let key = "";
          try {
            const d = new Date(createdAt);
            if (Number.isFinite(d.getTime())) key = d.toISOString().slice(0, 10);
          } catch {
            key = "";
          }
          if (!key) continue;
          const amt = Number((r as any)?.amount_mxn ?? 0) || 0;
          const prev = dailyMap.get(key) || { mxn: 0, count: 0 };
          dailyMap.set(key, { mxn: prev.mxn + amt, count: prev.count + 1 });
        }
      }
    } catch {
    }

    const daily_7d: any[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDaily7d);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      const v = dailyMap.get(key) || { mxn: 0, count: 0 };
      daily_7d.push({ day: key, mxn: Math.round((v.mxn || 0) * 100) / 100, count: v.count || 0 });
    }

    const userIds = new Set<string>(Array.from(realUsers.keys()));
    const txByUser = new Map<string, any[]>();
    try {
      const { data } = await admin
        .from("mp_transactions")
        .select("user_id, payment_id, pack_key, kind, created_at, amount_mxn")
        .eq("kind", "songs")
        .order("created_at", { ascending: false })
        .limit(20000);
      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        const uid = String((row as any)?.user_id || "").trim();
        if (!uid || !userIds.has(uid)) continue;
        const list = txByUser.get(uid) || [];
        list.push(row);
        txByUser.set(uid, list);
      }
    } catch {
    }

    const songsThisMonth = new Map<string, number>();
    try {
      const { data } = await admin
        .from("library_items")
        .select("user_id, title, description, suno_audio_id, created_at")
        .eq("type", "song")
        .gte("created_at", startMonth.toISOString())
        .limit(50000);
      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        const uid = String((row as any)?.user_id || "").trim();
        if (!uid || !userIds.has(uid)) continue;
        const description = String((row as any)?.description || "").trim().toLowerCase();
        const title = String((row as any)?.title || "").trim().toLowerCase();
        const sunoAudioId = String((row as any)?.suno_audio_id || "").trim().toLowerCase();
        const isMastered =
          description === "audio masterizado" ||
          title.endsWith("(masterizada)") ||
          sunoAudioId.startsWith("master_");
        if (isMastered) continue;
        songsThisMonth.set(uid, (songsThisMonth.get(uid) || 0) + 1);
      }
    } catch {
    }

    const sortUsers = (items: any[]) =>
      items.sort((a: any, b: any) => {
        const songsDiff = (Number(b?.songs_this_month ?? 0) || 0) - (Number(a?.songs_this_month ?? 0) || 0);
        if (songsDiff !== 0) return songsDiff;
        const signInDiff = safeTime(b?.last_sign_in_at) - safeTime(a?.last_sign_in_at);
        if (signInDiff !== 0) return signInDiff;
        return String(a?.email || "").localeCompare(String(b?.email || ""));
      });

    const active_users: any[] = [];
    const inactive_users: any[] = [];
    for (const user of realUsers.values()) {
      const plan = buildUserPlanFromTransactions(txByUser.get(user.id) || [], now.getTime());
      const row = {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        plan_key: String((plan as any)?.plan_key || "ninguno"),
        plan_active: Boolean((plan as any)?.plan_active),
        plan_expires_at: (plan as any)?.plan_expires_at ?? null,
        songs_this_month: Number(songsThisMonth.get(user.id) || 0),
      };
      if (row.plan_active) active_users.push(row);
      else inactive_users.push(row);
    }

    sortUsers(active_users);
    sortUsers(inactive_users);

    return send(res, 200, {
      users: {
        total: totalCount,
        active30d: active30dCount,
        new7d: new7dCount,
        real_total: realTotal,
        real_active30d: realActive30d,
        real_new7d: realNew7d,
      },
      user_activity: {
        active: active_users,
        inactive: inactive_users,
      },
      payments: {
        today: { mxn: today.ok ? today.mxn : 0, count: today.ok ? today.count : 0 },
        week: { mxn: week.ok ? week.mxn : 0, count: week.ok ? week.count : 0 },
        month: { mxn: month.ok ? month.mxn : 0, count: month.ok ? month.count : 0 },
        all: { mxn: all.ok ? all.mxn : 0, count: all.ok ? all.count : 0 },
        daily_7d,
      },
      generated_at: now.toISOString(),
    });
  }

  async function handleDiag(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const env = {
      has_supabase_url: Boolean(process.env.SUPABASE_URL),
      has_supabase_anon: Boolean(process.env.SUPABASE_ANON_KEY),
      has_supabase_service: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      has_suno_base: Boolean(process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL),
      has_suno_key: Boolean(process.env.SUNO_API_KEY || process.env.SUNO_KEY),
    };

    let provider: any = null;
    try {
      const paths = [
        "/api/v1/generate/credit",
        "/api/v1/get-credits",
        "/api/v1/suno/get-credits",
        "/api/v1/suno/generate/credit",
        "/api/v1/suno/credits",
        "/api/v1/suno/credit",
      ];
      let last: any = null;
      for (const p of paths) {
        const r = await providerFetchJson(p, { method: "GET" });
        last = r;
        if (r?.res?.status !== 404) break;
      }
      const r = last;
      const code = Number(r?.data?.code);
      const raw = r?.data?.data?.credits ?? r?.data?.data;
      const parsed = parseProviderCreditsValue(raw);
      provider = {
        ok: Boolean(r?.res?.ok),
        status: Number(r?.res?.status || 0),
        code: Number.isFinite(code) ? code : null,
        credits: Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null,
        text: String(r?.text || "").slice(0, 300),
      };
    } catch (e) {
      provider = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    return send(res, 200, { ok: true, env, provider });
  }

  async function handleGrantCredits(req: any, res: any) {
    const eid = genAdminErrorId("ADMGRN");
    const safeHandler = "handleGrantCredits";
    try {
      if ((req.method || "").toUpperCase() !== "POST") return adminSendError(res, 405, "Método no permitido", eid);
      const auth = await requireAdmin(req);
      if (!auth.ok) return adminSendError(res, auth.status, auth.error || "No autorizado", eid);

      const body = parseJsonBody(req);
      if (!body) return adminSendError(res, 400, "Body inválido", eid);
      const email = (body?.email || "").toString().trim().toLowerCase();
      const credits = Number(body?.credits ?? 0);
      if (!email) return adminSendError(res, 400, "Falta email", eid);
      if (!Number.isFinite(credits) || credits <= 0) return adminSendError(res, 400, "Créditos inválidos", eid);

      const admin = auth.admin;
      const found = await findUserIdByEmail(auth, email);
      if (!found.ok) return adminSendError(res, found.status, found.error || "Usuario no encontrado", eid, { detail: (found as any)?.detail || null });
      const userId = found.userId;

      const upd = await adjustUserCredits(admin, userId, credits);
      if (!upd.ok) return adminSendError(res, 500, upd.error || "No pude acreditar créditos", eid);

      const insert = await admin.from("mp_transactions").insert({
        user_id: userId,
        kind: "admin_grant",
        pack_key: "admin",
        amount_mxn: 0,
        payment_id: `admin_grant:${auth.user.id}:${Date.now()}`,
      });
      if (insert?.error) {
        adminServerLog(eid, safeHandler, { step: "insert.mp_transactions_err", err: insert.error });
      }

      return send(res, 200, { ok: true, user_id: userId, credited: credits, new_credits: upd.credits ?? null, error_id: eid });
    } catch (outer) {
      adminServerLog(eid, safeHandler, {
        step: "catch_outer",
        errMessage: outer instanceof Error ? outer.message : String(outer),
        errStack: outer instanceof Error ? outer.stack : undefined,
      });
      return adminSendError(res, 500, "Algo salió mal.", eid);
    }
  }

  async function handleGrantMiniPack(req: any, res: any) {
    const eid = genAdminErrorId("ADMPCK");
    const safeHandler = "handleGrantMiniPack";
    try {
      if ((req.method || "").toUpperCase() !== "POST") return adminSendError(res, 405, "Método no permitido", eid);
      const auth = await requireAdmin(req);
      if (!auth.ok) return adminSendError(res, auth.status, auth.error || "No autorizado", eid);

      const body = parseJsonBody(req);
      if (!body) return adminSendError(res, 400, "Body inválido", eid);
      const email = (body?.email || "").toString().trim().toLowerCase();
      const packKey = (body?.packKey || body?.pack_key || "").toString().trim();
      if (!email) return adminSendError(res, 400, "Falta email", eid);
      if (!packKey) return adminSendError(res, 400, "Falta packKey", eid);

      const admin = auth.admin;
      const found = await findUserIdByEmail(auth, email);
      if (!found.ok) return adminSendError(res, found.status, found.error || "Usuario no encontrado", eid, { detail: (found as any)?.detail || null });
      const userId = found.userId;

      const packs = await listActiveCreditPacks(admin);
      const pack = packs.find((p: any) => String((p as any).pack_key || "").trim().toLowerCase() === packKey.toLowerCase());
      if (!pack) return adminSendError(res, 404, "Paquete no encontrado o no disponible.", eid);

      const packId = Number((pack as any).id ?? 0);
      const credits = round2(Number((pack as any).credits_amount ?? 0));
      const validityDays = Number((pack as any).validity_days ?? 30);
      if (!Number.isFinite(credits) || credits <= 0) return adminSendError(res, 400, "Créditos inválidos en el paquete.", eid);
      if (!Number.isFinite(validityDays) || validityDays <= 0) return adminSendError(res, 400, "Vigencia inválida en el paquete.", eid);

      const paymentId = `admin_mini_pack:${auth.user.id}:${userId}:${Date.now()}`;
      const batch = await insertCreditBatch(admin, {
        userId,
        packId: Number.isFinite(packId) && packId > 0 ? packId : undefined,
        packKey,
        paymentId,
        credits,
        validityDays,
        amountMxn: 0,
        note: `Admin recarga mini pack (${packKey})`,
      });
      if (!batch.ok) return adminSendError(res, 500, batch.error || "No pude crear el lote del mini paquete.", eid);

      const insert = await admin.from("mp_transactions").insert({
        user_id: userId,
        kind: "admin_mini_pack",
        pack_key: packKey,
        amount_mxn: 0,
        payment_id: paymentId,
      });
      if (insert?.error) {
        adminServerLog(eid, safeHandler, { step: "insert.mp_transactions_err", err: insert.error });
      }

      return send(res, 200, { ok: true, user_id: userId, pack_key: packKey, credits, batch_id: batch.batchId ?? null, error_id: eid });
    } catch (outer) {
      adminServerLog(eid, safeHandler, {
        step: "catch_outer",
        errMessage: outer instanceof Error ? outer.message : String(outer),
        errStack: outer instanceof Error ? outer.stack : undefined,
      });
      return adminSendError(res, 500, "Algo salió mal.", eid);
    }
  }

  async function handleTransferCredits(req: any, res: any) {
    const eid = genAdminErrorId("ADMTRN");
    const safeHandler = "handleTransferCredits";
    try {
      if ((req.method || "").toUpperCase() !== "POST") return adminSendError(res, 405, "Método no permitido", eid);
      const auth = await requireAdmin(req);
      if (!auth.ok) return adminSendError(res, auth.status, auth.error || "No autorizado", eid);

      const body = parseJsonBody(req);
      if (!body) return adminSendError(res, 400, "Body inválido", eid);
      const email = (body?.email || "").toString().trim().toLowerCase();
      const credits = round2(Number(body?.credits ?? 0));
      if (!email) return adminSendError(res, 400, "Falta email", eid);
      if (!Number.isFinite(credits) || credits <= 0) return adminSendError(res, 400, "Créditos inválidos", eid);

      const admin = auth.admin;
      const found = await findUserIdByEmail(auth, email);
      if (!found.ok) return adminSendError(res, found.status, found.error || "Usuario no encontrado", eid, { detail: (found as any)?.detail || null });
      const fromUserId = found.userId;
      const toUserId = auth.user.id;

      const ensureFrom = await ensureProfileExists(admin, fromUserId);
      if (!ensureFrom.ok) return adminSendError(res, 500, "No pude preparar el usuario.", eid, { detail: ensureFrom.error });
      const ensureTo = await ensureProfileExists(admin, toUserId);
      if (!ensureTo.ok) return adminSendError(res, 500, "No pude preparar tu cuenta.", eid, { detail: ensureTo.error });

      const fromProfile = await admin.from("profiles").select("*").eq("id", fromUserId).maybeSingle();
      if (fromProfile.error) return adminSendError(res, 500, "No pude leer el saldo del usuario.", eid, { detail: fromProfile.error.message });
      const fromCreditsBefore = round2(creditsFromProfile(fromProfile.data));
      const toProfileBefore = await admin.from("profiles").select("*").eq("id", toUserId).maybeSingle();
      const toCreditsBefore = toProfileBefore.error ? null : round2(creditsFromProfile(toProfileBefore.data));
      if (fromCreditsBefore < credits) {
        return adminSendError(res, 400, `El usuario solo tiene ${fromCreditsBefore} créditos.`, eid);
      }
      const transferId = `admin_transfer:${toUserId}:${fromUserId}:${Date.now()}`;

      const out = await consumeUserCredits(admin, fromUserId, credits);
      if (!out.ok) return adminSendError(res, 500, out.error || "No pude quitar créditos.", eid);

      const inc = await adjustUserCredits(admin, toUserId, credits);
      if (!inc.ok) {
        try { await adjustUserCredits(admin, fromUserId, credits); } catch {}
        return adminSendError(res, 500, inc.error || "No pude regresarte los créditos (revertido).", eid);
      }

      const insertTr = await admin.from("mp_transactions").insert([
        { user_id: fromUserId, kind: "admin_transfer_out", pack_key: "admin", amount_mxn: 0, payment_id: `${transferId}:out` },
        { user_id: toUserId, kind: "admin_transfer_in", pack_key: "admin", amount_mxn: 0, payment_id: `${transferId}:in` },
      ]);
      if (insertTr?.error) adminServerLog(eid, safeHandler, { step: "insert.mp_transactions_err", err: insertTr.error });

      const fromProfileAfter = await admin.from("profiles").select("*").eq("id", fromUserId).maybeSingle();
      const fromCreditsAfter = fromProfileAfter.error ? null : round2(creditsFromProfile(fromProfileAfter.data));
      const toProfileAfter = await admin.from("profiles").select("*").eq("id", toUserId).maybeSingle();
      const toCreditsAfter = toProfileAfter.error ? null : round2(creditsFromProfile(toProfileAfter.data));

      return send(res, 200, {
        ok: true,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        transferred: credits,
        from_credits_before: fromCreditsBefore,
        from_credits_after: fromCreditsAfter,
        to_credits_before: toCreditsBefore,
        to_credits_after: toCreditsAfter,
        note: "Esto mueve el saldo interno (profiles). El saldo del proveedor (Suno) no se puede mover.",
        error_id: eid,
      });
    } catch (outer) {
      adminServerLog(eid, safeHandler, {
        step: "catch_outer",
        errMessage: outer instanceof Error ? outer.message : String(outer),
        errStack: outer instanceof Error ? outer.stack : undefined,
      });
      return adminSendError(res, 500, "Algo salió mal.", eid);
    }
  }

  async function setUserCreditsAbsolute(admin: any, userId: string, nextCredits: number) {
    const next = round2(Math.max(0, Number(nextCredits)));
    if (!Number.isFinite(next)) return { ok: false as const, error: "Créditos inválidos" };

    for (let i = 0; i < 4; i++) {
      const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (readErr) return { ok: false as const, error: readErr.message };
      if (!profile) {
        const created = await ensureProfileExists(admin, userId);
        if (!created.ok) return { ok: false as const, error: created.error };
        continue;
      }
      const upd = await updateCreditsAnyColumn(admin, userId, next);
      if (upd.ok) return { ok: true as const, credits: next };
      return { ok: false as const, error: upd.error };
    }

    return { ok: false as const, error: "No pude actualizar créditos (intenta otra vez)." };
  }

  async function handleSetPlan(req: any, res: any) {
    const eid = genAdminErrorId("ADMPLN");
    const safeHandler = "handleSetPlan";
    try {
      if ((req.method || "").toUpperCase() !== "POST") return adminSendError(res, 405, "Método no permitido", eid);
      const auth = await requireAdmin(req);
      if (!auth.ok) return adminSendError(res, auth.status, auth.error || "No autorizado", eid);

      const body = parseJsonBody(req);
      if (!body) return adminSendError(res, 400, "Body inválido", eid);
      const email = (body?.email || "").toString().trim().toLowerCase();
      const plan_key = (body?.plan_key || "").toString().trim().toLowerCase();
      const credits_mode = (body?.credits_mode || "none").toString().trim().toLowerCase();
      const credits = Number(body?.credits ?? 0);

      if (!email) return adminSendError(res, 400, "Falta email", eid);
      if (!(plan_key === "ninguno" || plan_key === "inicio" || plan_key === "productor")) {
        return adminSendError(res, 400, "Plan inválido", eid);
      }
      if (!(credits_mode === "none" || credits_mode === "default" || credits_mode === "set")) {
        return adminSendError(res, 400, "Modo de créditos inválido", eid);
      }

      const admin = auth.admin;
      const found = await findUserIdByEmail(auth, email);
      if (!found.ok) return adminSendError(res, found.status, found.error || "Usuario no encontrado", eid, { detail: (found as any)?.detail || null });
      const userId = found.userId;

      const payment_id = `admin_plan:${auth.user.id}:${userId}:${Date.now()}`;
      const insertTr = await admin.from("mp_transactions").insert({
        user_id: userId,
        kind: "songs",
        pack_key: plan_key,
        amount_mxn: 0,
        payment_id,
      });
      if (insertTr?.error) adminServerLog(eid, safeHandler, { step: "insert.mp_transactions_err", err: insertTr.error });

      if (credits_mode === "default") {
        let add = 0;
        if (plan_key === "inicio") add = 1200;
        if (plan_key === "productor") add = 2000;
        if (add > 0) {
          const upd = await applyCreditRolloverWithCap(admin, {
            userId,
            monthlyCredits: add,
            subscriptionActive: true,
            renewalPaidSuccessfully: true,
          });
          if (!upd.ok) return adminSendError(res, 500, upd.error || "No pude acreditar créditos", eid);
        }
      } else if (credits_mode === "set") {
        if (!Number.isFinite(credits) || credits < 0) return adminSendError(res, 400, "Créditos inválidos", eid);
        const upd = await setUserCreditsAbsolute(admin, userId, credits);
        if (!upd.ok) return adminSendError(res, 500, upd.error || "No pude fijar créditos", eid);
      }

      return send(res, 200, { ok: true, user_id: userId, plan_key, credits_mode, error_id: eid });
    } catch (outer) {
      adminServerLog(eid, safeHandler, {
        step: "catch_outer",
        errMessage: outer instanceof Error ? outer.message : String(outer),
        errStack: outer instanceof Error ? outer.stack : undefined,
      });
      return adminSendError(res, 500, "Algo salió mal.", eid);
    }
  }

  async function handleFeedback(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const mode = (pickQuery(req, "mode") || "").toString().trim().toLowerCase();
    const admin = auth.admin;
    try {
      let unread_count = 0;
      try {
        const r = await admin.from("support_feedback").select("id", { count: "exact", head: true }).eq("is_read", false);
        if (!r.error) unread_count = Number(r.count || 0);
      } catch {
        unread_count = 0;
      }
      if (mode === "count") return send(res, 200, { unread_count });

      const { data, error } = await admin
        .from("support_feedback")
        .select("id, user_id, user_email, name, whatsapp, message, created_at, is_read, read_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return send(res, 500, { error: error.message });
      const items = Array.isArray(data) ? data : [];
      return send(res, 200, { unread_count, items });
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleFeedbackMarkRead(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const id = (body?.id || "").toString().trim();
    if (!id) return send(res, 400, { error: "Falta id" });

    const admin = auth.admin;
    const { error } = await admin.from("support_feedback").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { ok: true });
  }

  async function handleUsers(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const searchRaw = (pickQuery(req, "search") || pickQuery(req, "q") || "").toString().trim().toLowerCase();
    const limitRaw = Number(pickQuery(req, "limit") || 200);
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 200, 500));
    const mode = (pickQuery(req, "mode") || "real").toString().trim().toLowerCase(); // real | all
    const onlyReal = mode !== "all";

    const supabaseUrl = String((auth as any)?.supabaseUrl || "").trim();
    const supabaseService = String((auth as any)?.supabaseService || "").trim();
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase Auth" });

    let activeUserIds: Set<string> | null = null;
    if (onlyReal) {
      try {
        activeUserIds = await buildRealUserIdSet((auth as any).admin);
      } catch {
        activeUserIds = new Set<string>();
      }
    }

    const items: any[] = [];
    let total: number | null = null;
    let adminSeen = 0;
    let total_filtered = 0;
    const perPage = 200;
    const maxPages = 10;

    for (let page = 1; page <= maxPages; page++) {
      const r = await listUsersViaHttp(supabaseUrl, supabaseService, page, perPage);
      if (!r.ok) return send(res, r.status, { error: explainAuthAdminError({ message: r.error }), detail: r.detail || null });
      if (typeof r.total === "number" && Number.isFinite(r.total)) total = r.total;
      const users = Array.isArray(r.users) ? r.users : [];
      if (!users.length) break;

      for (const u of users) {
        const email = (u?.email || "").toString().trim();
        if (!email) continue;
        const lower = email.toLowerCase();
        if (isAdminEmail(lower)) {
          adminSeen += 1;
          continue;
        }
        const uid = String(u?.id || "").trim();
        if (onlyReal && activeUserIds && uid && !activeUserIds.has(uid)) continue;
        if (searchRaw && !lower.includes(searchRaw)) continue;
        total_filtered += 1;
        const meta = (u as any)?.user_metadata ?? (u as any)?.user_meta_data ?? (u as any)?.raw_user_meta_data ?? {};
        const full_name = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : "";
        const birthdate =
          typeof meta?.birthdate === "string"
            ? meta.birthdate
            : typeof meta?.birthday === "string"
              ? meta.birthday
              : typeof meta?.dob === "string"
                ? meta.dob
                : "";
        items.push({
          id: uid,
          email,
          created_at: String(u?.created_at || ""),
          last_sign_in_at: String(u?.last_sign_in_at || ""),
          full_name: String(full_name || "").slice(0, 120),
          birthdate: String(birthdate || "").slice(0, 32),
        });
        if (items.length >= limit) break;
      }
      if (items.length >= limit && !searchRaw && total != null && total <= perPage * page) break;
    }

    const total_non_admin = total == null ? null : Math.max(0, Number(total || 0) - Number(adminSeen || 0));
    return send(res, 200, {
      ok: true,
      mode: onlyReal ? "real" : "all",
      total: total ?? null,
      total_non_admin,
      total_filtered,
      count: items.length,
      items,
    });
  }

  async function handleUserDetail(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const emailRaw = (pickQuery(req, "email") || "").toString().trim().toLowerCase();
    const userIdRaw = (pickQuery(req, "user_id") || pickQuery(req, "id") || "").toString().trim();
    if (!emailRaw && !userIdRaw) return send(res, 400, { error: "Falta email o user_id" });

    const supabaseUrl = String((auth as any)?.supabaseUrl || "").trim();
    const supabaseService = String((auth as any)?.supabaseService || "").trim();
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase Auth" });

    const perPage = 200;
    const maxPages = 25;
    let found: any = null;
    for (let page = 1; page <= maxPages; page++) {
      const r = await listUsersViaHttp(supabaseUrl, supabaseService, page, perPage);
      if (!r.ok) return send(res, r.status, { error: explainAuthAdminError({ message: r.error }), detail: r.detail || null });
      const users = Array.isArray(r.users) ? r.users : [];
      if (!users.length) break;
      found =
        users.find((u: any) => (userIdRaw ? String(u?.id || "").trim() === userIdRaw : false)) ||
        users.find((u: any) => (emailRaw ? String(u?.email || "").trim().toLowerCase() === emailRaw : false)) ||
        null;
      if (found) break;
    }
    if (!found) return send(res, 404, { error: "No encontré ese usuario." });
    const uid = String(found?.id || "").trim();
    if (!uid) return send(res, 404, { error: "No encontré ese usuario." });
    if (isAdminEmail(String(found?.email || "").trim().toLowerCase())) return send(res, 403, { error: "No puedes ver este usuario." });

    const meta = (found as any)?.user_metadata ?? (found as any)?.user_meta_data ?? (found as any)?.raw_user_meta_data ?? {};
    const full_name = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : "";
    const birthdate =
      typeof meta?.birthdate === "string"
        ? meta.birthdate
        : typeof meta?.birthday === "string"
          ? meta.birthday
          : typeof meta?.dob === "string"
            ? meta.dob
            : "";

    const admin = (auth as any).admin;
    const prof = await admin.from("profiles").select("*").eq("id", uid).maybeSingle();
    const internal_credits = prof.error ? null : round2(creditsFromProfile(prof.data));

    const plan = await getUserPlan(admin, uid).catch(() => ({
      plan_key: "ninguno",
      downloads_allowed: false,
      plan_active: false,
      plan_expires_at: null,
      hasProductor: false,
    }));

    return send(res, 200, {
      ok: true,
      user: {
        id: uid,
        email: String(found?.email || ""),
        created_at: String(found?.created_at || ""),
        last_sign_in_at: String(found?.last_sign_in_at || ""),
        full_name: String(full_name || "").slice(0, 120),
        birthdate: String(birthdate || "").slice(0, 32),
      },
      internal_credits,
      plan: {
        plan_key: String((plan as any)?.plan_key || "ninguno"),
        plan_active: Boolean((plan as any)?.plan_active),
        plan_expires_at: (plan as any)?.plan_expires_at ?? null,
        downloads_allowed: Boolean((plan as any)?.downloads_allowed),
      },
    });
  }

  async function handleDeleteUser(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const email = (body?.email || "").toString().trim().toLowerCase();
    if (!email) return send(res, 400, { error: "Falta email" });
    if (isAdminEmail(email)) return send(res, 403, { error: "No puedes borrar este usuario." });

    const supabaseUrl = String((auth as any)?.supabaseUrl || "").trim();
    const supabaseService = String((auth as any)?.supabaseService || "").trim();
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase Auth" });

    const found = await findUserIdByEmail(auth, email);
    if (!found.ok) return send(res, found.status, { error: found.error, detail: (found as any)?.detail || null });
    const uid = found.userId;

    const del = await deleteUserViaHttp(supabaseUrl, supabaseService, uid);
    if (!del.ok) return send(res, del.status, { error: "No pude borrar el usuario", detail: del.detail || del.error || null });

    const admin = (auth as any).admin;
    try {
      await admin.from("profiles").delete().eq("id", uid);
    } catch {
    }
    try {
      await admin.from("mp_transactions").delete().eq("user_id", uid);
    } catch {
    }
    try {
      await admin.from("library_items").delete().eq("user_id", uid);
    } catch {
    }
    try {
      await admin.from("suno_tasks").delete().eq("user_id", uid);
    } catch {
    }
    try {
      await admin.from("support_feedback").delete().eq("user_id", uid);
    } catch {
    }

    return send(res, 200, { ok: true, user_id: uid, email });
  }

  async function handlePruneUsers(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req) || {};
    const mode = String(body?.mode || "dry").trim().toLowerCase(); // dry | execute
    const days = Math.max(0, Math.min(Number(body?.days ?? 7) || 7, 365));
    const limit = Math.max(1, Math.min(Number(body?.limit ?? 500) || 500, 5000));

    const supabaseUrl = String((auth as any)?.supabaseUrl || "").trim();
    const supabaseService = String((auth as any)?.supabaseService || "").trim();
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase Auth" });

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffMs = cutoff.getTime();

    const admin = (auth as any).admin;
    const realIds = await buildRealUserIdSet(admin);
    const safeTime = (s: any) => {
      const v = typeof s === "string" ? s : "";
      if (!v) return 0;
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : 0;
    };

    const candidates: Array<{ id: string; email: string; created_at: string; last_sign_in_at: string }> = [];
    const perPage = 200;
    const maxPages = 50;
    for (let page = 1; page <= maxPages; page++) {
      const r = await listUsersViaHttp(supabaseUrl, supabaseService, page, perPage);
      if (!r.ok) return send(res, r.status, { error: explainAuthAdminError({ message: r.error }), detail: r.detail || null });
      const users = Array.isArray(r.users) ? r.users : [];
      if (!users.length) break;
      for (const u of users) {
        const email = String(u?.email || "").trim();
        if (!email) continue;
        if (isAdminEmail(email)) continue;
        const uid = String(u?.id || "").trim();
        if (!uid) continue;
        if (realIds.has(uid)) continue;
        const createdAt = String(u?.created_at || "");
        const lastSignInAt = String(u?.last_sign_in_at || "");
        const createdMs = safeTime(createdAt);
        const lastSignInMs = safeTime(lastSignInAt);
        const isRecent = (createdMs > 0 && createdMs >= cutoffMs) || (lastSignInMs > 0 && lastSignInMs >= cutoffMs);
        if (isRecent) continue;
        candidates.push({ id: uid, email, created_at: createdAt, last_sign_in_at: lastSignInAt });
        if (candidates.length >= limit && mode === "execute") break;
      }
      if (candidates.length >= limit && mode === "execute") break;
      if (typeof r.total === "number" && Number.isFinite(r.total) && r.total <= perPage * page) break;
    }

    if (mode !== "execute") {
      return send(res, 200, {
        ok: true,
        mode: "dry",
        days,
        found: candidates.length,
        preview: candidates.slice(0, 50).map((x) => ({ email: x.email, created_at: x.created_at, last_sign_in_at: x.last_sign_in_at })),
      });
    }

    let deleted = 0;
    let failed = 0;
    const failedEmails: string[] = [];
    const did = candidates.slice(0, limit);
    for (const c of did) {
      const del = await deleteUserViaHttp(supabaseUrl, supabaseService, c.id);
      if (!del.ok) {
        failed += 1;
        failedEmails.push(c.email);
        continue;
      }
      deleted += 1;
      try {
        await admin.from("profiles").delete().eq("id", c.id);
      } catch {
      }
      try {
        await admin.from("mp_transactions").delete().eq("user_id", c.id);
      } catch {
      }
      try {
        await admin.from("library_items").delete().eq("user_id", c.id);
      } catch {
      }
    }

    return send(res, 200, { ok: true, mode: "execute", days, attempted: did.length, deleted, failed, failed_emails: failedEmails.slice(0, 20) });
  }

  return async function handler(req: any, res: any) {
    const action = (pickQuery(req, "action") || "").trim().toLowerCase() || "";
    const fallback = (() => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const parts = pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => p === "admin");
      const next = i >= 0 ? parts.slice(i + 1).join("/") : "";
      return (next || "").toLowerCase();
    })();
    const a = action || fallback;

    if (a === "stats") return handleStats(req, res);
    if (a === "diag") return handleDiag(req, res);
    if (a === "grant-credits") return handleGrantCredits(req, res);
    if (a === "grant-mini-pack") return handleGrantMiniPack(req, res);
    if (a === "transfer-credits") return handleTransferCredits(req, res);
    if (a === "set-plan") return handleSetPlan(req, res);
    if (a === "feedback") return handleFeedback(req, res);
    if (a === "feedback-mark-read") return handleFeedbackMarkRead(req, res);
    if (a === "users") return handleUsers(req, res);
    if (a === "user-detail") return handleUserDetail(req, res);
    if (a === "collaborators") return handleGetCollaborators(req, res);
    if (a === "assign" || a === "collaborators/assign") return handleAssignCollaborator(req, res);
    if (a === "commissions-report") return handleCommissionsReport(req, res);
    if (a === "delete-user") return handleDeleteUser(req, res);
    if (a === "prune-users") return handlePruneUsers(req, res);
    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

const aiHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  const toBase64 = (buf: ArrayBuffer) => Buffer.from(buf).toString("base64");

  const safeUrl = (u: string) => {
    try {
      const url = new URL(u);
      if (!(url.protocol === "https:" || url.protocol === "http:")) return null;
      return url.toString();
    } catch {
      return null;
    }
  };

  const normalizeAudioMimeType = (raw: string) => {
    const s = (raw || "").toString().trim().toLowerCase();
    if (!s) return "";
    const mime = s.split(";")[0].trim();
    if (!mime) return "";
    if (mime === "audio/mp3") return "audio/mpeg";
    if (mime === "audio/x-m4a") return "audio/mp4";
    if (mime === "audio/m4a") return "audio/mp4";
    if (mime === "video/mp4") return "audio/mp4";
    if (mime.startsWith("audio/")) return mime;
    return "";
  };

  async function transcribeLyricsWithGemini(audioBuf: ArrayBuffer, mimeType: string) {
    const apiKey = String(
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      process.env.GEMINI_KEY ||
      process.env.GOOGLE_AI_STUDIO_KEY ||
      process.env.AI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY ||
      ""
    ).trim();
    if (!apiKey) {
      return {
        ok: false as const,
        error: "Falta GEMINI_API_KEY en Vercel",
        userMessage: "La transcripción no está configurada. Falta GEMINI_API_KEY en Vercel.",
      };
    }

    const mod = await import("@google/genai");
    const GoogleGenAI = mod?.GoogleGenAI || mod?.default?.GoogleGenAI;
    if (!GoogleGenAI) return { ok: false as const, error: "No pude cargar Gemini (@google/genai)" };

    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction =
      "Eres un experto en transcripción de audio difícil (con ruido, eco, baja calidad y voces mezcladas). " +
      "Debes limpiar el ruido mentalmente y enfocarte en la coherencia de las frases. " +
      "No inventes contenido: si una palabra no se entiende, usa [inaudible]. " +
      "Entrega únicamente la letra, sin explicaciones.";
    const prompt =
      "Transcribe únicamente la letra cantada en este audio. " +
      "Respeta saltos de línea. " +
      "Si identificas estructura, usa etiquetas como [Verso], [Coro], [Puente]. " +
      "Si NO hay voz/canto, responde exactamente: SIN_LETRA. " +
      "Si el audio es de plano ilegible y no se puede transcribir, responde exactamente: ILEGIBLE.";

    const mime = normalizeAudioMimeType(mimeType) || "audio/mpeg";
    const baseModels = [
      "gemini-3.6-flash",
      "gemini-3-flash",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-3.6-flash-preview",
      "gemini-3-flash-preview",
      "gemini-2.0-flash-lite-preview",
      "gemini-flash-lite-latest",
      "gemini-1.5-flash",
    ];

    let lastErr: any = null;
    for (const base of baseModels) {
      const modelsToTry = base.startsWith("models/") ? [base] : [base, `models/${base}`];
      try {
        let r: any = null;
        let ok = false;
        for (const model of modelsToTry) {
          try {
            r = await ai.models.generateContent({
              model,
              systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
              contents: [
                {
                  role: "user",
                  parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: toBase64(audioBuf) } }],
                },
              ],
            });
            ok = true;
            break;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            lastErr = msg;
            const lower = msg.toLowerCase();
            const is404 = lower.includes("404") || lower.includes("not found");
            if (is404) continue;
            throw e;
          }
        }
        if (!ok) {
          const msg = String(lastErr || "Modelo no disponible");
          return {
            ok: false as const,
            error: msg,
            userMessage:
              "No pude encontrar un modelo de transcripción disponible (404). " +
              "Esto puede pasar si el modelo cambió o tu API Key no tiene acceso. Intenta de nuevo en unos minutos.",
          };
        }

        const text = String(r?.text || "").trim();
        if (!text) {
          return {
            ok: false as const,
            error: "Gemini no devolvió texto",
            userMessage: "No pude transcribir la letra. Intenta con un audio más claro o más corto.",
          };
        }
        const upper = text.toUpperCase();
        if (upper === "SIN_LETRA") return { ok: true as const, lyrics: "", status: "SIN_LETRA" as const };
        if (upper === "ILEGIBLE") return { ok: true as const, lyrics: "", status: "ILEGIBLE" as const };
        return { ok: true as const, lyrics: text, status: "OK" as const };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastErr = msg;
        const lower = msg.toLowerCase();
        const is404 = lower.includes("404") || lower.includes("not found");
        if (is404) {
          continue;
        }
        const is401 = lower.includes("401") || lower.includes("unauthorized");
        const is403 = lower.includes("403") || lower.includes("permission") || lower.includes("forbidden");
        const is429 = lower.includes("429") || lower.includes("rate limit") || lower.includes("quota");
        const userMessage = is429
          ? "La transcripción está saturada en este momento. Intenta de nuevo en unos minutos."
          : is401 || is403
            ? "La transcripción no está disponible por permisos (API Key). Revisa tu GEMINI_API_KEY en Vercel."
            : "No pude transcribir la letra. Intenta con un audio más claro o más corto.";
        return { ok: false as const, error: msg, userMessage };
      }
    }

    return {
      ok: false as const,
      error: String(lastErr || "Modelo no disponible"),
      userMessage:
        "La transcripción no está disponible en este momento. " +
        "Si sigue igual, revisa que GEMINI_API_KEY esté bien configurada en Vercel y vuelve a intentar.",
    };
  }

  async function transcribeLyricsWithGeminiTranscribe(audioBuf, timeoutMs) {
    const apiKey = String(process.env.GEMINI_TRANSCRIBE_API_KEY || "").trim();
    if (!apiKey) {
      return {
        ok: false,
        error: "missing_transcribe_key",
        status: 0,
      };
    }

    const mod = await import("@google/genai");
    const GoogleGenAI = mod?.GoogleGenAI || mod?.default?.GoogleGenAI;
    if (!GoogleGenAI) return { ok: false, error: "No pude cargar Gemini (@google/genai)" };

    const ai = new GoogleGenAI({ apiKey });

    const withTimeout = async (p, ms) => {
      const m = Math.max(1, Number(ms) || 1);
      return await Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), m))]);
    };

    const extractInteractionText = (interaction) => {
      const direct = interaction?.output_text || interaction?.outputText || interaction?.text;
      if (typeof direct === "string" && direct.trim()) return direct;

      const outs = interaction?.outputs;
      if (Array.isArray(outs)) {
        const parts = outs
          .filter((o) => o && o.type === "text" && typeof o.text === "string")
          .map((o) => o.text);
        const joined = parts.join("");
        if (joined && joined.trim()) return joined;
      }

      return "";
    };

    const geminiMime = "audio/mpeg";
    const blob = new Blob([audioBuf], { type: "audio/mpeg" });

    const startedAt = Date.now();
    const audioFile = await withTimeout(ai.files.upload({ file: blob, config: { mimeType: geminiMime } }), timeoutMs);
    const remaining = Math.max(1, (Number(timeoutMs) || 1) - (Date.now() - startedAt));

    const fileUri = audioFile && typeof audioFile === "object" && typeof audioFile.uri === "string" ? audioFile.uri : "";
    if (!fileUri) return { ok: false, error: "No se pudo obtener URI del archivo (Gemini Files)." };

    const fileMime =
      audioFile && typeof audioFile === "object" && typeof audioFile.mimeType === "string"
        ? audioFile.mimeType
        : audioFile && typeof audioFile === "object" && typeof audioFile.mime_type === "string"
          ? audioFile.mime_type
          : geminiMime;

    let interaction = null;
    try {
      interaction = await withTimeout(
        ai.interactions.create(
          {
            model: "gemini-3.5-transcribe",
            input: [{ type: "audio", uri: fileUri, mime_type: fileMime }],
            generation_config: { transcription_config: { language_codes: ["es-MX"], mode: "verbatim" } },
          },
          { timeout: remaining }
        ),
        remaining + 200
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = e && typeof e === "object" && typeof e.status === "number" ? e.status : null;
      return { ok: false, error: msg, status: typeof status === "number" ? status : 0, interaction_keys: "" };
    }

    const interactionKeys =
      interaction && typeof interaction === "object" ? Object.keys(interaction).slice(0, 40).join(",") : "";
    const directText = interaction && typeof interaction === "object" && typeof interaction.output_text === "string" ? interaction.output_text : "";
    const text = (directText || extractInteractionText(interaction)).replace(/\r\n/g, "\n").trim();
    const outLen = text ? text.length : 0;
    if (!text) return { ok: false, error: "empty_transcription", status: 200, interaction_keys: interactionKeys, output_length: outLen };

    return { ok: true, lyrics: text, status: "OK", interaction_keys: interactionKeys, output_length: outLen };
  }

  async function generateLyricsWithGemini(topic: string, gender: string, style: string) {
    const apiKey = String(
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      process.env.GEMINI_KEY ||
      process.env.GOOGLE_AI_STUDIO_KEY ||
      process.env.AI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY ||
      ""
    ).trim();
    if (!apiKey) {
      return {
        ok: false as const,
        error: "Falta GEMINI_API_KEY en Vercel",
        userMessage: "La generación de letras no está configurada. Falta GEMINI_API_KEY en Vercel.",
      };
    }

    const mod: any = await import("@google/genai");
    const GoogleGenAI = mod?.GoogleGenAI || mod?.default?.GoogleGenAI;
    if (!GoogleGenAI) return { ok: false as const, error: "No pude cargar Gemini (@google/genai)" };
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction =
      "Eres un compositor profesional. " +
      "Genera letras totalmente originales (no copies canciones existentes). " +
      "Entrega solo la letra, sin explicación.";
    const userPrompt =
      "Genera una letra para una canción en español con estructura clara. " +
      "Regla obligatoria: Todas las etiquetas de estructura, indicaciones musicales, efectos, voces, instrumentos y direcciones de interpretación deben escribirse exclusivamente entre corchetes [ ]. Nunca deben escribirse entre paréntesis ( ). " +
      "Usa etiquetas como: [Intro], [Verso], [Coro], [Puente], [Outro]. " +
      "Tema: " +
      topic +
      "\nGénero vocal: " +
      gender +
      "\nEstilo musical: " +
      style +
      "\nEntrega solo la letra. No uses comillas ni markdown.";

    const baseModels = [
      "gemini-3.6-flash",
      "gemini-3-flash",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-3.6-flash-preview",
      "gemini-3-flash-preview",
      "gemini-2.0-flash-lite-preview",
      "gemini-flash-lite-latest",
      "gemini-1.5-flash",
    ];

    let lastErr: any = null;
    for (const base of baseModels) {
      const modelsToTry = base.startsWith("models/") ? [base] : [base, `models/${base}`];
      try {
        let r: any = null;
        let ok = false;
        for (const model of modelsToTry) {
          try {
            r = await ai.models.generateContent({
              model,
              systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            });
            ok = true;
            break;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            lastErr = msg;
            const lower = msg.toLowerCase();
            const is404 = lower.includes("404") || lower.includes("not found");
            if (is404) continue;
            throw e;
          }
        }
        if (!ok) {
          const msg = String(lastErr || "Modelo no disponible");
          return { ok: false as const, error: msg, userMessage: "La generación de letras no está disponible (modelo). Intenta de nuevo." };
        }

        const pickCandidateText = (obj: any) => {
          const parts = obj?.candidates?.[0]?.content?.parts;
          if (!Array.isArray(parts)) return "";
          return parts.map((p: any) => (p?.text ? String(p.text) : "")).join("");
        };
        const text = String(r?.text || pickCandidateText(r) || "").trim();
        if (!text) return { ok: false as const, error: "Gemini no devolvió texto", userMessage: "La IA no devolvió letra para ese tema. Intenta con otro tema o espera unos minutos." };

        const cleaned = text.replaceAll("```", "").trim();
        return { ok: true as const, lyrics: cleaned };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastErr = msg;
        const lower = msg.toLowerCase();
        const is404 = lower.includes("404") || lower.includes("not found");
        if (is404) continue;
        const is401 = lower.includes("401") || lower.includes("unauthorized");
        const is403 = lower.includes("403") || lower.includes("permission") || lower.includes("forbidden");
        const is429 = lower.includes("429") || lower.includes("rate limit") || lower.includes("quota");
        const userMessage = is429
          ? "La generación está saturada. Intenta de nuevo en unos minutos."
          : is401 || is403
            ? "La generación no está disponible por permisos (API Key). Revisa tu GEMINI_API_KEY en Vercel."
            : "No pude generar letras en este momento. Intenta de nuevo.";
        return { ok: false as const, error: msg, userMessage };
      }
    }

    return {
      ok: false as const,
      error: String(lastErr || "Modelo no disponible"),
      userMessage:
        "La generación de letras no está disponible en este momento. " +
        "Si sigue igual, revisa que GEMINI_API_KEY esté bien configurada en Vercel y vuelve a intentar.",
    };
  }

  async function generateLyricsWithSuno(topic: string, gender: string, style: string, req: any) {
    const apiKeyRaw = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
    const apiKey = String(apiKeyRaw || "").trim().replace(/^[`"' ]+/, "").replace(/[`"' ]+$/, "").trim();
    if (!apiKey) {
      return { ok: false as const, error: "Falta SUNO_API_KEY en Vercel", userMessage: "La generación de letras no está disponible (proveedor)." };
    }

    const cleanLine = (s: string) =>
      (s || "")
        .toString()
        .replaceAll("\r\n", " ")
        .replaceAll("\n", " ")
        .replaceAll("\t", " ")
        .replaceAll(/\s+/g, " ")
        .trim();

    const base = cleanLine(topic);
    const extra = cleanLine(`Estilo: ${style}. Voz: ${gender}. Etiquetas: solo [ ], nunca ( ).`);
    let prompt = base;
    if (extra && (base.length + 3 + extra.length) <= 200) prompt = `${base} | ${extra}`;
    prompt = cleanLine(prompt).slice(0, 200);
    if (!prompt) return { ok: false as const, error: "Prompt vacío", userMessage: "Escribe un tema para generar letras." };

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    try {
      const { res: r, data, text } = await sunoFetchJsonWithRetry("/api/v1/lyrics", {
        method: "POST",
        body: JSON.stringify({ prompt, callBackUrl }),
      });
      if (!r || !r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r?.status || 0}`);
        return { ok: false as const, error: String(msg), userMessage: "No pude generar letras con el proveedor." };
      }
      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        return { ok: false as const, error: String(msg), userMessage: "No pude generar letras con el proveedor." };
      }
      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) return { ok: false as const, error: "Respuesta inválida del proveedor", userMessage: "No pude generar letras con el proveedor." };

      const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const startedAt = Date.now();
      const maxWaitMs = 16000;

      while (Date.now() - startedAt < maxWaitMs) {
        const enc = encodeURIComponent(taskId);
        const paths = [`/api/v1/lyrics/record-info?taskId=${enc}`, `/api/v1/suno/lyrics/record-info?taskId=${enc}`];

        let info: any = null;
        for (const p of paths) {
          const rr = await sunoFetchJson(p, { method: "GET" });
          info = rr;
          if (rr?.res?.status !== 404) break;
        }

        const infoData = info?.data;
        const infoText = info?.text || "";
        if (!info?.res || !info.res.ok) {
          const msg = sunoErrorMessage(infoData, infoText || `HTTP ${info?.res?.status || 0}`);
          return { ok: false as const, error: String(msg), userMessage: "No pude obtener las letras del proveedor." };
        }
        const infoCode = Number(infoData?.code);
        if (infoCode && infoCode !== 200) {
          const msg = sunoErrorMessage(infoData, "Error del proveedor");
          return { ok: false as const, error: String(msg), userMessage: "No pude obtener las letras del proveedor." };
        }

        const payload = infoData?.data ?? {};
        const status = String(payload?.status || "").toUpperCase();
        if (status === "SUCCESS") {
          const rows = Array.isArray(payload?.response?.data) ? payload.response.data : [];
          const candidates = rows
            .map((x: any) => ({
              text: typeof x?.text === "string" ? x.text.trim() : "",
              status: typeof x?.status === "string" ? x.status.trim().toLowerCase() : "",
            }))
            .filter((x: any) => x.text && (x.status === "complete" || x.status === "completed" || !x.status));
          const best = candidates[0]?.text || "";
          if (!best) return { ok: false as const, error: "El proveedor no devolvió letra", userMessage: "La IA no devolvió letra. Intenta con un tema más específico." };
          return { ok: true as const, lyrics: best };
        }

        const failureStatuses = new Set([
          "CREATE_TASK_FAILED",
          "GENERATE_LYRICS_FAILED",
          "CALLBACK_EXCEPTION",
          "SENSITIVE_WORD_ERROR",
        ]);
        if (failureStatuses.has(status)) {
          const em = String(payload?.errorMessage || payload?.error_message || infoData?.msg || "").trim();
          return { ok: false as const, error: em || status, userMessage: "No pude generar letras con el proveedor." };
        }

        await sleep(1200);
      }

      return { ok: false as const, error: "Timeout esperando letras", userMessage: "El proveedor tardó demasiado. Voy a intentar con otra IA." };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg, userMessage: "No pude generar letras con el proveedor." };
    }
  }

  async function handleGenerateLyrics(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const topic = typeof payload?.topic === "string" ? payload.topic.trim() : "";
    const gender = typeof payload?.gender === "string" ? payload.gender.trim() : "Masculino";
    const style = typeof payload?.style === "string" ? payload.style.trim() : "General";

    if (!topic) {
      return send(res, 400, { error: "El tema es requerido para generar letras" });
    }

    try {
      const cost = CREDIT_COSTS.lyrics;
      const { data: profile, error: profErr } = await auth.admin.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
      if (profErr) return send(res, 500, { error: "No pude leer tu saldo", detail: profErr.message });
      const credits = creditsFromProfile(profile);

      if (!isAdminEmail(auth.user.email)) {
        if (credits < cost) {
          return send(res, 402, {
            error: "Créditos insuficientes",
            message: `Necesitas ${cost} créditos para generar letras. Tienes ${credits} créditos.`,
          });
        }
      }

      let out: any = null;
      try {
        out = await generateLyricsWithSuno(topic, gender, style, req);
      } catch {
        out = null;
      }
      if (!out || !out.ok) {
        out = await generateLyricsWithGemini(topic, gender, style);
      }
      
      if (!out.ok) {
        return send(res, 200, { 
          ok: false, 
          error: out.error || "No pude generar letras", 
          message: out.userMessage || "No pude generar letras para ese tema." 
        });
      }

      const lyrics = typeof (out as any)?.lyrics === "string" ? String((out as any).lyrics).trim() : "";
      if (!lyrics) {
        return send(res, 200, {
          ok: false,
          error: "La IA no devolvió letra",
          message: "La IA no devolvió letra para ese tema. Intenta con un tema más específico o espera unos minutos y vuelve a intentar.",
        });
      }

      let remaining = credits;
      if (!isAdminEmail(auth.user.email)) {
        const consumed = await consumeUserCredits(auth.admin, auth.user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes", ok: false });
        remaining = Number(consumed.credits ?? remaining);
      }

      return send(res, 200, { 
        ok: true, 
        lyrics,
        cost,
        remaining
      });
    } catch (e) {
      return send(res, 200, {
        ok: false,
        error: "Error generando letras",
        message: "No pude generar letras. Intenta con un tema diferente o más tarde.",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function handleTranscribeLyrics(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    if (method !== "POST") {
      const s = 405;
      const ms = 0;
      try {
        console.log(`transcribe-lyrics completed status=${s} ms=${ms} result=error`);
      } catch {}
      return send(res, s, {
        ok: false,
        message: "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
        error: "Método no permitido",
      });
    }

    const pad = (n) => String(n).padStart(2, "0");
    const d = new Date();
    const eid = `TR-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}-${Math.random().toString(16).slice(2, 8).padEnd(6, "0")}`;
    const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const short = (s, n) => oneLine(s).slice(0, Math.max(0, Number(n) || 0));
    const safeNum = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const sendErr = (s: number, userMsg: string) => {
      return send(res, s, { ok: false, message: userMsg, error_id: eid });
    };

    let finalStatus = 500;
    let finalResult: "success" | "error" | "timeout" = "error";
    const startedAt = Date.now();

    const flushCompleted = () => {
      const ms = Math.max(0, Date.now() - startedAt);
      try {
        console.log(`transcribe-lyrics completed status=${finalStatus} ms=${ms} result=${finalResult}`);
      } catch {}
    };

    const safeFinalize = (s: number, result: "success" | "error" | "timeout", respBody: any) => {
      finalStatus = safeNum(s) || s;
      finalResult = result;
      flushCompleted();
      return send(res, finalStatus, respBody);
    };

    try {
      const auth = await requireUser(req);
      if (!auth.ok) {
        const s = safeNum(auth.status) || 401;
        return safeFinalize(s, "error", {
          ok: false,
          message: "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
          error_id: eid,
        });
      }

      const payload = parseJsonBody(req);
      if (!payload) {
        return safeFinalize(400, "error", {
          ok: false,
          message: "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
          error_id: eid,
        });
      }

      const uploadUrl = typeof payload?.uploadUrl === "string" ? payload.uploadUrl.trim() : "";
      const mimeTypeHint = typeof payload?.mimeType === "string" ? payload.mimeType.trim() : "";
      const url = safeUrl(uploadUrl);
      if (!url) {
        return safeFinalize(400, "error", {
          ok: false,
          message: "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
          error_id: eid,
        });
      }

      const timeoutMs = 60000;
      const overallCtrl = new AbortController();
      const overallTimer = setTimeout(() => overallCtrl.abort(), timeoutMs);
      const clearOverall = () => {
        try {
          clearTimeout(overallTimer);
        } catch {}
      };

      try {
        let fr: any = null;
        try {
          fr = await fetch(url, { signal: overallCtrl.signal });
        } catch (e) {
          const isTimeout = e instanceof Error && (e.name === "AbortError" || /abort|timeout/i.test(e.message || ""));
          const s = isTimeout ? 504 : 502;
          const r = isTimeout ? "timeout" : "error";
          try {
            console.log(
              `[${eid}] transcribe-lyrics status=${s} model=none fallback=0 primary_status=0 primary_error_code=${isTimeout ? "fetch_audio_timeout" : "fetch_audio_exception"} primary_error_message=${short(e instanceof Error ? e.message : String(e), 140)} primary_output_length=0 fallback_attempted=0 fallback_status=0 fallback_output_length=0`
            );
          } catch {}
          return safeFinalize(s, r, {
            ok: false,
            message: isTimeout
              ? "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente."
              : "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
            error_id: eid,
          });
        } finally {
          clearOverall();
        }

        if (!fr || !fr.ok) {
          const s = fr && typeof fr.status === "number" && fr.status >= 400 ? fr.status : 502;
          try {
            console.log(
              `[${eid}] transcribe-lyrics status=${s} model=none fallback=0 primary_status=0 primary_error_code=fetch_audio_${s} primary_error_message= primary_output_length=0 fallback_attempted=0 fallback_status=0 fallback_output_length=0`
            );
          } catch {}
          return safeFinalize(s, "error", {
            ok: false,
            message: "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
            error_id: eid,
          });
        }

        const contentType = (fr.headers.get("content-type") || "").toString();
        const mimeType = normalizeAudioMimeType(mimeTypeHint) || normalizeAudioMimeType(contentType) || "audio/mpeg";
        let ab: any = null;
        try {
          ab = await fr.arrayBuffer();
        } catch (e) {
          try {
            console.log(
              `[${eid}] transcribe-lyrics status=502 model=none fallback=0 primary_status=0 primary_error_code=arraybuffer_exception primary_error_message=${short(e instanceof Error ? e.message : String(e), 140)} primary_output_length=0 fallback_attempted=0 fallback_status=0 fallback_output_length=0`
            );
          } catch {}
          return safeFinalize(502, "error", {
            ok: false,
            message: "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
            error_id: eid,
          });
        }

        const size = (ab && typeof ab.byteLength === "number" ? ab.byteLength : 0) || 0;
        if (size <= 0) {
          try {
            console.log(
              `[${eid}] transcribe-lyrics status=400 model=none fallback=0 primary_status=0 primary_error_code=empty_audio primary_error_message= primary_output_length=0 fallback_attempted=0 fallback_status=0 fallback_output_length=0`
            );
          } catch {}
          return safeFinalize(400, "error", {
            ok: false,
            message: "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
            error_id: eid,
          });
        }
        if (size > 15 * 1024 * 1024) {
          try {
            console.log(
              `[${eid}] transcribe-lyrics status=413 model=none fallback=0 primary_status=0 primary_error_code=audio_too_large primary_error_message= primary_output_length=0 fallback_attempted=0 fallback_status=0 fallback_output_length=0`
            );
          } catch {}
          return safeFinalize(413, "error", {
            ok: false,
            message: "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
            error_id: eid,
          });
        }

        const remainingAfterDownload = Math.max(1000, timeoutMs - (Date.now() - startedAt));
        const reserveForFallback = 15000;
        const primaryBudget = Math.max(1000, remainingAfterDownload - reserveForFallback);
        let primaryStatus = 0;
        let primaryErrorCode = "";
        let primaryErrorMessage = "";
        let primaryOutputLength = 0;
        let primaryKeys = "";

        let fallbackAttempted = false;
        let fallbackStatus = 0;
        let fallbackOutputLength = 0;
        let fallbackErrorName = "";
        let fallbackErrorMessage = "";

        let modelUsed = "gemini-3.5-transcribe";
        try {
          const out = await transcribeLyricsWithGeminiTranscribe(ab, primaryBudget);
          primaryStatus = safeNum(out && out.status);
          primaryKeys = out && typeof out.interaction_keys === "string" ? out.interaction_keys : "";
          primaryOutputLength = safeNum(out && out.output_length);
          const lyrics = out && out.ok ? String(out.lyrics || "") : "";
          if (out && out.ok && lyrics.trim()) {
            const ms = Date.now() - startedAt;
            try {
              console.log(
                `[${eid}] transcribe-lyrics status=200 model=${modelUsed} fallback=0 primary_status=${primaryStatus} primary_error_code= primary_error_message= primary_output_length=${primaryOutputLength} fallback_attempted=0 fallback_status=0 fallback_output_length=0 ms=${ms}`
              );
              if (primaryKeys) console.log(`[${eid}] transcribe-lyrics primary_keys=${short(primaryKeys, 240)}`);
            } catch {}
            return safeFinalize(200, "success", { ok: true, lyrics });
          }
          const errStr = out && typeof out.error === "string" ? out.error : "";
          primaryErrorMessage = errStr;
          primaryErrorCode = primaryStatus ? String(primaryStatus) : errStr || "transcribe_failed";
        } catch (e) {
          primaryErrorCode = "exception";
          primaryErrorMessage = e instanceof Error ? e.message : String(e);
        }

        fallbackAttempted = true;
        modelUsed = "gemini-3.6-flash";
        const remainingForFallback = Math.max(1000, timeoutMs - (Date.now() - startedAt));
        const fallbackBudget = remainingForFallback;
        const withTimeout = async (p: any, ms: number) => {
          const m = Math.max(1, Number(ms) || 1);
          return await Promise.race([
            p,
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), m)),
          ]);
        };

        let fallbackOut: any = null;
        try {
          fallbackOut = await withTimeout(transcribeLyricsWithGemini(ab, mimeType), fallbackBudget);
        } catch (e) {
          fallbackErrorName = e instanceof Error && e.name ? e.name : "Error";
          fallbackErrorMessage = e instanceof Error ? e.message : String(e);
          const st = e && typeof e === "object" && typeof (e as any).status === "number" ? (e as any).status : 0;
          fallbackStatus = safeNum(st);
          fallbackOut = { ok: false, error: fallbackErrorMessage, status: fallbackStatus };
        }

        if (fallbackOut && fallbackOut.ok) {
          const fallbackLyrics = String(fallbackOut.lyrics || "");
          fallbackOutputLength = fallbackLyrics.trim().length;
          if (fallbackLyrics.trim()) {
            fallbackStatus = 200;
            const ms = Date.now() - startedAt;
            try {
              console.log(
                `[${eid}] transcribe-lyrics status=200 model=${modelUsed} fallback=1 primary_status=${primaryStatus} primary_error_code=${short(primaryErrorCode, 40)} primary_error_message=${short(primaryErrorMessage, 140)} primary_output_length=${primaryOutputLength} fallback_attempted=1 fallback_status=${fallbackStatus} fallback_output_length=${fallbackOutputLength} fallback_error_name= fallback_error_message= ms=${ms}`
              );
              if (primaryKeys) console.log(`[${eid}] transcribe-lyrics primary_keys=${short(primaryKeys, 240)}`);
            } catch {}
            return safeFinalize(200, "success", { ok: true, lyrics: fallbackLyrics });
          }
        }

        if (!fallbackStatus) fallbackStatus = safeNum(fallbackOut && fallbackOut.status);
        if (!fallbackErrorMessage) fallbackErrorMessage = fallbackOut && typeof fallbackOut.error === "string" ? fallbackOut.error : "";
        if (!fallbackErrorName) fallbackErrorName = fallbackErrorMessage ? "FallbackError" : "";
        const ms = Date.now() - startedAt;
        const isFallbackTimeout = /timeout/i.test(fallbackErrorMessage || "") && !fallbackStatus;
        const finalS = 502;
        try {
          console.log(
            `[${eid}] transcribe-lyrics status=${finalS} model=${modelUsed} fallback=1 primary_status=${primaryStatus} primary_error_code=${short(primaryErrorCode, 40)} primary_error_message=${short(primaryErrorMessage, 140)} primary_output_length=${primaryOutputLength} fallback_attempted=1 fallback_status=${fallbackStatus} fallback_output_length=${fallbackOutputLength} fallback_error_name=${short(fallbackErrorName, 60)} fallback_error_message=${short(fallbackErrorMessage, 140)} ms=${ms}`
          );
          if (primaryKeys) console.log(`[${eid}] transcribe-lyrics primary_keys=${short(primaryKeys, 240)}`);
        } catch {}
        return safeFinalize(finalS, isFallbackTimeout ? "timeout" : "error", {
          ok: false,
          message: "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
          error_id: eid,
        });
      } catch (e) {
        const isAbort = e instanceof Error && e.name === "AbortError";
        const isTimeout = isAbort || /abort|timeout/i.test(e instanceof Error ? e.message : String(e));
        const s = isTimeout ? 504 : 500;
        const r = isTimeout ? "timeout" : "error";
        try {
          console.log(
            `[${eid}] transcribe-lyrics status=${s} model=none fallback=0 primary_status=0 primary_error_code=exception primary_error_message=${short(e instanceof Error ? e.message : String(e), 140)} primary_output_length=0 fallback_attempted=0 fallback_status=0 fallback_output_length=0`
          );
        } catch {}
        return safeFinalize(s, r, {
          ok: false,
          message: "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
          error_id: eid,
        });
      }
    } catch (e) {
      const s = 500;
      try {
        console.log(
          `[${eid}] transcribe-lyrics status=${s} model=none fallback=0 primary_status=0 primary_error_code=top_exception primary_error_message=${short(e instanceof Error ? e.message : String(e), 140)} primary_output_length=0 fallback_attempted=0 fallback_status=0 fallback_output_length=0`
        );
      } catch {}
      return safeFinalize(s, "error", {
        ok: false,
        message: "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.",
        error_id: eid,
      });
    }
  }

  try {
    const gt = globalThis as any;
    if (typeof gt.__LUCIANA_SHARED_FNS !== "object" || gt.__LUCIANA_SHARED_FNS === null) gt.__LUCIANA_SHARED_FNS = {};
    gt.__LUCIANA_SHARED_FNS.transcribeLyricsWithGemini = transcribeLyricsWithGemini;
    gt.__LUCIANA_SHARED_FNS.generateLyricsWithGemini = generateLyricsWithGemini;
    gt.__LUCIANA_SHARED_FNS.syncLyricsWithGemini = syncLyricsWithGemini;
  } catch {}

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "ai") return send(res, 404, { error: "Ruta no encontrada" });

    let action = "";
    try {
      action = (new URL(req.url, "http://localhost").searchParams.get("action") || "").toString();
    } catch {
      action = "";
    }
    action = action.trim().toLowerCase();
    const a = action || (next || "").toLowerCase();
    if (a === "transcribe-lyrics") return handleTranscribeLyrics(req, res);
    if (a === "generate-lyrics") return handleGenerateLyrics(req, res);
    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

const lucianaBotHandler = (() => {
  type LucianaQuickReply = {
    id: string;
    label: string;
    value: string;
    icon?: string;
    variant?: "primary" | "secondary" | "ghost";
  };

  type LucianaSongCard = {
    id: string;
    title: string;
    audioUrl?: string;
    coverUrl?: string;
    createdAt?: string;
    acceptedAt?: string | null;
    sunoTaskId?: string;
    sunoAudioId?: string;
  };

  type LucianaMessage = {
    id: string;
    role: "assistant" | "user";
    text?: string;
    quickReplies?: LucianaQuickReply[];
    inputMode?: "text" | "multiline" | "audio" | "audio_mp3" | "disabled";
    inputPlaceholder?: string;
    songs?: LucianaSongCard[];
    credits?: {
      credits: number;
      songBalance?: number;
      downloadsAllowed?: boolean;
      planKey?: string;
      planActive?: boolean;
      planExpiresAt?: string | null;
    };
    links?: Array<{ label: string; url: string }>;
    statusKey?: string;
  };

  type LucianaSession = {
    version: 1;
    flow: "home" | "generate" | "cover" | "separate" | "mastering";
    step: string;
    messages: LucianaMessage[];
    composer: {
      mode: "text" | "multiline" | "audio" | "audio_mp3" | "disabled";
      placeholder: string;
      sendLabel: string;
    };
    draft: {
      sourceMode?: "audio" | "lyrics" | "nothing";
      wantsAiLyrics?: boolean;
      referenceAudio?: { url: string; key?: string; fileName?: string; contentType?: string; size?: number };
      coverAudio?: { url: string; key?: string; fileName?: string; contentType?: string; size?: number };
      masteringAudio?: { url: string; key?: string; fileName?: string; contentType?: string; size?: number };
      originalLyrics?: string;
      lyrics?: string;
      correctedLyrics?: string;
      topic?: string;
      promptIdea?: string;
      genre?: string;
      extraInstructions?: string;
      pendingTaskId?: string;
      pendingKind?: string;
      pendingSongIds?: string[];
      selectedSongId?: string;
      selectedSongTitle?: string;
      selectedSongTaskId?: string;
      selectedSongAudioId?: string;
      selectedAction?: "separate" | "video";
      acceptedSongId?: string;
    };
  };

  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }
    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };
    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };
    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  function originFromReq(req: any) {
    const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
    return `${proto}://${host}`;
  }

  function absoluteUrlFromReq(req: any, pathname: string) {
    return new URL(pathname, originFromReq(req)).toString();
  }

  function makeMessageId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function defaultComposer(): LucianaSession["composer"] {
    return { mode: "text", placeholder: "Escribe aquí…", sendLabel: "Enviar" };
  }

  function createEmptySession(): LucianaSession {
    return {
      version: 1,
      flow: "home",
      step: "home",
      messages: [],
      composer: defaultComposer(),
      draft: {},
    };
  }

  function normalizeSession(input: any): LucianaSession {
    const base = createEmptySession();
    if (!input || typeof input !== "object") return base;
    const messages = Array.isArray(input?.messages) ? input.messages : [];
    const safeMessages = messages
      .map((m: any) => ({
        id: typeof m?.id === "string" ? m.id : makeMessageId("msg"),
        role: m?.role === "user" ? "user" : "assistant",
        text: typeof m?.text === "string" ? m.text.slice(0, 12000) : "",
        quickReplies: Array.isArray(m?.quickReplies)
          ? m.quickReplies
              .map((q: any) => ({
                id: typeof q?.id === "string" ? q.id.slice(0, 80) : makeMessageId("qr"),
                label: typeof q?.label === "string" ? q.label.slice(0, 80) : "",
                value: typeof q?.value === "string" ? q.value.slice(0, 120) : "",
                icon: typeof q?.icon === "string" ? q.icon.slice(0, 40) : "",
                variant: q?.variant === "ghost" || q?.variant === "secondary" ? q.variant : "primary",
              }))
              .filter((q: any) => q.label && q.value)
          : undefined,
        inputMode:
          m?.inputMode === "audio" || m?.inputMode === "audio_mp3" || m?.inputMode === "multiline" || m?.inputMode === "disabled"
            ? m.inputMode
            : "text",
        inputPlaceholder: typeof m?.inputPlaceholder === "string" ? m.inputPlaceholder.slice(0, 200) : "",
        songs: Array.isArray(m?.songs)
          ? m.songs
              .map((s: any) => ({
                id: typeof s?.id === "string" ? s.id.slice(0, 200) : "",
                title: typeof s?.title === "string" ? s.title.slice(0, 160) : "Canción",
                audioUrl: typeof s?.audioUrl === "string" ? s.audioUrl.slice(0, 2000) : "",
                coverUrl: typeof s?.coverUrl === "string" ? s.coverUrl.slice(0, 2000) : "",
                createdAt: typeof s?.createdAt === "string" ? s.createdAt : "",
                acceptedAt: typeof s?.acceptedAt === "string" ? s.acceptedAt : null,
                sunoTaskId: typeof s?.sunoTaskId === "string" ? s.sunoTaskId.slice(0, 200) : "",
                sunoAudioId: typeof s?.sunoAudioId === "string" ? s.sunoAudioId.slice(0, 200) : "",
              }))
              .filter((s: any) => s.id)
          : undefined,
        credits: m?.credits && typeof m.credits === "object" ? m.credits : undefined,
        links: Array.isArray(m?.links)
          ? m.links
              .map((x: any) => ({
                label: typeof x?.label === "string" ? x.label.slice(0, 80) : "Abrir",
                url: typeof x?.url === "string" ? x.url.slice(0, 2000) : "",
              }))
              .filter((x: any) => /^https?:\/\//i.test(x.url))
          : undefined,
        statusKey: typeof m?.statusKey === "string" ? m.statusKey.slice(0, 120) : "",
      }))
      .slice(-40);

    const composerInput = input?.composer || {};
    const composer: LucianaSession["composer"] = {
      mode:
        composerInput?.mode === "audio" ||
        composerInput?.mode === "audio_mp3" ||
        composerInput?.mode === "multiline" ||
        composerInput?.mode === "disabled"
          ? composerInput.mode
          : "text",
      placeholder: typeof composerInput?.placeholder === "string" ? composerInput.placeholder.slice(0, 200) : "Escribe aquí…",
      sendLabel: typeof composerInput?.sendLabel === "string" ? composerInput.sendLabel.slice(0, 40) : "Enviar",
    };

    return {
      version: 1,
      flow:
        input?.flow === "generate" || input?.flow === "cover" || input?.flow === "separate" || input?.flow === "mastering"
          ? input.flow
          : "home",
      step: typeof input?.step === "string" ? input.step.slice(0, 80) : "home",
      messages: safeMessages,
      composer,
      draft: typeof input?.draft === "object" && input?.draft ? { ...input.draft } : {},
    };
  }

  function setComposer(
    session: LucianaSession,
    mode: LucianaSession["composer"]["mode"],
    placeholder: string,
    sendLabel = "Enviar",
  ) {
    session.composer = { mode, placeholder, sendLabel };
  }

  function pushAssistant(
    session: LucianaSession,
    text: string,
    extra?: Partial<Omit<LucianaMessage, "id" | "role" | "text">>,
  ) {
    session.messages.push({
      id: makeMessageId("assistant"),
      role: "assistant",
      text: (text || "").slice(0, 12000),
      ...(extra || {}),
    });
    session.messages = session.messages.slice(-40);
  }

  function pushUser(session: LucianaSession, text: string) {
    session.messages.push({
      id: makeMessageId("user"),
      role: "user",
      text: (text || "").slice(0, 4000),
    });
    session.messages = session.messages.slice(-40);
  }

  function upsertStatusMessage(session: LucianaSession, statusKey: string, text: string) {
    const idx = [...session.messages].reverse().findIndex((m) => m.role === "assistant" && m.statusKey === statusKey);
    if (idx >= 0) {
      const realIdx = session.messages.length - 1 - idx;
      session.messages[realIdx] = { ...session.messages[realIdx], text: text.slice(0, 12000) };
      return;
    }
    pushAssistant(session, text, { statusKey });
  }

  function mainMenuReplies(): LucianaQuickReply[] {
    return [
      { id: "menu-generate", label: "Generar canción", value: "menu:generate", icon: "sparkles", variant: "primary" },
      { id: "menu-cover", label: "Hacer cover", value: "menu:cover", icon: "music", variant: "secondary" },
      { id: "menu-mastering", label: "Masterizar", value: "menu:mastering", icon: "upload", variant: "secondary" },
      { id: "menu-credits", label: "Ver créditos", value: "menu:credits", icon: "coins", variant: "ghost" },
      { id: "menu-recent", label: "Canciones recientes", value: "menu:recent", icon: "library", variant: "ghost" },
    ];
  }

  function genreReplies(): LucianaQuickReply[] {
    return [
      { id: "genre-banda", label: "Banda", value: "genre:Banda", icon: "music", variant: "primary" },
      { id: "genre-reggaeton", label: "Reggaetón", value: "genre:Reggaetón", icon: "music", variant: "secondary" },
      { id: "genre-corridos", label: "Corridos", value: "genre:Corridos", icon: "music", variant: "secondary" },
      { id: "genre-balada", label: "Balada", value: "genre:Balada", icon: "music", variant: "secondary" },
      { id: "genre-pop", label: "Pop", value: "genre:Pop", icon: "music", variant: "secondary" },
      { id: "genre-mariachi", label: "Mariachi", value: "genre:Mariachi", icon: "music", variant: "secondary" },
      { id: "genre-other", label: "Otro género", value: "genre:other", icon: "edit", variant: "ghost" },
    ];
  }

  function normalizeText(v: any, max = 4000) {
    return String(v || "").replaceAll("\r\n", "\n").replaceAll(/\t/g, " ").trim().slice(0, max);
  }

  function safeSongTitleFromDraft(draft: LucianaSession["draft"]) {
    const topic = normalizeText(draft.topic || draft.promptIdea || "", 120);
    if (topic) return topic.slice(0, 90);
    const lyrics = normalizeText(draft.lyrics || draft.originalLyrics || "", 300);
    const line = lyrics
      .split("\n")
      .map((x) => x.trim())
      .find((x) => x && !x.startsWith("["));
    return (line || "Canción LucIAna").slice(0, 90);
  }

  async function internalJson(req: any, path: string, init?: { method?: string; body?: any }) {
    const url = absoluteUrlFromReq(req, path);
    const headers: Record<string, string> = {};
    const authHeader = (req.headers.authorization || "").toString().trim();
    if (authHeader) headers.authorization = authHeader;
    if (init?.body != null) headers["content-type"] = "application/json";
    const r = await fetch(url, {
      method: init?.method || (init?.body != null ? "POST" : "GET"),
      headers,
      body: init?.body != null ? JSON.stringify(init.body) : undefined,
    });
    const out = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, out };
  }

  function getAnthropicConfig() {
    const apiKey = (process.env.ANTHROPIC_API_KEY || "").toString().trim();
    const model = (process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5").toString().trim();
    return { apiKey, model };
  }

  async function callAnthropicTools(params: {
    system: string;
    userText: string;
    tools: Array<{ name: string; description: string; input_schema: any }>;
  }) {
    const { apiKey, model } = getAnthropicConfig();
    if (!apiKey) return { ok: false as const, error: "Falta ANTHROPIC_API_KEY en Vercel" };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        tool_choice: { type: "any" },
        system: params.system,
        messages: [{ role: "user", content: params.userText }],
        tools: params.tools,
      }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false as const, error: String(out?.error?.message || out?.error || `HTTP ${r.status}`) };
    }
    const content = Array.isArray(out?.content) ? out.content : [];
    const toolUse = content.find((x: any) => x?.type === "tool_use");
    if (!toolUse) {
      const text = content.filter((x: any) => x?.type === "text").map((x: any) => String(x?.text || "")).join("\n").trim();
      return { ok: true as const, text, toolName: "", input: {} };
    }
    return {
      ok: true as const,
      text: "",
      toolName: String(toolUse?.name || ""),
      input: toolUse?.input ?? {},
    };
  }

  async function routeHomeIntent(text: string) {
    const trimmed = normalizeText(text, 800);
    const lower = trimmed.toLowerCase();
    const separateOnlyAfterSongMessage =
      "Quitar voz solo aparece al final de una canción creada dentro de la app. Si subes una canción externa, esa opción no aplica aquí.";
    const byKeyword = (() => {
      if (lower.includes("crédito") || lower.includes("saldo")) return { toolName: "show_account", input: { view: "credits" } };
      if (lower.includes("reciente") || lower.includes("biblioteca") || lower.includes("cancione")) return { toolName: "show_account", input: { view: "recent_songs" } };
      if (lower.includes("masteriz")) return { toolName: "open_flow", input: { flow: "mastering" } };
      if (lower.includes("cover")) return { toolName: "open_flow", input: { flow: "cover" } };
      if (lower.includes("separa") || lower.includes("karaoke") || lower.includes("stems") || lower.includes("voz")) {
        return { toolName: "answer_user", input: { message: separateOnlyAfterSongMessage } };
      }
      if (lower.includes("genera") || lower.includes("hazme") || lower.includes("canción") || lower.includes("cancion")) return { toolName: "open_flow", input: { flow: "generate" } };
      return null;
    })();

    const ai = await callAnthropicTools({
      system:
        "Eres LucIAna Bot. Tu trabajo aquí es SOLO detectar la intención principal del usuario dentro de una app de música. " +
        "Debes usar una herramienta. Si el usuario quiere crear/generar canción usa open_flow(generate). " +
        "Si quiere masterizar una canción, masterizar un mp3 o dice frases como masteriza esto, usa open_flow(mastering). " +
        "Si quiere cover usa open_flow(cover). Si pregunta por quitar voz, karaoke o stems usa answer_user y explica que eso solo aparece al final de una canción creada dentro de la app. " +
        "Si quiere ver créditos usa show_account(credits). Si quiere ver canciones recientes usa show_account(recent_songs). " +
        "Si solo está saludando o no está claro, usa answer_user con un mensaje corto y amable.",
      userText: trimmed || "hola",
      tools: [
        {
          name: "open_flow",
          description: "Abre uno de los flujos principales del chat.",
          input_schema: {
            type: "object",
            properties: { flow: { type: "string", enum: ["generate", "cover", "mastering"] } },
            required: ["flow"],
          },
        },
        {
          name: "show_account",
          description: "Muestra información rápida de la cuenta.",
          input_schema: {
            type: "object",
            properties: { view: { type: "string", enum: ["credits", "recent_songs"] } },
            required: ["view"],
          },
        },
        {
          name: "answer_user",
          description: "Responde si el mensaje es saludo o algo general.",
          input_schema: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
          },
        },
      ],
    });

    if (!ai.ok) return byKeyword || { toolName: "answer_user", input: { message: "Te ayudo con eso. Puedes elegir una opción de abajo." } };
    if (ai.toolName) return { toolName: ai.toolName, input: ai.input || {} };
    return byKeyword || { toolName: "answer_user", input: { message: ai.text || "Te ayudo con eso. Puedes elegir una opción de abajo." } };
  }

  async function reviewLyricsWithAnthropic(lyrics: string) {
    const text = normalizeText(lyrics, 12000);
    const ai = await callAnthropicTools({
      system:
        "Eres corrector ortográfico en español de México. Revisa solo escritura, acentos, signos y errores evidentes. " +
        "No cambies el estilo ni la intención artística. Usa la herramienta con el resultado.",
      userText: text,
      tools: [
        {
          name: "lyrics_review",
          description: "Resultado de revisión ortográfica de una letra.",
          input_schema: {
            type: "object",
            properties: {
              hasIssues: { type: "boolean" },
              correctedLyrics: { type: "string" },
              summary: { type: "string" },
            },
            required: ["hasIssues", "correctedLyrics", "summary"],
          },
        },
      ],
    });
    if (!ai.ok || ai.toolName !== "lyrics_review") {
      return { hasIssues: false, correctedLyrics: text, summary: "No detecté cambios necesarios." };
    }
    return {
      hasIssues: Boolean(ai.input?.hasIssues),
      correctedLyrics: normalizeText(ai.input?.correctedLyrics || text, 12000) || text,
      summary: normalizeText(ai.input?.summary || "Detecté algunos ajustes.", 500),
    };
  }

  async function generateLyricsWithAnthropic(topic: string, genre: string, extra: string) {
    const prompt =
      `Tema: ${normalizeText(topic, 400)}\n` +
      `Género: ${normalizeText(genre, 120) || "General"}\n` +
      `Indicaciones: ${normalizeText(extra, 500) || "Hazla original, pegajosa y en español."}\n` +
      "Genera una letra original en español con etiquetas [Intro], [Verso], [Coro], [Puente], [Outro].";
    const ai = await callAnthropicTools({
      system:
        "Eres compositor profesional. Crea letras originales para canciones en español. " +
        "No expliques nada. Usa la herramienta con la letra final y una sugerencia corta de título.",
      userText: prompt,
      tools: [
        {
          name: "lyrics_result",
          description: "Letra final para la canción.",
          input_schema: {
            type: "object",
            properties: {
              lyrics: { type: "string" },
              titleSuggestion: { type: "string" },
            },
            required: ["lyrics", "titleSuggestion"],
          },
        },
      ],
    });
    if (!ai.ok || ai.toolName !== "lyrics_result") {
      return { ok: false as const, error: ai.ok ? "Claude no devolvió letra" : ai.error };
    }
    return {
      ok: true as const,
      lyrics: normalizeText(ai.input?.lyrics || "", 12000),
      titleSuggestion: normalizeText(ai.input?.titleSuggestion || "Canción LucIAna", 120),
    };
  }

  async function getRecentSongs(admin: any, userId: string, limit = 5) {
    let { data, error } = await admin
      .from("library_items")
      .select("id,title,audio_url,cover_url,created_at,suno_task_id,suno_audio_id,accepted_at,delivered_at")
      .eq("user_id", userId)
      .eq("type", "song")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const missingAccepted = msg.includes("accepted_at") || msg.includes("delivered_at");
      if (missingAccepted) {
        const fallback = await admin
          .from("library_items")
          .select("id,title,audio_url,cover_url,created_at,suno_task_id,suno_audio_id")
          .eq("user_id", userId)
          .eq("type", "song")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(limit);
        data = fallback.data as any;
        error = fallback.error as any;
      }
    }
    if (error) return [];
    return (Array.isArray(data) ? data : []).map((row: any) => ({
      id: String(row?.id || ""),
      title: String(row?.title || "Canción").trim(),
      audioUrl: String(row?.audio_url || "").trim(),
      coverUrl: String(row?.cover_url || "").trim(),
      createdAt: String(row?.created_at || "").trim(),
      acceptedAt: row?.accepted_at || row?.delivered_at || null,
      sunoTaskId: String(row?.suno_task_id || "").trim(),
      sunoAudioId: String(row?.suno_audio_id || "").trim(),
    }));
  }

  async function getSongsByTask(admin: any, userId: string, taskId: string) {
    let { data, error } = await admin
      .from("library_items")
      .select("id,title,audio_url,cover_url,created_at,accepted_at,delivered_at")
      .eq("user_id", userId)
      .eq("type", "song")
      .eq("suno_task_id", taskId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(6);
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const missingAccepted = msg.includes("accepted_at") || msg.includes("delivered_at");
      if (missingAccepted) {
        const fallback = await admin
          .from("library_items")
          .select("id,title,audio_url,cover_url,created_at")
          .eq("user_id", userId)
          .eq("type", "song")
          .eq("suno_task_id", taskId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(6);
        data = fallback.data as any;
        error = fallback.error as any;
      }
    }
    if (error) return [];
    return (Array.isArray(data) ? data : []).map((row: any) => ({
      id: String(row?.id || ""),
      title: String(row?.title || "Canción").trim(),
      audioUrl: String(row?.audio_url || "").trim(),
      coverUrl: String(row?.cover_url || "").trim(),
      createdAt: String(row?.created_at || "").trim(),
      acceptedAt: row?.accepted_at || row?.delivered_at || null,
      sunoTaskId: taskId,
      sunoAudioId: String(row?.suno_audio_id || "").trim(),
    }));
  }

  async function getSongsByIds(admin: any, userId: string, ids: string[]) {
    const cleanIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((x) => normalizeText(x || "", 200)).filter(Boolean))).slice(0, 12);
    if (!cleanIds.length) return [];
    const { data, error } = await admin
      .from("library_items")
      .select("id,title,audio_url,cover_url,created_at,suno_task_id,suno_audio_id")
      .eq("user_id", userId)
      .eq("type", "song")
      .in("id", cleanIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) return [];
    const order = new Map(cleanIds.map((id, idx) => [id, idx]));
    return (Array.isArray(data) ? data : [])
      .map((row: any) => ({
        id: String(row?.id || ""),
        title: String(row?.title || "Canción").trim(),
        audioUrl: String(row?.audio_url || "").trim(),
        coverUrl: String(row?.cover_url || "").trim(),
        createdAt: String(row?.created_at || "").trim(),
        acceptedAt: null,
        sunoTaskId: String(row?.suno_task_id || "").trim(),
        sunoAudioId: String(row?.suno_audio_id || "").trim(),
      }))
      .sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  function parseSunoTaskStatus(provider: any) {
    const raw =
      provider?.data?.status ??
      provider?.data?.successFlag ??
      provider?.data?.data?.status ??
      provider?.data?.data?.successFlag ??
      provider?.status ??
      provider?.successFlag ??
      "";
    const n = typeof raw === "number" ? raw : Number(String(raw || "").trim());
    if (n === 0) return "PENDING";
    if (n === 1) return "SUCCESS";
    if (n === 2) return "CREATE_TASK_FAILED";
    if (n === 3) return "FAILED";
    return String(raw || "").toUpperCase();
  }

  function parseVocalRemovalItems(provider: any) {
    const cleanUrl = (raw: any) =>
      String(raw || "")
        .trim()
        .replaceAll("`", "")
        .trim();
    const normalizeKey = (k: string) => {
      const kk = (k || "").trim();
      if (!kk) return "";
      if (kk.endsWith("_url")) return kk.slice(0, -4) + "Url";
      return kk;
    };
    const root = provider?.data || {};
    const resp = root?.response || root?.data?.response || {};
    const directUrlEntries = Object.entries(resp || {})
      .filter(([k, v]) => {
        const kk = String(k || "");
        const vv = cleanUrl(v);
        if (!vv.startsWith("http")) return false;
        return kk.endsWith("Url") || kk.endsWith("_url") || kk.endsWith("url");
      })
      .map(([k, v]) => [normalizeKey(String(k)), cleanUrl(v)] as const);
    const map = new Map<string, string>();
    if (Array.isArray(resp?.originData)) {
      for (const row of resp.originData) {
        const key = normalizeKey(String(row?.stem_type_group_name || row?.stemTypeGroupName || row?.name || row?.type || "").trim() || "");
        const url = cleanUrl(row?.audio_url || row?.audioUrl || "");
        if (!key || !url.startsWith("http")) continue;
        map.set(key, url);
      }
    }
    for (const [k, v] of directUrlEntries) map.set(k, v);
    const labels: Record<string, string> = {
      instrumentalUrl: "Instrumental (Karaoke)",
      vocalUrl: "Voz",
      backingVocalsUrl: "Coros",
      drumsUrl: "Batería",
      bassUrl: "Bajo",
      guitarUrl: "Guitarra",
      keyboardUrl: "Teclado",
      percussionUrl: "Percusión",
      stringsUrl: "Cuerdas",
      synthUrl: "Synth",
      fxUrl: "FX",
      brassUrl: "Metales",
      woodwindsUrl: "Vientos",
      originUrl: "Original",
    };
    return Array.from(map.entries())
      .map(([key, url]) => ({ key, label: labels[key] || key, url }))
      .filter((x) => /^https?:\/\//i.test(x.url));
  }

  function extractSunoTracks(providerRaw: any) {
    const cleanStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim();
    const d = providerRaw?.data || providerRaw;
    const candidates: any[] = [];
    if (Array.isArray(d?.response?.data)) candidates.push(d.response.data);
    if (Array.isArray(d?.response?.sunoData)) candidates.push(d.response.sunoData);
    if (Array.isArray(d?.response)) candidates.push(d.response);
    if (Array.isArray(d?.data)) candidates.push(d.data);
    if (Array.isArray(d?.data?.data)) candidates.push(d.data.data);
    const list = (candidates.find((x) => Array.isArray(x) && x.length) as any[]) || [];

    const pickAudioUrl = (track: any) =>
      cleanStr(
        track?.audio_url ||
          track?.audioUrl ||
          track?.streamAudioUrl ||
          track?.stream_audio_url ||
          track?.stream_url ||
          track?.url ||
          track?.audio ||
          "",
      );
    const pickCoverUrl = (track: any) =>
      cleanStr(track?.image_url || track?.imageUrl || track?.cover_url || track?.coverUrl || track?.img_url || track?.imgUrl || "");
    const pickAudioId = (track: any) => cleanStr(track?.id || track?.audio_id || track?.audioId || track?.audioID || "");

    return (Array.isArray(list) ? list : [])
      .map((track: any, idx: number) => ({
        idx,
        sunoAudioId: pickAudioId(track),
        audioUrl: pickAudioUrl(track),
        coverUrl: pickCoverUrl(track),
        title: cleanStr(track?.title || ""),
        tags: cleanStr(track?.tags || ""),
      }))
      .filter((x: any) => x.sunoAudioId && x.audioUrl);
  }

  function extractMp4Url(providerRaw: any) {
    const d = providerRaw?.data || providerRaw;
    const raw =
      d?.response?.videoUrl ||
      d?.data?.response?.videoUrl ||
      d?.response?.video_url ||
      d?.data?.response?.video_url ||
      providerRaw?.response?.videoUrl ||
      providerRaw?.response?.video_url ||
      "";
    const url = String(raw || "").trim();
    return /^https?:\/\//i.test(url) ? url : "";
  }

  async function persistSunoTracksFromProvider(req: any, auth: any, params: { taskId: string; provider: any; isCover?: boolean }) {
    const taskId = normalizeText(params.taskId || "", 200);
    if (!taskId) return [];
    const tracks = extractSunoTracks(params.provider);
    if (!tracks.length) return [];

    for (const track of tracks) {
      const base = normalizeText(track.title || "Canción", 120) || "Canción";
      const suffix = tracks.length === 2 ? (track.idx === 0 ? "A" : track.idx === 1 ? "B" : String(track.idx + 1)) : tracks.length > 1 ? String(track.idx + 1) : "";
      const finalTitle = /\s(A|B|\d+)$/i.test(base) || !suffix ? base.slice(0, 120) : `${base} ${suffix}`.slice(0, 120);
      await internalJson(req, "/api/library/import-audio", {
        method: "POST",
        body: {
          sourceUrl: track.audioUrl,
          title: finalTitle,
          description: normalizeText(track.tags || "", 2000),
          coverUrl: normalizeText(track.coverUrl || "", 2000),
          externalId: normalizeText(track.sunoAudioId || "", 200),
          sunoTaskId: taskId,
          isCover: Boolean(params.isCover),
        },
      });
    }

    return await getSongsByTask(auth.admin, auth.user.id, taskId);
  }

  function resetHome(session: LucianaSession, intro?: string) {
    session.flow = "home";
    session.step = "home";
    session.draft = {};
    setComposer(session, "text", "Escribe lo que necesitas o toca un botón…", "Enviar");
    pushAssistant(
      session,
      intro || "Soy LucIAna Bot. Te ayudo a crear canciones, hacer covers, ver créditos o revisar tus canciones recientes.",
      {
        quickReplies: mainMenuReplies(),
        inputMode: "text",
        inputPlaceholder: "Ejemplo: quiero una canción para mi negocio",
      },
    );
  }

  function askGenerateStart(session: LucianaSession) {
    session.flow = "generate";
    session.step = "generate-start";
    setComposer(session, "disabled", "Elige una opción para empezar…", "Enviar");
    pushAssistant(session, "¿Cómo quieres empezar tu canción?", {
      quickReplies: [
        { id: "gen-audio", label: "Tengo un audio de referencia", value: "generate:start:audio", icon: "upload", variant: "primary" },
        { id: "gen-lyrics", label: "Ya tengo la letra", value: "generate:start:lyrics", icon: "file-text", variant: "secondary" },
        { id: "gen-nothing", label: "No tengo nada", value: "generate:start:nothing", icon: "sparkles", variant: "secondary" },
        { id: "go-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
      ],
      inputMode: "disabled",
    });
  }

  function askGenre(session: LucianaSession) {
    session.step = "generate-genre";
    setComposer(session, "disabled", "Elige un género o escribe uno…", "Enviar");
    pushAssistant(session, "Ahora dime el género musical.", {
      quickReplies: [...genreReplies(), { id: "go-home-2", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
      inputMode: "disabled",
    });
  }

  function askExtraInstructions(session: LucianaSession) {
    session.step = "generate-extra";
    setComposer(session, "multiline", "Ejemplo: romántica, para aniversario, voz masculina, con trompetas…", "Guardar");
    pushAssistant(session, "Cuéntame cómo la quieres: mood, ocasión, detalles o cualquier instrucción extra.", {
      quickReplies: [
        { id: "extra-skip", label: "Sin instrucciones extra", value: "generate:extra:skip", icon: "arrow-right", variant: "secondary" },
        { id: "extra-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
      ],
      inputMode: "multiline",
      inputPlaceholder: "Escribe aquí detalles de la canción…",
    });
  }

  function askGenerateConfirm(session: LucianaSession) {
    session.step = "generate-confirm";
    const summary: string[] = [];
    if (session.draft.lyrics) summary.push("Letra: lista");
    else if (session.draft.promptIdea) summary.push(`Idea: ${session.draft.promptIdea}`);
    if (session.draft.genre) summary.push(`Género: ${session.draft.genre}`);
    if (session.draft.extraInstructions) summary.push(`Detalles: ${session.draft.extraInstructions}`);
    setComposer(session, "disabled", "Confirma para generar…", "Enviar");
    pushAssistant(session, `Ya casi.\n\n${summary.join("\n")}\n\n¿La genero así?`, {
      quickReplies: [
        { id: "gen-confirm", label: "Sí, generar canción", value: "generate:confirm", icon: "sparkles", variant: "primary" },
        { id: "gen-adjust", label: "Cambiar algo", value: "generate:adjust", icon: "edit", variant: "secondary" },
        { id: "gen-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
      ],
      inputMode: "disabled",
    });
  }

  function readySongQuickReplies(kind: "generate" | "cover") {
    if (kind === "generate") {
      return [
        { id: "gen-service-separate", label: "Quitar voz", value: "generate:service:separate", icon: "mic-off", variant: "primary" as const },
        { id: "gen-service-video", label: "Hacer video", value: "generate:service:video", icon: "video", variant: "secondary" as const },
        { id: "gen-ready-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" as const },
      ];
    }
    return [{ id: "cover-home-ready", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" as const }];
  }

  async function askSongVersionForService(auth: any, session: LucianaSession, service: "separate" | "video") {
    const songs = await getSongsByIds(auth.admin, auth.user.id, session.draft.pendingSongIds || []);
    if (!songs.length) {
      pushAssistant(session, "No encontré esas canciones en tu Biblioteca. Si quieres, te muestro tus canciones recientes.", {
        quickReplies: [
          { id: "recent-after-missing", label: "Ver Biblioteca", value: "menu:recent", icon: "library", variant: "primary" },
          { id: "missing-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
        ],
      });
      session.flow = "home";
      session.step = "home";
      setComposer(session, "text", "Escribe aquí…", "Enviar");
      return;
    }
    session.draft.selectedAction = service;
    session.step = service === "separate" ? "generate-service-separate-song" : "generate-service-video-song";
    setComposer(session, "disabled", "Elige una versión…", "Enviar");
    pushAssistant(
      session,
      service === "separate"
        ? "Claro. ¿A cuál versión quieres que le quite la voz?"
        : "Claro. ¿Cuál versión quieres que convierta en video para redes?",
      {
        songs,
        quickReplies: [
          ...songs.slice(0, 2).map((song: any, idx: number) => ({
            id: `${service}-pick-${song.id}`,
            label: `${idx === 0 ? "Versión A" : idx === 1 ? "Versión B" : song.title.slice(0, 22)}`,
            value: `generate:service:${service}:song:${song.id}`,
            icon: service === "separate" ? "mic-off" : "video",
            variant: "secondary" as const,
          })),
          { id: `${service}-home`, label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" as const },
        ],
      },
    );
  }

  async function startGenerate(req: any, session: LucianaSession) {
    const hasLyrics = Boolean(normalizeText(session.draft.lyrics || "", 12000));
    const genre = normalizeText(session.draft.genre || "General", 120);
    const extra = normalizeText(session.draft.extraInstructions || "", 1000);
    const title = safeSongTitleFromDraft(session.draft);
    const payload = hasLyrics
      ? {
          prompt: normalizeText(session.draft.lyrics || "", 12000),
          customMode: true,
          style: [genre, extra].filter(Boolean).join(". ").slice(0, 900),
          title,
          instrumental: false,
        }
      : {
          prompt: [normalizeText(session.draft.promptIdea || session.draft.topic || "", 1000), `Género: ${genre}`, extra].filter(Boolean).join(". "),
          customMode: false,
          instrumental: false,
          model: "V4_5",
        };
    const started = await internalJson(req, "/api/suno/generate", { method: "POST", body: payload });
    if (!started.ok) {
      pushAssistant(session, (started.out?.detail || started.out?.error || "No pude iniciar la generación.").toString(), {
        quickReplies: [
          { id: "retry-generate", label: "Intentar otra vez", value: "generate:confirm", icon: "refresh", variant: "primary" },
          { id: "home-generate", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
        ],
      });
      return;
    }
    const taskId = String(started.out?.taskId || "").trim();
    if (!taskId) {
      pushAssistant(session, "No recibí taskId del proveedor. Intenta otra vez.", {
        quickReplies: [{ id: "retry-generate-2", label: "Reintentar", value: "generate:confirm", icon: "refresh", variant: "primary" }],
      });
      return;
    }
    session.step = "generate-polling";
    session.draft.pendingTaskId = taskId;
    session.draft.pendingKind = "generate";
    setComposer(session, "disabled", "Generando canción…", "Enviar");
    upsertStatusMessage(session, `generate:${taskId}`, "Estoy generando tu canción. Voy a revisar el estado real cada 15 segundos hasta que quede lista.");
  }

  async function startCover(req: any, session: LucianaSession) {
    const audio = session.draft.coverAudio;
    if (!audio?.url) {
      pushAssistant(session, "Primero súbeme el audio para el cover.");
      return;
    }
    const payload: any = {
      uploadUrl: audio.url,
      uploadBucket: audio.key ? "ramber-tunes" : undefined,
      uploadPath: audio.key || undefined,
      instrumental: false,
      prompt: " ",
      style: normalizeText(session.draft.extraInstructions || "General", 500) || "General",
      title: normalizeText((audio.fileName || "Cover").replace(/\.[a-z0-9]+$/i, ""), 120) || "Cover",
      model: "V4_5",
    };
    const started = await internalJson(req, "/api/suno/upload-cover", { method: "POST", body: payload });
    if (!started.ok) {
      pushAssistant(session, (started.out?.detail || started.out?.error || "No pude iniciar el cover.").toString(), {
        quickReplies: [
          { id: "cover-retry", label: "Intentar otra vez", value: "cover:confirm", icon: "refresh", variant: "primary" },
          { id: "cover-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
        ],
      });
      return;
    }
    const taskId = String(started.out?.taskId || "").trim();
    if (!taskId) {
      pushAssistant(session, "No recibí taskId del cover. Intenta otra vez.");
      return;
    }
    session.step = "cover-polling";
    session.draft.pendingTaskId = taskId;
    session.draft.pendingKind = "upload-cover";
    setComposer(session, "disabled", "Generando cover…", "Enviar");
    upsertStatusMessage(session, `cover:${taskId}`, "Ya puse a trabajar tu cover. Te aviso aquí mismo cuando esté listo.");
  }

  async function startSeparate(req: any, session: LucianaSession) {
    const taskId = normalizeText(session.draft.selectedSongTaskId || "", 200);
    const audioId = normalizeText(session.draft.selectedSongAudioId || "", 200);
    const type = normalizeText(session.draft.pendingKind || "separate_vocal", 40);
    if (!taskId && !audioId) {
      pushAssistant(session, "Esa canción no tiene datos suficientes para separar voz. Elige otra más reciente.");
      return;
    }
    const started = await internalJson(req, "/api/suno/separate", {
      method: "POST",
      body: { taskId, audioId, type },
    });
    if (!started.ok) {
      pushAssistant(session, (started.out?.detail || started.out?.error || "No pude iniciar la separación.").toString(), {
        quickReplies: [
          { id: "sep-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
        ],
      });
      return;
    }
    const outTaskId = String(started.out?.taskId || "").trim();
    if (!outTaskId) {
      pushAssistant(session, "No recibí taskId de separación. Intenta otra vez.");
      return;
    }
    session.step = "separate-polling";
    session.draft.pendingTaskId = outTaskId;
    session.draft.pendingKind = type || "separate_vocal";
    setComposer(session, "disabled", "Separando voz…", "Enviar");
    upsertStatusMessage(session, `separate:${outTaskId}`, "Ya estoy separando la voz. Voy a revisar el estado real y te pondré aquí los links cuando terminen.");
  }

  async function startVideo(req: any, auth: any, session: LucianaSession) {
    const taskId = normalizeText(session.draft.selectedSongTaskId || "", 200);
    const audioId = normalizeText(session.draft.selectedSongAudioId || "", 200);
    if (!taskId && !audioId) {
      pushAssistant(session, "Esa canción no tiene datos suficientes para crear el video. Elige otra versión.");
      return;
    }
    const author = normalizeText(
      auth?.user?.user_metadata?.display_name || auth?.user?.user_metadata?.full_name || auth?.user?.email || "",
      50,
    )
      .split("@")[0]
      .trim();
    const started = await internalJson(req, "/api/suno/mp4", {
      method: "POST",
      body: { taskId, audioId, author },
    });
    if (!started.ok) {
      pushAssistant(session, (started.out?.detail || started.out?.error || "No pude iniciar el video.").toString(), {
        quickReplies: [
          { id: "video-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
        ],
      });
      return;
    }
    const outTaskId = String(started.out?.taskId || "").trim();
    if (!outTaskId) {
      pushAssistant(session, "No recibí taskId del video. Intenta otra vez.");
      return;
    }
    session.step = "video-polling";
    session.draft.pendingTaskId = outTaskId;
    session.draft.pendingKind = "mp4";
    setComposer(session, "disabled", "Generando video…", "Enviar");
    upsertStatusMessage(session, `video:${outTaskId}`, "Preparando tu video para redes. Esto puede tardar unos minutos.");
  }

  async function pollPendingTask(req: any, auth: any, session: LucianaSession) {
    const taskId = normalizeText(session.draft.pendingTaskId || "", 200);
    const kind = normalizeText(session.draft.pendingKind || "generate", 80);
    if (!taskId) return;

    if (kind === "transcribe-lyrics") {
      const startedAt = Number(session.draft.pendingStartedAt ?? 0) || 0;
      const pendingFlow = normalizeText(session.draft.pendingFlow || session.flow || "generate", 40);
      if (startedAt > 0 && Date.now() - startedAt >= 60000) {
        session.draft.pendingTaskId = undefined;
        session.draft.pendingKind = undefined;
        session.draft.pendingStartedAt = undefined;
        session.draft.pendingFlow = undefined;
        if (pendingFlow === "cover") {
          session.step = "cover-audio";
          setComposer(session, "audio", "Súbeme el MP3 para hacer el cover…", "Enviar");
          pushAssistant(session, "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.", {
            quickReplies: [
              { id: "cover-retry-audio", label: "Reintentar", value: "cover:retry-audio", icon: "refresh", variant: "primary" },
              { id: "cover-manual-lyrics", label: "Escribir letra", value: "cover:lyrics:manual", icon: "edit", variant: "secondary" },
            ],
            inputMode: "audio",
          });
          return;
        }
        session.step = "generate-lyrics";
        setComposer(session, "multiline", "Pégame la letra o unas líneas de referencia…", "Guardar");
        pushAssistant(session, "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.", {
          quickReplies: [
            { id: "gen-retry-audio", label: "Reintentar", value: "generate:retry-audio", icon: "refresh", variant: "primary" },
            { id: "gen-manual-lyrics", label: "Escribir letra", value: "generate:write-lyrics", icon: "edit", variant: "secondary" },
          ],
          inputMode: "multiline",
        });
        return;
      }

      const audio = session.draft.referenceAudio;
      const uploadUrl = normalizeText(audio?.url || "", 2000);
      const mimeType = normalizeText(audio?.contentType || "audio/mpeg", 120) || "audio/mpeg";
      if (!uploadUrl) {
        session.draft.pendingTaskId = undefined;
        session.draft.pendingKind = undefined;
        session.draft.pendingStartedAt = undefined;
        session.draft.pendingFlow = undefined;
        if (pendingFlow === "cover") {
          session.step = "cover-lyrics-manual";
          setComposer(session, "multiline", "Pega aquí la letra…", "Guardar");
          pushAssistant(session, "No pude encontrar el audio que subiste. Pega aquí la letra manualmente.", { inputMode: "multiline" });
          return;
        }
        session.step = "generate-lyrics";
        setComposer(session, "multiline", "Pégame la letra o unas líneas de referencia…", "Guardar");
        pushAssistant(session, "No pude encontrar el audio que subiste. Si quieres, pégame aquí la letra manualmente o unas líneas de referencia.", {
          inputMode: "multiline",
        });
        return;
      }

      const tr = await internalJson(req, "/api/ai/transcribe-lyrics", {
        method: "POST",
        body: { uploadUrl, mimeType },
      });
      const lyrics = normalizeText(tr.out?.lyrics || "", 12000);
      session.draft.pendingTaskId = undefined;
      session.draft.pendingKind = undefined;
      session.draft.pendingStartedAt = undefined;
      session.draft.pendingFlow = undefined;

      if (!tr.ok || tr.out?.ok === false || !lyrics) {
        const msg = (tr.out?.message || "No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.").toString();
        const id = normalizeText(tr.out?.error_id || "", 40);
        const safeMsg = [msg, id ? `(Error ${id})` : ""].filter(Boolean).join(" ");
        if (pendingFlow === "cover") {
          session.step = "cover-lyrics-manual";
          setComposer(session, "multiline", "Pega aquí la letra…", "Guardar");
          pushAssistant(session, safeMsg, { inputMode: "multiline" });
          return;
        }
        session.step = "generate-lyrics";
        setComposer(session, "multiline", "Pégame la letra o unas líneas de referencia…", "Guardar");
        pushAssistant(session, safeMsg, { inputMode: "multiline" });
        return;
      }

      if (pendingFlow === "cover") {
        session.draft.coverLyrics = lyrics;
        session.step = "cover-lyrics-confirm";
        setComposer(session, "disabled", "Confirma la letra…", "Enviar");
        pushAssistant(session, `Te detecté esta letra del audio:\n\n${lyrics}\n\n¿La letra está correcta?`, {
          quickReplies: [
            { id: "cover-lyrics-ok", label: "Sí, está correcta", value: "cover:lyrics:ok", icon: "check", variant: "primary" },
            { id: "cover-lyrics-manual", label: "No, escribiré la letra", value: "cover:lyrics:manual", icon: "edit", variant: "secondary" },
          ],
          inputMode: "disabled",
        });
        return;
      }

      session.draft.originalLyrics = lyrics;
      session.draft.lyrics = lyrics;
      pushAssistant(session, `Te detecté esta letra del audio:\n\n${lyrics}`, {
        quickReplies: [{ id: "audio-lyrics-ok", label: "Seguir", value: "generate:audio:continue", icon: "arrow-right", variant: "primary" }],
      });
      askGenre(session);
      return;
    }

    if (kind === "generate" || kind === "upload-cover") {
      const songs = await getSongsByTask(auth.admin, auth.user.id, taskId);
      if (songs.length > 0) {
        session.draft.pendingSongIds = songs.map((s: any) => s.id);
        session.draft.pendingTaskId = undefined;
        session.draft.pendingKind = undefined;
        session.step = kind === "generate" ? "generate-ready" : "cover-ready";
        setComposer(session, "disabled", "Listo", "Enviar");
        pushAssistant(
          session,
          kind === "generate"
            ? "Tus 2 versiones ya quedaron listas y guardadas automáticamente en tu Biblioteca. Aquí puedes escucharlas. Si quieres, también puedo quitar la voz de una de ellas o hacerte un video para redes."
            : "Tu cover ya quedó listo y guardado automáticamente en tu Biblioteca.",
          {
            songs,
            quickReplies: readySongQuickReplies(kind === "generate" ? "generate" : "cover"),
          },
        );
        return;
      }
    }

    const polled = await internalJson(req, `/api/suno/task?kind=${encodeURIComponent(kind === "upload-cover" ? "generate" : kind)}&taskId=${encodeURIComponent(taskId)}`);
    if (!polled.ok) {
      upsertStatusMessage(session, `${kind}:${taskId}`, "Sigo revisando tu proceso. Si tarda, vuelve a tocar el botón o espera unos segundos.");
      return;
    }
    const provider = polled.out?.data;
    const status = parseSunoTaskStatus(provider);
    if (kind === "generate" || kind === "upload-cover") {
      if (status === "SUCCESS") {
        const songs = await persistSunoTracksFromProvider(req, auth, {
          taskId,
          provider,
          isCover: kind === "upload-cover",
        });
        if (songs.length > 0) {
          session.draft.pendingSongIds = songs.map((s: any) => s.id);
          session.draft.pendingTaskId = undefined;
          session.draft.pendingKind = undefined;
          session.step = kind === "generate" ? "generate-ready" : "cover-ready";
          setComposer(session, "disabled", "Listo", "Enviar");
          pushAssistant(
            session,
            kind === "generate"
              ? "Tus 2 versiones ya quedaron listas y guardadas automáticamente en tu Biblioteca. Aquí puedes escucharlas. Si quieres, también puedo quitar la voz de una de ellas o hacerte un video para redes."
              : "Tu cover ya quedó listo y guardado automáticamente en tu Biblioteca.",
            {
              songs,
              quickReplies: readySongQuickReplies(kind === "generate" ? "generate" : "cover"),
            },
          );
          return;
        }
      }
      if (
        status === "FAILED" ||
        status === "CREATE_TASK_FAILED" ||
        status === "GENERATE_AUDIO_FAILED" ||
        status === "CALLBACK_EXCEPTION" ||
        status === "SENSITIVE_WORD_ERROR"
      ) {
        session.draft.pendingTaskId = undefined;
        session.draft.pendingKind = undefined;
        session.step = "home";
        setComposer(session, "text", "Escribe aquí…", "Enviar");
        pushAssistant(session, "No pude terminar esa generación. Si quieres, la intentamos de nuevo con otra idea.", {
          quickReplies: [
            { id: "gen-again", label: "Generar otra canción", value: "menu:generate", icon: "sparkles", variant: "primary" },
            { id: "gen-home-fail", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
          ],
        });
        return;
      }
    }
    if (kind === "separate_vocal" || kind === "split_stem") {
      if (status === "SUCCESS") {
        const items = parseVocalRemovalItems(provider);
        session.step = "separate-ready";
        session.draft.pendingTaskId = undefined;
        session.draft.pendingKind = undefined;
        setComposer(session, "disabled", "Listo", "Enviar");
        pushAssistant(session, "La separación ya quedó lista. Aquí te dejo los links que regresó el proveedor.", {
          links: items.map((x) => ({ label: x.label, url: x.url })).slice(0, 12),
          quickReplies: [{ id: "sep-ready-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
        });
        return;
      }
      if (status === "FAILED" || status === "CREATE_TASK_FAILED" || status === "CALLBACK_EXCEPTION") {
        session.draft.pendingTaskId = undefined;
        session.draft.pendingKind = undefined;
        session.step = "home";
        setComposer(session, "text", "Escribe aquí…", "Enviar");
        pushAssistant(session, "La separación falló. Si quieres, intento con otra canción.", {
          quickReplies: [
            { id: "sep-home-fail", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
          ],
        });
        return;
      }
    }
    if (kind === "mp4") {
      if (status === "SUCCESS") {
        const videoUrl = extractMp4Url(provider);
        session.step = "video-ready";
        session.draft.pendingTaskId = undefined;
        session.draft.pendingKind = undefined;
        setComposer(session, "disabled", "Listo", "Enviar");
        pushAssistant(
          session,
          videoUrl
            ? "Tu video para redes ya quedó listo. Aquí te dejo el botón para abrirlo."
            : "El video terminó, pero no recibí el link final. Si quieres, lo revisamos otra vez.",
          {
            links: videoUrl ? [{ label: "Abrir video", url: videoUrl }] : [],
            quickReplies: [{ id: "video-ready-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
          },
        );
        return;
      }
      if (status === "FAILED" || status === "CREATE_TASK_FAILED" || status === "GENERATE_MP4_FAILED" || status === "CALLBACK_EXCEPTION") {
        session.draft.pendingTaskId = undefined;
        session.draft.pendingKind = undefined;
        session.step = "home";
        setComposer(session, "text", "Escribe aquí…", "Enviar");
        pushAssistant(session, "No pude terminar el video. Si quieres, luego lo intento otra vez con una de tus canciones.", {
          quickReplies: [
            { id: "video-recent", label: "Ver canciones recientes", value: "menu:recent", icon: "library", variant: "primary" },
            { id: "video-home-fail", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
          ],
        });
        return;
      }
    }
    const friendly =
      kind === "generate"
        ? "Generando tu canción... Esto puede tardar unos minutos."
        : kind === "upload-cover"
          ? "Generando tu cover... Esto puede tardar unos minutos."
          : kind === "mp4"
            ? "Preparando tu video para redes... Esto puede tardar unos minutos."
          : kind === "separate_vocal" || kind === "split_stem"
            ? "Separando la voz... Esto puede tardar unos minutos."
            : "Procesando tu solicitud... Esto puede tardar unos minutos.";
    upsertStatusMessage(session, `${kind}:${taskId}`, friendly);
  }

  async function showCredits(req: any, session: LucianaSession) {
    const info = await internalJson(req, "/api/account/balance");
    if (!info.ok) {
      pushAssistant(session, (info.out?.detail || info.out?.error || "No pude leer tus créditos.").toString(), {
        quickReplies: mainMenuReplies(),
      });
      return;
    }
    const out = info.out || {};
    pushAssistant(session, "Aquí tienes tu saldo actual.", {
      credits: {
        credits: Number(out?.credits ?? 0),
        songBalance: Number(out?.song_balance ?? 0),
        downloadsAllowed: Boolean(out?.downloads_allowed),
        planKey: String(out?.plan_key || "ninguno"),
        planActive: Boolean(out?.plan_active),
        planExpiresAt: out?.plan_expires_at || null,
      },
      quickReplies: mainMenuReplies(),
    });
  }

  async function getCreditsSummary(req: any) {
    const info = await internalJson(req, "/api/account/balance");
    if (!info.ok) return { ok: false as const, error: (info.out?.detail || info.out?.error || "No pude leer tus créditos.").toString() };
    const out = info.out || {};
    return {
      ok: true as const,
      credits: Number(out?.credits ?? 0),
      songBalance: Number(out?.song_balance ?? 0),
      downloadsAllowed: Boolean(out?.downloads_allowed),
      planKey: String(out?.plan_key || "ninguno"),
      planActive: Boolean(out?.plan_active),
      planExpiresAt: out?.plan_expires_at || null,
    };
  }

  async function askMasteringStart(req: any, session: LucianaSession) {
    const balance = await getCreditsSummary(req);
    session.flow = "mastering";
    session.step = "mastering-audio";
    session.draft = {};
    setComposer(session, "audio_mp3", "Súbeme el MP3 que quieres masterizar…", "Enviar");
    if (!balance.ok) {
      pushAssistant(
        session,
        "Te ayudo a masterizar tu canción. Primero súbeme un MP3.\n\nSi tu archivo no está en MP3, conviértelo aquí: https://online-audio-converter.com/sp/",
        {
          quickReplies: [{ id: "master-home-0", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
          inputMode: "audio_mp3",
          inputPlaceholder: "Sube un MP3",
        },
      );
      return;
    }

    if (balance.credits < (CREDIT_COSTS.mastering || 10)) {
      pushAssistant(
        session,
        `Para masterizar necesitas 10 créditos y ahorita tienes ${balance.credits.toLocaleString("es-MX")}.\n\nRecarga saldo y en cuanto quieras lo hacemos aquí mismo.`,
        {
          credits: {
            credits: balance.credits,
            songBalance: balance.songBalance,
            downloadsAllowed: balance.downloadsAllowed,
            planKey: balance.planKey,
            planActive: balance.planActive,
            planExpiresAt: balance.planExpiresAt,
          },
          quickReplies: [
            { id: "master-low-credits", label: "Ver créditos", value: "menu:credits", icon: "coins", variant: "primary" },
            { id: "master-home-1", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
          ],
        },
      );
      setComposer(session, "disabled", "Necesitas recargar créditos…", "Enviar");
      return;
    }

    pushAssistant(
      session,
      `Perfecto. Sí tienes saldo suficiente para masterizar: ${balance.credits.toLocaleString("es-MX")} créditos.\n\nAhora súbeme tu archivo en MP3 y yo me encargo del resto.\n\nSi no está en MP3, conviértelo aquí: https://online-audio-converter.com/sp/`,
      {
        credits: {
          credits: balance.credits,
          songBalance: balance.songBalance,
          downloadsAllowed: balance.downloadsAllowed,
          planKey: balance.planKey,
          planActive: balance.planActive,
          planExpiresAt: balance.planExpiresAt,
        },
        quickReplies: [{ id: "master-home-2", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
        inputMode: "audio_mp3",
        inputPlaceholder: "Sube un MP3",
      },
    );
  }

  async function startMastering(req: any, session: LucianaSession) {
    const audio = session.draft.masteringAudio;
    const inputKey = normalizeText(audio?.key || "", 500);
    if (!inputKey) {
      pushAssistant(session, "Primero súbeme el MP3 que quieres masterizar.");
      return;
    }

    const title = normalizeText((audio?.fileName || "audio").replace(/\.[a-z0-9]+$/i, ""), 120) || "audio";
    const started = await internalJson(req, "/api/mastering/masterize", {
      method: "POST",
      body: {
        inputKey,
        title,
      },
    });

    if (!started.ok) {
      const errorText = (started.out?.detail || started.out?.error || "No pude masterizar tu audio.").toString();
      const converterUrl = normalizeText(started.out?.converterUrl || "", 500);
      pushAssistant(
        session,
        converterUrl ? `${errorText}\n\nConvierte tu audio aquí: ${converterUrl}` : errorText,
        {
          quickReplies: [
            { id: "master-retry", label: "Subir otro MP3", value: "menu:mastering", icon: "upload", variant: "primary" },
            { id: "master-home-fail", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
          ],
          inputMode: converterUrl ? "audio_mp3" : "disabled",
        },
      );
      if (converterUrl) {
        session.step = "mastering-audio";
        setComposer(session, "audio_mp3", "Súbeme un MP3…", "Enviar");
      }
      return;
    }

    const song = started.out?.song || {};
    session.step = "mastering-ready";
    session.draft.pendingTaskId = undefined;
    session.draft.pendingKind = undefined;
    setComposer(session, "disabled", "Listo", "Enviar");
    pushAssistant(session, "Tu canción ya quedó masterizada con nuestra tecnología LucIAna SoundCore y también la guardé en tu Biblioteca.", {
      songs: [
        {
          id: String(song?.id || `master_${Date.now()}`),
          title: String(song?.title || `${title} (Masterizada)`),
          audioUrl: String(song?.audio_url || started.out?.downloadUrl || "").trim(),
          coverUrl: String(song?.cover_url || "").trim(),
          createdAt: String(song?.created_at || new Date().toISOString()),
          acceptedAt: null,
          sunoTaskId: String(song?.suno_task_id || "").trim(),
          sunoAudioId: String(song?.suno_audio_id || "").trim(),
        },
      ],
      quickReplies: [
        { id: "master-again", label: "Masterizar otra", value: "menu:mastering", icon: "upload", variant: "primary" },
        { id: "master-recent", label: "Ver Biblioteca", value: "menu:recent", icon: "library", variant: "secondary" },
        { id: "master-home-ready", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
      ],
    });
  }

  async function showRecentSongs(auth: any, session: LucianaSession) {
    const songs = await getRecentSongs(auth.admin, auth.user.id, 6);
    if (!songs.length) {
      pushAssistant(session, "Todavía no veo canciones en tu biblioteca.", {
        quickReplies: mainMenuReplies(),
      });
      return;
    }
    pushAssistant(session, "Estas son tus canciones más recientes.", {
      songs,
      quickReplies: [
        { id: "recent-generate", label: "Generar otra canción", value: "menu:generate", icon: "sparkles", variant: "primary" },
        { id: "recent-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
      ],
    });
  }

  async function handleOpen(auth: any, session: LucianaSession) {
    if (session.messages.length > 0) return;
    const name =
      String(auth?.user?.user_metadata?.display_name || auth?.user?.user_metadata?.full_name || auth?.user?.email || "amigo")
        .split("@")[0]
        .slice(0, 40);
    resetHome(session, `Hola, ${name}. Soy LucIAna Bot. Aquí te ayudo paso por paso sin que tengas que meterte a cosas técnicas.`);
  }

  async function handleChat(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const session = normalizeSession(body?.session);
    const event = body?.event && typeof body.event === "object" ? body.event : {};
    const eventType = typeof event?.type === "string" ? event.type.trim().toLowerCase() : "open";
    const eventText = normalizeText(event?.text || event?.label || "", 12000);
    const eventValue = normalizeText(event?.value || "", 200);
    const file = event?.file && typeof event.file === "object" ? event.file : null;

    try {
      if (eventType === "open") {
        await handleOpen(auth, session);
        return send(res, 200, { ok: true, session });
      }

      if (eventType === "poll") {
        await pollPendingTask(req, auth, session);
        return send(res, 200, { ok: true, session });
      }

      if (eventType === "message" && eventText) {
        pushUser(session, eventText);
      } else if (eventType === "quick_reply" && eventText) {
        pushUser(session, eventText);
      } else if (eventType === "file" && file) {
        pushUser(session, `Subí un audio: ${normalizeText(file?.fileName || "audio", 120)}`);
      }

      if (eventType === "quick_reply" && eventValue === "menu:home") {
        resetHome(session);
        return send(res, 200, { ok: true, session });
      }

      if (session.step === "home") {
        if (eventType === "file" && file) {
          session.draft.homeUploadedFile = {
            url: normalizeText(file?.url || "", 2000),
            key: normalizeText(file?.key || "", 500),
            fileName: normalizeText(file?.fileName || "", 200),
            contentType: normalizeText(file?.contentType || "", 120),
            size: Number(file?.size || 0),
          };
          setComposer(session, "disabled", "Elige una opción…", "Enviar");
          pushAssistant(session, "Recibí tu MP3. ¿Qué quieres hacer con este audio?", {
            quickReplies: [
              { id: "home-file-cover", label: "Hacer cover", value: "home:file:cover", icon: "sparkles", variant: "primary" },
              { id: "home-file-generate", label: "Crear canción", value: "home:file:generate", icon: "music", variant: "secondary" },
              { id: "home-file-master", label: "Masterizar", value: "home:file:mastering", icon: "upload", variant: "secondary" },
              { id: "home-file-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
            ],
            inputMode: "disabled",
          });
          return send(res, 200, { ok: true, session });
        }

        if (eventType === "quick_reply" && eventValue.startsWith("home:file:")) {
          const saved = session.draft.homeUploadedFile;
          const savedFile = saved && typeof saved === "object" ? saved : null;
          if (!savedFile?.url) {
            resetHome(session, "No encontré el audio que subiste. Súbelo otra vez, por favor.");
            return send(res, 200, { ok: true, session });
          }

          const contentType = normalizeText(savedFile?.contentType || "", 120).toLowerCase();
          const fileNameLower = normalizeText(savedFile?.fileName || "", 200).toLowerCase();
          const isMp3 = contentType === "audio/mpeg" || fileNameLower.endsWith(".mp3");
          if (!isMp3) {
            resetHome(session, "Ese archivo no está en MP3. Convierte tu audio aquí y luego súbelo otra vez: https://online-audio-converter.com/sp/");
            return send(res, 200, { ok: true, session });
          }

          const mode = eventValue.replace("home:file:", "").trim();
          session.draft.homeUploadedFile = undefined;

          if (mode === "cover") {
            session.flow = "cover";
            session.step = "cover-audio";
            session.draft.coverAudio = {
              url: normalizeText(savedFile?.url || "", 2000),
              key: normalizeText(savedFile?.key || "", 500),
              fileName: normalizeText(savedFile?.fileName || "", 200),
              contentType: contentType,
              size: Number(savedFile?.size || 0),
            };
            session.draft.referenceAudio = session.draft.coverAudio;
            const nextTaskId = makeMessageId("transcribe");
            session.step = "cover-transcribe-polling";
            session.draft.pendingTaskId = nextTaskId;
            session.draft.pendingKind = "transcribe-lyrics";
            session.draft.pendingStartedAt = Date.now();
            session.draft.pendingFlow = "cover";
            setComposer(session, "disabled", "Transcribiendo letra…", "Enviar");
            upsertStatusMessage(session, `transcribe:${nextTaskId}`, "Audio cargado. Confirmando autorización y transcribiendo…");
            return send(res, 200, { ok: true, session });
          }

          if (mode === "generate") {
            session.flow = "generate";
            session.step = "generate-audio";
            session.draft.referenceAudio = {
              url: normalizeText(savedFile?.url || "", 2000),
              key: normalizeText(savedFile?.key || "", 500),
              fileName: normalizeText(savedFile?.fileName || "", 200),
              contentType: contentType,
              size: Number(savedFile?.size || 0),
            };
            const nextTaskId = makeMessageId("transcribe");
            session.step = "generate-audio-polling";
            session.draft.pendingTaskId = nextTaskId;
            session.draft.pendingKind = "transcribe-lyrics";
            session.draft.pendingStartedAt = Date.now();
            session.draft.pendingFlow = "generate";
            setComposer(session, "disabled", "Transcribiendo letra…", "Enviar");
            upsertStatusMessage(session, `transcribe:${nextTaskId}`, "Audio cargado. Confirmando autorización y transcribiendo…");
            return send(res, 200, { ok: true, session });
          }

          if (mode === "mastering") {
            session.flow = "mastering";
            session.step = "mastering-audio";
            session.draft.masteringAudio = {
              url: normalizeText(savedFile?.url || "", 2000),
              key: normalizeText(savedFile?.key || "", 500),
              fileName: normalizeText(savedFile?.fileName || "", 200),
              contentType: contentType,
              size: Number(savedFile?.size || 0),
            };
            await startMastering(req, session);
            return send(res, 200, { ok: true, session });
          }
        }

        const route =
          eventType === "quick_reply" && eventValue.startsWith("menu:")
            ? (() => {
                const view = eventValue.replace("menu:", "").trim();
                if (view === "generate" || view === "cover" || view === "mastering") return { toolName: "open_flow", input: { flow: view } };
                if (view === "separate") {
                  return {
                    toolName: "answer_user",
                    input: {
                      message:
                        "Quitar voz solo aparece al final de una canción creada dentro de la app. Si subes una canción externa, esa opción no aplica aquí.",
                    },
                  };
                }
                if (view === "credits") return { toolName: "show_account", input: { view: "credits" } };
                if (view === "recent") return { toolName: "show_account", input: { view: "recent_songs" } };
                return { toolName: "answer_user", input: { message: "Te ayudo con eso." } };
              })()
            : await routeHomeIntent(eventText || eventValue || "hola");

        if (route.toolName === "open_flow") {
          const flow = normalizeText(route.input?.flow || "", 40);
          if (flow === "generate") {
            askGenerateStart(session);
            return send(res, 200, { ok: true, session });
          }
          if (flow === "cover") {
            session.flow = "cover";
            session.step = "cover-audio";
            setComposer(session, "audio", "Súbeme el audio para hacer el cover…", "Enviar");
            pushAssistant(session, "Súbeme el audio que quieres usar para el cover. Cuando lo tenga, te pido las indicaciones extra.", {
              quickReplies: [{ id: "cover-home-btn", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
              inputMode: "audio",
            });
            return send(res, 200, { ok: true, session });
          }
          if (flow === "mastering") {
            await askMasteringStart(req, session);
            return send(res, 200, { ok: true, session });
          }
        }

        if (route.toolName === "show_account") {
          const view = normalizeText(route.input?.view || "", 40);
          if (view === "credits") {
            await showCredits(req, session);
            return send(res, 200, { ok: true, session });
          }
          if (view === "recent_songs") {
            await showRecentSongs(auth, session);
            return send(res, 200, { ok: true, session });
          }
        }

        resetHome(session, normalizeText(route.input?.message || "Te ayudo con eso.", 400));
        return send(res, 200, { ok: true, session });
      }

      if (session.flow === "generate") {
        if (session.step === "generate-start" && eventType === "quick_reply") {
          if (eventValue === "generate:start:audio") {
            session.draft = { sourceMode: "audio" };
            session.step = "generate-audio";
            setComposer(session, "audio_mp3", "Súbeme un MP3 de referencia…", "Enviar");
            pushAssistant(
              session,
              "Súbeme un MP3 de referencia. Ojo: es solo para inspirarnos, no debe ser una canción famosa con derechos de autor.\n\nSi tu archivo no está en MP3, conviértelo aquí: https://online-audio-converter.com/sp/",
              {
                quickReplies: [{ id: "gen-audio-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
                inputMode: "audio_mp3",
              },
            );
            return send(res, 200, { ok: true, session });
          }
          if (eventValue === "generate:start:lyrics") {
            session.draft = { sourceMode: "lyrics" };
            session.step = "generate-lyrics";
            setComposer(session, "multiline", "Pega aquí tu letra completa…", "Guardar letra");
            pushAssistant(session, "Pégame aquí la letra completa y la reviso antes de generar.", {
              inputMode: "multiline",
              inputPlaceholder: "Pega aquí tu letra…",
            });
            return send(res, 200, { ok: true, session });
          }
          if (eventValue === "generate:start:nothing") {
            session.draft = { sourceMode: "nothing" };
            session.step = "generate-ai-lyrics-confirm";
            setComposer(session, "disabled", "Elige una opción…", "Enviar");
            pushAssistant(session, "¿Quieres que te hagamos una letra única sin costo extra?", {
              quickReplies: [
                { id: "ai-lyrics-yes", label: "Sí, hazme la letra", value: "generate:ai-lyrics:yes", icon: "sparkles", variant: "primary" },
                { id: "ai-lyrics-no", label: "No, solo dame ideas", value: "generate:ai-lyrics:no", icon: "edit", variant: "secondary" },
                { id: "ai-lyrics-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
              ],
              inputMode: "disabled",
            });
            return send(res, 200, { ok: true, session });
          }
        }

        if (session.step === "generate-audio" && eventType === "file" && file) {
          const contentType = normalizeText(file?.contentType || "", 120).toLowerCase();
          const fileName = normalizeText(file?.fileName || "", 200).toLowerCase();
          const isMp3 = contentType === "audio/mpeg" || fileName.endsWith(".mp3");
          if (!isMp3) {
            pushAssistant(session, "Ese archivo no está en MP3. Convierte tu audio aquí y luego súbelo otra vez: https://online-audio-converter.com/sp/", {
              inputMode: "audio_mp3",
            });
            return send(res, 200, { ok: true, session });
          }
          session.draft.referenceAudio = {
            url: normalizeText(file?.url || "", 2000),
            key: normalizeText(file?.key || "", 500),
            fileName: normalizeText(file?.fileName || "", 200),
            contentType,
            size: Number(file?.size || 0),
          };
          const nextTaskId = makeMessageId("transcribe");
          session.step = "generate-audio-polling";
          session.draft.pendingTaskId = nextTaskId;
          session.draft.pendingKind = "transcribe-lyrics";
          session.draft.pendingStartedAt = Date.now();
          session.draft.pendingFlow = "generate";
          setComposer(session, "disabled", "Transcribiendo letra…", "Enviar");
          upsertStatusMessage(session, `transcribe:${nextTaskId}`, "Audio cargado. Confirmando autorización y transcribiendo…");
          return send(res, 200, { ok: true, session });
        }

        if (session.step === "generate-lyrics" && eventType === "message" && eventText) {
          session.draft.originalLyrics = eventText;
          const review = await reviewLyricsWithAnthropic(eventText);
          session.draft.correctedLyrics = review.correctedLyrics;
          if (review.hasIssues && normalizeText(review.correctedLyrics, 12000) !== normalizeText(eventText, 12000)) {
            session.step = "generate-lyrics-fix";
            setComposer(session, "disabled", "Elige una opción…", "Enviar");
            pushAssistant(
              session,
              `Detectamos algunos errores de escritura.\n\n${review.summary}\n\n¿Quieres que los corrijamos?`,
              {
                quickReplies: [
                  { id: "lyrics-fix-yes", label: "Sí, corrígelos", value: "generate:lyrics:apply-fix", icon: "check", variant: "primary" },
                  { id: "lyrics-fix-no", label: "Déjala original", value: "generate:lyrics:keep-original", icon: "edit", variant: "secondary" },
                ],
                inputMode: "disabled",
              },
            );
            return send(res, 200, { ok: true, session });
          }
          session.draft.lyrics = eventText;
          askGenre(session);
          return send(res, 200, { ok: true, session });
        }

        if (session.step === "generate-lyrics-fix" && eventType === "quick_reply") {
          if (eventValue === "generate:lyrics:apply-fix") session.draft.lyrics = normalizeText(session.draft.correctedLyrics || session.draft.originalLyrics || "", 12000);
          if (eventValue === "generate:lyrics:keep-original") session.draft.lyrics = normalizeText(session.draft.originalLyrics || "", 12000);
          askGenre(session);
          return send(res, 200, { ok: true, session });
        }

        if (session.step === "generate-ai-lyrics-confirm" && eventType === "quick_reply") {
          if (eventValue === "generate:ai-lyrics:yes") {
            session.draft.wantsAiLyrics = true;
            session.step = "generate-ai-topic";
            setComposer(session, "multiline", "¿De qué debe tratar la canción?", "Guardar tema");
            pushAssistant(session, "Perfecto. ¿Sobre qué debe tratar la canción?", { inputMode: "multiline" });
            return send(res, 200, { ok: true, session });
          }
          if (eventValue === "generate:ai-lyrics:no") {
            session.draft.wantsAiLyrics = false;
            session.step = "generate-prompt-topic";
            setComposer(session, "multiline", "Cuéntame la idea principal de la canción…", "Guardar idea");
            pushAssistant(session, "Cuéntame la idea principal y yo la usaré como base para generar la canción.", { inputMode: "multiline" });
            return send(res, 200, { ok: true, session });
          }
        }

        if (session.step === "generate-ai-topic" && eventType === "message" && eventText) {
          session.draft.topic = eventText;
          const generated = await generateLyricsWithAnthropic(eventText, session.draft.genre || "General", session.draft.extraInstructions || "");
          if (!generated.ok || !generated.lyrics) {
            pushAssistant(session, `No pude generar la letra ahorita: ${generated.ok ? "sin respuesta" : generated.error}`, {
              quickReplies: [{ id: "ai-topic-retry", label: "Intentar otra vez", value: "generate:ai-lyrics:yes", icon: "refresh", variant: "primary" }],
            });
            return send(res, 200, { ok: true, session });
          }
          session.draft.lyrics = generated.lyrics;
          pushAssistant(session, `Ya te armé una letra original:\n\n${generated.lyrics}`);
          askGenre(session);
          return send(res, 200, { ok: true, session });
        }

        if (session.step === "generate-prompt-topic" && eventType === "message" && eventText) {
          session.draft.promptIdea = eventText;
          session.draft.topic = eventText;
          askGenre(session);
          return send(res, 200, { ok: true, session });
        }

        if (session.step === "generate-genre") {
          if (eventType === "quick_reply" && eventValue.startsWith("genre:")) {
            const genre = eventValue.replace(/^genre:/, "").trim();
            if (genre === "other") {
              session.step = "generate-genre-other";
              setComposer(session, "text", "Escribe tu género…", "Guardar");
              pushAssistant(session, "Escríbeme el género que quieres.", { inputMode: "text" });
              return send(res, 200, { ok: true, session });
            }
            session.draft.genre = genre;
            askExtraInstructions(session);
            return send(res, 200, { ok: true, session });
          }
        }

        if (session.step === "generate-genre-other" && eventType === "message" && eventText) {
          session.draft.genre = eventText;
          askExtraInstructions(session);
          return send(res, 200, { ok: true, session });
        }

        if (session.step === "generate-extra") {
          if (eventType === "quick_reply" && eventValue === "generate:extra:skip") {
            session.draft.extraInstructions = "";
            askGenerateConfirm(session);
            return send(res, 200, { ok: true, session });
          }
          if (eventType === "message") {
            session.draft.extraInstructions = eventText;
            askGenerateConfirm(session);
            return send(res, 200, { ok: true, session });
          }
        }

        if (session.step === "generate-confirm" && eventType === "quick_reply") {
          if (eventValue === "generate:confirm") {
            await startGenerate(req, session);
            return send(res, 200, { ok: true, session });
          }
          if (eventValue === "generate:adjust") {
            session.step = "generate-extra";
            setComposer(session, "multiline", "Escribe lo que quieres ajustar…", "Guardar");
            pushAssistant(session, "Dime qué quieres ajustar y lo vuelvo a preparar.", { inputMode: "multiline" });
            return send(res, 200, { ok: true, session });
          }
        }

        if (session.step === "generate-polling") {
          await pollPendingTask(req, auth, session);
          return send(res, 200, { ok: true, session });
        }

        if (session.step === "generate-ready" && eventType === "quick_reply") {
          if (eventValue === "generate:service:separate") {
            await askSongVersionForService(auth, session, "separate");
            return send(res, 200, { ok: true, session });
          }
          if (eventValue === "generate:service:video") {
            await askSongVersionForService(auth, session, "video");
            return send(res, 200, { ok: true, session });
          }
        }

        if (
          (session.step === "generate-service-separate-song" || session.step === "generate-service-video-song") &&
          eventType === "quick_reply" &&
          eventValue.startsWith("generate:service:")
        ) {
          const parts = eventValue.split(":");
          const service = normalizeText(parts[2] || "", 40);
          const songId = normalizeText(parts[4] || "", 200);
          const songs = await getSongsByIds(auth.admin, auth.user.id, session.draft.pendingSongIds || []);
          const picked = songs.find((x: any) => x.id === songId);
          if (!picked) {
            pushAssistant(session, "No encontré esa versión. Intenta otra vez.", {
              quickReplies: [{ id: "service-home-missing", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
            });
            return send(res, 200, { ok: true, session });
          }
          session.draft.selectedSongId = picked.id;
          session.draft.selectedSongTitle = picked.title;
          session.draft.selectedSongTaskId = picked.sunoTaskId || "";
          session.draft.selectedSongAudioId = picked.sunoAudioId || "";
          if (service === "separate") {
            session.draft.pendingKind = "separate_vocal";
            await startSeparate(req, session);
            return send(res, 200, { ok: true, session });
          }
          if (service === "video") {
            await startVideo(req, auth, session);
            return send(res, 200, { ok: true, session });
          }
        }

        if (session.step === "video-polling") {
          await pollPendingTask(req, auth, session);
          return send(res, 200, { ok: true, session });
        }

      }

      if (session.flow === "cover") {
        if (eventType === "quick_reply" && eventValue === "cover:retry-audio") {
          session.step = "cover-audio";
          setComposer(session, "audio", "Súbeme el MP3 para hacer el cover…", "Enviar");
          pushAssistant(session, "Súbeme el MP3 que quieres usar para el cover.", { inputMode: "audio" });
          return send(res, 200, { ok: true, session });
        }

        if (eventType === "quick_reply" && eventValue === "cover:lyrics:manual") {
          session.step = "cover-lyrics-manual";
          setComposer(session, "multiline", "Pega aquí la letra…", "Guardar");
          pushAssistant(session, "Pega aquí la letra manualmente.", { inputMode: "multiline" });
          return send(res, 200, { ok: true, session });
        }

        if (session.step === "cover-audio" && eventType === "file" && file) {
          const contentType = normalizeText(file?.contentType || "", 120).toLowerCase();
          const fileNameLower = normalizeText(file?.fileName || "", 200).toLowerCase();
          const isMp3 = contentType === "audio/mpeg" || fileNameLower.endsWith(".mp3");
          if (!isMp3) {
            pushAssistant(session, "Ese archivo no está en MP3. Convierte tu audio aquí y luego súbelo otra vez: https://online-audio-converter.com/sp/", {
              inputMode: "audio",
              quickReplies: [{ id: "cover-home-bad-file", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
            });
            return send(res, 200, { ok: true, session });
          }

          session.draft.coverAudio = {
            url: normalizeText(file?.url || "", 2000),
            key: normalizeText(file?.key || "", 500),
            fileName: normalizeText(file?.fileName || "", 200),
            contentType: contentType,
            size: Number(file?.size || 0),
          };
          session.draft.referenceAudio = session.draft.coverAudio;
          const nextTaskId = makeMessageId("transcribe");
          session.step = "cover-transcribe-polling";
          session.draft.pendingTaskId = nextTaskId;
          session.draft.pendingKind = "transcribe-lyrics";
          session.draft.pendingStartedAt = Date.now();
          session.draft.pendingFlow = "cover";
          setComposer(session, "disabled", "Transcribiendo letra…", "Enviar");
          upsertStatusMessage(session, `transcribe:${nextTaskId}`, "Audio cargado. Confirmando autorización y transcribiendo…");
          return send(res, 200, { ok: true, session });
        }

        if (session.step === "cover-lyrics-confirm" && eventType === "quick_reply") {
          if (eventValue === "cover:lyrics:ok") {
            session.step = "cover-genre";
            setComposer(session, "multiline", "Dime el género musical…", "Guardar");
            pushAssistant(session, "Ahora dime el género musical.", {
              quickReplies: [...genreReplies(), { id: "cover-genre-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
              inputMode: "multiline",
            });
            return send(res, 200, { ok: true, session });
          }
          if (eventValue === "cover:lyrics:manual") {
            session.step = "cover-lyrics-manual";
            setComposer(session, "multiline", "Pega aquí la letra…", "Guardar");
            pushAssistant(session, "Pega aquí la letra manualmente.", { inputMode: "multiline" });
            return send(res, 200, { ok: true, session });
          }
        }

        if (session.step === "cover-lyrics-manual" && eventType === "message" && eventText) {
          session.draft.coverLyrics = eventText;
          session.step = "cover-genre";
          setComposer(session, "multiline", "Dime el género musical…", "Guardar");
          pushAssistant(session, "Ahora dime el género musical.", {
            quickReplies: [...genreReplies(), { id: "cover-genre-home-2", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
            inputMode: "multiline",
          });
          return send(res, 200, { ok: true, session });
        }

        if (session.step === "cover-genre") {
          if (eventType === "quick_reply" && eventValue.startsWith("genre:")) {
            session.draft.genre = eventValue.replace("genre:", "").trim();
          }
          if (eventType === "message" && eventText) {
            session.draft.genre = eventText;
          }
          if ((eventType === "message" && eventText) || (eventType === "quick_reply" && eventValue.startsWith("genre:"))) {
            session.step = "cover-extra";
            setComposer(session, "multiline", "Escribe indicaciones extra (opcional)…", "Guardar");
            pushAssistant(session, "Ahora dime cualquier detalle extra (opcional). Si no tienes, puedes omitirlo.", {
              quickReplies: [{ id: "cover-skip-extra", label: "Sin indicaciones", value: "cover:extra:skip", icon: "arrow-right", variant: "secondary" }],
              inputMode: "multiline",
            });
            return send(res, 200, { ok: true, session });
          }
        }

        if (session.step === "cover-extra") {
          if (eventType === "message") session.draft.extraInstructions = eventText;
          if ((eventType === "message" && eventText) || (eventType === "quick_reply" && eventValue === "cover:extra:skip")) {
            session.step = "cover-confirm";
            setComposer(session, "disabled", "Confirma para generar…", "Enviar");
            const summary: string[] = [];
            if (session.draft.genre) summary.push(`Género: ${session.draft.genre}`);
            if (session.draft.extraInstructions) summary.push(`Detalles: ${session.draft.extraInstructions}`);
            pushAssistant(session, `Listo.\n\n${summary.filter(Boolean).join("\n")}\n\n¿Genero el cover así?`, {
              quickReplies: [
                { id: "cover-confirm", label: "Generar cover", value: "cover:confirm", icon: "sparkles", variant: "primary" },
                { id: "cover-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
              ],
              inputMode: "disabled",
            });
            return send(res, 200, { ok: true, session });
          }
        }

        if (session.step === "cover-confirm" && eventType === "quick_reply" && eventValue === "cover:confirm") {
          await startCover(req, session);
          return send(res, 200, { ok: true, session });
        }

        if (session.step === "cover-transcribe-polling") {
          await pollPendingTask(req, auth, session);
          return send(res, 200, { ok: true, session });
        }
        if (session.step === "cover-polling") {
          await pollPendingTask(req, auth, session);
          return send(res, 200, { ok: true, session });
        }
      }

      if (session.flow === "separate") {
        if (session.step === "separate-song" && eventType === "quick_reply" && eventValue.startsWith("separate:song:")) {
          const songId = eventValue.replace("separate:song:", "").trim();
          const songs = await getRecentSongs(auth.admin, auth.user.id, 10);
          const picked = songs.find((x: any) => x.id === songId);
          if (!picked) {
            pushAssistant(session, "No encontré esa canción. Intenta otra vez.");
            return send(res, 200, { ok: true, session });
          }
          session.draft.selectedSongId = picked.id;
          session.draft.selectedSongTitle = picked.title;
          session.draft.selectedSongTaskId = picked.sunoTaskId || "";
          session.draft.selectedSongAudioId = picked.sunoAudioId || "";
          session.step = "separate-type";
          setComposer(session, "disabled", "Elige el tipo…", "Enviar");
          pushAssistant(session, `¿Qué quieres sacar de "${picked.title}"?`, {
            quickReplies: [
              { id: "sep-karaoke", label: "Karaoke (sin voz)", value: "separate:type:separate_vocal", icon: "mic-off", variant: "primary" },
              { id: "sep-stems", label: "Stems (12 pistas)", value: "separate:type:split_stem", icon: "layers", variant: "secondary" },
              { id: "sep-home-back", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" },
            ],
          });
          return send(res, 200, { ok: true, session });
        }
        if (session.step === "separate-type" && eventType === "quick_reply" && eventValue.startsWith("separate:type:")) {
          session.draft.pendingKind = eventValue.replace("separate:type:", "").trim();
          await startSeparate(req, session);
          return send(res, 200, { ok: true, session });
        }
        if (session.step === "separate-polling") {
          await pollPendingTask(req, auth, session);
          return send(res, 200, { ok: true, session });
        }
      }

      if (session.flow === "mastering") {
        if (session.step === "mastering-audio" && eventType === "file" && file) {
          const contentType = normalizeText(file?.contentType || "", 120).toLowerCase();
          const fileName = normalizeText(file?.fileName || "", 200).toLowerCase();
          const isMp3 = contentType === "audio/mpeg" || fileName.endsWith(".mp3");
          if (!isMp3) {
            pushAssistant(session, "Ese archivo no está en MP3. Convierte tu audio aquí y luego súbelo otra vez: https://online-audio-converter.com/sp/", {
              inputMode: "audio_mp3",
              quickReplies: [{ id: "master-bad-file-home", label: "Menú principal", value: "menu:home", icon: "home", variant: "ghost" }],
            });
            return send(res, 200, { ok: true, session });
          }
          session.draft.masteringAudio = {
            url: normalizeText(file?.url || "", 2000),
            key: normalizeText(file?.key || "", 500),
            fileName: normalizeText(file?.fileName || "", 200),
            contentType,
            size: Number(file?.size || 0),
          };
          await startMastering(req, session);
          return send(res, 200, { ok: true, session });
        }
      }

      pushAssistant(session, "Te sigo ayudando. Si quieres, toca una opción del menú para continuar.", {
        quickReplies: mainMenuReplies(),
      });
      return send(res, 200, { ok: true, session });
    } catch (e) {
      return send(res, 500, { error: "No pude procesar el chat", detail: e instanceof Error ? e.message : String(e), session });
    }
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "luciana-bot") return send(res, 404, { error: "Ruta no encontrada" });
    if (next === "chat") return handleChat(req, res);
    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

const affiliatesHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function originFromReq(req: any) {
    const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
    return `${proto}://${host}`;
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const authHeader = (req.headers.authorization || "").toString();
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  const createTablesSql = `create extension if not exists pgcrypto;

create table if not exists public.affiliate_accounts (
  user_id uuid primary key,
  code text unique not null,
  payout_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null,
  referred_user_id uuid not null unique,
  referred_full_name text,
  created_at timestamptz default now()
);

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null,
  referred_user_id uuid not null,
  payment_id text not null unique,
  pack_key text,
  amount_mxn numeric default 0,
  status text default 'pending',
  detail text,
  payout_payment_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.affiliate_accounts enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.affiliate_commissions enable row level security;

drop policy if exists "affiliate_accounts_select_own" on public.affiliate_accounts;
create policy "affiliate_accounts_select_own" on public.affiliate_accounts for select to authenticated using (auth.uid() = user_id);
drop policy if exists "affiliate_accounts_update_own" on public.affiliate_accounts;
create policy "affiliate_accounts_update_own" on public.affiliate_accounts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "affiliate_referrals_select_own" on public.affiliate_referrals;
create policy "affiliate_referrals_select_own" on public.affiliate_referrals for select to authenticated using (auth.uid() = affiliate_user_id);

drop policy if exists "affiliate_commissions_select_own" on public.affiliate_commissions;
create policy "affiliate_commissions_select_own" on public.affiliate_commissions for select to authenticated using (auth.uid() = affiliate_user_id);

notify pgrst, 'reload schema';`;

  async function handleMe(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const userId = auth.user.id;
    try {
      const ensured = await ensureAffiliateAccount(auth.admin, userId);
      if (!ensured.ok) return send(res, 500, { error: ensured.error || "No pude preparar tu cuenta" });
      const acc: any = ensured.account || {};

      const is_admin = isAdminEmail(auth.user.email);
      const plan = await getUserPlan(auth.admin, userId).catch(() => ({ plan_active: false }));
      const plan_active = is_admin ? true : Boolean((plan as any)?.plan_active);

      const { data: refRows } = await auth.admin
        .from("affiliate_referrals")
        .select("referred_user_id, referred_full_name")
        .eq("affiliate_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      const refs = Array.isArray(refRows) ? refRows : [];

      const active: Array<{ user_id: string; full_name: string }> = [];
      const inactive: Array<{ user_id: string; full_name: string }> = [];
      for (const r of refs) {
        const rid = String((r as any)?.referred_user_id || "").trim();
        if (!rid) continue;
        const p = await getUserPlan(auth.admin, rid).catch(() => ({ plan_active: false }));
        const name = String((r as any)?.referred_full_name || "").trim();
        const referral = { user_id: rid, full_name: name || "Usuario" };
        
        if (Boolean((p as any)?.plan_active)) {
          active.push(referral);
        } else {
          inactive.push(referral);
        }
        
        if (active.length + inactive.length >= 200) break;
      }

      const { data: cRows } = await auth.admin
        .from("affiliate_commissions")
        .select("amount_mxn, status")
        .eq("affiliate_user_id", userId)
        .limit(5000);
      const comm = Array.isArray(cRows) ? cRows : [];
      const sumBy = (st: string[]) =>
        comm
          .filter((x: any) => st.includes(String(x?.status || "")))
          .reduce((a: number, x: any) => a + (Number(x?.amount_mxn ?? 0) || 0), 0);

      const stats = {
        referrals_total: refs.length,
        referrals_active: active.length,
        commissions_paid_mxn: sumBy(["paid"]),
        commissions_pending_mxn: sumBy(["pending", "pending_destination"]),
        commissions_blocked_mxn: sumBy(["blocked"]),
      };

      const code = String(acc?.code || "").trim();
      const link = code ? `${originFromReq(req)}/?ref=${encodeURIComponent(code)}` : "";
      return send(res, 200, {
        ok: true,
        code,
        link,
        plan_active,
        is_admin,
        payout_email: acc?.payout_email ?? null,
        stats,
        active_referrals: active,
        inactive_referrals: inactive,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const lower = msg.toLowerCase();
      const missingTable = lower.includes("could not find the table") || (lower.includes("relation") && lower.includes("does not exist"));
      return send(res, 500, {
        error: "No pude cargar Afiliados",
        detail: msg,
        hint: missingTable ? "Faltan tablas de Afiliados en Supabase. Crea las tablas y recarga el schema cache." : undefined,
        sql: missingTable ? createTablesSql : undefined,
      });
    }
  }

  async function handlePayoutEmail(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const payoutEmail = (typeof body?.payoutEmail === "string" ? body.payoutEmail : "").toString().trim().slice(0, 160);
    if (!payoutEmail) return send(res, 400, { error: "Falta correo de Mercado Pago" });

    try {
      const ensured = await ensureAffiliateAccount(auth.admin, auth.user.id);
      if (!ensured.ok) return send(res, 500, { error: ensured.error || "No pude preparar tu cuenta" });
      const upd = await auth.admin
        .from("affiliate_accounts")
        .update({ payout_email: payoutEmail, updated_at: new Date().toISOString() })
        .eq("user_id", auth.user.id);
      if (upd?.error) return send(res, 500, { error: "No pude guardar", detail: upd.error.message });
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, 500, { error: "No pude guardar", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "affiliates") return send(res, 404, { error: "Ruta no encontrada" });
    const action = (pickQuery(req, "action") || "").toString().trim().toLowerCase();
    const a = action || (next || "").toLowerCase();
    if (a === "me") return handleMe(req, res);
    if (a === "payout-email") return handlePayoutEmail(req, res);
    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

const appHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "app") return send(res, 404, { error: "Ruta no encontrada" });

    let action = "";
    try {
      action = (pickQuery(req, "action") || "").toString();
    } catch {
      action = "";
    }
    action = action.trim().toLowerCase();
    const a = action || (next || "").toLowerCase();

    if (a === "version") {
      if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
      res.setHeader("cache-control", "no-store, max-age=0, s-maxage=0, must-revalidate");
      res.setHeader("pragma", "no-cache");
      res.setHeader("expires", "0");
      const versionRaw =
        (process.env.VERCEL_GIT_COMMIT_SHA || "").toString().trim() ||
        (process.env.VERCEL_DEPLOYMENT_ID || "").toString().trim() ||
        (process.env.GITHUB_SHA || "").toString().trim() ||
        "local";
      const version = versionRaw.slice(0, 80);
      const deployedAt = (process.env.VERCEL_DEPLOYMENT_ID || "").toString().trim().slice(0, 120) || null;
      return send(res, 200, { ok: true, version, deployed_at: deployedAt });
    }

    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

const kitsVoicesHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function firstString(obj: any, keys: string[]): string {
    if (!obj || typeof obj !== "object") return "";
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = (req.headers.authorization || "").toString();
    const bearerToken = token.toLowerCase().startsWith("bearer ") ? token.slice(7).trim() : "";
    if (!bearerToken) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearerToken);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  return async function handler(req: any, res: any) {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;
    const parts = pathname.split("/").filter(Boolean);
    
    // Verificar si es una ruta específica como /api/kits/voice-conversions/:id
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    const third = isApi ? parts[3] : parts[2];
    
    if (head === "kits" && next === "voice-conversions" && third) {
      // Es una solicitud para obtener el estado de una conversión específica
      const conversionId = third;
      
      if ((req.method || "").toUpperCase() === "GET") {
        const auth = await requireUser(req);
        if (!auth.ok) return send(res, auth.status, { error: auth.error });

        try {
          // Primero verificar si la voz pertenece al usuario
          const { data: voice, error } = await auth.admin
            .from("kits_voices")
            .select("*")
            .eq("voice_id", conversionId)
            .eq("user_id", auth.user.id)
            .single();

          if (error) {
            if (error.code === "PGRST116") {
              return send(res, 404, { error: "Conversión no encontrada" });
            }
            throw error;
          }

          // Consultar el estado en la API de Arpeggi
          const apiKey = process.env.ARPEGGI_API_KEY || process.env.KITS_API_KEY;
          if (!apiKey) {
            return send(res, 500, { error: "Falta API key de Arpeggi/Kits" });
          }

          const response = await fetch(`https://arpeggi.io/api/kits/v1/voice-conversions/${conversionId}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
            },
          });

          if (!response.ok) {
            if (response.status === 404) {
              return send(res, 404, { error: "Conversión no encontrada en Arpeggi" });
            }
            const errorData = await response.json().catch(() => ({}));
            return send(res, response.status, { 
              error: "Error consultando estado", 
              detail: errorData?.error || `HTTP ${response.status}` 
            });
          }

          const conversionData = await response.json();
          
          // Actualizar el estado en nuestra base de datos
          let newStatus = "processing";
          if (conversionData.status === "completed" || conversionData.status === "succeeded") {
            newStatus = "ready";
          } else if (conversionData.status === "failed" || conversionData.status === "error") {
            newStatus = "failed";
          }
          
          if (voice.status !== newStatus) {
            await auth.admin
              .from("kits_voices")
              .update({ status: newStatus })
              .eq("id", voice.id);
          }

          return send(res, 200, { 
            conversion: {
              ...conversionData,
              local_status: newStatus,
              voice_name: voice.voice_name,
              description: voice.description
            }
          });
        } catch (e) {
          return send(res, 500, { error: "Error obteniendo estado de conversión", detail: e instanceof Error ? e.message : String(e) });
        }
      } else {
        return send(res, 405, { error: "Método no permitido" });
      }
    }
    
    // Rutas originales para /api/kits/voices
    if ((req.method || "").toUpperCase() === "GET") {
      const auth = await requireUser(req);
      if (!auth.ok) return send(res, auth.status, { error: auth.error });

      try {
        const { data: voices, error } = await auth.admin
          .from("kits_voices")
          .select("*")
          .eq("user_id", auth.user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        const out: any[] = Array.isArray(voices) ? voices : [];
        const refreshSignedUrlField = async (row: any, field: string) => {
          const raw = row?.[field];
          if (typeof raw !== "string" || !raw.trim()) return;
          const s = raw.trim();
          const looksSigned = s.includes("X-Amz-Signature=") || s.includes("X-Amz-Algorithm=");
          if (!looksSigned) return;
          try {
            const u = new URL(s);
            const key = (u.pathname || "").replace(/^\/+/, "");
            if (!key) return;
            const okPrefix =
              key.startsWith("uploads/") ||
              key.startsWith("personas/") ||
              key.startsWith("rvc_datasets/") ||
              key.startsWith("covers/");
            if (!okPrefix) return;
            const refreshed = await getSignedR2Url(key, 60 * 60 * 2);
            if (typeof refreshed === "string" && refreshed.trim()) row[field] = refreshed.trim();
          } catch {
          }
        };

        for (const v of out) {
          await refreshSignedUrlField(v, "sample_url");
          await refreshSignedUrlField(v, "profile_image_url");
        }

        return send(res, 200, { voices: out });
      } catch (e) {
        return send(res, 500, { error: "Error obteniendo voces", detail: e instanceof Error ? e.message : String(e) });
      }
    } else if ((req.method || "").toUpperCase() === "DELETE") {
      const auth = await requireUser(req);
      if (!auth.ok) return send(res, auth.status, { error: auth.error });

      const payload = parseJsonBody(req);
      const voiceId = firstString(payload, ["voiceId", "voice_id"]);

      if (!voiceId) return send(res, 400, { error: "Falta voiceId" });

      try {
        const { error } = await auth.admin
          .from("kits_voices")
          .delete()
          .eq("id", voiceId)
          .eq("user_id", auth.user.id);

        if (error) throw error;

        return send(res, 200, { ok: true, message: "Voz eliminada" });
      } catch (e) {
        return send(res, 500, { error: "Error eliminando voz", detail: e instanceof Error ? e.message : String(e) });
      }
    } else if ((req.method || "").toUpperCase() === "PATCH") {
      const auth = await requireUser(req);
      if (!auth.ok) return send(res, auth.status, { error: auth.error });

      const payload = parseJsonBody(req);
      const voiceId = firstString(payload, ["voiceId", "voice_id"]);
      const voiceName = firstString(payload, ["voiceName", "voice_name"]);
      const profileImageUrl = firstString(payload, ["profileImageUrl", "profile_image_url"]);

      if (!voiceId) return send(res, 400, { error: "Falta voiceId" });

      const patch: any = { updated_at: new Date().toISOString() };
      if (voiceName) patch.voice_name = voiceName.slice(0, 120);
      if (profileImageUrl) patch.profile_image_url = profileImageUrl.slice(0, 2000);

      const keys = Object.keys(patch).filter((k) => k !== "updated_at");
      if (keys.length === 0) return send(res, 400, { error: "No hay cambios" });

      try {
        const { data, error } = await auth.admin
          .from("kits_voices")
          .update(patch)
          .eq("id", voiceId)
          .eq("user_id", auth.user.id)
          .select("*")
          .maybeSingle();

        if (error) throw error;
        if (!data) return send(res, 404, { error: "Voz no encontrada" });
        return send(res, 200, { ok: true, voice: data });
      } catch (e) {
        return send(res, 500, { error: "Error actualizando voz", detail: e instanceof Error ? e.message : String(e) });
      }
    } else {
      return send(res, 405, { error: "Método no permitido" });
    }
  };
})();

const uploadAudioHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function safeFileName(name: string) {
    const s = (name || "").toString().trim();
    const cleaned = s.replaceAll("\\", "/").split("/").pop() || "audio.mp3";
    return cleaned.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "audio.mp3";
  }

  function fileArrayToUint8(arr: any): Uint8Array | null {
    if (!Array.isArray(arr)) return null;
    const out = new Uint8Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const n = Number(arr[i]);
      if (!Number.isFinite(n)) return null;
      out[i] = Math.max(0, Math.min(255, Math.trunc(n)));
    }
    return out;
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = (req.headers.authorization || "").toString();
    const bearerToken = token.toLowerCase().startsWith("bearer ") ? token.slice(7).trim() : "";
    if (!bearerToken) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearerToken);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin, supabaseUrl };
  }

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const bucket = "ramber-tunes";
    const title = typeof payload?.title === "string" ? payload.title.trim() : "audio.mp3";
    const contentType = (typeof payload?.contentType === "string" ? payload.contentType.trim() : "audio/mpeg") || "audio/mpeg";
    const fname = safeFileName(title);
    const rand = Math.random().toString(36).slice(2, 10);
    const key = `uploads/audio/${auth.user.id}/${Date.now()}_${rand}_${fname}`;
    const userId = String(auth.user.id || "");

    try {
      // Intentar usar R2 si está configurado
      let inline: Uint8Array | null = null;
      let inlineSizeBytes = 0;
      if (typeof payload?.file === "string") {
        const b64 = payload.file.includes(",") ? payload.file.split(",")[1] : payload.file;
        inline = new Uint8Array(Buffer.from(b64, "base64"));
      } else {
        inline = fileArrayToUint8(payload?.file);
      }
      inlineSizeBytes = inline ? inline.byteLength : 0;

      if (inline) {
        const maxBytes = 3 * 1024 * 1024; // 3 MB - seguro bajo el límite Vercel (~4.5MB) para evitar FUNCTION_PAYLOAD_TOO_LARGE
        if (inline.byteLength > maxBytes) {
          try { console.error(JSON.stringify({ kind: "UPLOAD_AUDIO_HANDLER", userId, mode: "inline_rejected_oversize", key, sizeBytes: inlineSizeBytes, maxBytes, contentType, fname })); } catch {}
          return send(res, 413, {
            ok: false,
            error: "Audio muy pesado",
            message: "Ese MP3 está muy pesado para subirlo por el servidor. Se usará subida directa a Supabase Storage.",
          });
        }
        try {
          const t0 = Date.now();
          await uploadToR2(key, inline, contentType);
          const dt = Date.now() - t0;
          const url = await getSignedR2Url(key, 60 * 60 * 2);
          try { console.log(JSON.stringify({ kind: "UPLOAD_AUDIO_HANDLER", userId, mode: "inline_r2_ok", key, sizeBytes: inlineSizeBytes, contentType, fname, durationMs: dt, via: "server_r2" })); } catch {}
          return send(res, 200, { ok: true, url, key, contentType, via: "server_r2" });
        } catch (r2Error) {
          const r2Msg = r2Error instanceof Error ? r2Error.message : String(r2Error || "");
          try { console.error(JSON.stringify({ kind: "UPLOAD_AUDIO_HANDLER", userId, mode: "inline_r2_failed", key, sizeBytes: inlineSizeBytes, contentType, fname, error: r2Msg.slice(0, 500) })); } catch {}
          try {
            const t0 = Date.now();
            const up = await auth.admin.storage.from(bucket).upload(key, inline, { contentType, upsert: true });
            if (up.error) throw up.error;
            const signed = await auth.admin.storage.from(bucket).createSignedUrl(key, 60 * 60 * 2);
            if (signed.error) throw signed.error;
            const raw = (signed.data as any)?.signedUrl || "";
            const url = /^https?:\/\//i.test(String(raw)) ? String(raw) : new URL(String(raw || ""), auth.supabaseUrl || process.env.SUPABASE_URL || "").toString();
            const dt = Date.now() - t0;
            try { console.log(JSON.stringify({ kind: "UPLOAD_AUDIO_HANDLER", userId, mode: "inline_supabase_ok", key, sizeBytes: inlineSizeBytes, contentType, fname, durationMs: dt, via: "server_supabase" })); } catch {}
            return send(res, 200, { ok: true, url, key, contentType, via: "server_supabase" });
          } catch (supErr) {
            const supMsg = supErr instanceof Error ? supErr.message : String(supErr || "");
            try { console.error(JSON.stringify({ kind: "UPLOAD_AUDIO_HANDLER", userId, mode: "inline_supabase_failed", key, sizeBytes: inlineSizeBytes, contentType, fname, error: supMsg.slice(0, 500) })); } catch {}
            throw supErr;
          }
        }
      }

      try {
        const uploadUrl = await getSignedR2PutUrl(key, contentType, 60 * 10);
        const url = await getSignedR2Url(key, 60 * 60 * 2);
        try { console.log(JSON.stringify({ kind: "UPLOAD_AUDIO_HANDLER", userId, mode: "direct_prep_ok", key, contentType, fname, via: "direct", signedPut: true })); } catch {}
        return send(res, 200, { ok: true, uploadUrl, url, key, contentType, via: "direct" });
      } catch (r2Error) {
        const msg = r2Error instanceof Error ? r2Error.message : String(r2Error || "");
        const isMissingEnv = /Missing required R2 environment variables/i.test(msg || "");
        try { console.error(JSON.stringify({ kind: "UPLOAD_AUDIO_HANDLER", userId, mode: "direct_prep_failed", key, contentType, fname, error: msg.slice(0, 500), missingEnv: isMissingEnv })); } catch {}
        return send(res, 200, {
          ok: false,
          error: isMissingEnv ? "Falta configurar Cloudflare R2 en Vercel - subiendo por servidor" : "No pude preparar la subida del audio",
          detail: isMissingEnv ? "Falta configurar Cloudflare R2 en Vercel - vuelve a intentar para subir por servidor." : "R2 no está configurado para subida directa. Vuelve a intentar para subir por servidor."
        });
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const msg = /Missing required R2 environment variables/i.test(detail || "")
        ? "Falta configurar Cloudflare R2 en Vercel - subiendo por servidor"
        : "No pude preparar la subida del audio";
      try { console.error(JSON.stringify({ kind: "UPLOAD_AUDIO_HANDLER", userId, mode: "global_catch", key: (key || "").slice(0, 200), contentType, fname, error: String(detail || "").slice(0, 800) })); } catch {}
      return send(res, 500, { ok: false, error: msg, detail });
    }
  };
})();

const uploadAudioSupabaseHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body ?? null;
  }

  function safeFileName(name: string) {
    const s = (name || "").toString().trim();
    const cleaned = s.replaceAll("\\", "/").split("/").pop() || "audio.mp3";
    return cleaned.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "audio.mp3";
  }

  function fileArrayToUint8(arr: any): Uint8Array | null {
    if (!Array.isArray(arr)) return null;
    const out = new Uint8Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const n = Number(arr[i]);
      if (!Number.isFinite(n)) return null;
      out[i] = n & 0xff;
    }
    return out;
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL as string | undefined || "";
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY as string | undefined || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined || "";
    if (!supabaseUrl || !supabaseAnonKey || !supabaseService) {
      return { ok: false as const, status: 500, error: "Falta configurar Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)." };
    }
    const createClient = await getSupabaseCreateClient();
    const token = (req.headers["authorization"] || "").toString().trim().replace(/^Bearer\s+/i, "").trim();
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };
    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin, supabaseUrl };
  }

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const bucket = "ramber-tunes";
    const wantFetchUrl = typeof payload?.fetchSignedUrl === "boolean" ? !!payload.fetchSignedUrl : String(payload?.mode || "").toLowerCase() === "fetchsignedurl";
    const keyInPayload = (payload?.key || payload?.path || "").toString().trim();
    const userId = String(auth.user.id || "");

    try {
      // MODO ESPECIAL: Segunda llamada DESPUÉS de que el cliente terminó de subir (POST multipart).
      if (wantFetchUrl && keyInPayload) {
        let safeKey = keyInPayload.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/^\/+/, "").slice(0, 500);
        if (!safeKey || !/^(uploads\/(audio|avatars|profiles|))\//i.test(safeKey + "/")) {
          try { console.error(JSON.stringify({ kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: "fetch_signed_denied_path", key: safeKey.slice(0, 200) })); } catch {}
          return send(res, 403, { ok: false, error: "Ruta no permitida para firmar URL" });
        }
        try {
          const t0 = Date.now();
          try {
            const now = new Date().toISOString();
            let ownerUpdOk = false;
            try {
              const { error: errA } = await auth.admin
                .schema("storage")
                .from("objects")
                .update({ owner_id: userId, updated_at: now } as any)
                .eq("name" as any, safeKey)
                .eq("bucket_id" as any, bucket);
              if (!errA) ownerUpdOk = true;
              else try { console.warn("[UPLOAD_AUDIO_SUPABASE] owner_id update err (schema storage, no fatal):", String((errA as any)?.message || errA || "").slice(0, 400)); } catch {}
            } catch (schemaErr) {
              try { console.warn("[UPLOAD_AUDIO_SUPABASE] owner_id update schema fail (no fatal):", String(schemaErr instanceof Error ? schemaErr.message : schemaErr || "").slice(0, 400)); } catch {}
            }
            if (ownerUpdOk) try { console.log(JSON.stringify({ kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: "owner_id_updated", key: safeKey.slice(0, 200) })); } catch {}
            else try { console.warn("[UPLOAD_AUDIO_SUPABASE] owner_id update skipped (no fatal) -> owner_id = NULL temporal, pero se reproduce OK."); } catch {}
          } catch (_e) {
            try { console.warn("[UPLOAD_AUDIO_SUPABASE] owner_id try outer (no fatal)."); } catch {}
          }

          // ================================================================
          // NUEVA ESTRATEGIA ULTRA-ROBUSTA fetchSignedUrl (v4 - sin errores de redeclaración):
          //
          // PRINCIPIO FUNDAMENTAL (corrige bug anterior):
          //   El list() por consistencia eventual devuelve a VECES el ARCHIVO ANTERIOR (aún no
          //   se ha replicado el NUEVO). Antes usábamos listedNames[0] (más reciente VISIBLE) como #1
          //   → eso era el UPLOAD ANTERIOR, no el actual. Ahora:
          //
          //   #1 PRIORIDAD SIEMPRE = keyInPayload (el EXACTO que devolvió PREP, creado en el servidor).
          //   Si ese path da Object not found → es SOLO por lag, esperamos y reintentamos.
          //
          // REINTENTOS: 8 totales, backoff exponencial 500→1500ms (espera total ~8s mínimo).
          // CADA 2 intentos → RE-LISTAMOS la carpeta para refrescar listedNames y resolvedListPath.
          // ================================================================
          const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
          const backoffForAttempt = (n: number): number => {
            if (n <= 2) return 500;
            if (n <= 4) return 750;
            if (n <= 6) return 1000;
            return 1500;
          };
          let listedNames: Array<{ name: string; fullPath: string; created_at: any; }> = [];
          const folderPath = `uploads/audio/${userId}`;

          const listFolder = async (tag: string): Promise<void> => {
            try {
              let listedFiles: any[] = [];
              try {
                const { data: listData, error: listErr } = await auth.admin.storage.from(bucket).list(
                  folderPath, { limit: 100, offset: 0, sortBy: { column: "created_at", order: "desc" } }
                );
                if (listErr) try { console.warn(`[UPLOAD_AUDIO_SUPABASE] list() err (${tag}):`, String((listErr as any)?.message || listErr || "").slice(0, 400)); } catch {}
                listedFiles = Array.isArray(listData) ? listData.slice() : [];
              } catch (lc) { listedFiles = []; }
              listedNames = listedFiles.map((f: any) => ({
                name: String(f?.name || ""),
                created_at: (f as any)?.created_at || null,
                fullPath: `${folderPath.replace(/\/+$/, "")}/${String(f?.name || "")}`,
              }));
              try { console.log(JSON.stringify({ kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: `fetchSignedUrl_list_refresh_${tag}`, folder: folderPath, count: listedNames.length, shown: listedNames.slice(0, 8) })); } catch {}
            } catch {}
          };

          const resolveFromListed = (): string => {
            try {
              // PRIMERO: coincidencia EXACTA con keyInPayload o safeKey (por si list() ya vió el nuevo archivo)
              let path = "";
              const exact = listedNames.find(n =>
                n.fullPath === keyInPayload || n.fullPath === safeKey ||
                n.fullPath.replace(/^\/+/, "") === keyInPayload.replace(/^\/+/, "") ||
                n.fullPath.replace(/^\/+/, "") === safeKey.replace(/^\/+/, "")
              );
              if (exact) return exact.fullPath;
              // SEGUNDO: coincidencia por SUFIJO (filename)
              const suffix = (keyInPayload.split("/").pop() || safeKey.split("/").pop() || "").trim();
              if (suffix) {
                const bySuffix = listedNames.find(n =>
                  n.fullPath.endsWith("/" + suffix) || n.name === suffix
                );
                if (bySuffix) return bySuffix.fullPath;
              }
              // TERCERO: el más reciente visible (SOLO como último recurso — podría ser upload anterior)
              if (listedNames.length > 0) path = listedNames[0].fullPath;
              return path;
            } catch { return ""; }
          };

          // Primer listado inicial:
          await listFolder("initial");

          const totalAttempts = 8;
          const triedKeys: Array<{ attempt: number; key: string; err: string }> = [];
          let signed: any = null;
          let finalKeyUsed = "";

          for (let attempt = 1; attempt <= totalAttempts; attempt++) {
            // Re-listar cada 2 intentos (attempts 3,5,7) → refrescar visibilidad:
            if (attempt === 3 || attempt === 5 || attempt === 7) {
              await listFolder(`refresh_attempt${attempt}`);
            }
            const resolvedListPath = resolveFromListed();

            // ---- ELEGIR QUÉ PATH PROBAR AHORA (prioridades correctas) ----
            let tryKey = "";
            // (1) Exacto keyInPayload 100% (devuelto por PREP) → #1 de #1
            if (attempt === 1 || attempt === 2 || attempt === 4 || attempt === 6) {
              tryKey = keyInPayload;
            }
            // (2) safeKey normalizado (casi siempre = keyInPayload, pero por si hubo encoding raro)
            else if (attempt === 3) {
              tryKey = keyInPayload !== safeKey ? safeKey : keyInPayload;
            }
            // (3) Intentos finales 5/7/8: probar resolvedListPath si es distinto, sino keyInPayload siempre
            else {
              if (resolvedListPath && resolvedListPath !== keyInPayload && resolvedListPath !== safeKey) {
                tryKey = resolvedListPath;
              } else {
                tryKey = keyInPayload;
              }
              // attempt 8: si safeKey es diferente a keyInPayload, probar safeKey como última bala antes del throw
              if (attempt === 8 && safeKey !== keyInPayload && !signed) {
                tryKey = safeKey;
              }
            }
            if (!tryKey) tryKey = keyInPayload || safeKey; // Nunca vacío

            // ---- PROBAR createSignedUrl ----
            try {
              try { console.log(`[UPLOAD_AUDIO_SUPABASE] fetchSignedUrl attempt=${attempt}/${totalAttempts} → tryKey=${tryKey.slice(0, 160)}`); } catch {}
              const trySigned = await auth.admin.storage.from(bucket).createSignedUrl(tryKey, 60 * 60 * 2);
              if (trySigned.error) throw trySigned.error;
              signed = trySigned;
              finalKeyUsed = tryKey;
              triedKeys.push({ attempt, key: tryKey.slice(0, 240), err: "" });
              break;
            } catch (signedErr) {
              const msg = String((signedErr as any)?.message || signedErr || "").toLowerCase();
              triedKeys.push({ attempt, key: tryKey.slice(0, 240), err: (signedErr as any)?.message ? String((signedErr as any).message).slice(0, 200) : msg.slice(0, 200) });
              const isObjectNotFound = msg.includes("object not found");
              // Último intento: no esperar, salir.
              if (attempt === totalAttempts) break;
              // Si NO es Object not found → error distinto (permisos, formato, etc.), no vale la pena reintentar:
              if (!isObjectNotFound) {
                try { console.warn(`[UPLOAD_AUDIO_SUPABASE] fetchSignedUrl attempt=${attempt}: ERROR NO ES \"Object not found\" (${msg.slice(0, 160)}), abortando retries anticipadamente.`); } catch {}
                break;
              }
              // Sí es Object not found + quedan intentos → esperar backoff:
              const waitMs = backoffForAttempt(attempt);
              try { console.warn(`[UPLOAD_AUDIO_SUPABASE] fetchSignedUrl attempt=${attempt} Object not found. Esperando ${waitMs}ms antes de retry...`); } catch {}
              await sleepMs(waitMs);
            }
          }

          // Fallback: si firmamos pero con key distinta, actualizar safeKey para respuesta:
          if (signed && finalKeyUsed) safeKey = finalKeyUsed;

          // Error final con DIAGNÓSTICO COMPLETO (para logs y UI):
          if (!signed) {
            let diagnostic = "";
            try {
              diagnostic = JSON.stringify({
                triedKeys,
                listed_names_count: listedNames.length,
                listed_recent: listedNames.slice(0, 5),
                keyInPayload,
                safeKey,
                bucket,
                userId,
              });
            } catch { diagnostic = ""; }
            const lastErrMsg = triedKeys.length > 0 ? triedKeys[triedKeys.length - 1].err || "" : "";
            const msg = (lastErrMsg ? lastErrMsg + " | " : "") + "Se agotaron los " + totalAttempts + " reintentos de consistencia eventual Supabase Storage. Diagnostic: " + diagnostic.slice(0, 1400);
            throw new Error(msg);
          }

          const raw = ((signed.data as any)?.signedUrl || "").toString().trim();
          const url = /^https?:\/\//i.test(raw) ? raw : new URL(raw || "", auth.supabaseUrl || process.env.SUPABASE_URL || "").toString();
          const dt = Date.now() - t0;
          try { console.log(JSON.stringify({ kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: "fetch_signed_ok", key: safeKey.slice(0, 200), finalTryKey: finalKeyUsed.slice(0, 200), durationMs: dt })); } catch {}
          return send(res, 200, { ok: true, url, key: safeKey });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e || "");
            try { console.error(JSON.stringify({ kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: "fetch_signed_failed", key: safeKey.slice(0, 200), keyInPayload: keyInPayload.slice(0, 200), error: msg.slice(0, 1200) })); } catch {}
            return send(res, 500, { ok: false, error: "No pude generar la URL de reproducción (fetchSignedUrl)", detail: msg.slice(0, 1400) });
          }
        }

      const title = typeof payload?.title === "string" ? payload.title.trim() : "audio.mp3";
      const contentType = (typeof payload?.contentType === "string" ? payload.contentType.trim() : "audio/mpeg") || "audio/mpeg";
      const fname = safeFileName(title);
      const rand = Math.random().toString(36).slice(2, 10);
      const key = `uploads/audio/${auth.user.id}/${Date.now()}_${rand}_${fname}`;
      let inline: Uint8Array | null = null;
      let inlineSizeBytes = 0;
      if (typeof payload?.file === "string") {
        const b64 = payload.file.includes(",") ? payload.file.split(",")[1] : payload.file;
        inline = new Uint8Array(Buffer.from(b64, "base64"));
      } else {
        inline = fileArrayToUint8(payload?.file);
      }
      inlineSizeBytes = inline ? inline.byteLength : 0;

      const maxInline = Math.floor(3 * 1024 * 1024);
      if (inline && inlineSizeBytes > 0 && inlineSizeBytes <= maxInline) {
        try {
          const t0 = Date.now();
          const up = await auth.admin.storage.from(bucket).upload(key, inline, { contentType, upsert: true, cacheControl: "max-age=604800, immutable" });
          if (up.error) throw up.error;
          const signed = await auth.admin.storage.from(bucket).createSignedUrl(key, 60 * 60 * 2);
          if (signed.error) throw signed.error;
          const raw = ((signed.data as any)?.signedUrl || "").toString().trim();
          const url = /^https?:\/\//i.test(raw) ? raw : new URL(raw || "", auth.supabaseUrl || process.env.SUPABASE_URL || "").toString();
          const dt = Date.now() - t0;
          try { console.log(JSON.stringify({ kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: "admin_inline_ok", key: (key || "").slice(0, 200), sizeBytes: inlineSizeBytes, contentType, fname, durationMs: dt, via: "supabase_admin_inline" })); } catch {}
          return send(res, 200, { ok: true, url, key, contentType, via: "supabase_admin_inline" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e || "");
          try { console.error(JSON.stringify({ kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: "admin_inline_failed", key: (key || "").slice(0, 200), sizeBytes: inlineSizeBytes, contentType, fname, error: msg.slice(0, 1000) })); } catch {}
          throw e;
        }
      }

      // MODO 2 (DIRECTO SIGNED UPLOAD) > 3MB:
      // Usamos EXCLUSIVAMENTE createSignedUploadUrl del SDK admin (service_role).
      // Esto funciona porque:
      //  (1) La firma del endpoint la hace ADMIN (service_role) -> URL VÁLIDA siempre.
      //  (2) El INSERT en storage.objects pasa por RLS PERO nuestra nueva policy
      //      anon_insert_ramber_tunes_uploads_paths TO public PERMITE INSERT SIEMPRE
      //      que bucket='ramber-tunes' y path empiece por uploads/audio (no necesita auth.uid())
      //      -> eso soluciona el 403 RLS ("row violates row-level security policy").
      //  (3) DESPUÉS de que el cliente termina el upload y llama fetchSignedUrl=1,
      //      el servidor ADMIN actualiza owner_id=auth.user.id en la fila de storage.objects,
      //      así SELECT/UPDATE/DELETE siguen funcionando con auth.uid() normal.
      const t0 = Date.now();
      const anonKey = (process.env.SUPABASE_ANON_KEY || "").toString().trim();
      const urlBase = (auth.supabaseUrl || process.env.SUPABASE_URL || "").toString().trim();

      // Crear signed upload URL con ADMIN SDK (siempre válida por service_role)
      const { data, error } = await auth.admin.storage.from(bucket).createSignedUploadUrl(key);
      const dtPrep = Date.now() - t0;
      if (error) {
        try { console.error(JSON.stringify({ kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: "prep_signed_sdk_failed", key, contentType, fname, error: String(error?.message || error || "").slice(0, 800) })); } catch {}
        return send(res, 500, { ok: false, error: "No pude preparar la subida en Supabase", detail: String(error?.message || error || "").slice(0, 1000) });
      }
      const uploadUrl: string = (data as any)?.signedUrl || "";
      const pathKey: string = (data as any)?.path || key;
      if (!uploadUrl) {
        try { console.error(JSON.stringify({ kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: "prep_signed_sdk_missing_url", key, contentType, fname })); } catch {}
        return send(res, 500, { ok: false, error: "No recibí la URL de subida de Supabase" });
      }
      // 🔍 DIAGNÓSTICO: Comparar el key QUE NOSOTROS CREAMOS vs el path que DEVUELVE Supabase.
      // A veces Supabase normaliza slashes / quita caracteres / encoding, y esto causa Object not found luego.
      try {
        console.log(JSON.stringify({
          kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: "prep_signed_sdk_paths_compare",
          key_original: key,
          supabase_returned_data_path: pathKey,
          key_equals_supabase_path: key === pathKey,
          bucket,
          supabaseUrl: auth.supabaseUrl || process.env.SUPABASE_URL || "",
          contentType,
          fname,
          via: "supabase_signed_direct_sdk",
        }));
      } catch {}
      try { console.log(JSON.stringify({ kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: "prep_signed_sdk_ok", key: (pathKey || key).slice(0, 200), contentType, fname, durationPrepMs: dtPrep, via: "supabase_signed_direct_sdk" })); } catch {}
      return send(res, 200, {
        ok: true,
        uploadUrl,
        key: pathKey || key,
        contentType,
        via: "supabase_signed_direct_sdk",
        // ✅ createSignedUploadUrl() de Supabase SDK crea una URL firmada para método PUT BLOB DIRECTO.
        // NO usar POST FormData (multipart) aquí — método incompat; causa "Object not found" persistente.
        uploadMethod: "PUT_BLOB",
        needsFetchSignedUrl: true,
        // Headers que el cliente DEBE enviar JUNTO al PUT (junto a la firma de la URL):
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "apikey": anonKey,
          "authorization": `Bearer ${anonKey}`,
          "content-type": contentType,
        },
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      try { console.error(JSON.stringify({ kind: "UPLOAD_AUDIO_SUPABASE", userId, mode: "global_catch", key: String((keyInPayload || (payload?.key as any)) || "").slice(0, 200), contentType: String((payload as any)?.contentType || ""), fname: String((payload as any)?.title || ""), error: String(detail || "").slice(0, 1000) })); } catch {}
      return send(res, 500, { ok: false, error: "No pude preparar la subida en Supabase", detail: String(detail || "").slice(0, 1000) });
    }
  };
})();

const rvcHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  const replicateCache = new Map<
    string,
    { checkedAt: number; status: string; output: any; error: any }
  >();

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = (req.headers.authorization || "").toString();
    const bearerToken = token.toLowerCase().startsWith("bearer ") ? token.slice(7).trim() : "";
    if (!bearerToken) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearerToken);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  async function coverStatus(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const predictionId = pickQuery(req, "predictionId").toString().trim();
    if (!predictionId) return send(res, 400, { error: "Falta predictionId" });
    const noCache = pickQuery(req, "nocache").toString().trim() === "1";

    try {
      let row: any = null;
      let dbStatus = "processing";
      let trackingWarning: string | null = null;
      try {
        const { data: coverRows, error: coverErr } = await auth.admin
          .from("rvc_covers")
          .select("prediction_id,status,updated_at,error,output,output_format,title,user_id")
          .eq("user_id", auth.user.id)
          .eq("prediction_id", predictionId.slice(0, 200))
          .limit(1);
        if (coverErr) {
          const msg = String((coverErr as any)?.message || "").trim();
          const lower = msg.toLowerCase();
          const missingTable = lower.includes("could not find the table") && lower.includes("rvc_covers");
          if (!missingTable) return send(res, 500, { error: "No pude buscar el cover", detail: msg || coverErr.message });
          trackingWarning = "Falta la tabla rvc_covers en Supabase. El seguimiento puede ser limitado.";
        } else {
          row = Array.isArray(coverRows) ? coverRows[0] : null;
          dbStatus = row && (row as any)?.status ? String((row as any).status) : "processing";
        }
      } catch (e) {
        trackingWarning = e instanceof Error ? e.message : String(e);
      }

      const externalId = `rvc_${predictionId}`.slice(0, 200);
      const { data: libRows } = await auth.admin
        .from("library_items")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("type", "song")
        .eq("suno_audio_id", externalId)
        .is("deleted_at", null)
        .limit(1);
      const imported = Array.isArray(libRows) && libRows.length > 0;

      const normalizeHttpUrl = (raw: any) => {
        const s = (typeof raw === "string" ? raw : raw == null ? "" : String(raw)).trim();
        if (!s) return "";
        if (/^https?:\/\//i.test(s) || /^\/\//.test(s)) return s;
        return "";
      };

      const pickFirstUrl = (output: any) => {
        const direct = normalizeHttpUrl(output);
        if (direct) return direct;
        const candidates: any[] = [];
        if (output && typeof output === "object") {
          candidates.push(
            output?.audio,
            output?.audio_url,
            output?.audioUrl,
            output?.output,
            output?.output_url,
            output?.outputUrl,
            output?.url,
            output?.download,
            output?.download_url
          );
          if (Array.isArray(output)) candidates.push(...output);
        }
        for (const c of candidates) {
          const u = normalizeHttpUrl(c);
          if (u) return u;
        }
        return "";
      };

      const contentTypeForExt = (ext: string) => {
        const e = (ext || "").toString().trim().toLowerCase();
        if (e === "wav") return "audio/wav";
        if (e === "ogg") return "audio/ogg";
        if (e === "aac") return "audio/aac";
        if (e === "m4a") return "audio/mp4";
        return "audio/mpeg";
      };

      let replicateStatus = "";
      let replicateOutput: any = null;
      let replicateError: any = null;
      let outputUrlHint = "";
      const replicateToken = process.env.REPLICATE_API_TOKEN;
      const shouldRefreshFromReplicate = Boolean(replicateToken) && (dbStatus === "processing" || noCache);
      let replicateHttpStatus: number | null = null;
      let replicateCheckedAt: number | null = null;
      let replicateFetchError: string | null = null;
      if (shouldRefreshFromReplicate) {
        const cached = replicateCache.get(predictionId);
        const now = Date.now();
        if (!noCache && cached && now - cached.checkedAt < 45_000) {
          replicateStatus = cached.status || "";
          replicateOutput = cached.output ?? null;
          replicateError = cached.error ?? null;
          outputUrlHint = pickFirstUrl(replicateOutput);
          replicateCheckedAt = cached.checkedAt;
        } else {
          try {
            const r = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(predictionId)}`, {
              headers: { authorization: `Token ${replicateToken}` },
            });
            replicateHttpStatus = r.status;
            replicateCheckedAt = now;
            const data = await r.json().catch(() => null);
            if (r.ok && data && typeof data === "object") {
              replicateStatus = (data as any)?.status ? String((data as any).status) : "";
              replicateOutput = (data as any)?.output ?? null;
              replicateError = (data as any)?.error ?? null;
              replicateCache.set(predictionId, { checkedAt: now, status: replicateStatus, output: replicateOutput, error: replicateError });
              outputUrlHint = pickFirstUrl(replicateOutput);
            } else {
              const detail =
                (data && typeof data === "object" && ((data as any)?.detail || (data as any)?.error || (data as any)?.message)) ||
                `HTTP ${r.status}`;
              replicateFetchError = String(detail || "").slice(0, 240) || `HTTP ${r.status}`;
            }
          } catch {
            replicateCheckedAt = now;
            replicateFetchError = "No pude consultar Replicate en este momento.";
          }
        }
      }

      const computedStatusRaw = (replicateStatus || dbStatus || "").toString().trim().toLowerCase();
      const computedStatus =
        computedStatusRaw === "succeeded" || computedStatusRaw === "completed"
          ? "ready"
          : computedStatusRaw === "failed" || computedStatusRaw === "canceled" || computedStatusRaw === "error"
          ? "failed"
          : "processing";

      if (row && String((row as any)?.status || "").trim() !== computedStatus && (computedStatus === "ready" || computedStatus === "failed")) {
        try {
          await auth.admin
            .from("rvc_covers")
            .update({
              status: computedStatus,
              output: replicateOutput ? JSON.stringify(replicateOutput) : null,
              error: replicateError ? JSON.stringify(replicateError) : null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", auth.user.id)
            .eq("prediction_id", predictionId.slice(0, 200));
        } catch {
        }
      }

      let syncImported = imported;
      let importError: string | null = null;
      console.log(`[DEBUG] coverStatus: predictionId=${predictionId}, computedStatus=${computedStatus}, imported=${imported}, replicateStatus=${replicateStatus}`);
      if (!syncImported && computedStatus === "ready") {
        const userId = row && (row as any)?.user_id ? String((row as any).user_id) : auth.user.id;
        let outObj: any = replicateOutput;
        if (!outObj) {
          const outRaw = row ? (row as any)?.output : null;
          if (outRaw && typeof outRaw === "string") {
            try {
              outObj = JSON.parse(outRaw);
            } catch {
              outObj = null;
            }
          } else if (outRaw && typeof outRaw === "object") {
            outObj = outRaw;
          }
        }
        const audioSourceUrl = pickFirstUrl(outObj);
        console.log(`[DEBUG] audioSourceUrl: ${audioSourceUrl}`);
        if (!audioSourceUrl) importError = "Replicate terminó, pero no devolvió una URL de audio para descargar.";
        if (audioSourceUrl) {
          try {
              console.log(`[DEBUG] Intentando descargar audio de: ${audioSourceUrl}`);
              const ctrl = new AbortController();
              const timer = setTimeout(() => ctrl.abort(), 120_000);
              const r = await fetch(audioSourceUrl, { signal: ctrl.signal as any });
              clearTimeout(timer);
              console.log(`[DEBUG] Respuesta de descarga: HTTP ${r.status}, ok=${r.ok}`);
              if (!r.ok) {
                importError = `Replicate terminó, pero no pude descargar el audio (HTTP ${r.status}).`;
              } else {
              const remoteCt = (r.headers.get("content-type") || "").toString().trim().slice(0, 120);
              const ab = await r.arrayBuffer();
              if (!ab || !ab.byteLength) {
                importError = "Replicate terminó, pero el audio descargado llegó vacío.";
              } else {
                const buf = Buffer.from(ab);
                console.log(`[DEBUG] Audio descargado: ${ab.byteLength} bytes`);
                const fmt = String((row as any)?.output_format || "mp3").trim().toLowerCase();
                const ext = ["mp3", "wav", "ogg", "aac", "m4a"].includes(fmt) ? fmt : "mp3";
                const contentType = remoteCt || contentTypeForExt(ext);
                const safeId = predictionId.replaceAll(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 120) || "cover";
                const key = `covers/${userId}/${Date.now()}_${safeId}.${ext}`;
                console.log(`[DEBUG] Subiendo a R2 con key: ${key}`);
                const audioUrl = await uploadToR2(key, buf, contentType);
                console.log(`[DEBUG] Audio subido a R2: ${audioUrl}`);
                const title = String((row as any)?.title || "Cover (voz clonada)").trim().slice(0, 120) || "Cover (voz clonada)";

                const { data: exists2 } = await auth.admin
                  .from("library_items")
                  .select("id")
                  .eq("user_id", userId)
                  .eq("type", "song")
                  .eq("suno_audio_id", externalId)
                  .is("deleted_at", null)
                  .limit(1);
                if (!Array.isArray(exists2) || exists2.length === 0) {
                  console.log(`[DEBUG] Insertando en library_items: title=${title}, audio_url=${audioUrl}`);
                  const { error: insErr } = await auth.admin.from("library_items").insert({
                    user_id: userId,
                    type: "song",
                    title,
                    description: "Cover generado con voz clonada",
                    lyrics: null,
                    gender: null,
                    audio_url: audioUrl,
                    cover_url: null,
                    suno_task_id: null,
                    suno_audio_id: externalId,
                    is_cover: true,
                  } as any);
                  if (!insErr) {
                    console.log(`[DEBUG] Inserción exitosa en library_items`);
                    syncImported = true;
                    importError = null;
                  } else {
                    console.log(`[DEBUG] Error en inserción: ${insErr.message}`);
                    importError = `El cover está listo, pero no pude guardarlo en Biblioteca: ${insErr.message}`;
                  }
                } else {
                  syncImported = true;
                  importError = null;
                }
              }
            }
          } catch {
            importError = "El cover está listo, pero falló la descarga/subida automática del audio.";
          }
        }
      }

      let errObj: any = null;
      const rawErr = row ? (row as any)?.error : null;
      if (rawErr && typeof rawErr === "string") {
        try {
          errObj = JSON.parse(rawErr);
        } catch {
          errObj = rawErr;
        }
      } else if (rawErr && typeof rawErr === "object") {
        errObj = rawErr;
      }

      return send(res, 200, {
        ok: true,
        predictionId,
        status: computedStatus,
        replicateStatus: replicateStatus || null,
        replicateHttpStatus,
        replicateCheckedAt,
        replicateFetchError,
        trackingWarning,
        imported: syncImported,
        importError,
        outputUrl: outputUrlHint || null,
        error: errObj,
        updatedAt: row && (row as any)?.updated_at ? String((row as any).updated_at) : null,
      });
    } catch (e) {
      return send(res, 502, { error: "No pude consultar el estado del cover", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  return async function handler(req: any, res: any) {
    const u = new URL(req.url, "http://localhost");
    const parts = u.pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "rvc") return send(res, 404, { error: "Ruta no encontrada" });
    if (next === "cover-status") return coverStatus(req, res);
    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

const CHATGPT_OAUTH_CONFIG = {
  clientId: "chatgpt-luciana-client",
  clientSecret: "luciana-secret-key-2026",
  callbackUrl: "https://chat.openai.com/aip/g-6aa75d9e076081918b49ba962297c64c/oauth/callback",
  accessTokenExpiresIn: 2592000,
};

function oauthGptSendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function parseAnyBody(req: any): any {
  const raw = typeof req.body === "string" ? req.body : req.body;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  const s = String(raw);
  try {
    const j = JSON.parse(s);
    if (j && typeof j === "object") return j;
  } catch {}
  const out: any = {};
  try {
    const usp = new URLSearchParams(s);
    usp.forEach((v, k) => {
      out[k] = v;
    });
  } catch {}
  return out;
}

function extractBearerToken(req: any): string {
  const h = (req.headers?.authorization || req.headers?.Authorization || "").toString();
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function requireAnyUserFromToken(token: string) {
  const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
  const supabaseAnon = (process.env.SUPABASE_ANON_KEY || "").toString().trim();
  const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
  if (!supabaseUrl || !supabaseAnon || !supabaseService) {
    return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
  }
  const t = (token || "").trim();
  if (!t) return { ok: false as const, status: 401, error: "No autorizado" };
  const createClient = await getSupabaseCreateClient();
  const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await supabase.auth.getUser(t);
  const user = userData?.user;
  if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };
  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
  return { ok: true as const, user, admin, supabaseUrl, supabaseAnon, supabaseService };
}

async function loadUserProfile(admin: any, userId: string) {
  try {
    const r = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (r?.error && !String(r?.error?.message || "").toLowerCase().includes("no rows")) throw r.error;
    return r?.data ?? null;
  } catch {
    return null;
  }
}

const GPT_UPLOAD_AUDIO_ALLOWED_EXTS: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
};
const GPT_UPLOAD_AUDIO_MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/x-mpeg-3": ".mp3",
  "audio/mpeg3": ".mp3",
  "audio/wav": ".wav",
  "audio/wave": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/aac": ".m4a",
  "audio/ogg": ".ogg",
  "application/ogg": ".ogg",
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
  "audio/x-m4a": ".m4a",
};
const GPT_UPLOAD_AUDIO_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const GPT_UPLOAD_AUDIO_R2_PREFIX = "gpt-uploads";

function gptCryptoRandom(): Uint8Array {
  try {
    const webCrypto = (globalThis as any)?.crypto as any;
    if (webCrypto && typeof webCrypto.getRandomValues === "function") {
      const buf = new Uint8Array(16);
      webCrypto.getRandomValues(buf);
      return buf;
    }
  } catch {}
  const buf = new Uint8Array(16);
  for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}
function gptUuidV4(): string {
  const b = gptCryptoRandom();
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
function gptAudioSafeExt(raw: string): string {
  const s = (raw || "").toString().trim().toLowerCase();
  if (!s) return "";
  if (GPT_UPLOAD_AUDIO_ALLOWED_EXTS[s]) return s;
  if (s.startsWith(".")) return s in GPT_UPLOAD_AUDIO_ALLOWED_EXTS ? s : "";
  return `.${s}` in GPT_UPLOAD_AUDIO_ALLOWED_EXTS ? `.${s}` : "";
}
function gptAudioMimeToExt(mime: string): string {
  const s = (mime || "").toString().trim().toLowerCase().split(";")[0].trim();
  return GPT_UPLOAD_AUDIO_MIME_TO_EXT[s] || "";
}
function gptAudioGuessExt(maybeName: string, mime: string): string {
  let ext = "";
  try {
    const name = (maybeName || "").toString().trim();
    if (name) {
      const base = name.split("?")[0].replace(/\\/g, "/").split("/").pop() || "";
      const idx = base.lastIndexOf(".");
      if (idx >= 0) ext = gptAudioSafeExt(base.slice(idx));
    }
  } catch {}
  if (ext) return ext;
  return gptAudioMimeToExt(mime);
}
function gptAudioCleanFileName(fname: string): string {
  const safe = (fname || "").toString().trim().replace(/\\/g, "/").split("/").pop() || "audio";
  const cleaned = safe.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
  return cleaned || "audio";
}

async function gptReadRawBody(req: any): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf-8");
  if (req.body instanceof Uint8Array) return Buffer.from(req.body);
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let done = false;
    const cleanup = () => {
      try { req.removeListener?.("data", onData); } catch {}
      try { req.removeListener?.("end", onEnd); } catch {}
      try { req.removeListener?.("error", onErr); } catch {}
    };
    const onData = (c: any) => {
      if (c) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    };
    const onEnd = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onErr = (e: any) => {
      if (done) return;
      done = true;
      cleanup();
      reject(e);
    };
    try {
      req.on("data", onData);
      req.on("end", onEnd);
      req.on("error", onErr);
      if (typeof req.resume === "function") req.resume();
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

function gptParseMultipart(raw: Buffer, boundary: string): { fields: Record<string, string>; files: Array<{ name: string; filename: string; contentType: string; content: Buffer }> } {
  const fields: Record<string, string> = {};
  const files: Array<{ name: string; filename: string; contentType: string; content: Buffer }> = [];
  const b = Buffer.concat([Buffer.from("--"), Buffer.from(boundary)]);
  const endB = Buffer.concat([b, Buffer.from("--")]);
  let i = raw.indexOf(b);
  if (i < 0) return { fields, files };
  i += b.length;
  while (i < raw.length) {
    const r = raw.indexOf(Buffer.from("\r\n\r\n"), i);
    if (r < 0) break;
    const headerStr = raw.slice(i, r).toString("utf-8");
    const headers: Record<string, string> = {};
    for (const h of headerStr.split(/\r\n/)) {
      const colon = h.indexOf(":");
      if (colon < 0) continue;
      const k = h.slice(0, colon).trim().toLowerCase();
      const v = h.slice(colon + 1).trim();
      if (k) headers[k] = v;
    }
    const disp = headers["content-disposition"] || "";
    const nameMatch = /name="([^"]+)"/i.exec(disp);
    const fnameMatch = /filename="([^"]+)"/i.exec(disp);
    const contentType = headers["content-type"] || "";
    const start = r + 4;
    const nextB = raw.indexOf(b, start);
    const endB2 = raw.indexOf(endB, start);
    const endOff = nextB >= 0 && (endB2 < 0 || nextB <= endB2) ? nextB : endB2;
    if (endOff < 0) break;
    const end = (endOff > 2 && raw[endOff - 2] === 0x0d && raw[endOff - 1] === 0x0a) ? endOff - 2 : endOff;
    const content = raw.slice(start, end);
    if (fnameMatch) {
      files.push({ name: nameMatch?.[1] || "file", filename: fnameMatch[1], contentType, content: Buffer.from(content) });
    } else if (nameMatch) {
      fields[nameMatch[1]] = content.toString("utf-8");
    }
    if (endB2 >= 0 && endOff === endB2) break;
    i = endOff + b.length;
    if (raw.slice(i, i + 2).toString() === "\r\n") i += 2;
  }
  return { fields, files };
}


try {
  const gt = globalThis as any;
  if (typeof gt.__LUCIANA_SHARED_FNS !== "object" || gt.__LUCIANA_SHARED_FNS === null) gt.__LUCIANA_SHARED_FNS = {};
  if (typeof gt.__LUCIANA_SHARED_FNS.__INIT_SUNO_FNS__ !== "function") {
    gt.__LUCIANA_SHARED_FNS.__INIT_SUNO_FNS__ = async function __initSunoSharedFns() {
      try {
        await sunoHandler(
          { url: "http://localhost/api/suno/health", method: "GET", headers: {} } as any,
          { statusCode: 200, setHeader: () => {}, end: () => {}, write: () => {} } as any
        );
      } catch {}
      try {
        const inner = sunoHandler as any;
        if (typeof inner?.transcribeLyricsWithGemini === "function") {
          gt.__LUCIANA_SHARED_FNS.transcribeLyricsWithGemini = inner.transcribeLyricsWithGemini;
        }
      } catch {}
    };
  }
} catch {}

const oauthHandler = (() => {
  function isValidChatgptRedirectUri(s: string): boolean {
    if (typeof s !== "string" || !s) return false;
    const t = s.trim();
    if (!t) return false;
    try {
      const u = new URL(t);
      const hp = `${u.protocol}//${u.host}${u.pathname}`;
      const reChatOpenai = /^https:\/\/chat\.openai\.com\/aip\/g-[A-Za-z0-9_-]+\/oauth\/callback\/?$/i;
      const reChatgptCom = /^https:\/\/chatgpt\.com\/aip\/g-[A-Za-z0-9_-]+\/oauth\/callback\/?$/i;
      return reChatOpenai.test(hp) || reChatgptCom.test(hp);
    } catch {
      return false;
    }
  }

  function parseBasicAuth(req: any): { clientId: string; clientSecret: string } {
    const h = (req.headers?.authorization || req.headers?.Authorization || "").toString().trim();
    const out = { clientId: "", clientSecret: "" };
    if (!h || !h.toLowerCase().startsWith("basic ")) return out;
    const raw = h.slice(6).trim();
    if (!raw) return out;
    let decoded = "";
    try {
      decoded = Buffer.from(raw, "base64").toString("utf8");
    } catch {}
    if (!decoded || !decoded.includes(":")) return out;
    const idx = decoded.indexOf(":");
    out.clientId = decoded.slice(0, idx);
    out.clientSecret = decoded.slice(idx + 1);
    return out;
  }

  async function handleAuthorize(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    const u = new URL(req.url, "http://localhost");
    const qs = u.searchParams;

    const clientId = (qs.get("client_id") || qs.get("clientId") || "").toString().trim();
    const redirectUri = (qs.get("redirect_uri") || qs.get("redirectUri") || qs.get("redirect_url") || qs.get("callback_url") || "").toString().trim();
    const responseType = (qs.get("response_type") || "").toString().trim().toLowerCase();
    const state = (qs.get("state") || "").toString();
    const scope = (qs.get("scope") || "").toString();

    console.log(`[oauth:authorize][${method}] in >>> url=${req.url} clientId=${clientId} redirectUri=${redirectUri} responseType=${responseType} statePresent=!!${!!state} scope=${scope} headers=${JSON.stringify(req.headers || {})}`);

    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "GET, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization");
      res.end();
      return;
    }
    if (method !== "GET") {
      res.statusCode = 405;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "invalid_request", error_description: "Método no permitido" }));
      return;
    }

    if (clientId !== CHATGPT_OAUTH_CONFIG.clientId) {
      console.log(`[oauth:authorize] invalid_client: clientId esperado ${CHATGPT_OAUTH_CONFIG.clientId} vs recibido ${clientId}`);
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "invalid_client", error_description: "client_id OAuth no válido" }));
      return;
    }
    if (responseType && responseType !== "code") {
      console.log(`[oauth:authorize] unsupported_response_type: responseType=${responseType}`);
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "unsupported_response_type", error_description: "Solo response_type=code" }));
      return;
    }
    if (!isValidChatgptRedirectUri(redirectUri) && redirectUri !== CHATGPT_OAUTH_CONFIG.callbackUrl) {
      console.log(`[oauth:authorize] invalid_redirect_uri: recibido <<<${redirectUri}>>> esperado match o <<<${CHATGPT_OAUTH_CONFIG.callbackUrl}>>>`);
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "invalid_redirect_uri", error_description: "redirect_uri OAuth no permitida" }));
      return;
    }
    if (!state) {
      console.log(`[oauth:authorize] falta state`);
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "invalid_request", error_description: "Falta el parámetro state" }));
      return;
    }

    try {
      const proto =
        (req.headers["x-forwarded-proto"] || req.headers["X-Forwarded-Proto"] || "").toString().trim().toLowerCase() ||
        (req.connection && (req.connection as any).encrypted ? "https" : "http");
      const host = (req.headers["x-forwarded-host"] || req.headers["host"] || req.headers["Host"] || "lucianamusic.app").toString().trim();
      const origin = `${proto}://${host}`;
      const screenUrl = new URL(`${origin.replace(/\/+$/, "")}/auth/chatgpt`);
      screenUrl.searchParams.set("client_id", clientId);
      screenUrl.searchParams.set("redirect_uri", redirectUri);
      screenUrl.searchParams.set("state", state);
      screenUrl.searchParams.set("response_type", "code");
      if (scope) screenUrl.searchParams.set("scope", scope);

      console.log(`[oauth:authorize] ok: redirigiendo a pantalla React origin=${origin} redirect_uri_out=${redirectUri} state_len=${state.length} finalRedirect=${screenUrl.toString()}`);
      res.statusCode = 302;
      res.setHeader("location", screenUrl.toString());
      res.setHeader("cache-control", "no-store, private, max-age=0");
      res.setHeader("pragma", "no-cache");
      res.end();
      return;
    } catch (e) {
      console.log(`[oauth:authorize] redirect crash: ${e instanceof Error ? e.stack || e.message : String(e)}`);
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "server_error", error_description: e instanceof Error ? e.message : String(e) }));
      return;
    }
  }

  async function handleToken(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization");
      res.end();
      return;
    }
    if (method !== "POST") return oauthGptSendJson(res, 405, { error: "invalid_request", error_description: "Método no permitido" });

    const contentType = (req.headers?.["content-type"] || req.headers?.["Content-Type"] || "").toString().toLowerCase();
    const bodyRaw = await (async () => {
      try { return await gptReadRawBody(req); } catch { return Buffer.alloc(0); }
    })();
    let body: any = {};
    try {
      const s = bodyRaw.toString("utf8");
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const out: any = {};
        try {
          const usp = new URLSearchParams(s);
          usp.forEach((v, k) => { out[k] = v; });
        } catch {}
        body = out;
      } else if (contentType.includes("application/json")) {
        try {
          const j = JSON.parse(s);
          if (j && typeof j === "object") body = j;
        } catch {
          body = {};
        }
      } else {
        body = parseAnyBody({ body: s } as any);
      }
    } catch {
      body = {};
    }

    const basic = parseBasicAuth(req);
    const clientId = String(basic.clientId || body?.client_id || "").trim();
    const clientSecret = String(basic.clientSecret || body?.client_secret || "").trim();
    const code = String(body?.code || "").trim();
    const grantType = String(body?.grant_type || "").trim();
    const redirectUri = String(body?.redirect_uri || body?.redirectUri || "").trim();

    console.log(`[oauth:token] in >>> method=${method} contentType=${contentType} basicPresent=${!!basic.clientId} clientId=${clientId} grantType=${grantType} codeLen=${code.length} redirectUri=${redirectUri} keys=${Object.keys(body || {}).join(',')}`);

    if (!clientId || !clientSecret) {
      console.log(`[oauth:token] invalid_client: FALTAN credenciales basic=${JSON.stringify(basic)} body.client_id=${body?.client_id} body.client_secret=${body?.client_secret}`);
      return oauthGptSendJson(res, 401, { error: "invalid_client", error_description: "Falta client_id o client_secret (Basic Auth o body)" });
    }
    if (clientId !== CHATGPT_OAUTH_CONFIG.clientId || clientSecret !== CHATGPT_OAUTH_CONFIG.clientSecret) {
      console.log(`[oauth:token] invalid_client: credenciales NO coinciden. ClientID esperado=<<<${CHATGPT_OAUTH_CONFIG.clientId}>>> vs <<<${clientId}>>>. Secret match=${clientSecret === CHATGPT_OAUTH_CONFIG.clientSecret}`);
      return oauthGptSendJson(res, 401, { error: "invalid_client", error_description: "Credenciales OAuth inválidas" });
    }
    if (grantType && grantType !== "authorization_code") {
      console.log(`[oauth:token] unsupported_grant_type: ${grantType}`);
      return oauthGptSendJson(res, 400, { error: "unsupported_grant_type", error_description: "Solo se admite authorization_code" });
    }
    if (!code) {
      console.log(`[oauth:token] invalid_grant: code vacío.`);
      return oauthGptSendJson(res, 400, { error: "invalid_grant", error_description: "Falta code" });
    }

    const auth = await requireAnyUserFromToken(code);
    if (!auth.ok) {
      console.log(`[oauth:token] invalid_grant: requireAnyUserFromToken falló status=${auth.status} msg=${auth.error}`);
      return oauthGptSendJson(res, 400, { error: "invalid_grant", error_description: "El code no corresponde a una sesión válida" });
    }
    const userId = (auth.user?.id || "").toString();
    const userEmail = (auth.user?.email || "").toString();

    console.log(`[oauth:token] ok: user=${userId} email=${userEmail} expires_in=${CHATGPT_OAUTH_CONFIG.accessTokenExpiresIn}`);
    return oauthGptSendJson(res, 200, {
      access_token: code,
      token_type: "Bearer",
      expires_in: CHATGPT_OAUTH_CONFIG.accessTokenExpiresIn,
      scope: (body?.scope || "").toString(),
    });
  }

  return async function handler(req: any, res: any) {
    try {
      const u = new URL(req.url, "http://localhost");
      const parts = u.pathname.split("/").filter(Boolean);
      const isApi = parts[0] === "api";
      const next = isApi ? parts[2] : parts[1];
      if (!next) return oauthGptSendJson(res, 404, { error: "ruta_no_encontrada" });
      if (next === "authorize") return await handleAuthorize(req, res);
      if (next === "token") return await handleToken(req, res);
      return oauthGptSendJson(res, 404, { error: "ruta_no_encontrada" });
    } catch (e) {
      console.log(`[oauth:handler] crash: ${e instanceof Error ? (e.stack || e.message) : String(e)}`);
      return oauthGptSendJson(res, 500, { error: "error_interno", error_description: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const difyHandler = (() => {
  const DIFY_CONV_BY_USER_CACHE = new Map<string, string>();

  function difySendJson(res: any, status: number, payload: any) {
    try {
      const body = JSON.stringify(payload);
      res.statusCode = Number.isFinite(status) && status >= 100 && status < 600 ? status : 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store, private, max-age=0");
      res.setHeader("pragma", "no-cache");
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("access-control-allow-origin", "*");
      res.end(body);
    } catch (_e) {
      try {
        res.statusCode = 500;
        res.end(`{"error":"internal_json_error"}`);
      } catch {}
    }
  }

  function difyExtractBearerFromHeader(req: any, headerName: string): string {
    try {
      const h = (req.headers?.[headerName] || req.headers?.[headerName.toLowerCase()] || req.headers?.[headerName.toUpperCase()] || "").toString().trim();
      if (!h) return "";
      const m = /^Bearer\s+(.+)$/i.exec(h);
      if (!m || !m[1]) return "";
      return String(m[1]).trim();
    } catch {
      return "";
    }
  }

  function difyTimingSafeEqual(expected: string, actual: string): boolean {
    try {
      const crypto = require("crypto") as typeof import("crypto");
      const a = typeof expected === "string" ? expected : "";
      const b = typeof actual === "string" ? actual : "";
      const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
      const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
      if (hashA.length !== hashB.length) return false;
      return crypto.timingSafeEqual(hashA, hashB);
    } catch {
      let diff = 0;
      const a = String(typeof expected === "string" ? expected : "");
      const b = String(typeof actual === "string" ? actual : "");
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return diff === 0;
    }
  }

  function difyValidateApiKey(req: any): { ok: boolean; status: number; error?: string } {
    const envKey = String(process.env.DIFY_TOOL_API_KEY || "").trim();
    const headerToken = difyExtractBearerFromHeader(req, "authorization");
    if (!envKey) {
      try {
        console.error(`[dify:auth] Falta configurar DIFY_TOOL_API_KEY en Vercel (process.env). Solicitud bloqueada. headerTokenLen=${(headerToken || "").length} ua=${(req.headers?.["user-agent"] || "").toString().slice(0, 160)}`);
      } catch {}
      return { ok: false, status: 500, error: "dify_api_key_not_configured" };
    }
    if (envKey.length < 16) {
      try {
        console.error(`[dify:auth] DIFY_TOOL_API_KEY configurado pero demasiado corto (${envKey.length} chars, min 16).`);
      } catch {}
      return { ok: false, status: 500, error: "dify_api_key_invalid_config" };
    }
    if (!headerToken) {
      return { ok: false, status: 401, error: "missing_bearer_authorization_header" };
    }
    const match = difyTimingSafeEqual(envKey, headerToken);
    if (!match) {
      try {
        console.error(`[dify:auth] DIFY_TOOL_API_KEY NO coincide. headerLen=${headerToken.length} expectedLen=${envKey.length} ua=${(req.headers?.["user-agent"] || "").toString().slice(0, 160)} ip=${String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "").slice(0, 80)}`);
      } catch {}
      return { ok: false, status: 401, error: "invalid_bearer_authorization_header" };
    }
    return { ok: true };
  }

  function difyGetInternalShared(): { generate: any; status: any } | null {
    try {
      const gt = globalThis as any;
      const shared = gt?.__LUCIANA_SHARED_FNS__;
      if (shared && typeof shared.gptGenerateInternal === "function" && typeof shared.gptStatusInternal === "function") {
        return { generate: shared.gptGenerateInternal, status: shared.gptStatusInternal };
      }
      return null;
    } catch {
      return null;
    }
  }

  function difyBuildWrappedRequest(originalReq: any, overrides: { method?: string; url?: string; headers?: any; bodyBuffer?: Buffer | Uint8Array; bodyJson?: any }): any {
    const newMethod = (overrides.method || originalReq.method || "GET").toString().toUpperCase();
    const newUrl = (overrides.url || originalReq.url || "/").toString();
    const baseHeaders: any = {};
    try {
      const orig = originalReq.headers || {};
      Object.keys(orig).forEach((k) => {
        const lk = String(k).toLowerCase();
        baseHeaders[lk] = orig[k];
      });
    } catch {}
    const customHeaders = overrides.headers || {};
    Object.keys(customHeaders).forEach((k) => {
      baseHeaders[String(k).toLowerCase()] = customHeaders[k];
    });
    let bodyBuffer: Buffer | Uint8Array | null = null;
    if (overrides.bodyBuffer && (overrides.bodyBuffer as any).length) {
      bodyBuffer = overrides.bodyBuffer;
    } else if (overrides.bodyJson) {
      try {
        const s = JSON.stringify(overrides.bodyJson);
        bodyBuffer = Buffer.from(s, "utf8");
        baseHeaders["content-type"] = baseHeaders["content-type"] || "application/json";
        baseHeaders["content-length"] = String((bodyBuffer as Buffer).byteLength);
      } catch {}
    }
    const fakeSocket = originalReq.socket ? { ...originalReq.socket } : undefined;
    const fake = {
      method: newMethod,
      url: newUrl,
      headers: baseHeaders,
      socket: fakeSocket,
      connection: originalReq.connection,
      on: originalReq.on ? originalReq.on.bind(originalReq) : (() => fake) as any,
      once: originalReq.once ? originalReq.once.bind(originalReq) : (() => fake) as any,
      removeListener: originalReq.removeListener ? originalReq.removeListener.bind(originalReq) : (() => fake) as any,
      _bodyConsumed: false,
      _buffer: bodyBuffer,
    } as any;
    if (fake._buffer) {
      let consumed = false;
      const replayListeners: any[] = [];
      fake.on = (evt: string, cb: any) => {
        if (evt === "data" || evt === "end") {
          replayListeners.push({ evt, cb });
          if (!consumed) {
            consumed = true;
            setImmediate(() => {
              try {
                for (const l of replayListeners.filter(x => x.evt === "data")) {
                  try { l.cb(fake._buffer); } catch {}
                }
                for (const l of replayListeners.filter(x => x.evt === "end")) {
                  try { l.cb(); } catch {}
                }
              } catch {}
            });
          }
        } else if (originalReq.on) {
          try { originalReq.on(evt, cb); } catch {}
        }
        return fake;
      };
      fake.once = fake.on;
    }
    return fake;
  }

  function difyCaptureResponse(nextHandler: (req: any, res: any) => Promise<any>, req: any): Promise<{ status: number; body: any; rawText: string }> {
    return new Promise((resolve) => {
      const outRes: any = {
        _headers: {} as any,
        statusCode: 200,
        _chunks: [] as any[],
        setHeader(k: string, v: any) { this._headers[String(k).toLowerCase()] = v; return this; },
        getHeader(k: string) { return this._headers[String(k).toLowerCase()]; },
        hasHeader(k: string) { return Object.prototype.hasOwnProperty.call(this._headers, String(k).toLowerCase()); },
        removeHeader(k: string) { delete this._headers[String(k).toLowerCase()]; return this; },
        writeHead(code: number, headers: any) {
          this.statusCode = Number(code) || this.statusCode;
          if (headers && typeof headers === "object") {
            Object.keys(headers).forEach((k) => { this._headers[String(k).toLowerCase()] = headers[k]; });
          }
          return this;
        },
        write(chunk: any) { this._chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ""), "utf8")); return true; },
        end(chunk: any) {
          if (arguments.length && typeof chunk !== "function" && chunk !== undefined) {
            this.write(chunk);
          }
          const buf = Buffer.concat(this._chunks.map((c: any) => Buffer.isBuffer(c) ? c : Buffer.from(String(c || ""), "utf8")));
          const text = buf.toString("utf8");
          let parsed: any = null;
          if (text) {
            try { parsed = JSON.parse(text); } catch { parsed = text; }
          }
          resolve({ status: Number(this.statusCode) || 200, body: parsed, rawText: text });
        },
      };
      Promise.resolve(nextHandler(req, outRes)).catch((e) => {
        try {
          outRes.statusCode = 500;
          outRes.end(JSON.stringify({ error: "internal_pipeline_error", message: e instanceof Error ? String(e.message) : String(e) }));
        } catch {}
      });
    });
  }

  function difyValidGenerateBody(body: any): { ok: boolean; status: number; error?: string; normalized?: { prompt: string; style: string; title: string; instrumental: boolean } } {
    const b = body || {};
    if (b === null || typeof b !== "object" || Array.isArray(b)) {
      return { ok: false, status: 400, error: "invalid_body_expected_json_object" };
    }
    let prompt = typeof b.prompt === "string" ? b.prompt : "";
    prompt = prompt.trim();
    if (!prompt) return { ok: false, status: 400, error: "field_prompt_required" };
    if (prompt.length > 12000) return { ok: false, status: 413, error: "field_prompt_too_long" };
    let style = typeof b.style === "string" ? b.style : "";
    style = style.trim().slice(0, 600);
    let title = typeof b.title === "string" ? b.title : "";
    title = title.trim().slice(0, 220);
    let instrumental: boolean;
    if (typeof b.instrumental === "boolean") instrumental = b.instrumental;
    else if (b.instrumental === 0 || b.instrumental === 1) instrumental = Boolean(b.instrumental);
    else if (typeof b.instrumental === "string") instrumental = /^(1|true|yes|si|on)$/i.test(b.instrumental.trim());
    else instrumental = false;
    return { ok: true, normalized: { prompt, style, title, instrumental } };
  }

  function difyExtractCopilotConversationFromProfile(profile: any): string {
    try {
      if (!profile || typeof profile !== "object") return "";
      const s = (profile as any).settings;
      if (s && typeof s === "object" && typeof (s as any).dify_conversation_id === "string") {
        return String((s as any).dify_conversation_id).trim();
      }
      const raw = (profile as any).dify_conversation_id;
      if (typeof raw === "string") return raw.trim();
      const rawMeta = (profile as any).metadata || (profile as any).raw_user_meta_data;
      if (rawMeta && typeof rawMeta === "object" && typeof (rawMeta as any).dify_conversation_id === "string") {
        return String((rawMeta as any).dify_conversation_id).trim();
      }
    } catch {}
    return "";
  }

  async function difySaveCopilotConversationToProfile(admin: any, userId: string, conversationId: string): Promise<void> {
    try {
      if (!admin || !userId || !String(conversationId || "").trim()) return;
      const existing = await loadUserProfile(admin, userId);
      const currentSettings = (existing && typeof (existing as any).settings === "object" && (existing as any).settings !== null) ? { ...(existing as any).settings } : {};
      (currentSettings as any).dify_conversation_id = String(conversationId).trim();
      const payload: any = { id: userId, updated_at: new Date().toISOString(), settings: currentSettings };
      try {
        await admin.from("profiles").upsert(payload).eq("id", userId);
      } catch {
        // si falla upsert (columnas distintas por proyecto) intentamos update
        try {
          await admin.from("profiles").update({ settings: currentSettings, updated_at: payload.updated_at }).eq("id", userId);
        } catch {}
      }
    } catch {}
  }

  function difyParseReadyToGenerateStructured(rawAnswer: string): { action: "ready_to_generate"; prompt: string; style: string; title: string; instrumental: boolean } | null {
    const text = typeof rawAnswer === "string" ? rawAnswer : String(rawAnswer || "");
    if (!text) return null;

    const candidates: string[] = [];
    try {
      const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
      let m: any;
      while ((m = fenceRe.exec(text)) !== null) candidates.push(String(m[1] || "").trim());
    } catch {}
    try {
      const braceRe = /(\{\s*"action"\s*:\s*"ready_to_generate"[\s\S]*?\})/gi;
      let m2: any;
      while ((m2 = braceRe.exec(text)) !== null) candidates.push(String(m2[1] || "").trim());
    } catch {}
    try {
      const anyObj = /\{[\s\S]{12,4000}\}/g;
      let m3: any;
      while ((m3 = anyObj.exec(text)) !== null) candidates.push(String(m3[0] || "").trim());
    } catch {}

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c) continue;
      let obj: any = null;
      try { obj = JSON.parse(c); } catch {
        try { obj = JSON.parse(c.replace(/,\s*([}\]])/g, "$1")); } catch { obj = null; }
      }
      if (obj && typeof obj === "object" && !Array.isArray(obj) && String((obj as any).action || "").toLowerCase() === "ready_to_generate") {
        let prompt = String((obj as any).prompt || "").trim();
        if (!prompt) continue;
        if (prompt.length > 12000) prompt = prompt.slice(0, 12000);
        const style = String((obj as any).style || "").trim().slice(0, 600);
        const title = String((obj as any).title || "").trim().slice(0, 220);
        let instrumental: boolean;
        const insRaw = (obj as any).instrumental;
        if (typeof insRaw === "boolean") instrumental = insRaw;
        else if (insRaw === 0 || insRaw === 1) instrumental = Boolean(insRaw);
        else if (typeof insRaw === "string") instrumental = /^(1|true|yes|si|on)$/i.test(insRaw.trim());
        else instrumental = false;
        return { action: "ready_to_generate", prompt, style, title, instrumental };
      }
    }
    return null;
  }

  async function difyUploadFileToDify(params: {
    apiKey: string; baseUrl: string; user: any; fileName: string; mimeType: string; bytes: Buffer;
  }): Promise<{ id: string; name: string; mime_type: string }> {
    const { apiKey, baseUrl, user, fileName, mimeType, bytes } = params;
    const userIdShort = String(user.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20) || "anon";
    const difyUser = String(process.env.DIFY_COPILOT_USER_TEMPLATE || "luciana_{user_id}").replace(/\{user_id\}/g, userIdShort).slice(0, 64);
    let base = String(baseUrl || "https://api.dify.ai/v1").trim().replace(/\/+$/g, "");
    if (!/^https?:\/\//i.test(base)) base = "https://api.dify.ai/v1";
    // Caso 1: baseUrl actual apunta a .../v1/chat-messages, nos quedamos con /v1
    const m = base.match(/^(https?:\/\/[^/]+\/v\d+)(?:\/.*)?$/i);
    if (m && m[1]) base = m[1];
    const url = `${base}/files/upload`;
    // Construir multipart/form-data manual sin depender de FormData de navegador
    const boundary = `----LucianaDifyUpload${Date.now().toString(36)}`;
    const head =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${encodeURIComponent(String(fileName || "file").slice(0, 200))}"\r\n` +
      `Content-Type: ${String(mimeType || "application/octet-stream")}\r\n\r\n`;
    const mid =
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="user"\r\n\r\n${String(difyUser)}\r\n` +
      `--${boundary}--\r\n`;
    const body = Buffer.concat([Buffer.from(head, "utf8"), Buffer.from(bytes), Buffer.from(mid, "utf8")]);
    let r: any;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": String(body.length),
          "cache-control": "no-store",
        },
        body,
      } as any);
    } catch (e) {
      throw new Error(`Dify upload fetch error: ${e instanceof Error ? String(e.message) : String(e)}`);
    }
    if (!r || typeof r.status !== "number") {
      throw new Error("Dify upload: el servidor remoto no devolvió status.");
    }
    const t = typeof r.text === "function" ? await r.text() : "";
    let j: any = null;
    try { j = t ? JSON.parse(t) : null; } catch { j = null; }
    if (r.status < 200 || r.status >= 300) {
      const msg =
        (j && typeof (j as any).message === "string" ? (j as any).message : "") ||
        (j && typeof (j as any).error === "string" ? (j as any).error : "") ||
        (j && typeof (j as any).code === "string" ? (j as any).code : "") ||
        `HTTP ${r.status}`;
      throw new Error(`Dify upload HTTP ${r.status}: ${String(msg || "").slice(0, 400)}`);
    }
    const id = String(
      (j && typeof (j as any).id === "string" ? (j as any).id : "") ||
      (j && j.data && typeof j.data.id === "string" ? j.data.id : "") ||
      ""
    ).trim();
    if (!id) throw new Error("Dify upload no devolvió id de archivo.");
    return {
      id,
      name: String(j && typeof (j as any).name === "string" ? (j as any).name : fileName || "file"),
      mime_type: String(j && typeof (j as any).mime_type === "string" ? (j as any).mime_type : mimeType || ""),
    };
  }

  async function difyFetchCopilotFromDify(params: {
    apiKey: string; apiUrl: string; user: any; message: string; conversationId: string;
    files?: Array<{ type: 'image'; transfer_method: 'local_file'; upload_file_id: string; }>;
  }): Promise<{ answer: string; conversationId: string; raw: any }> {
    const { apiKey, apiUrl, user, message, conversationId } = params;
    const userIdShort = String(user.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20) || "anon";
    const difyUser = String(process.env.DIFY_COPILOT_USER_TEMPLATE || "luciana_{user_id}").replace(/\{user_id\}/g, userIdShort).slice(0, 64);
    const payload: any = {
      inputs: {},
      query: String(message || "").slice(0, 20000),
      response_mode: "blocking",
      user: difyUser,
    };
    const cid = String(conversationId || "").trim();
    if (cid) payload.conversation_id = cid;
    if (params.files && Array.isArray(params.files) && params.files.length) {
      payload.files = params.files.slice(0, 5);
    } else if (process.env.DIFY_COPILOT_FILES && String(process.env.DIFY_COPILOT_FILES).trim()) {
      try {
        const arr = JSON.parse(process.env.DIFY_COPILOT_FILES);
        if (Array.isArray(arr) && arr.length) payload.files = arr;
      } catch {}
    }
    const headers: Record<string, string> = {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json; charset=utf-8",
      accept: "application/json",
      "cache-control": "no-store",
    };
    try {
      console.log(`[dify:chat:upstream] url=${apiUrl} difyUser=${difyUser} conversationId_present=!!${!!cid} msgLen=${String(message || "").length}`);
    } catch {}
    let r: Response | any;
    try {
      const controller = (globalThis as any).AbortController ? new (globalThis as any).AbortController() : null;
      const timer = controller ? (globalThis as any).setTimeout(() => { try { controller.abort(); } catch {} }, 120000) : null;
      r = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller?.signal || undefined,
      } as any);
      if (timer) try { (globalThis as any).clearTimeout(timer); } catch {}
    } catch (e) {
      throw new Error(`Dify upstream fetch error: ${e instanceof Error ? String(e.message) : String(e)}`);
    }
    if (!r || typeof r.status !== "number") {
      throw new Error("Dify upstream no devolvió status.");
    }
    const textOut = typeof r.text === "function" ? await r.text() : String((r as any).body || "");
    let jsonOut: any = null;
    try { jsonOut = textOut ? JSON.parse(textOut) : null; } catch { jsonOut = null; }
    if (r.status < 200 || r.status >= 300) {
      const msg =
        (jsonOut && typeof (jsonOut as any).message === "string" ? (jsonOut as any).message : "") ||
        (jsonOut && typeof (jsonOut as any).error === "string" ? (jsonOut as any).error : "") ||
        `HTTP ${r.status}`;
      throw new Error(`Dify upstream HTTP ${r.status}: ${String(msg || "").slice(0, 500)}`);
    }
    const answer =
      (jsonOut && typeof (jsonOut as any).answer === "string" ? (jsonOut as any).answer : "") ||
      (jsonOut && typeof (jsonOut as any).text === "string" ? (jsonOut as any).text : "") ||
      (jsonOut && typeof (jsonOut as any).output_text === "string" ? (jsonOut as any).output_text : "") ||
      (typeof textOut === "string" ? textOut.slice(0, 40000) : "");
    const cleanAnswer = stripInternalReasoning(answer);
    const newConv =
      String(
        (jsonOut && typeof (jsonOut as any).conversation_id === "string" ? (jsonOut as any).conversation_id : cid || "") || ""
      ).trim() || cid;
    return { answer: cleanAnswer, conversationId: newConv, raw: jsonOut };
  }

  async function handleDifyChat(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization");
      res.end();
      return;
    }
    if (method !== "POST") return difySendJson(res, 405, { error: "method_not_allowed", message: "Solo POST en /api/dify/chat." });

    const userToken = difyExtractBearerFromHeader(req, "authorization");
    if (!userToken) {
      return difySendJson(res, 401, { error: "unauthorized", message: "Sesión expirada o faltante. Vuelve a iniciar sesión con Google." });
    }
    const auth = await requireAnyUserFromToken(userToken);
    if (!auth.ok) {
      const isMissing = !userToken || (auth.status && auth.status >= 400 && auth.status < 500);
      return difySendJson(res, isMissing ? (auth.status || 401) : 500, { error: "unauthorized", message: "Tu sesión de LucIAna no es válida. Cierra y vuelve a iniciar sesión con Google." });
    }

    const copilotApiKey = String(process.env.DIFY_COPILOT_API_KEY || process.env.DIFY_API_KEY || "").trim();
    if (!copilotApiKey) {
      return difySendJson(res, 500, {
        error: "dify_copilot_not_configured",
        message: "Falta configurar DIFY_COPILOT_API_KEY en Vercel Environment Variables.",
      });
    }
    if (copilotApiKey.length < 16) {
      return difySendJson(res, 500, {
        error: "dify_copilot_not_configured",
        message: "DIFY_COPILOT_API_KEY configurada pero demasiado corta (mínimo 16 chars).",
      });
    }
    const copilotApiUrl = String(process.env.DIFY_COPILOT_API_URL || "").trim() || "https://api.dify.ai/v1/chat-messages";
    if (!/^https?:\/\//i.test(copilotApiUrl)) {
      return difySendJson(res, 500, {
        error: "dify_copilot_not_configured",
        message: "DIFY_COPILOT_API_URL debe empezar por https:// o http://.",
      });
    }

    const rawBody = await (async () => {
      try { return await gptReadRawBody(req); } catch { return Buffer.alloc(0); }
    })();
    const contentType = (req.headers?.["content-type"] || req.headers?.["Content-Type"] || "").toString().toLowerCase();
    let body: any = {};
    try {
      const s = rawBody.toString("utf8");
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const out: any = {};
        try {
          const usp = new URLSearchParams(s);
          usp.forEach((v, k) => { out[k] = v; });
        } catch {}
        body = out;
      } else if (contentType.includes("application/json") || s) {
        try { body = s ? JSON.parse(s) : {}; } catch { body = parseAnyBody(req) || {}; }
      } else {
        body = parseAnyBody(req) || {};
      }
    } catch {
      body = parseAnyBody(req) || {};
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return difySendJson(res, 400, { error: "invalid_request", message: "Body debe ser un JSON object con el campo 'message'." });
    }
    const rawAttachment = body?.attachment && typeof body.attachment === "object" && body.attachment !== null ? body.attachment : null;
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
    let difyFileRefs: Array<{ type: 'image'; transfer_method: 'local_file'; upload_file_id: string; }> = [];
    if (rawAttachment) {
      const kind = String(rawAttachment.kind || rawAttachment.type || "").trim().toLowerCase();
      if (kind === "image") {
        try {
          const mimeOk = String(rawAttachment.mime_type || rawAttachment.mimeType || "").toLowerCase().trim();
          const nameRaw = String(rawAttachment.name || rawAttachment.fileName || "imagen").trim() || "imagen";
          let b64 = String(rawAttachment.bytes_base64 || rawAttachment.data || rawAttachment.base64 || "").trim();
          if (!b64) {
            return difySendJson(res, 400, { error: "image_missing_bytes", message: "El adjunto de imagen no contiene bytes." });
          }
          if (b64.includes(",")) b64 = b64.split(",")[1];
          b64 = b64.replace(/\s+/g, "");
          if (!ALLOWED_IMAGE_MIMES.has(mimeOk)) {
            return difySendJson(res, 400, {
              error: "image_type_invalid",
              message: "Formato de imagen no admitido. Usa JPG, PNG o WEBP.",
            });
          }
          const nameExt =
            mimeOk === "image/png"
              ? ".png"
              : mimeOk === "image/webp"
                ? ".webp"
                : ".jpg";
          const safeName = `${(nameRaw.replace(/\.[^.]+$/, "").slice(0, 60) || "imagen")}${nameExt}`;
          let bytes: Buffer | null = null;
          try { bytes = Buffer.from(b64, "base64"); }
          catch { bytes = null; }
          if (!bytes || !bytes.length) {
            return difySendJson(res, 400, { error: "image_bytes_invalid", message: "La imagen no contiene bytes válidos." });
          }
          if (bytes.length > MAX_IMAGE_BYTES) {
            return difySendJson(res, 413, { error: "image_too_large", message: "La imagen supera los 10 MB permitidos." });
          }
          const up = await difyUploadFileToDify({
            apiKey: copilotApiKey,
            baseUrl: copilotApiUrl,
            user: auth.user,
            fileName: safeName,
            mimeType: mimeOk,
            bytes,
          });
          difyFileRefs = [{ type: "image", transfer_method: "local_file", upload_file_id: up.id }];
        } catch (e: any) {
          const upMsg = String(e instanceof Error ? e.message : String(e || "")).slice(0, 600);
          try { console.error(`[dify:chat:image_upload_error] ${upMsg}`); } catch {}
          const msg = upMsg
            ? `No pude subir la foto al copiloto Dify: ${upMsg}`
            : "No pude procesar la imagen adjunta.";
          return difySendJson(res, 502, { error: "image_upload_error", message: msg });
        }
      }
    }
    const message = String(body?.message || body?.query || body?.text || "").trim();
    if (!message && !difyFileRefs.length) {
      return difySendJson(res, 400, { error: "field_message_required", message: "Falta el campo 'message' (texto no vacío) o una imagen adjunta." });
    }
    const finalMessage =
      !message && difyFileRefs.length
        ? "Analiza con precisión esta foto y extrae todo el texto (letra de canción, párrafos o líneas). Si no se lee nada, indícalo claramente."
        : message;
    if (finalMessage.length > 20000) {
      return difySendJson(res, 413, { error: "field_message_too_long", message: "Mensaje demasiado largo (max 20,000 chars)." });
    }
    let conversationId = String(body?.conversation_id || body?.conversationId || "").trim();
    const userId = String(auth.user.id || "").trim();
    if (!conversationId) {
      if (DIFY_CONV_BY_USER_CACHE.has(userId)) {
        conversationId = DIFY_CONV_BY_USER_CACHE.get(userId) || "";
      } else {
        try {
          const profile = await loadUserProfile(auth.admin, userId);
          conversationId = difyExtractCopilotConversationFromProfile(profile);
          if (conversationId) DIFY_CONV_BY_USER_CACHE.set(userId, conversationId);
        } catch {}
      }
    }

    try {
      const upstream = await difyFetchCopilotFromDify({
        apiKey: copilotApiKey,
        apiUrl: copilotApiUrl,
        user: auth.user,
        message: finalMessage,
        conversationId,
        files: difyFileRefs.length ? difyFileRefs : undefined,
      });
      if (upstream.conversationId && upstream.conversationId !== conversationId) {
        DIFY_CONV_BY_USER_CACHE.set(userId, upstream.conversationId);
        try {
          await difySaveCopilotConversationToProfile(auth.admin, userId, upstream.conversationId);
        } catch {}
      }
      const structured = difyParseReadyToGenerateStructured(upstream.answer);
      const justText = structured
        ? stripInternalReasoning(
            String(upstream.answer || "")
              .replace(/```(?:json)?[\s\S]*?```/gi, "")
              .replace(/\{"action"\s*:\s*"ready_to_generate"[\s\S]*?\}/gi, "")
              .replace(/\n{3,}/g, "\n\n")
              .trim()
          )
        : String(upstream.answer || "");
      return difySendJson(res, 200, {
        reply_text: justText || "",
        conversation_id: upstream.conversationId || "",
        structured_action: structured || null,
        debug_provider: process.env.DIFY_COPILOT_DEBUG === "1" ? { answer_len: upstream.answer.length, structured_found: !!structured, has_image: difyFileRefs.length > 0 } : undefined,
      });
    } catch (e: any) {
      const msg = String(e instanceof Error ? e.message : String(e || "")).slice(0, 800);
      try { console.error(`[dify:chat:upstream_error] ${msg}`); } catch {}
      return difySendJson(res, 502, {
        error: "dify_upstream_error",
        message: `No pude conectar con el copiloto Dify: ${msg || "Error desconocido"}`,
      });
    }
  }

  async function handleDifyGenerate(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization, x-luciana-user-token");
      res.end();
      return;
    }
    if (method !== "POST") return difySendJson(res, 405, { error: "method_not_allowed", message: "Solo POST en /api/dify/generate." });

    const apiKeyCheck = difyValidateApiKey(req);
    if (!apiKeyCheck.ok) {
      const msg =
        apiKeyCheck.status === 500
          ? "DIFY_TOOL_API_KEY no está configurada en Vercel Environment Variables."
          : apiKeyCheck.status === 401
          ? "Authorization header inválido. Usa: Authorization: Bearer <DIFY_TOOL_API_KEY>."
          : "No autorizado.";
      return difySendJson(res, apiKeyCheck.status, { error: apiKeyCheck.error || "unauthorized", message: msg });
    }

    const userToken = difyExtractBearerFromHeader(req, "x-luciana-user-token");
    if (!userToken) {
      return difySendJson(res, 401, {
        error: "missing_x_luciana_user_token",
        message:
          "Falta el header X-Luciana-User-Token con el Bearer token del usuario final de LucIAna Music (SU sesión, JWT). Dify no se salta la autenticación ni los límites/créditos.",
      });
    }

    const rawBody = await (async () => {
      try { return await gptReadRawBody(req); } catch { return Buffer.alloc(0); }
    })();
    const contentType = (req.headers?.["content-type"] || req.headers?.["Content-Type"] || "").toString().toLowerCase();
    let body: any = {};
    try {
      const s = rawBody.toString("utf8");
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const out: any = {};
        try {
          const usp = new URLSearchParams(s);
          usp.forEach((v, k) => { out[k] = v; });
        } catch {}
        body = out;
      } else if (contentType.includes("application/json") || s) {
        try { body = s ? JSON.parse(s) : {}; } catch { body = parseAnyBody(req) || {}; }
      } else {
        body = parseAnyBody(req) || {};
      }
    } catch {
      body = parseAnyBody(req) || {};
    }
    const v = difyValidGenerateBody(body);
    if (!v.ok || !v.normalized) {
      const detail =
        v.error === "field_prompt_required"
          ? "Falta el campo 'prompt' (texto no vacío)."
          : v.error === "field_prompt_too_long"
          ? "Campo 'prompt' muy largo (max 12,000 chars)."
          : v.error === "invalid_body_expected_json_object"
          ? "Body debe ser un objeto JSON."
          : "Body inválido.";
      return difySendJson(res, v.status, { error: v.error || "invalid_request", message: detail });
    }

    const shared = difyGetInternalShared();
    if (!shared) {
      return difySendJson(res, 500, { error: "shared_pipeline_not_ready", message: "Pipeline interno no inicializado. Vuelve a intentarlo en 2 segundos." });
    }

    const internalUrl =
      "/api/gpt/generate" + (req.url && new URL(req.url, "http://localhost").search ? new URL(req.url, "http://localhost").search : "");
    const wrapped = difyBuildWrappedRequest(req, {
      method: "POST",
      url: internalUrl,
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${userToken}`,
        accept: "application/json",
      },
      bodyJson: {
        prompt: v.normalized.prompt,
        style: v.normalized.style,
        title: v.normalized.title,
        instrumental: v.normalized.instrumental,
        model: "V6",
      },
    });

    try {
      const r = await difyCaptureResponse(shared.generate, wrapped);
      if (!r.body || typeof r.body !== "object") {
        return difySendJson(res, 502, { error: "internal_generate_bad_response", message: "El generador interno no devolvió un JSON válido.", debug: typeof r.body });
      }
      const taskId =
        String((r.body as any).task_id || (r.body as any).taskId || "").trim() ||
        String((r.body as any).task?.id || "").trim();
      if (r.status >= 400) {
        const mapped = {
          error: String((r.body as any).error || "generate_failed"),
          message:
            String((r.body as any).message || (r.body as any).detail || `Error interno HTTP ${r.status}`).slice(0, 600) || "Error interno.",
          upstream_http_status: r.status,
          credits_required: Number.isFinite((r.body as any).credits_required) ? (r.body as any).credits_required : undefined,
          credits_available: Number.isFinite((r.body as any).credits_available) ? (r.body as any).credits_available : undefined,
        } as any;
        if (taskId) mapped.task_id = taskId;
        return difySendJson(res, r.status >= 400 && r.status < 600 ? r.status : 502, mapped);
      }
      const finalStatus = String((r.body as any).status || "").trim() || (taskId ? "queued" : "unknown");
      return difySendJson(res, 200, {
        task_id: taskId || undefined,
        status: finalStatus,
        credits_cost: Number.isFinite((r.body as any).credits_cost) ? (r.body as any).credits_cost : undefined,
        title: typeof (r.body as any).title === "string" ? (r.body as any).title.slice(0, 220) : undefined,
      });
    } catch (e) {
      return difySendJson(res, 502, {
        error: "internal_generate_exception",
        message: e instanceof Error ? String(e.message).slice(0, 600) : String(e).slice(0, 600),
      });
    }
  }

  async function handleDifyStatus(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "GET, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization, x-luciana-user-token");
      res.end();
      return;
    }
    if (method !== "GET") return difySendJson(res, 405, { error: "method_not_allowed", message: "Solo GET en /api/dify/status." });

    const apiKeyCheck = difyValidateApiKey(req);
    if (!apiKeyCheck.ok) {
      const msg =
        apiKeyCheck.status === 500
          ? "DIFY_TOOL_API_KEY no está configurada en Vercel Environment Variables."
          : apiKeyCheck.status === 401
          ? "Authorization header inválido. Usa: Authorization: Bearer <DIFY_TOOL_API_KEY>."
          : "No autorizado.";
      return difySendJson(res, apiKeyCheck.status, { error: apiKeyCheck.error || "unauthorized", message: msg });
    }

    const userToken = difyExtractBearerFromHeader(req, "x-luciana-user-token");
    if (!userToken) {
      return difySendJson(res, 401, {
        error: "missing_x_luciana_user_token",
        message: "Falta el header X-Luciana-User-Token Bearer <JWT usuario final>, igual que /api/dify/generate. No se permite lectura de tareas ajenas.",
      });
    }

    let taskId = "";
    try {
      const u = new URL(req.url, "http://localhost");
      taskId = String(u.searchParams.get("task_id") || u.searchParams.get("taskId") || u.searchParams.get("tid") || "").trim();
    } catch {}
    if (!taskId) {
      return difySendJson(res, 400, { error: "field_task_id_required", message: "Falta la query ?task_id=XXX (también admite taskId)." });
    }
    if (taskId.length > 200) {
      return difySendJson(res, 400, { error: "field_task_id_too_long", message: "task_id demasiado largo." });
    }

    const shared = difyGetInternalShared();
    if (!shared) {
      return difySendJson(res, 500, { error: "shared_pipeline_not_ready", message: "Pipeline interno no inicializado. Vuelve a intentarlo en 2 segundos." });
    }

    const internalUrl = `/api/gpt/status?task_id=${encodeURIComponent(taskId)}`;
    const wrapped = difyBuildWrappedRequest(req, {
      method: "GET",
      url: internalUrl,
      headers: {
        authorization: `Bearer ${userToken}`,
        accept: "application/json",
      },
    });

    try {
      const r = await difyCaptureResponse(shared.status, wrapped);
      if (!r.body || typeof r.body !== "object") {
        return difySendJson(res, 502, {
          task_id: taskId,
          status: "processing",
          audio_urls: [],
          error: "internal_status_bad_response",
        });
      }
      if (r.status >= 400 && r.status !== 500) {
        return difySendJson(res, r.status, {
          task_id: taskId,
          status: "processing",
          audio_urls: [],
          error: String((r.body as any).error || "status_failed"),
          message: String((r.body as any).message || (r.body as any).detail || "").slice(0, 600) || undefined,
          upstream_http_status: r.status,
        });
      }
      const rawStatus = String((r.body as any).status || "processing").toLowerCase().trim() || "processing";
      let status: "queued" | "processing" | "complete" | "failed" = "processing";
      if (["queued", "pending", "waiting", "submitted"].includes(rawStatus)) status = "queued";
      else if (["complete", "completed", "success", "done"].includes(rawStatus)) status = "complete";
      else if (["failed", "error", "rejected", "canceled", "cancelled"].includes(rawStatus)) status = "failed";

      const audio_urls: string[] = [];
      const tryAdd = (c: any) => {
        if (typeof c !== "string") return;
        const s = c.trim();
        if (!/^https?:\/\//i.test(s)) return;
        if (!audio_urls.includes(s)) audio_urls.push(s);
      };
      tryAdd((r.body as any).audio_url);
      tryAdd((r.body as any).audioUrl);
      tryAdd((r.body as any).stream_audio_url);
      tryAdd((r.body as any).streamAudioUrl);
      const extraRaw = Array.isArray((r.body as any).extra_songs) ? (r.body as any).extra_songs : [];
      for (const it of extraRaw) {
        tryAdd(it?.audio_url);
        tryAdd(it?.audioUrl);
        tryAdd(it?.stream_audio_url);
        tryAdd(it?.streamAudioUrl);
      }
      const extrasBucket = Array.isArray((r.body as any).audios) ? (r.body as any).audios : extraRaw;
      for (const it of extrasBucket) {
        if (it && typeof it === "object") {
          tryAdd(it.audio_url);
          tryAdd(it.audioUrl);
          tryAdd(it.stream_audio_url);
          tryAdd(it.streamAudioUrl);
        }
      }

      const cover_urls: string[] = [];
      const tryAddCover = (c: any) => {
        if (typeof c !== "string") return;
        const s = c.trim();
        if (!/^https?:\/\//i.test(s)) return;
        if (!cover_urls.includes(s)) cover_urls.push(s);
      };
      tryAddCover((r.body as any).cover_url);
      tryAddCover((r.body as any).coverUrl);
      tryAddCover((r.body as any).image_url);
      tryAddCover((r.body as any).imageUrl);
      for (const it of extraRaw) {
        tryAddCover(it?.cover_url);
        tryAddCover(it?.coverUrl);
        tryAddCover(it?.image_url);
        tryAddCover(it?.imageUrl);
      }

      const out: any = {
        task_id: taskId,
        status,
        audio_urls,
      };
      if (cover_urls.length) out.cover_urls = cover_urls;
      if (typeof (r.body as any).title === "string") out.title = (r.body as any).title.slice(0, 220);
      if (status === "failed") {
        out.message =
          String((r.body as any).message || (r.body as any).error || (r.body as any).provider_error || "").slice(0, 600) ||
          "La generación falló en el proveedor.";
      }
      return difySendJson(res, r.status >= 400 && r.status < 600 ? r.status : 200, out);
    } catch (e) {
      return difySendJson(res, 502, {
        task_id: taskId,
        status: "processing",
        audio_urls: [],
        error: "internal_status_exception",
        message: e instanceof Error ? String(e.message).slice(0, 600) : String(e).slice(0, 600),
      });
    }
  }

  return async function handler(req: any, res: any) {
    try {
      const u = new URL(req.url, "http://localhost");
      const parts = u.pathname.split("/").filter(Boolean);
      const head = parts[0] || "";
      const isApi = head === "api";
      const next = isApi ? parts[2] : parts[1];
      const ua = (req.headers?.["user-agent"] || req.headers?.["User-Agent"] || "").toString().slice(0, 220);
      const method = (req.method || "GET").toUpperCase();
      try {
        console.log(
          `[dify:entry] ${method} path=${u.pathname} next=${next} ua=${ua} hasAuth=!!${!!difyExtractBearerFromHeader(req, "authorization")} hasUser=!!${!!difyExtractBearerFromHeader(req, "x-luciana-user-token")} ip=${(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().slice(0, 80)}`
        );
      } catch {}
      if (next === "chat") return await handleDifyChat(req, res);
      if (next === "generate") return await handleDifyGenerate(req, res);
      if (next === "status") return await handleDifyStatus(req, res);
      return difySendJson(res, 404, {
        error: "ruta_no_encontrada",
        message:
          "Endpoints Dify admitidos:\n· POST /api/dify/chat (copiloto conversacional por usuario)\n· POST /api/dify/generate · GET /api/dify/status?task_id=... (herramientas server-to-server con DIFY_TOOL_API_KEY)",
      });
    } catch (e) {
      try {
        console.error(`[dify:entry] crash: ${e instanceof Error ? (e.stack || e.message) : String(e)}`);
      } catch {}
      return difySendJson(res, 500, {
        error: "error_interno",
        message: e instanceof Error ? String(e.message).slice(0, 600) : String(e).slice(0, 600),
      });
    }
  };
})();

const gptHandler = (() => {
  async function handleGenerate(req: any, res: any) {
    if ((req.method || "").toUpperCase() === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization");
      res.end();
      return;
    }
    if ((req.method || "").toUpperCase() !== "POST") return oauthGptSendJson(res, 405, { error: "method_not_allowed", message: "Solo POST" });

    const token = extractBearerToken(req);
    const auth = await requireAnyUserFromToken(token);
    if (!auth.ok) return oauthGptSendJson(res, auth.status, { error: "unauthorized", message: auth.error });

    const body = parseAnyBody(req) || {};
    const cost = Number(CREDIT_COSTS.generate_music) || 12;
    const isAdmin = isAdminEmail(auth.user.email);

    if (!isAdmin) {
      const profile = await loadUserProfile(auth.admin, auth.user.id);
      const available = creditsFromProfile(profile);
      if (!Number.isFinite(available) || available < cost) {
        return oauthGptSendJson(res, 402, {
          error: "insufficient_credits",
          message: "No tienes suficientes créditos en LucIAna Music para generar esta canción. Recarga en tu panel.",
          credits_required: cost,
          credits_available: Number.isFinite(available) ? available : 0,
        });
      }
    }

    const origin = (() => {
      try {
        const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
        const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
        return `${proto}://${host}`;
      } catch {
        return "";
      }
    })();

    const callGenerateUrl = origin ? new URL("/api/suno/generate", origin).toString() : "/api/suno/generate";
    const headersInternal: Record<string, string> = { "content-type": "application/json" };
    if (token) headersInternal.authorization = `Bearer ${token}`;

    const payload: any = {
      prompt: typeof body?.prompt === "string" ? body.prompt : "",
      style: typeof body?.style === "string" ? body.style : "",
      title: typeof body?.title === "string" ? body.title : "",
      instrumental: Boolean(body?.instrumental),
      model: typeof body?.model === "string" ? body.model : "V6",
      mv: typeof body?.mv === "string" ? body.mv : "",
      customMode: typeof body?.customMode === "boolean" ? body.customMode : (Boolean(body?.style) || Boolean(body?.title)),
      negativeTags: typeof body?.negativeTags === "string" ? body.negativeTags : "",
      personaId: typeof body?.personaId === "string" ? body.personaId : "",
      personaModel: typeof body?.personaModel === "string" ? body.personaModel : "",
      vocalGender: typeof body?.vocalGender === "string" ? body.vocalGender : "",
      styleWeight: typeof body?.styleWeight === "number" ? body.styleWeight : undefined,
      weirdnessConstraint: typeof body?.weirdnessConstraint === "number" ? body.weirdnessConstraint : undefined,
      audioWeight: typeof body?.audioWeight === "number" ? body.audioWeight : undefined,
    };

    let started: any = null;
    try {
      const r = await fetch(callGenerateUrl, {
        method: "POST",
        headers: headersInternal,
        body: JSON.stringify(payload),
      });
      const out = await r.json().catch(() => ({}));
      started = { ok: r.ok, status: r.status, out };
    } catch (e) {
      return oauthGptSendJson(res, 502, {
        error: "generate_error",
        message: e instanceof Error ? e.message : "No pude conectar con el generador.",
      });
    }

    if (!started.ok) {
      const errCode = Number(started?.status || 0);
      const msg =
        (typeof started?.out?.error === "string" && started.out.error) ||
        (typeof started?.out?.message === "string" && started.out.message) ||
        (typeof started?.out?.detail === "string" && started.out.detail) ||
        `Error HTTP ${errCode || 502}`;
      return oauthGptSendJson(res, errCode >= 400 ? errCode : 502, {
        error: errCode === 402 ? "insufficient_credits" : "generate_error",
        message: msg,
      });
    }

    const taskId = String(started?.out?.taskId || started?.out?.task_id || "").trim();
    const title =
      (typeof payload.title === "string" && payload.title.trim()) ||
      (typeof payload.prompt === "string" ? payload.prompt.slice(0, 80).trim() : "Canción LucIAna");
    return oauthGptSendJson(res, 200, {
      taskId: taskId || undefined,
      task_id: taskId || undefined,
      title,
      status: taskId ? "queued" : "unknown",
      provider: "suno_v6",
      credits_cost: cost,
    });
  }

  async function handleStatus(req: any, res: any) {
    if ((req.method || "").toUpperCase() === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "GET, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization");
      res.end();
      return;
    }
    if ((req.method || "").toUpperCase() !== "GET") return oauthGptSendJson(res, 405, { error: "method_not_allowed", message: "Solo GET" });

    const token = extractBearerToken(req);
    const auth = await requireAnyUserFromToken(token);
    if (!auth.ok) return oauthGptSendJson(res, auth.status, { error: "unauthorized", message: auth.error });

    let taskId = "";
    try {
      const u = new URL(req.url, "http://localhost");
      taskId = String(u.searchParams.get("taskId") || u.searchParams.get("task_id") || "").trim();
    } catch {}
    if (!taskId) return oauthGptSendJson(res, 400, { error: "invalid_request", message: "Falta el parámetro taskId en la query." });

    const isAdmin = isAdminEmail(auth.user.email);
    try {
      const rowsRaw = await auth.admin.from("suno_tasks").select("user_id, kind, cost, consumed, created_at").eq("task_id", taskId).limit(1);
      const row = Array.isArray(rowsRaw?.data) ? rowsRaw.data[0] : null;
      if (!isAdmin) {
        if (!row || String((row as any)?.user_id || "") !== String(auth.user.id || "")) {
          return oauthGptSendJson(res, 403, {
            error: "forbidden",
            message: "Este taskId no pertenece a tu cuenta de LucIAna Music.",
          });
        }
      }
    } catch {}

    try {
      const libRows = await auth.admin
        .from("library_items")
        .select("id, title, audio_url, cover_url, created_at, type, suno_task_id, suno_audio_id, deleted_at")
        .eq("suno_task_id", taskId)
        .limit(5);
      const libItems = (Array.isArray(libRows?.data) ? (libRows.data as any[]) : []).filter((x: any) => !x?.deleted_at);
      if (libItems.length && (libItems[0].audio_url || libItems[0].cover_url)) {
        const first = libItems[0];
        const extras = libItems.length > 1 ? libItems.slice(1).map((x: any) => ({
          id: String(x.id || ""),
          title: String(x.title || "").trim(),
          audio_url: String(x.audio_url || "").trim() || null,
          cover_url: String(x.cover_url || "").trim() || null,
        })).filter((x: any) => x.audio_url) : [];
        return oauthGptSendJson(res, 200, {
          taskId,
          task_id: taskId,
          status: "complete",
          title: String(first.title || "").trim() || null,
          audio_url: String(first.audio_url || "").trim() || null,
          cover_url: String(first.cover_url || "").trim() || null,
          extra_songs: extras.length ? extras : undefined,
          provider: "suno_v6",
          source: "supabase_library",
        });
      }
    } catch {}

    const origin = (() => {
      try {
        const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
        const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
        return `${proto}://${host}`;
      } catch {
        return "";
      }
    })();

    const taskStatusUrl = origin ? new URL(`/api/suno/task?taskId=${encodeURIComponent(taskId)}&kind=generate`, origin).toString() : `/api/suno/task?taskId=${encodeURIComponent(taskId)}&kind=generate`;
    const headersInternal: Record<string, string> = { "content-type": "application/json" };
    if (token) headersInternal.authorization = `Bearer ${token}`;

    let providerResult: any = null;
    try {
      const r = await fetch(taskStatusUrl, { method: "GET", headers: headersInternal });
      const out = await r.json().catch(() => ({}));
      providerResult = { ok: r.ok, status: r.status, out };
    } catch (e) {
      return oauthGptSendJson(res, 502, {
        taskId,
        task_id: taskId,
        status: "processing",
        audio_url: null,
        cover_url: null,
        title: null,
        provider: "suno_v6",
        error: "status_fetch_error",
        message: e instanceof Error ? e.message : "No pude consultar el estado con el proveedor. Vuelve a intentarlo en unos segundos.",
      });
    }

    if (!providerResult.ok) {
      const errCode = Number(providerResult?.status || 0);
      const msg =
        (typeof providerResult?.out?.error === "string" && providerResult.out.error) ||
        (typeof providerResult?.out?.detail === "string" && providerResult.out.detail) ||
        `Error HTTP ${errCode || 502}`;
      return oauthGptSendJson(res, errCode >= 400 ? errCode : 502, {
        taskId,
        task_id: taskId,
        status: "processing",
        audio_url: null,
        cover_url: null,
        title: null,
        provider: "suno_v6",
        error: "status_provider_error",
        message: msg,
      });
    }

    const kind = String(providerResult?.out?.kind || "generate").toLowerCase().trim();
    const raw = providerResult?.out?.data ?? null;
    const statusRaw =
      raw?.status ??
      raw?.successFlag ??
      raw?.data?.status ??
      raw?.data?.successFlag ??
      raw?.data?.data?.status ??
      raw?.data?.data?.successFlag ??
      "";
    const normalized = String(statusRaw || "").toUpperCase();

    let status: "complete" | "processing" | "failed" = "processing";
    if (normalized === "SUCCESS") status = "complete";
    else if (
      normalized === "FAILED" ||
      normalized === "CREATE_TASK_FAILED" ||
      normalized === "GENERATE_AUDIO_FAILED" ||
      normalized === "GENERATE_LYRICS_FAILED" ||
      normalized === "CALLBACK_EXCEPTION" ||
      normalized === "SENSITIVE_WORD_ERROR" ||
      normalized.startsWith("GENERATE_") && normalized.endsWith("_FAILED")
    ) {
      status = "failed";
    }

    const pickFirstUrl = (...candidates: any[]): string | null => {
      for (const c of candidates) {
        if (typeof c === "string") {
          const s = c.trim();
          if (/^https?:\/\//i.test(s)) return s;
        }
      }
      return null;
    };

    const audiosBucket: any[] = [];
    try {
      const c1 = Array.isArray(raw?.audios) ? raw.audios : [];
      const c2 = Array.isArray(raw?.data?.audios) ? raw.data.audios : [];
      const c3 = Array.isArray(raw?.data?.data?.audios) ? raw.data.data.audios : [];
      for (const arr of [c1, c2, c3]) {
        for (const it of arr) {
          if (it && typeof it === "object") audiosBucket.push(it);
        }
      }
    } catch {}

    const audio_url = pickFirstUrl(
      raw?.audio_url,
      raw?.audioUrl,
      raw?.stream_audio_url,
      raw?.streamAudioUrl,
      raw?.data?.audio_url,
      raw?.data?.audioUrl,
      raw?.data?.stream_audio_url,
      raw?.data?.streamAudioUrl,
      raw?.data?.data?.audio_url,
      raw?.data?.data?.audioUrl,
      raw?.data?.data?.stream_audio_url,
      raw?.data?.data?.streamAudioUrl,
      audiosBucket[0]?.audio_url,
      audiosBucket[0]?.audioUrl,
      audiosBucket[0]?.stream_audio_url,
      audiosBucket[0]?.streamAudioUrl
    );
    const cover_url = pickFirstUrl(
      raw?.cover_url,
      raw?.coverUrl,
      raw?.image_url,
      raw?.imageUrl,
      raw?.data?.cover_url,
      raw?.data?.coverUrl,
      raw?.data?.image_url,
      raw?.data?.imageUrl,
      raw?.data?.data?.cover_url,
      raw?.data?.data?.coverUrl,
      raw?.data?.data?.image_url,
      raw?.data?.data?.imageUrl,
      audiosBucket[0]?.cover_url,
      audiosBucket[0]?.coverUrl,
      audiosBucket[0]?.image_url,
      audiosBucket[0]?.imageUrl
    );
    const title =
      (typeof raw?.title === "string" && raw.title.trim()) ||
      (typeof raw?.data?.title === "string" && raw.data.title.trim()) ||
      (typeof raw?.data?.data?.title === "string" && raw.data.data.title.trim()) ||
      (typeof audiosBucket[0]?.title === "string" && audiosBucket[0].title.trim()) ||
      null;

    const extras =
      audiosBucket.length > 1
        ? audiosBucket.slice(0, 10).map((x: any, i: number) => ({
            index: i,
            title: typeof x?.title === "string" ? x.title.trim() : null,
            audio_url: pickFirstUrl(x?.audio_url, x?.audioUrl, x?.stream_audio_url, x?.streamAudioUrl),
            cover_url: pickFirstUrl(x?.cover_url, x?.coverUrl, x?.image_url, x?.imageUrl),
          })).filter((x: any) => x.audio_url)
        : [];

    const failedMessage =
      status === "failed"
        ? (typeof raw?.errorMessage === "string" && raw.errorMessage) ||
          (typeof raw?.msg === "string" && raw.msg) ||
          (typeof raw?.message === "string" && raw.message) ||
          (typeof raw?.data?.message === "string" && raw.data.message) ||
          "El proveedor no pudo generar la canción (tema restringido, parámetros inválidos o error interno). Intenta con otro prompt."
        : null;

    return oauthGptSendJson(res, 200, {
      taskId,
      task_id: taskId,
      status,
      title,
      audio_url,
      cover_url,
      extra_songs: extras.length ? extras : undefined,
      provider: "suno_v6",
      source: "suno_provider",
      provider_kind: kind || "generate",
      provider_status_raw: normalized || undefined,
      message: failedMessage || undefined,
    });
  }

  async function handleUploadAudio(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization");
      res.end();
      return;
    }
    if (method !== "POST") return oauthGptSendJson(res, 405, { success: false, error: "method_not_allowed", message: "Solo POST" });

    const token = extractBearerToken(req);
    const auth = await requireAnyUserFromToken(token);
    if (!auth.ok) {
      const authHeaderRaw = (req.headers?.authorization || req.headers?.Authorization || "").toString();
      console.error("[handleUploadAudio] 401 Unauthorized en /api/gpt/upload-audio. Detalle completo depuracion token:", {
        authStatus: auth.status,
        authError: auth.error,
        tokenLlegadaPresent: !!token,
        tokenLlegadaLength: (token || "").length,
        tokenLlegadaStart: (token || "").slice(0, 12) + "...",
        authHeaderPresent: !!authHeaderRaw,
        authHeaderStartsBearer: /^bearer\s/i.test(authHeaderRaw),
        authHeaderLength: authHeaderRaw.length,
        contentType: (req.headers?.["content-type"] || req.headers?.["Content-Type"] || "").toString().slice(0, 200),
        pathname: req.url,
        method,
        ua: (req.headers?.["user-agent"] || req.headers?.["User-Agent"] || "").toString().slice(0, 180),
        timestamp: new Date().toISOString()
      });
      return oauthGptSendJson(res, auth.status, { success: false, error: "unauthorized", message: auth.error });
    }

    const contentType = (req.headers["content-type"] || req.headers["Content-Type"] || "").toString().trim().toLowerCase();
    const isMultipart = contentType.startsWith("multipart/form-data");
    const isJson = contentType.startsWith("application/json");
    const isOctet = contentType.startsWith("application/octet-stream") || contentType.startsWith("audio/");

    let bytes: Buffer | Uint8Array | null = null;
    let fileName = "";
    let mime = "";
    let params: any = {};

    try {
      if (isMultipart) {
        const boundaryMatch = /boundary=([^;]+)/i.exec(String(req.headers["content-type"] || req.headers["Content-Type"] || ""));
        const boundary = boundaryMatch ? boundaryMatch[1].trim().replace(/^"|"$/g, "") : "";
        if (!boundary) throw new Error("Missing multipart boundary");
        const raw = await gptReadRawBody(req);
        const parsed = gptParseMultipart(raw, boundary);
        const f = parsed.files.find(x => x) || null;
        if (!f || !f.content?.byteLength) throw new Error("No se recibió ningún archivo de audio (multipart). Sube un archivo .mp3/.wav/.m4a/.ogg en el campo 'file'.");
        bytes = f.content;
        fileName = f.filename || "";
        mime = f.contentType || "";
        params = parsed.fields || {};
      } else if (isJson) {
        const body = parseAnyBody(req) || {};
        let raw64 = "";
        if (typeof body?.file === "string") raw64 = body.file;
        else if (typeof body?.audio === "string") raw64 = body.audio;
        else if (typeof body?.data === "string") raw64 = body.data;
        if (raw64) {
          const clean = raw64.includes(",") ? raw64.slice(raw64.indexOf(",") + 1) : raw64;
          bytes = Buffer.from(clean, "base64");
        }
        if (!bytes || !bytes.byteLength) {
          if (typeof body?.fileBytes?.length === "number") bytes = Buffer.from(new Uint8Array(body.fileBytes));
          else if (Array.isArray(body?.bytes)) bytes = Buffer.from(new Uint8Array(body.bytes.filter(v => typeof v === "number").map(v => Number(v) & 0xff)));
        }
        fileName = typeof body?.filename === "string" ? body.filename : (typeof body?.name === "string" ? body.name : "");
        mime = typeof body?.contentType === "string" ? body.contentType : (typeof body?.mimeType === "string" ? body.mimeType : "");
        params = body || {};
      } else if (isOctet) {
        bytes = await gptReadRawBody(req);
        fileName = "";
        mime = contentType;
        params = {};
      } else {
        const raw = await gptReadRawBody(req);
        if (raw && raw.length > 0) {
          const s = raw.toString("utf-8");
          try {
            const j = JSON.parse(s);
            const clean = (typeof j?.file === "string") ? (j.file.includes(",") ? j.file.slice(j.file.indexOf(",") + 1) : j.file) : "";
            bytes = clean ? Buffer.from(clean, "base64") : null;
            fileName = typeof j?.filename === "string" ? j.filename : "";
            mime = typeof j?.contentType === "string" ? j.contentType : "";
            params = j || {};
          } catch {
            bytes = raw;
            mime = contentType;
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return oauthGptSendJson(res, 400, { success: false, error: "invalid_body", message: `No pude leer el audio subido: ${msg.slice(0, 400)}` });
    }

    if (!bytes || !bytes.byteLength) {
      return oauthGptSendJson(res, 400, { success: false, error: "missing_audio", message: "No se recibió ningún archivo de audio válido. Sube un archivo .mp3, .wav, .m4a o .ogg." });
    }

    const sizeBytes = Number(bytes.byteLength) || 0;
    if (!sizeBytes) return oauthGptSendJson(res, 400, { success: false, error: "empty_audio", message: "El audio está vacío." });
    if (sizeBytes > GPT_UPLOAD_AUDIO_MAX_BYTES) {
      return oauthGptSendJson(res, 413, {
        success: false,
        error: "audio_too_large",
        message: `Audio muy pesado. Máximo permitido: ${Math.round(GPT_UPLOAD_AUDIO_MAX_BYTES / 1024 / 1024)} MB. Tu archivo: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB.`,
        max_bytes: GPT_UPLOAD_AUDIO_MAX_BYTES,
        size_bytes: sizeBytes,
      });
    }

    const explicitExt = gptAudioSafeExt(typeof params?.ext === "string" ? params.ext : (typeof params?.extension === "string" ? params.extension : ""));
    let ext = explicitExt || gptAudioGuessExt(fileName, mime);
    if (!ext) ext = ".bin";

    if (!gptAudioSafeExt(ext)) {
      return oauthGptSendJson(res, 415, {
        success: false,
        error: "unsupported_format",
        message: `Formato de audio no permitido. Usa .mp3, .wav, .m4a, .ogg (detectado ext=${ext || "ninguna"} mime=${mime || "ninguno"}).`,
      });
    }

    try {
      const r2Env = getR2Env();
      if (!r2Env?.bucketName) throw new Error("R2 no configurado");
    } catch (e) {
      return oauthGptSendJson(res, 500, {
        success: false,
        error: "storage_not_configured",
        message: "Almacenamiento R2 no está configurado en el servidor.",
      });
    }

    const uuid = gptUuidV4();
    const cleanBase = fileName ? gptAudioCleanFileName(fileName.split(/[.]/).slice(0, -1).join(".") || "audio") : "audio";
    const datePrefix = `${new Date().getUTCFullYear()}${String(new Date().getUTCMonth() + 1).padStart(2, "0")}${String(new Date().getUTCDate()).padStart(2, "0")}`;
    const userIdShort = String(auth.user.id || "anon").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "anon";
    const key = `${GPT_UPLOAD_AUDIO_R2_PREFIX}/${datePrefix}/${userIdShort}/${uuid}-${cleanBase}${ext}`;
    const finalMime = GPT_UPLOAD_AUDIO_ALLOWED_EXTS[gptAudioSafeExt(ext)] || (mime && /^audio\//i.test(mime) ? mime : "application/octet-stream");

    let publicUrl = "";
    try {
      publicUrl = await uploadToR2(key, bytes, finalMime);
    } catch (r2Err) {
      const msg = r2Err instanceof Error ? r2Err.message : String(r2Err || "");
      try {
        const sbUrl = (process.env.SUPABASE_URL || "").toString().trim();
        const sbSvc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
        if (sbUrl && sbSvc) {
          const createClient = await getSupabaseCreateClient();
          const sb = createClient(sbUrl, sbSvc, { auth: { persistSession: false } });
          const up = await sb.storage.from("ramber-tunes").upload(key, Buffer.from(bytes as any), { contentType: finalMime, upsert: true });
          if (up?.error) throw up.error;
          const signed = await sb.storage.from("ramber-tunes").createSignedUrl(key, 60 * 60 * 24 * 7);
          if (signed?.error) throw signed.error;
          const raw = (signed?.data as any)?.signedUrl || "";
          if (!raw) throw new Error("No signed url from supabase");
          publicUrl = /^https?:\/\//i.test(String(raw)) ? String(raw) : new URL(String(raw), sbUrl).toString();
        } else {
          throw r2Err;
        }
      } catch (supErr) {
        const sm = supErr instanceof Error ? supErr.message : String(supErr || "");
        try { console.error(JSON.stringify({ kind: "GPT_UPLOAD_AUDIO", userId: auth.user.id, key, sizeBytes, ext, mime, r2: msg.slice(0, 300), supabase: sm.slice(0, 300) })); } catch {}
        return oauthGptSendJson(res, 502, { success: false, error: "storage_upload_failed", message: `No pude guardar el audio: ${sm.slice(0, 400)}` });
      }
    }

    return oauthGptSendJson(res, 200, {
      success: true,
      url: publicUrl,
      r2_key: key,
      filename: `${cleanBase}${ext}`,
      content_type: finalMime,
      size_bytes: sizeBytes,
      ext: ext.replace(/^\./, ""),
      user_id: auth.user.id,
      expires_in_seconds: 30 * 24 * 60 * 60,
    });
  }

  async function handleCover(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization");
      res.end();
      return;
    }
    if (method !== "POST") return oauthGptSendJson(res, 405, { error: "method_not_allowed", message: "Solo POST" });

    const token = extractBearerToken(req);
    const auth = await requireAnyUserFromToken(token);
    if (!auth.ok) return oauthGptSendJson(res, auth.status, { error: "unauthorized", message: auth.error });

    const body = parseAnyBody(req) || {};
    const cost = Number(CREDIT_COSTS.upload_and_cover) || 12;
    const isAdmin = isAdminEmail(auth.user.email);

    if (!isAdmin) {
      const profile = await loadUserProfile(auth.admin, auth.user.id);
      const available = creditsFromProfile(profile);
      if (!Number.isFinite(available) || available < cost) {
        return oauthGptSendJson(res, 402, {
          error: "insufficient_credits",
          message: "No tienes suficientes créditos en LucIAna Music para hacer este cover. Recarga en tu panel.",
          credits_required: cost,
          credits_available: Number.isFinite(available) ? available : 0,
        });
      }
    }

    const uploadUrl =
      (typeof body?.upload_url === "string" ? body.upload_url.trim() : "") ||
      (typeof body?.uploadUrl === "string" ? body.uploadUrl.trim() : "") ||
      (typeof body?.url === "string" ? body.url.trim() : "") ||
      (typeof body?.audio_url === "string" ? body.audio_url.trim() : "") ||
      "";
    const uploadPath =
      (typeof body?.upload_path === "string" ? body.upload_path.trim() : "") ||
      (typeof body?.uploadPath === "string" ? body.uploadPath.trim() : "") ||
      (typeof body?.r2_key === "string" ? body.r2_key.trim() : "") ||
      (typeof body?.key === "string" ? body.key.trim() : "") ||
      "";

    if (!uploadUrl && !uploadPath) {
      return oauthGptSendJson(res, 400, {
        error: "invalid_request",
        message: "Falta upload_url (URL pública HTTPS del audio) o upload_path (key del archivo en R2). Primero sube el audio a /api/gpt/upload-audio.",
      });
    }

    const origin = (() => {
      try {
        const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
        const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
        return `${proto}://${host}`;
      } catch {
        return "";
      }
    })();

    const callCoverUrl = origin ? new URL("/api/suno/upload-cover", origin).toString() : "/api/suno/upload-cover";
    const headersInternal: Record<string, string> = { "content-type": "application/json" };
    if (token) headersInternal.authorization = `Bearer ${token}`;

    const payload: any = {};
    payload.uploadUrl = uploadUrl || undefined;
    payload.uploadPath = uploadPath || undefined;
    if (typeof body?.prompt === "string") payload.prompt = body.prompt;
    if (typeof body?.lyrics === "string" && !payload.prompt) payload.prompt = body.lyrics;
    if (typeof body?.style === "string") payload.style = body.style;
    if (typeof body?.genre === "string" && !payload.style) payload.style = body.genre;
    if (typeof body?.title === "string") payload.title = body.title;
    if (typeof body?.instrumental === "boolean") payload.instrumental = body.instrumental;
    if (typeof body?.model === "string") payload.model = body.model; else payload.model = "V6";
    if (typeof body?.negativeTags === "string") payload.negativeTags = body.negativeTags;
    if (typeof body?.negative_tags === "string" && !payload.negativeTags) payload.negativeTags = body.negative_tags;
    if (typeof body?.personaId === "string") payload.personaId = body.personaId;
    if (typeof body?.persona_id === "string" && !payload.personaId) payload.personaId = body.persona_id;
    if (typeof body?.personaModel === "string") payload.personaModel = body.personaModel;
    if (typeof body?.vocalGender === "string") payload.vocalGender = body.vocalGender;
    if (typeof body?.vocal_gender === "string" && !payload.vocalGender) payload.vocalGender = body.vocal_gender;
    if (typeof body?.styleWeight === "number") payload.styleWeight = body.styleWeight;
    if (typeof body?.weirdnessConstraint === "number") payload.weirdnessConstraint = body.weirdnessConstraint;
    if (typeof body?.audioWeight === "number") payload.audioWeight = body.audioWeight;

    let started: any = null;
    try {
      const r = await fetch(callCoverUrl, { method: "POST", headers: headersInternal, body: JSON.stringify(payload) });
      const out = await r.json().catch(() => ({}));
      started = { ok: r.ok, status: r.status, out };
    } catch (e) {
      return oauthGptSendJson(res, 502, { error: "cover_error", message: e instanceof Error ? e.message : "No pude conectar con el generador de covers." });
    }

    if (!started.ok) {
      const errCode = Number(started?.status || 0);
      const msg =
        (typeof started?.out?.error === "string" && started.out.error) ||
        (typeof started?.out?.message === "string" && started.out.message) ||
        (typeof started?.out?.detail === "string" && started.out.detail) ||
        `Error HTTP ${errCode || 502}`;
      return oauthGptSendJson(res, errCode >= 400 ? errCode : 502, {
        error: errCode === 402 ? "insufficient_credits" : "cover_error",
        message: msg,
      });
    }

    const taskId = String(started?.out?.taskId || started?.out?.task_id || "").trim();
    const title =
      (typeof payload.title === "string" && payload.title.trim()) ||
      (typeof uploadPath === "string" ? uploadPath.split("/").pop() : "") ||
      "Cover LucIAna";
    return oauthGptSendJson(res, 200, {
      taskId: taskId || undefined,
      task_id: taskId || undefined,
      title,
      status: taskId ? "queued" : "unknown",
      provider: "suno_v6",
      credits_cost: cost,
    });
  }

  async function handleTranscribe(req: any, res: any) {
    const method = (req.method || "").toUpperCase();
    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization");
      res.end();
      return;
    }
    if (method !== "POST") {
      console.error("[handleTranscribe Error] method_not_allowed", { method });
      return oauthGptSendJson(res, 405, { success: false, error: "method_not_allowed", message: "Solo POST" });
    }

    const token = extractBearerToken(req);
    const auth = await requireAnyUserFromToken(token);
    const body = parseAnyBody(req) || {};
    const audioUrlRaw =
      (typeof body?.audio_url === "string" ? body.audio_url.trim() : "") ||
      (typeof body?.audioUrl === "string" ? body.audioUrl.trim() : "") ||
      (typeof body?.url === "string" ? body.url.trim() : "") ||
      "";

    if (!audioUrlRaw) {
      console.error("[handleTranscribe Error] invalid_request: missing audio_url", {
        hasToken: !!(token && token.trim().length > 0),
        authOk: auth.ok,
        authStatus: auth.status,
        bodyKeys: Object.keys(body || {}).slice(0, 10),
      });
      return oauthGptSendJson(res, 400, {
        success: false,
        error: "invalid_request",
        message: "Falta audio_url (URL pública HTTPS o HTTP del archivo MP3).",
      });
    }
    let audioUrl: URL;
    try {
      audioUrl = new URL(audioUrlRaw);
      if (!(audioUrl.protocol === "https:" || audioUrl.protocol === "http:")) throw new Error("proto");
    } catch (e) {
      console.error("[handleTranscribe Error] invalid_request: invalid audio_url", {
        audioUrlRaw: audioUrlRaw.slice(0, 120),
        err: e instanceof Error ? e.message : String(e),
      });
      return oauthGptSendJson(res, 400, {
        success: false,
        error: "invalid_request",
        message: "audio_url debe ser una URL pública válida (https:// o http://).",
      });
    }

    const TRUSTED_HOST_REGEX = /(^|\.)(lucianamusic\.app|ramber-tunes\.vercel\.app|r2\.lucianamusic\.app|ramber-tunes\.supabase\.co|r2\.dev)$/i;
    const isTrustedHost = TRUSTED_HOST_REGEX.test(audioUrl.hostname);

    if (!auth.ok) {
      if (isTrustedHost) {
        console.error("[handleTranscribe Auth Bypass] auth failed but audio from trusted host → allowed (no user)", {
          hostname: audioUrl.hostname,
          authStatus: auth.status,
          authError: auth.error,
          tokenLen: (token || "").trim().length,
        });
      } else {
        console.error("[handleTranscribe Error] unauthorized: invalid/missing Bearer token AND audio NOT from trusted host", {
          hostname: audioUrl.hostname,
          isTrustedHost: false,
          authStatus: auth.status,
          authError: auth.error,
          tokenLen: (token || "").trim().length,
        });
        return oauthGptSendJson(res, auth.status, { success: false, error: "unauthorized", message: auth.error || "No autorizado" });
      }
    }

    const RESOLVE_GEMINI_KEY = () => String(
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      process.env.GEMINI_KEY ||
      process.env.GOOGLE_AI_STUDIO_KEY ||
      process.env.AI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY ||
      ""
    ).trim();
    const GEMINI_RESOLVED_KEY = RESOLVE_GEMINI_KEY();
    const ENV_DETAILED_PRESENT = {
      GEMINI_API_KEY: !!(process.env.GEMINI_API_KEY && String(process.env.GEMINI_API_KEY).trim().length >= 8),
      GOOGLE_GEMINI_API_KEY: !!(process.env.GOOGLE_GEMINI_API_KEY && String(process.env.GOOGLE_GEMINI_API_KEY).trim().length >= 8),
      GOOGLE_API_KEY: !!(process.env.GOOGLE_API_KEY && String(process.env.GOOGLE_API_KEY).trim().length >= 8),
      VITE_GEMINI_API_KEY: !!(process.env.VITE_GEMINI_API_KEY && String(process.env.VITE_GEMINI_API_KEY).trim().length >= 8),
      NEXT_PUBLIC_GEMINI_API_KEY: !!(process.env.NEXT_PUBLIC_GEMINI_API_KEY && String(process.env.NEXT_PUBLIC_GEMINI_API_KEY).trim().length >= 8),
      GEMINI_KEY: !!(process.env.GEMINI_KEY && String(process.env.GEMINI_KEY).trim().length >= 8),
      GOOGLE_AI_STUDIO_KEY: !!(process.env.GOOGLE_AI_STUDIO_KEY && String(process.env.GOOGLE_AI_STUDIO_KEY).trim().length >= 8),
      AI_API_KEY: !!(process.env.AI_API_KEY && String(process.env.AI_API_KEY).trim().length >= 8),
      GOOGLE_AI_API_KEY: !!(process.env.GOOGLE_AI_API_KEY && String(process.env.GOOGLE_AI_API_KEY).trim().length >= 8),
    };
    const resolvedLen = GEMINI_RESOLVED_KEY.length;
    const resolveTranscribeFn = (): ((audioBuf: ArrayBuffer, mimeType: string) => Promise<any>) => {
      try {
        if (typeof (transcribeLyricsWithGemini as any) === "function") return (transcribeLyricsWithGemini as any);
      } catch {}
      try {
        const gt = globalThis as any;
        const shared = (gt && typeof gt.__LUCIANA_SHARED_FNS === "object" && gt.__LUCIANA_SHARED_FNS !== null) ? gt.__LUCIANA_SHARED_FNS : null;
        if (shared && typeof shared.transcribeLyricsWithGemini === "function") return shared.transcribeLyricsWithGemini;
      } catch {}
      return undefined as any;
    };
    const transcribeGemini: any = resolveTranscribeFn();
    if (typeof transcribeGemini !== "function") {
      const detail = [
        "Error interno: pipeline de transcripción (transcribeLyricsWithGemini) no está disponible en este despliegue.",
        `GEMINI_RESOLVED_KEY.length=${resolvedLen}; env_detailed_present=${JSON.stringify(ENV_DETAILED_PRESENT)}`,
        `Lexical scope typeof=${typeof (transcribeLyricsWithGemini as any)}; shared typeof=${typeof (globalThis as any)?.__LUCIANA_SHARED_FNS?.transcribeLyricsWithGemini}`,
      ].join(" | ");
      console.error("[handleTranscribe Error] 422 transcribe_failed: transcribeLyricsWithGemini not available (separate closures)", {
        geminiKeyLen: resolvedLen,
        env_detailed_present: ENV_DETAILED_PRESENT,
        lexical_typeof: typeof (transcribeLyricsWithGemini as any),
        shared_typeof: typeof (globalThis as any)?.__LUCIANA_SHARED_FNS?.transcribeLyricsWithGemini,
      });
      return oauthGptSendJson(res, 422, {
        success: false,
        error: "transcribe_failed",
        detail,
        message: "El motor de transcripción no está disponible en este despliegue. Revisa que GEMINI_API_KEY esté configurada en Vercel.",
        env_detailed_present: ENV_DETAILED_PRESENT,
        resolved_key_len: resolvedLen,
      });
    }

    let titleHint =
      (typeof body?.title === "string" ? body.title.trim() : "") ||
      decodeURIComponent(audioUrl.pathname.split("/").filter(Boolean).pop() || "").replace(/\.[^.]+$/, "").trim() ||
      "Audio LucIAna";

    const TRANSCRIBE_MAX_BYTES = 15 * 1024 * 1024;
    let fr: Response;
    try {
      const controller = new (globalThis as any).AbortController();
      const timer = (globalThis as any).setTimeout(() => { try { controller.abort(); } catch {} }, 120_000);
      fr = await fetch(audioUrl.toString(), { method: "GET", redirect: "follow", signal: controller.signal } as any);
      try { (globalThis as any).clearTimeout(timer); } catch {}
    } catch (e) {
      console.error("[handleTranscribe Error] download_failed fetch throw", {
        audioUrl: audioUrl.toString().slice(0, 200),
        hostname: audioUrl.hostname,
        err: e instanceof Error ? { name: e.name, message: e.message.slice(0, 300) } : String(e).slice(0, 300),
      });
      return oauthGptSendJson(res, 502, {
        success: false,
        error: "download_failed",
        message: `No pude descargar el audio desde la URL proporcionada: ${(e instanceof Error ? e.message : String(e)).slice(0, 280)}`,
      });
    }
    if (!fr.ok) {
      console.error("[handleTranscribe Error] download_failed remote HTTP not ok", {
        audioUrl: audioUrl.toString().slice(0, 200),
        remoteStatus: fr.status,
        remoteStatusText: fr.statusText?.slice(0, 120) || "",
      });
      return oauthGptSendJson(res, 502, {
        success: false,
        error: "download_failed",
        message: `No pude descargar el audio. El servidor remoto devolvió HTTP ${fr.status}.`,
        http_status: fr.status,
      });
    }

    const contentType = (fr.headers && typeof fr.headers.get === "function") ? String(fr.headers.get("content-type") || "") : "";
    const ext = (() => {
      try {
        const name = audioUrl.pathname.toLowerCase().split("/").pop() || "";
        const dot = name.lastIndexOf(".");
        return dot >= 0 ? name.slice(dot) : "";
      } catch { return ""; }
    })();
    const mime =
      (ext && GPT_UPLOAD_AUDIO_MIME_TO_EXT && (GPT_UPLOAD_AUDIO_MIME_TO_EXT as any)[contentType.toLowerCase()] ? contentType : "") ||
      (ext && GPT_UPLOAD_AUDIO_ALLOWED_EXTS && (GPT_UPLOAD_AUDIO_ALLOWED_EXTS as any)[ext] ? (GPT_UPLOAD_AUDIO_ALLOWED_EXTS as any)[ext] : "") ||
      contentType ||
      "audio/mpeg";

    let ab: ArrayBuffer;
    try {
      ab = await fr.arrayBuffer();
    } catch (e) {
      console.error("[handleTranscribe Error] download_failed arrayBuffer error", {
        audioUrl: audioUrl.toString().slice(0, 200),
        err: e instanceof Error ? { name: e.name, message: e.message.slice(0, 300) } : String(e).slice(0, 300),
      });
      return oauthGptSendJson(res, 502, {
        success: false,
        error: "download_failed",
        message: `No pude leer el contenido del audio: ${(e instanceof Error ? e.message : String(e)).slice(0, 280)}`,
      });
    }
    const size = Number(ab?.byteLength || 0);
    if (!size) {
      console.error("[handleTranscribe Error] invalid_request: audio empty 0 bytes", { audioUrl: audioUrl.toString().slice(0, 200) });
      return oauthGptSendJson(res, 400, { success: false, error: "invalid_request", message: "El audio está vacío (0 bytes)." });
    }
    if (size > TRANSCRIBE_MAX_BYTES) {
      console.error("[handleTranscribe Error] payload_too_large", {
        size_bytes: size,
        max_bytes: TRANSCRIBE_MAX_BYTES,
        audioUrl: audioUrl.toString().slice(0, 200),
      });
      return oauthGptSendJson(res, 413, {
        success: false,
        error: "payload_too_large",
        message: `Audio demasiado pesado para transcribir. Máximo ${Math.round(TRANSCRIBE_MAX_BYTES / 1024 / 1024)} MB. Sube un fragmento más corto o comprímelo.`,
        size_bytes: size,
        max_bytes: TRANSCRIBE_MAX_BYTES,
      });
    }

    let transcription: any = null;
    try {
      transcription = await transcribeGemini(ab, mime);
    } catch (e) {
      const detail = String(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      console.error("[handleTranscribe Error] 422 transcribe_failed: transcribeLyricsWithGemini threw exception", {
        err: e instanceof Error ? { name: e.name, message: e.message.slice(0, 500), stack: (e.stack || "").slice(0, 400) } : String(e).slice(0, 500),
        mime,
        size_bytes: size,
      });
      return oauthGptSendJson(res, 422, {
        success: false,
        error: "transcribe_failed",
        detail,
        message: "No pude procesar la transcripción de este audio. Revisa la calidad del MP3 o prueba con un fragmento más corto.",
      });
    }
    const transOk = !!(transcription && transcription.ok);
    const transStatus = String((transcription as any)?.status || "").toUpperCase();
    const transErrRaw = String((transcription as any)?.error || "").toLowerCase();
    const isGeminiKeyMissing = transErrRaw.includes("falta gemini_api_key") || transErrRaw.includes("gemini_api_key");
    if (isGeminiKeyMissing) {
      const detail = [
        "Falta configurar la clave GEMINI_API_KEY (o equivalente) en Vercel Environment Variables, sección Serverless Functions.",
        `Resolved key length: ${resolvedLen}.`,
        `Env detailed present: ${JSON.stringify(ENV_DETAILED_PRESENT)}`,
        String((transcription as any)?.error || "").slice(0, 400),
      ].join(" | ");
      console.error("[handleTranscribe Error] 422 transcribe_failed: inner function returned missing GEMINI_API_KEY", {
        innerError: String((transcription as any)?.error || "").slice(0, 300),
        geminiKeyLen: resolvedLen,
        env_detailed_present: ENV_DETAILED_PRESENT,
      });
      return oauthGptSendJson(res, 422, {
        success: false,
        error: "transcribe_failed",
        detail,
        message: "La transcripción no está disponible. Añade GEMINI_API_KEY en Vercel Settings → Environment Variables (marca Serverless Functions) y haz Redeploy.",
        env_detailed_present: ENV_DETAILED_PRESENT,
        resolved_key_len: resolvedLen,
      });
    }
    if (!transOk) {
      const detail = [
        `status=${transStatus || "unknown"}`,
        String((transcription as any)?.error || "").slice(0, 400),
        String((transcription as any)?.userMessage || "").slice(0, 400),
      ].filter(Boolean).join(" | ");
      console.error("[handleTranscribe Error] 422 transcribe_failed: inner !ok", {
        transStatus,
        innerError: String((transcription as any)?.error || "").slice(0, 400),
        innerUserMessage: String((transcription as any)?.userMessage || "").slice(0, 400),
        mime,
        size_bytes: size,
      });
      return oauthGptSendJson(res, 422, {
        success: false,
        error: "transcribe_failed",
        detail,
        message: String((transcription as any)?.userMessage || (transcription as any)?.error || "No pude transcribir la letra de este audio."),
      });
    }
    if (transStatus === "ILEGIBLE") {
      const detail = [
        "status=ILEGIBLE",
        String((transcription as any)?.userMessage || "").slice(0, 400),
        String((transcription as any)?.error || "").slice(0, 400),
      ].filter(Boolean).join(" | ");
      console.error("[handleTranscribe Error] 422 transcribe_failed: ILEGIBLE", {
        mime,
        size_bytes: size,
        title: titleHint.slice(0, 120),
      });
      return oauthGptSendJson(res, 422, {
        success: false,
        error: "transcribe_failed",
        detail,
        message: "No pude entender la letra con este audio. Prueba con un fragmento más corto o con menos ruido.",
      });
    }
    const lyrics = String((transcription as any)?.lyrics || "").trim();
    console.error("[handleTranscribe Info] OK transcripcion exitosa", {
      status: transStatus || "OK",
      title: titleHint.slice(0, 120),
      mime,
      size_bytes: size,
      lyricsLen: lyrics.length,
    });
    return oauthGptSendJson(res, 200, {
      success: true,
      lyrics,
      title: titleHint,
    });
  }

  return async function handler(req: any, res: any) {
    try {
      const u = new URL(req.url, "http://localhost");
      const parts = u.pathname.split("/").filter(Boolean);
      const isApi = parts[0] === "api";
      const next = isApi ? parts[2] : parts[1];
      try {
        const gt = globalThis as any;
        const shared = gt.__LUCIANA_SHARED_FNS__ || (gt.__LUCIANA_SHARED_FNS__ = {});
        shared.gptGenerateInternal = handleGenerate;
        shared.gptStatusInternal = handleStatus;
      } catch {}
      if (next === "generate") return handleGenerate(req, res);
      if (next === "status") return handleStatus(req, res);
      if (next === "upload-audio") return handleUploadAudio(req, res);
      if (next === "cover") return handleCover(req, res);
      if (next === "transcribe") return handleTranscribe(req, res);
      return oauthGptSendJson(res, 404, { error: "ruta_no_encontrada" });
    } catch (e) {
      return oauthGptSendJson(res, 500, { error: "error_interno", error_description: e instanceof Error ? e.message : String(e) });
    }
  };
})();

function sendNotFound(res: any) {
  res.statusCode = 404;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: "Ruta no encontrada" }));
}

const chatHandler = (() => {
  function chatSendJson(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }
  function chatIsValidUuid(s: any): boolean {
    if (typeof s !== "string" || !s) return false;
    const re = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    return re.test(s.trim());
  }
  function chatSafeString(v: any, maxLen = 20000, fallback = ""): string {
    if (v === null || v === undefined) return fallback;
    let s: string;
    if (typeof v === "string") s = v;
    else {
      try { s = JSON.stringify(v); } catch { s = String(v); }
    }
    s = String(s || "");
    if (maxLen > 0 && s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }
  function chatSafeInt(v: any, min = 0, max = 1_000_000_000, fallback = 0): number {
    if (v === null || v === undefined || v === "") return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    const i = Math.trunc(n);
    if (i < min) return min;
    if (i > max) return max;
    return i;
  }

  async function handleListConversations(req: any, res: any, auth: any) {
    const u = new URL(req.url, "http://localhost");
    const limit = chatSafeInt(u.searchParams.get("limit") || "50", 1, 200, 50);
    const offset = chatSafeInt(u.searchParams.get("offset") || "0", 0, 1_000_000, 0);
    const includeArchivedRaw = (u.searchParams.get("include_archived") || "").toString().trim().toLowerCase();
    const includeArchived = includeArchivedRaw === "1" || includeArchivedRaw === "true";
    const { admin, user } = auth;
    let q = admin
      .from("chat_conversations")
      .select("id, title, internal_dify_conversation_id, summary_snapshot, created_at, updated_at, archived_at, pinned, deleted_at", { count: "exact" })
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (!includeArchived) q = q.is("archived_at", null);
    const { data, error, count } = await q;
    if (error) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(error?.message || error) });
    return chatSendJson(res, 200, {
      success: true,
      conversations: (data || []).map((c: any) => ({
        id: c.id,
        title: c.title || "Nuevo chat",
        created_at: c.created_at,
        updated_at: c.updated_at,
        archived_at: c.archived_at || null,
        pinned: Boolean(c.pinned),
        deleted_at: c.deleted_at || null,
      })),
      count: typeof count === "number" ? count : (data || []).length,
      limit,
      offset,
    });
  }

  async function handleCreateConversation(req: any, res: any, auth: any) {
    const body = parseAnyBody(req);
    const { admin, user } = auth;
    const title = chatSafeString(body.title || "Nuevo chat", 200, "Nuevo chat");
    const summary_snapshot = body && typeof body.summary_snapshot === "object" && body.summary_snapshot !== null ? body.summary_snapshot : {};
    const internal_dify_conversation_id = chatSafeString(body.internal_dify_conversation_id || null, 200, "");
    const payload: any = {
      user_id: user.id,
      title,
      summary_snapshot,
    };
    if (internal_dify_conversation_id) payload.internal_dify_conversation_id = internal_dify_conversation_id;
    const { data, error } = await admin
      .from("chat_conversations")
      .insert(payload)
      .select("id, title, internal_dify_conversation_id, summary_snapshot, created_at, updated_at, archived_at, pinned, deleted_at")
      .maybeSingle();
    if (error) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(error?.message || error) });
    if (!data) return chatSendJson(res, 500, { success: false, error: "create_failed", message: "No se pudo crear la conversación." });
    return chatSendJson(res, 200, {
      success: true,
      conversation: {
        id: data.id,
        title: data.title || "Nuevo chat",
        created_at: data.created_at,
        updated_at: data.updated_at,
        internal_dify_conversation_id: data.internal_dify_conversation_id || null,
        archived_at: data.archived_at || null,
        pinned: Boolean(data.pinned),
        deleted_at: data.deleted_at || null,
      },
    });
  }

  async function handleGetConversation(req: any, res: any, auth: any, convId: string) {
    if (!chatIsValidUuid(convId)) return chatSendJson(res, 400, { success: false, error: "id_invalido", message: "El id de conversación no es válido." });
    const { admin, user } = auth;
    const { data: conv, error: convErr } = await admin
      .from("chat_conversations")
      .select("id, title, internal_dify_conversation_id, summary_snapshot, created_at, updated_at, archived_at, pinned, deleted_at")
      .eq("id", convId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (convErr) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(convErr?.message || convErr) });
    if (!conv) return chatSendJson(res, 404, { success: false, error: "no_encontrada", message: "Conversación no encontrada." });
    const { data: msgs, error: msgErr } = await admin
      .from("chat_messages")
      .select("id, conversation_id, role, content, structured_action, tokens, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (msgErr) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(msgErr?.message || msgErr) });
    return chatSendJson(res, 200, {
      success: true,
      conversation: {
        id: conv.id,
        title: conv.title || "Nuevo chat",
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        archived_at: conv.archived_at || null,
        pinned: Boolean(conv.pinned),
        deleted_at: conv.deleted_at || null,
        internal_dify_conversation_id: conv.internal_dify_conversation_id || null,
        summary_snapshot: conv.summary_snapshot || {},
      },
      messages: (msgs || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.role === "assistant" || m.role === "system" ? stripInternalReasoning(m.content) : m.content,
        structured_action: m.structured_action || null,
        tokens: typeof m.tokens === "number" ? m.tokens : null,
        created_at: m.created_at,
      })),
    });
  }

  async function handlePatchConversation(req: any, res: any, auth: any, convId: string) {
    if (!chatIsValidUuid(convId)) return chatSendJson(res, 400, { success: false, error: "id_invalido", message: "El id de conversación no es válido." });
    const body = parseAnyBody(req);
    const { admin, user } = auth;
    const patch: any = {};
    if (body && body.title !== undefined) {
      const t = chatSafeString(body.title, 200, "");
      if (t) patch.title = t;
    }
    if (body && body.summary_snapshot !== undefined && typeof body.summary_snapshot === "object" && body.summary_snapshot !== null) {
      patch.summary_snapshot = body.summary_snapshot;
    }
    if (body && body.internal_dify_conversation_id !== undefined) {
      const v = chatSafeString(body.internal_dify_conversation_id, 200, "");
      if (v) patch.internal_dify_conversation_id = v;
    }
    if (body && body.archived === true) patch.archived_at = new Date().toISOString();
    else if (body && body.archived === false) patch.archived_at = null;
    if (body && body.pinned === true) patch.pinned = true;
    else if (body && body.pinned === false) patch.pinned = false;
    if (body && body.deleted === true) patch.deleted_at = new Date().toISOString();
    else if (body && body.deleted === false) patch.deleted_at = null;
    if (Object.keys(patch).length === 0) {
      return chatSendJson(res, 200, { success: true, updated: false });
    }
    if (patch.deleted_at !== undefined) {
      const { data: checkRow, error: chkErr } = await admin
        .from("chat_conversations")
        .select("pinned")
        .eq("id", convId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (chkErr) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(chkErr?.message || chkErr) });
      if (!checkRow) return chatSendJson(res, 404, { success: false, error: "no_encontrada", message: "Conversación no encontrada." });
      if (Boolean(checkRow.pinned)) {
        return chatSendJson(res, 409, { success: false, error: "chat_fijado", message: "Primero desfija este chat para poder eliminarlo." });
      }
    }
    const { data, error } = await admin
      .from("chat_conversations")
      .update(patch)
      .eq("id", convId)
      .eq("user_id", user.id)
      .select("id, title, internal_dify_conversation_id, summary_snapshot, created_at, updated_at, archived_at, pinned, deleted_at")
      .maybeSingle();
    if (error) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(error?.message || error) });
    if (!data) return chatSendJson(res, 404, { success: false, error: "no_encontrada", message: "Conversación no encontrada." });
    return chatSendJson(res, 200, {
      success: true,
      updated: true,
      conversation: {
        id: data.id,
        title: data.title || "Nuevo chat",
        created_at: data.created_at,
        updated_at: data.updated_at,
        archived_at: data.archived_at || null,
        pinned: Boolean(data.pinned),
        deleted_at: data.deleted_at || null,
        internal_dify_conversation_id: data.internal_dify_conversation_id || null,
      },
    });
  }

  async function handleSoftDeleteConversation(req: any, res: any, auth: any, convId: string) {
    if (!chatIsValidUuid(convId)) return chatSendJson(res, 400, { success: false, error: "id_invalido", message: "El id de conversación no es válido." });
    const { admin, user } = auth;
    const { data: checkRow, error: chkErr } = await admin
      .from("chat_conversations")
      .select("pinned")
      .eq("id", convId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (chkErr) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(chkErr?.message || chkErr) });
    if (!checkRow) return chatSendJson(res, 404, { success: false, error: "no_encontrada", message: "Conversación no encontrada." });
    if (Boolean(checkRow.pinned)) {
      return chatSendJson(res, 409, { success: false, error: "chat_fijado", message: "Primero desfija este chat para poder eliminarlo." });
    }
    const patch: any = { deleted_at: new Date().toISOString() };
    const { data, error } = await admin
      .from("chat_conversations")
      .update(patch)
      .eq("id", convId)
      .eq("user_id", user.id)
      .select("id, title, pinned, deleted_at, updated_at")
      .maybeSingle();
    if (error) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(error?.message || error) });
    if (!data) return chatSendJson(res, 404, { success: false, error: "no_encontrada", message: "Conversación no encontrada." });
    return chatSendJson(res, 200, {
      success: true,
      deleted: true,
      conversation: {
        id: data.id,
        title: data.title || "Nuevo chat",
        pinned: Boolean(data.pinned),
        deleted_at: data.deleted_at || null,
        updated_at: data.updated_at,
      },
    });
  }

  async function handleAppendMessage(req: any, res: any, auth: any, convId: string) {
    if (!chatIsValidUuid(convId)) return chatSendJson(res, 400, { success: false, error: "id_invalido", message: "El id de conversación no es válido." });
    const { admin, user } = auth;
    const { data: conv, error: convErr } = await admin
      .from("chat_conversations")
      .select("id")
      .eq("id", convId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (convErr) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(convErr?.message || convErr) });
    if (!conv) return chatSendJson(res, 404, { success: false, error: "no_encontrada", message: "Conversación no encontrada." });
    const body = parseAnyBody(req);
    const roleRaw = chatSafeString(body?.role || "", 20, "").toLowerCase();
    if (roleRaw !== "user" && roleRaw !== "assistant" && roleRaw !== "system") {
      return chatSendJson(res, 400, { success: false, error: "role_invalido", message: "El rol debe ser user, assistant o system." });
    }
    const contentRaw = chatSafeString(body?.content || "", 50000, "");
    const content = roleRaw === "assistant" || roleRaw === "system" ? stripInternalReasoning(contentRaw) : contentRaw;
    if (!content) return chatSendJson(res, 400, { success: false, error: "contenido_vacio", message: "El contenido no puede estar vacío." });
    const structured_action = body?.structured_action !== undefined && body?.structured_action !== null ? body.structured_action : null;
    const tokensRaw = body?.tokens;
    const tokens = tokensRaw === null || tokensRaw === undefined || tokensRaw === "" ? null : chatSafeInt(tokensRaw, 0, 1_000_000, 0);
    const payload: any = {
      conversation_id: convId,
      role: roleRaw,
      content,
    };
    if (structured_action !== null) payload.structured_action = structured_action;
    if (tokens !== null) payload.tokens = tokens;
    const { data, error } = await admin
      .from("chat_messages")
      .insert(payload)
      .select("id, conversation_id, role, content, structured_action, tokens, created_at")
      .maybeSingle();
    if (error) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(error?.message || error) });
    if (!data) return chatSendJson(res, 500, { success: false, error: "insert_failed", message: "No se pudo guardar el mensaje." });
    return chatSendJson(res, 200, {
      success: true,
      message: {
        id: data.id,
        role: data.role,
        content: data.role === "assistant" || data.role === "system" ? stripInternalReasoning(data.content) : data.content,
        structured_action: data.structured_action || null,
        tokens: typeof data.tokens === "number" ? data.tokens : null,
        created_at: data.created_at,
      },
    });
  }

  async function handleBatchAppendMessages(req: any, res: any, auth: any, convId: string) {
    if (!chatIsValidUuid(convId)) return chatSendJson(res, 400, { success: false, error: "id_invalido", message: "El id de conversación no es válido." });
    const { admin, user } = auth;
    const { data: conv, error: convErr } = await admin
      .from("chat_conversations")
      .select("id")
      .eq("id", convId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (convErr) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(convErr?.message || convErr) });
    if (!conv) return chatSendJson(res, 404, { success: false, error: "no_encontrada", message: "Conversación no encontrada." });
    const body = parseAnyBody(req);
    const rawMsgs = Array.isArray(body?.messages) ? body.messages : [];
    if (!rawMsgs.length) return chatSendJson(res, 400, { success: false, error: "sin_mensajes", message: "Debe enviar al menos un mensaje." });
    if (rawMsgs.length > 50) return chatSendJson(res, 413, { success: false, error: "demasiados_mensajes", message: "Máximo 50 mensajes por lote." });
    const rows: any[] = [];
    for (const it of rawMsgs) {
      const roleRaw = chatSafeString(it?.role || "", 20, "").toLowerCase();
      if (roleRaw !== "user" && roleRaw !== "assistant" && roleRaw !== "system") continue;
      const contentRaw = chatSafeString(it?.content || "", 50000, "");
      const content = roleRaw === "assistant" || roleRaw === "system" ? stripInternalReasoning(contentRaw) : contentRaw;
      if (!content) continue;
      const structured_action = it?.structured_action !== undefined && it?.structured_action !== null ? it.structured_action : null;
      const tokensRaw = it?.tokens;
      const tokens = tokensRaw === null || tokensRaw === undefined || tokensRaw === "" ? null : chatSafeInt(tokensRaw, 0, 1_000_000, 0);
      const row: any = { conversation_id: convId, role: roleRaw, content };
      if (structured_action !== null) row.structured_action = structured_action;
      if (tokens !== null) row.tokens = tokens;
      rows.push(row);
    }
    if (!rows.length) return chatSendJson(res, 400, { success: false, error: "mensajes_invalidos", message: "Ningún mensaje del lote es válido." });
    const { data, error } = await admin
      .from("chat_messages")
      .insert(rows)
      .select("id, conversation_id, role, content, structured_action, tokens, created_at")
      .order("created_at", { ascending: true });
    if (error) return chatSendJson(res, 500, { success: false, error: "db_error", message: String(error?.message || error) });
    return chatSendJson(res, 200, {
      success: true,
      messages: (data || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.role === "assistant" || m.role === "system" ? stripInternalReasoning(m.content) : m.content,
        structured_action: m.structured_action || null,
        tokens: typeof m.tokens === "number" ? m.tokens : null,
        created_at: m.created_at,
      })),
    });
  }

  async function handleAttachImage(req: any, res: any, auth: any) {
    const MAX_BYTES = 10 * 1024 * 1024;
    try {
      const rawCl = String(req.headers["content-length"] || "0").trim();
      const contentLength = Number(rawCl);
      if (!Number.isFinite(contentLength) || contentLength <= 0) {
        return chatSendJson(res, 400, { success: false, error: "sin_archivo", message: "No se detectó archivo en la petición." });
      }
      if (contentLength > MAX_BYTES) {
        return chatSendJson(res, 413, { success: false, error: "demasiado_grande", message: "La imagen supera los 10 MB permitidos." });
      }
      const ct = String(req.headers["content-type"] || "").toLowerCase();
      const isMultipart = ct.includes("multipart/form-data");
      const isJsonImage = ct.includes("application/json");
      if (!isMultipart && !isJsonImage) {
        return chatSendJson(res, 400, { success: false, error: "tipo_invalido", message: "Formato de petición no admitido. Usa multipart/form-data o JSON con la imagen." });
      }
      const userId = String(auth.user?.id || "").trim();
      if (!userId) {
        return chatSendJson(res, 401, { success: false, error: "sesion_invalida", message: "Usuario no autenticado." });
      }
      return chatSendJson(res, 200, {
        success: true,
        feature_stage: "development",
        will_process: false,
        message: "Adjuntar foto de letra: funcionalidad en desarrollo. Tu imagen se validó correctamente pero aún no se procesa. Cuando esté activo, se extraerá el texto de la letra con el modelo de visión configurado.",
        user_id: userId,
        received_bytes: contentLength,
        max_allowed_bytes: MAX_BYTES,
      });
    } catch (e) {
      return chatSendJson(res, 500, { success: false, error: "error_interno", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return async function handler(req: any, res: any) {
    try {
      const u = new URL(req.url, "http://localhost");
      const parts = u.pathname.split("/").filter(Boolean);
      const head = parts[0] === "api" ? parts[1] : parts[0];
      if (head !== "chat") return chatSendJson(res, 400, { error: "ruta_invalida" });
      const method = (req.method || "GET").toUpperCase();
      const token = extractBearerToken(req);
      const auth = await requireAnyUserFromToken(token);
      if (!auth.ok) return chatSendJson(res, auth.status, { success: false, error: "sesion_invalida", message: auth.error || "Sesión inválida." });
      const next = parts[0] === "api" ? parts[2] : parts[1];
      const third = parts[0] === "api" ? parts[3] : parts[2];
      const fourth = parts[0] === "api" ? parts[4] : parts[3];

      if (!next && method === "GET") return handleListConversations(req, res, auth);
      if (!next && method === "POST") return handleCreateConversation(req, res, auth);
      if (next === "attach-image" && !third && method === "POST") return handleAttachImage(req, res, auth);

      if (next && !third) {
        if (method === "GET") return handleGetConversation(req, res, auth, next);
        if (method === "PATCH") return handlePatchConversation(req, res, auth, next);
        if (method === "DELETE") return handleSoftDeleteConversation(req, res, auth, next);
      }

      if (next && third === "messages" && !fourth && method === "POST") return handleAppendMessage(req, res, auth, next);
      if (next && third === "messages" && fourth === "batch" && method === "POST") return handleBatchAppendMessages(req, res, auth, next);

      return chatSendJson(res, 404, { success: false, error: "ruta_no_encontrada", message: "Ruta chat no encontrada." });
    } catch (e) {
      return chatSendJson(res, 500, { success: false, error: "error_interno", message: e instanceof Error ? e.message : String(e) });
    }
  };
})();

// ============================================================
// LUCIANA VOICE FLOW · PERSONAJE PERMANENTE + ACTIVACIONES 24h
// TODO acceso es exclusivamente por este endpoint.
// RLS: 0 políticas = navegador no lee nada directo; solo Service Role.
// ============================================================
const lucianaVoiceHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }
  function pickBody(p: any, keys: string[]) {
    const o: any = {};
    for (const k of keys) if (p != null && k in p) o[k] = p[k];
    return o;
  }
  function nowISO() { return new Date().toISOString(); }
  function addHoursISO(h: number) { const d = new Date(); d.setHours(d.getHours() + h); return d.toISOString(); }

  // Texto consentimiento (versionado; guardamos consent_version con la aceptación)
  const CONSENT_VERSION = "v1-es-20260919";
  const CONSENT_TEXT =
    "Confirmo que esta es mi voz o que tengo autorización explícita para usarla.";

  // NOTA DE NEGOCIO (2026-09-19): Crear personaje y reactivar personaje es GRATIS para el cliente.
  // Los créditos solo se descuentan al generar canciones o covers (cobro Suno por crear la voz es costo interno).
  const ACTIVATION_COST = 0;

  function parseJsonBody(req: any) {
    if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
    return req.body ?? null;
  }

  async function requireAuth(req: any) {
    const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
    const supabaseAnon = (process.env.SUPABASE_ANON_KEY || "").toString().trim();
    const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Falta configuración de Supabase." };
    }
    const authHeader = (req.headers.authorization || req.headers.Authorization || "").toString();
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return { ok: false as const, status: 401, error: "No autorizado." };
    const createClient = await getSupabaseCreateClient();
    const sbAnon = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data, error } = await sbAnon.auth.getUser(token);
    if (error || !data?.user) return { ok: false as const, status: 401, error: "Sesión inválida." };
    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user: data.user, admin };
  }

  // Reutiliza handlers Suno existentes como funciones internas con stub req/res.
  async function callSunoAdmin<T = any>(auth: any, handlerName: string, payload: any, query: any = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const headers: any = {};
      const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
      if (supabaseService) headers["Authorization"] = `Bearer ${supabaseService}`;
      const params = new URLSearchParams();
      params.set("action", handlerName);
      for (const k of Object.keys(query || {})) params.set(k, query[k]);
      const url = `${process.env.SUNO_API_BASE || "https://sunoapiorg.redpandaai.co"}/api/v1/${handlerName}?${params.toString()}`;
      const hasBody = payload != null && typeof payload === "object" && Object.keys(payload).length > 0;
      fetch(url, {
        method: hasBody ? "POST" : "GET",
        headers: { "Content-Type": "application/json", ...headers },
        body: hasBody ? JSON.stringify(payload) : undefined,
      }).then(async (r) => {
        const text = await r.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
        resolve(data as any);
      }).catch(reject);
    });
  }

  async function fetchJSON(auth: any, method: "GET" | "POST", apiPath: string, payload?: any) {
    const sunoBase = (process.env.SUNO_API_BASE || process.env.SUNO_KEY_BASE || "https://sunoapiorg.redpandaai.co").toString().replace(/\/+$/, "");
    const url = `${sunoBase}${apiPath.startsWith("/") ? "" : "/"}${apiPath}`;
    const opts: any = {
      method,
      headers: { "content-type": "application/json", Accept: "application/json" },
    };
    const sKey = (process.env.SUNO_API_KEY || process.env.SUNO_KEY || "").toString().trim();
    if (sKey) opts.headers.Authorization = `Bearer ${sKey}`;
    if (method === "POST" && payload != null) opts.body = JSON.stringify(payload);
    const r = await fetch(url, opts);
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text }; }
    return { ok: r.ok, status: r.status, data, text };
  }

  async function getProfileActiveActivation(auth: any, profileId: string) {
    try {
      const { data: rows, error } = await auth.admin
        .from("voice_activations")
        .select("*")
        .eq("voice_profile_id", profileId)
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        return { error: new Error("DB_ERR:" + (error.message || String(error))), latest: null, rows: [], active: null };
      }
      const alive = (rows || []).filter((r: any) => Boolean(r.is_active) && (r.expires_at == null || new Date(r.expires_at).getTime() > Date.now()));
      return { latest: (rows || [])[0] || null, rows: rows || [], active: alive[0] || null, error: null };
    } catch (anyErr) {
      // Captura TypeError: Cannot read property 'from' of undefined / etc.
      const wrapped = anyErr instanceof Error ? anyErr : new Error(String(anyErr || "unknown"));
      return { error: wrapped, latest: null, rows: [], active: null };
    }
  }

  async function buildPublicView(auth: any, profileRow: any | null, nowMs: number = Date.now()) {
    if (!profileRow) return { profile: null };
    const { active, latest } = await getProfileActiveActivation(auth, profileRow.id);
    const activeId = active?.id || null;

    let isCreating = false;
    let simpleStatus = "draft";
    if (profileRow.deleted_at) simpleStatus = "hidden";
    else if ((active && active.status === "failed_verify") || (latest && latest.status === "failed_verify") || profileRow.status === "failed_verify") {
      simpleStatus = "failed_verify";
    } else if (active && active.status === "ready") {
      simpleStatus = new Date(active.expires_at).getTime() > nowMs ? "ready" : "expired";
    } else if (latest && !active && latest.status === "ready") {
      simpleStatus = "expired";
    } else if (active && active.status === "processing" && (active.voice_generate_task_id || (active.voice_check_task_id && active.suno_voice_id))) {
      simpleStatus = "creating";
      isCreating = true;
    } else if (!profileRow.consent_given_at) simpleStatus = "pending";
    else if (!profileRow.sample_original_r2_path) simpleStatus = "pending";
    else {
      const hasPhrase = Boolean((active && active.current_validate_phrase) || (latest && latest.current_validate_phrase));
      const hasVerify = Boolean(profileRow.last_verify_r2_path);
      const hasName = Boolean(profileRow.name);
      if (profileRow.status === "ready") simpleStatus = "ready";
      else if (!hasPhrase) simpleStatus = "pending";
      else if (!hasVerify) simpleStatus = "pending";
      else if (!hasName) simpleStatus = "pending";
      else simpleStatus = "pending";
    }
    if (!isCreating && (active && active.status === "processing")) {
      if (active.voice_generate_task_id || (active.voice_check_task_id && active.suno_voice_id)) {
        simpleStatus = "creating";
      }
    }

    return {
      profile: {
        id: profileRow.id,
        name: profileRow.name || null,
        status: simpleStatus,
        consent_given_at: profileRow.consent_given_at || null,
        consent_version: profileRow.consent_version || null,
        created_at: profileRow.created_at,
        updated_at: profileRow.updated_at,
        expires_at: active?.expires_at || null,
        sample_ready: Boolean(profileRow.sample_original_r2_path),
        verify_ready: Boolean(profileRow.last_verify_r2_path),
        current_phrase: (active && active.current_validate_phrase) || (latest && latest.current_validate_phrase) || null,
        is_active: Boolean(active),
        cost_for_next_activation: ACTIVATION_COST,
        active_activation_id: activeId,
      },
    };
  }

  async function chargeActivationIdempotent(auth: any, activationId: string) {
    // NEGOCIO (2026-09-19): crear/reactivar personaje es GRATIS para el cliente.
    // Esta función se mantiene por compatibilidad (sin cobro ni consumo de créditos).
    const { data: rows, error } = await auth.admin
      .from("voice_activations")
      .select("id, cost_charged, voice_generate_task_id")
      .eq("id", activationId)
      .eq("user_id", auth.user.id)
      .limit(1);
    if (error || !rows?.length) return { ok: false, message: "No encontré la activación." };
    // Idempotencia: si ya está marcado no volvemos a escribir.
    const row = rows[0] as any;
    if (Number(row.cost_charged || 0) <= 0) {
      await auth.admin
        .from("voice_activations")
        .update({ cost_charged: 0, updated_at: nowISO() })
        .eq("id", activationId)
        .eq("user_id", auth.user.id)
        .lt("cost_charged", 1)
        .catch(() => {});
    }
    return { ok: true, already: true };
  }

  return async function handler(req: any, res: any) {
    try {
      if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido." });

      function genErrorId(): string {
        const hh = String(new Date().getHours()).padStart(2, "0");
        const mm = String(new Date().getMinutes()).padStart(2, "0");
        let rnd = "";
        try {
          if (typeof (globalThis as any)?.crypto?.getRandomValues === "function") {
            const buf = new Uint8Array(3);
            (globalThis as any).crypto.getRandomValues(buf);
            rnd = Array.from(buf, (b: number) => b.toString(16).padStart(2, "0")).join("");
          } else if (typeof require !== "undefined") {
            rnd = require("crypto")?.randomBytes?.(3)?.toString?.("hex") || "";
          }
        } catch {}
        if (!rnd) rnd = Math.random().toString(16).slice(2, 8).padEnd(6, "0");
        return `VF-${hh}${mm}-${String(rnd).slice(0, 6)}`;
      }

      function clientError(httpStatus: number, userMessage: string, eid: string) {
        return send(res, httpStatus, { error: userMessage, error_id: eid });
      }
      function serverLog(eid: string, actionName: string, detail: any) {
        try {
          // eslint-disable-next-line no-console
          console.error(`[${eid}] lucianaVoiceHandler action=${actionName}`,
            typeof detail === "string" ? detail
            : detail instanceof Error ? detail.stack || String(detail)
            : JSON.stringify(detail, null, 0).slice(0, 5000));
        } catch {}
      }

      const auth = await requireAuth(req);
      if (!auth.ok) {
        const eid = genErrorId();
        serverLog(eid, "auth", auth);
        return clientError(auth.status, auth.error || "No autorizado.", eid);
      }

      const payload = parseJsonBody(req);
      if (!payload || typeof payload !== "object") {
        const eid = genErrorId();
        serverLog(eid, "parse_body", { payloadType: typeof payload, payload });
        return clientError(400, "Petición inválida.", eid);
      }

      const action = String(payload?.action || "").trim();
      const profileId = String(payload?.profileId || payload?.profile_id || "").trim();

      const nowMs = Date.now();

      // 1) list · mis personajes
      if (action === "list") {
        const { data: rows, error } = await auth.admin
          .from("voice_profiles")
          .select("*")
          .eq("user_id", auth.user.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) {
          const eid = genErrorId();
          serverLog(eid, "list", error);
          return clientError(500, "No pude listar tus personajes.", eid);
        }
        const items = [];
        for (const r of rows || []) {
          const { profile } = await buildPublicView(auth, r, nowMs);
          items.push(profile);
        }
        return send(res, 200, { ok: true, list: items });
      }

      // 2) get · un solo personaje
      if (action === "get") {
        if (!profileId) {
          const eid = genErrorId();
          return clientError(400, "Falta identificador del personaje.", eid);
        }
        const { data: rows, error } = await auth.admin
          .from("voice_profiles")
          .select("*")
          .eq("id", profileId)
          .eq("user_id", auth.user.id)
          .limit(1);
        if (error) {
          const eid = genErrorId();
          serverLog(eid, "get", error);
          return clientError(500, "Personaje no disponible.", eid);
        }
        if (!rows?.length) {
          const eid = genErrorId();
          return clientError(404, "Personaje no encontrado.", eid);
        }
        const { profile } = await buildPublicView(auth, rows[0], nowMs);
        return send(res, 200, { ok: true, profile });
      }

      // 3) create · nuevo personaje (borrador)
      // ---------------------------------------------------------------
      // ROOT CAUSE confirmada vía inspección:
      // El SQL v5.1 manual (ejecutado en Supabase por el usuario) declaró
      //   voice_profiles.name  AS  VARCHAR NOT NULL
      // sin DEFAULT. Pero el INSERT original enviaba `name = null` (línea
      // anterior) para que el usuario elija el nombre después → el trigger
      // NOT NULL rechazaba el INSERT inmediatamente y salía "No pude crear
      // el personaje." justo al tocar "Empezar ahora".
      // FIX: generar nombre temporal único interno (nunca visible al cliente
      // hasta que el usuario lo confirme en el paso "Nombre").
      //
      // Cualquier error técnico se registra en console.error del servidor
      // con error_id corto; al cliente SOLO le enviamos error + error_id
      // (nunca code/message/details/hint/vars/env internas).
      if (action === "create") {
        const missingEnvs: string[] = [];
        if (!process.env.SUPABASE_URL) missingEnvs.push("SUPABASE_URL");
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnvs.push("SUPABASE_SERVICE_ROLE_KEY");
        if (missingEnvs.length) {
          const eid = genErrorId();
          // eslint-disable-next-line no-console
          console.error(`[${eid}] lucianaVoiceHandler action=create missing_envs: ${missingEnvs.join(", ")}`);
          return send(res, 500, { error: "No pudimos iniciar el personaje. Intenta de nuevo.", error_id: eid });
        }
        if (!auth?.user?.id) {
          const eid = genErrorId();
          // eslint-disable-next-line no-console
          console.error(`[${eid}] lucianaVoiceHandler action=create missing_user_id hasAuth=${Boolean(auth)} hasUser=${Boolean(auth?.user)}`);
          return send(res, 401, { error: "No pudimos iniciar el personaje. Intenta de nuevo.", error_id: eid });
        }

        // Pre-check SELECT (solo server log si falla; nunca al cliente)
        try {
          const { error: probeErr } = await auth.admin
            .from("voice_profiles")
            .select("id")
            .eq("id", "00000000-0000-0000-0000-000000000000")
            .limit(1);
          if (probeErr) {
            const eid = genErrorId();
            // eslint-disable-next-line no-console
            console.error(`[${eid}] lucianaVoiceHandler action=create select_probe_failed`, JSON.stringify({
              code: (probeErr as any)?.code || null,
              message: (probeErr as any)?.message || null,
              details: (probeErr as any)?.details || null,
              hint: (probeErr as any)?.hint || null,
            }));
            return send(res, 500, { error: "No pudimos iniciar el personaje. Intenta de nuevo.", error_id: eid });
          }
        } catch (probeExc: any) {
          const eid = genErrorId();
          // eslint-disable-next-line no-console
          console.error(`[${eid}] lucianaVoiceHandler action=create select_probe_exception`, probeExc instanceof Error ? probeExc.stack : String(probeExc || ""));
          return send(res, 500, { error: "No pudimos iniciar el personaje. Intenta de nuevo.", error_id: eid });
        }

        const rawName = String(payload?.name || "").trim();

        // Generar UUID ID por si el SQL v5.1 declaró id NOT NULL sin DEFAULT gen_random_uuid()
        let idUuid: string | null = null;
        try {
          if (typeof (globalThis as any)?.crypto?.randomUUID === "function") {
            idUuid = (globalThis as any).crypto.randomUUID();
          } else if (typeof require !== "undefined") {
            try { idUuid = require("crypto")?.randomUUID?.(); } catch {}
          }
        } catch {}

        // ROOT FIX: `voice_profiles.name` es NOT NULL (SQL v5.1 manual sin DEFAULT).
        // No podemos insertar NULL → nombre temporal interno único: Borrador-<8hex userId>
        const insert: any = {
          user_id: auth.user.id,
          name: "", // ← se setea abajo (NOT NULL)
          status: "draft",
          created_at: nowISO(),
          updated_at: nowISO(),
          consent_given_at: null,
          consent_version: null,
          sample_original_r2_path: null,
          last_verify_r2_path: null,
          deleted_at: null,
        };
        if (idUuid) insert.id = idUuid;
        if (rawName) {
          insert.name = rawName.slice(0, 50);
        } else {
          // Sufijo del auth.user.id (hex) para que no choque el unique index
          // uq_voice_profiles_user_name_alive = (user_id, name) WHERE deleted_at IS NULL
          try {
            const suf = String(auth.user.id || "").replace(/[^a-f0-9]/gi, "").slice(0, 8).toLowerCase()
                   || Math.random().toString(16).slice(2, 10);
            insert.name = `Borrador-${suf}`;
          } catch {
            insert.name = `Borrador-${Date.now().toString(36).slice(-6)}`;
          }
        }

        let data: any = null;
        let insertErr: any = null;
        try {
          const resI = await auth.admin.from("voice_profiles").insert(insert).select().limit(1);
          data = resI.data;
          insertErr = resI.error;
        } catch (exc) {
          insertErr = exc;
        }

        if (insertErr) {
          const eid = genErrorId();
          const code = (insertErr as any)?.code ? String((insertErr as any).code) : null;
          const message = (insertErr as any)?.message ? String((insertErr as any).message) : null;
          const details = (insertErr as any)?.details ? String((insertErr as any).details) : null;
          const hint = (insertErr as any)?.hint ? String((insertErr as any).hint) : null;
          const msg = (message || "").toString();
          // SÓLO si es unique_name_alive el usuario SÍ puede ver el mensaje real
          // (es un error de negocio visible, no técnico). El resto SOLO server log.
          const isUniqueNameAlive =
            (code === "23505") ||
            /uq_voice_profiles_user_name_alive|duplicate key value violates unique constraint/i.test(msg + " " + (details || ""));
          if (isUniqueNameAlive) return send(res, 409, { error: "Ya tienes un personaje con ese nombre." });
          // eslint-disable-next-line no-console
          console.error(`[${eid}] lucianaVoiceHandler action=create insert_failed`, JSON.stringify({
            code,
            message,
            details,
            hint,
            insert_keys: Object.keys(insert),
          }));
          return send(res, 500, { error: "No pudimos iniciar el personaje. Intenta de nuevo.", error_id: eid });
        }
        const row = (data as any[])[0];
        const { profile } = await buildPublicView(auth, row, nowMs);
        return send(res, 200, { ok: true, profile, profileId: row?.id || null });
      }

      // 4) accept-consent
      if (action === "accept-consent") {
        if (!profileId) return send(res, 400, { error: "Falta profileId." });
        const { error } = await auth.admin
          .from("voice_profiles")
          .update({ consent_given_at: nowISO(), consent_version: CONSENT_VERSION, updated_at: nowISO() })
          .eq("id", profileId)
          .eq("user_id", auth.user.id);
        if (error) return send(res, 500, { error: "No pude guardar el consentimiento." });
        const { data: rows } = await auth.admin
          .from("voice_profiles").select("*").eq("id", profileId).eq("user_id", auth.user.id).limit(1);
        const r = (rows || [])[0] || null;
        const pub = await buildPublicView(auth, r, nowMs);
        return send(res, 200, { ok: true, message: "Consentimiento guardado. Puedes continuar.", ...pub });
      }

      // 5) signed-upload-urls (sample y verify)
      //    Devuelve URLs firmadas de SUBIDA (PUT) y el R2 path privado a guardar.
      if (action === "get-upload-url") {
        const kind = String(payload?.kind || "").trim();
        if (!["sample", "verify"].includes(kind)) return send(res, 400, { error: "Tipo inválido." });
        const extension = String(payload?.extension || payload?.ext || "webm").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "webm";
        const contentType = String(payload?.contentType || payload?.content_type || "").trim() || `audio/${extension === "mp3" ? "mpeg" : extension === "wav" ? "wav" : extension === "m4a" ? "mp4" : extension === "ogg" ? "ogg" : "webm"}`;
        if (!profileId) return send(res, 400, { error: "Falta profileId." });
        const actId = String(payload?.activationId || "").trim();
        const rand = Math.random().toString(36).slice(2, 8);
        const safeExt = extension || "webm";
        const path = kind === "sample"
          ? `voice_profiles/${auth.user.id}/${profileId}/sample_original.${rand}.${safeExt}`
          : `voice_profiles/${auth.user.id}/${profileId}/verify_${actId || "new"}.${rand}.${safeExt}`;

        // Usar la función global getSignedR2PutUrl(key, contentType, expiresInSeconds)
        try {
          if (typeof getSignedR2PutUrl === "function") {
            const putUrl = await getSignedR2PutUrl(path, contentType, 30 * 60);
            return send(res, 200, {
              ok: true,
              upload_url: putUrl,
              uploadUrl: putUrl,
              signedPutUrl: putUrl,
              r2_path: path,
              suggested_path: path,
              key: path,
            });
          }
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e || "");
          return send(res, 500, { error: "No puedo generar la URL de subida (R2).", detail });
        }
        return send(res, 500, { error: "No puedo generar la URL de subida (módulo R2 no cargado)." });
      }

      // 6) save-sample-path · guarda el path R2 de la muestra original (permanente)
      if (action === "save-sample-path") {
        if (!profileId) return send(res, 400, { error: "Falta profileId." });
        const r2Path = String(payload?.r2_path || payload?.r2Path || payload?.key || payload?.suggested_path || "").trim();
        if (!r2Path) return send(res, 400, { error: "Falta la ruta del audio." });
        const { error } = await auth.admin
          .from("voice_profiles")
          .update({ sample_original_r2_path: r2Path, updated_at: nowISO() })
          .eq("id", profileId)
          .eq("user_id", auth.user.id);
        if (error) return send(res, 500, { error: "No pude guardar la muestra." });
        return send(res, 200, { ok: true, message: "Muestra original guardada." });
      }

      // 7) save-verify-path · guarda el path R2 de la grabación de la frase
      if (action === "save-verify-path") {
        if (!profileId) return send(res, 400, { error: "Falta profileId." });
        const r2Path = String(payload?.r2_path || payload?.r2Path || payload?.key || payload?.suggested_path || "").trim();
        const actId = String(payload?.activationId || "").trim();
        if (!r2Path) return send(res, 400, { error: "Falta ruta de grabación." });
        const { error } = await auth.admin
          .from("voice_profiles")
          .update({ last_verify_r2_path: r2Path, updated_at: nowISO() })
          .eq("id", profileId)
          .eq("user_id", auth.user.id);
        if (error) return send(res, 500, { error: "No pude guardar la grabación." });
        if (actId) {
          // Registrar también en la activación por si acaso.
          await auth.admin.from("voice_activations").update({ updated_at: nowISO() }).eq("id", actId).eq("user_id", auth.user.id).catch(() => {});
        }
        return send(res, 200, { ok: true, message: "Grabación de verificación guardada." });
      }

      // 8) request-phrase · Iniciar validación y pedir frase a Suno (con la muestra original guardada)
      if (action === "request-phrase" || action === "regenerate-phrase") {
        // safeAction: variable declarada ANTES del try/catch outer para estar disponible en TODOS los catches.
        // Evita ReferenceError: OUTER_ACTION is not defined (VF-0808-d177de).
        const safeAction: string = String(action || "unknown");
        try {
          if (!profileId) {
            const eid = genErrorId();
            return clientError(400, "Falta identificador del personaje.", eid);
          }
          // 1. Cargar perfil (protegido: TypeError Cannot read 'from' if auth.admin bad)
          let pRows: any[] = []; let pErr: any = null;
          try {
            const sel = await auth.admin
              .from("voice_profiles")
              .select("*")
              .eq("id", profileId)
              .eq("user_id", auth.user.id)
              .limit(1);
            pRows = sel.data || []; pErr = sel.error || null;
          } catch (anyErr) {
            const eid = genErrorId();
            serverLog(eid, safeAction, {
              step: "select.voice_profiles_throw",
              errMessage: anyErr instanceof Error ? anyErr.message : String(anyErr),
              errStack: anyErr instanceof Error ? anyErr.stack : undefined,
            });
            return clientError(500, "Personaje no disponible.", eid);
          }
          if (pErr) {
            const eid = genErrorId();
            serverLog(eid, safeAction, { step: "select.voice_profiles_err", err: pErr });
            return clientError(500, "Personaje no disponible.", eid);
          }
          if (!pRows?.length) {
            const eid = genErrorId();
            return clientError(404, "Personaje no encontrado.", eid);
          }
          const profile = pRows[0] as any;
          if (!profile.sample_original_r2_path) {
            const eid = genErrorId();
            return clientError(400, "Sube primero tu muestra de voz.", eid);
          }
          if (!profile.consent_given_at) {
            const eid = genErrorId();
            return clientError(400, "Acepta primero el consentimiento.", eid);
          }

        // 2. Firmar URL de la muestra para enviarla a Suno (URL FIRMADA TEMPORAL SOLAMENTE)
        //    - PRIVACIDAD CRÍTICA: audios biométricos NUNCA públicos.
        //    - No se usa ninguna URL pública ni fallback; si falla la firma, cortamos el flujo.
        //    - TTL: PROVIDER_SOURCE_AUDIO_URL_TTL_SECONDS (24h por defecto L474)
        //      para dar tiempo al proveedor de entrar en cola antes de descargar.
        const samplePath = String(profile.sample_original_r2_path || "").trim();
        let sampleSigned = "";
        if (typeof getSignedR2Url !== "function" || !samplePath) {
          const eid = genErrorId();
          serverLog(eid, action, { step: "getSignedR2Url_check", samplePath, getSignedR2Url_type: typeof getSignedR2Url });
          return clientError(500, "No podemos preparar tu muestra en este momento. Inténtalo de nuevo o contacta a soporte.", eid);
        }
        try {
          sampleSigned = String(await getSignedR2Url(samplePath, PROVIDER_SOURCE_AUDIO_URL_TTL_SECONDS) || "").trim();
        } catch (r2e) {
          const eid = genErrorId();
          // getR2Env lanza exactamente "Missing required R2 environment variables" si faltan las 4 vars.
          serverLog(eid, action, {
            step: "getSignedR2Url_throw",
            errMessage: r2e instanceof Error ? r2e.message : String(r2e),
            errStack: r2e instanceof Error ? r2e.stack : undefined,
            samplePath,
          });
          sampleSigned = "";
        }
        if (!sampleSigned) {
          const eid = genErrorId();
          serverLog(eid, action, { step: "sample_url_empty_after_throw", samplePath });
          return clientError(500, "No podemos preparar tu muestra en este momento. Inténtalo de nuevo o contacta a soporte.", eid);
        }

        // ⚠️ Flujo oficial Suno: NUEVA frase → el usuario DEBE grabar/cantar EXACTAMENTE la frase nueva.
        // Cualquier grabación de verificación anterior NO SIRVE (la frase cambió).
        // NULLificamos last_verify_r2_path para forzar que UI pida grabar OTRA VEZ.
        try {
          await auth.admin
            .from("voice_profiles")
            .update({ last_verify_r2_path: null, updated_at: nowISO() })
            .eq("id", profile.id)
            .eq("user_id", auth.user.id);
        } catch { /* ignore; no-romper */ }

        // 3. Transacción atómica: desactivar activa anterior + nueva
        const language = "es";
        const { data: newActRows, error: insErr } = await auth.admin
          .rpc("voice_start_new_activation", {
            p_profile_id: profile.id,
            p_user_id: auth.user.id,
          })
          .catch(() => ({ data: null, error: null }));
        if (insErr) {
          const eid = genErrorId();
          serverLog(eid, action, { step: "rpc.voice_start_new_activation", err: insErr });
          // no romper; continuamos con fallback abajo
        }
        let activationId: string | null = (newActRows as any)?.[0]?.id || null;

        // Fallback sin stored procedure
        if (!activationId) {
          try {
            await auth.admin
              .from("voice_activations")
              .update({ is_active: false, updated_at: nowISO() })
              .eq("voice_profile_id", profile.id)
              .eq("user_id", auth.user.id)
              .eq("is_active", true);
          } catch { /* ignore; unique index lo protege */ }
          const { data: arows, error: aerr } = await auth.admin
            .from("voice_activations")
            .insert({
              user_id: auth.user.id,
              voice_profile_id: profile.id,
              status: action === "regenerate-phrase" ? "processing" : "pending",
              is_active: true,
              created_at: nowISO(),
              updated_at: nowISO(),
            })
            .select("id")
            .limit(1);
          if (aerr) {
            const eid = genErrorId();
            serverLog(eid, action, { step: "insert.voice_activations", err: aerr });
            return clientError(500, "No puedo iniciar la validación. Intenta de nuevo.", eid);
          }
          activationId = (arows as any[])?.[0]?.id || null;
        }
        if (!activationId) {
          const eid = genErrorId();
          return clientError(500, "No se pudo preparar la validación.", eid);
        }

        // 4. Llamar Suno
        let taskId = "";
        let phrase = "";
        try {
          if (action === "request-phrase") {
            const callback = absoluteUrlFromReq ? absoluteUrlFromReq(req, "/api/webhooks/suno") : undefined;
            const { data, ok, status } = await fetchJSON(auth, "POST", "/api/v1/voice/validate", {
              sampleUrl: sampleSigned,
              language,
              callBackUrl: callback,
            });
            taskId = String(data?.data?.taskId || "").trim();
            if (!ok || !taskId) {
              const eid = genErrorId();
              serverLog(eid, action, { step: "voice/validate", ok, status, data });
              return clientError(502, "El proveedor no respondió la validación.", eid);
            }
          } else {
            // regenerate-phrase
            let prevTaskId = String(payload?.taskId || "").trim();
            if (!prevTaskId) {
              // Fallback: buscar el taskId de la última activación del perfil
              const prev = (await getProfileActiveActivation(auth, profile.id));
              prevTaskId = String(prev.active?.validate_task_id || prev.latest?.validate_task_id || "").trim();
            }
            if (!prevTaskId) {
              const eid = genErrorId();
              return clientError(400, "Falta identificación para regenerar la frase.", eid);
            }
            const { data, ok, status } = await fetchJSON(auth, "POST", "/api/v1/voice/regenerate", {
              taskId: prevTaskId,
              calBackUrl: absoluteUrlFromReq ? absoluteUrlFromReq(req, "/api/webhooks/suno") : undefined,
            });
            taskId = String(data?.data?.taskId || "").trim();
            if (!ok || !taskId) {
              const eid = genErrorId();
              serverLog(eid, action, { step: "voice/regenerate", ok, status, data });
              return clientError(502, "No pude generar otra frase.", eid);
            }
          }
          // Guardar taskId en activación
          await auth.admin
            .from("voice_activations")
            .update({ validate_task_id: taskId, status: "processing", updated_at: nowISO() })
            .eq("id", activationId)
            .eq("user_id", auth.user.id)
            .catch((e) => { const eid = genErrorId(); serverLog(eid, action, { step: "update.validate_task_id", err: e }); });

          // 5. Consultar frase
          const tries = [0, 1100, 2300];
          for (let i = 0; i < tries.length; i++) {
            if (i > 0) await new Promise((r) => setTimeout(r, tries[i]));
            const { data: vinfo, ok } = await fetchJSON(auth, "GET", `/api/v1/voice/validate-info?taskId=${encodeURIComponent(taskId)}`);
            const status = String(vinfo?.data?.status || "").toLowerCase();
            const validateInfo = String(vinfo?.data?.validateInfo || "").trim();
            if (validateInfo) { phrase = validateInfo; break; }
            if (status === "wait_validating" && validateInfo) phrase = validateInfo;
            if (status === "failed" || status === "error") break;
          }

          await auth.admin
            .from("voice_activations")
            .update({
              validate_task_id: taskId,
              current_validate_phrase: phrase || null,
              status: phrase ? "awaiting_verify" : "processing",
              updated_at: nowISO(),
            })
            .eq("id", activationId)
            .eq("user_id", auth.user.id)
            .catch((e) => { const eid = genErrorId(); serverLog(eid, action, { step: "update.current_validate_phrase", err: e }); });

          return send(res, 200, {
            ok: true,
            activationId,
            phrase: phrase || null,
            status: phrase ? "esperando_grabacion_verificacion" : "creando",
            message: phrase
              ? "Frase lista. Grábala tal cual está escrita."
              : "Preparando frase de verificación… actualiza en un momento.",
          });
        } catch (e) {
          const eid = genErrorId();
          serverLog(eid, safeAction, { step: "suno.full_try", err: e instanceof Error ? e.stack || String(e) : String(e) });
          return clientError(502, "El proveedor no respondió bien.", eid);
        }
        } catch (outerErr) {
          // Catch EXTERNO de request-phrase / regenerate-phrase:
          // Captura CUALQUIER throw síncrono/permiso no controlado (TypeError Cannot read 'from' de auth.admin, undefined vars, etc.)
          // para que NUNCA caiga en el catch top genérico "Error interno."
          const eid = genErrorId();
          try {
            // eslint-disable-next-line no-console
            console.error(`[${eid}] lucianaVoiceHandler action=${safeAction} step=outer_request_phrase_catch`,
              outerErr instanceof Error ? outerErr.stack || String(outerErr) : String(outerErr || ""));
          } catch {}
          serverLog(eid, safeAction, {
            step: "outer_request_phrase_catch",
            errMessage: outerErr instanceof Error ? outerErr.message : String(outerErr),
            errStack: outerErr instanceof Error ? outerErr.stack : undefined,
            toString: String(outerErr || ""),
          });
          return clientError(500, "No pudimos preparar tu solicitud en este momento. Inténtalo de nuevo o contacta a soporte.", eid);
        }
      }

      // 9) set-name · nombre del personaje (antes de confirmar costo)
      if (action === "set-name") {
        if (!profileId) return send(res, 400, { error: "Falta profileId." });
        const name = String(payload?.name || "").trim().slice(0, 50);
        if (!name) return send(res, 400, { error: "Dale un nombre al personaje." });
        const { error } = await auth.admin
          .from("voice_profiles")
          .update({ name, updated_at: nowISO() })
          .eq("id", profileId)
          .eq("user_id", auth.user.id);
        if (error) {
          const msg = (error.message || "").toString();
          if (msg.includes("uq_voice_profiles_user_name_alive")) return send(res, 409, { error: "Ya tienes un personaje con ese nombre." });
          return send(res, 500, { error: "No pude cambiar el nombre." });
        }
        const { data: rows } = await auth.admin
          .from("voice_profiles").select("*").eq("id", profileId).eq("user_id", auth.user.id).limit(1);
        const r = (rows || [])[0] || null;
        const pub = await buildPublicView(auth, r, nowMs);
        return send(res, 200, { ok: true, message: `Nombre guardado: ${name}.`, ...pub });
      }

      // 10) confirm-create · cobra y crea la voz en Suno (GRABAR + voice/generate)
      if (action === "confirm-create") {
        if (!profileId) return send(res, 400, { error: "Falta profileId." });
        const { data: pRows, error: pErr } = await auth.admin
          .from("voice_profiles").select("*").eq("id", profileId).eq("user_id", auth.user.id).limit(1);
        if (pErr || !pRows?.length) return send(res, 404, { error: "Personaje no encontrado." });
        const profile = pRows[0] as any;
        if (!profile.consent_given_at) return send(res, 400, { error: "Acepta el consentimiento." });
        if (!profile.sample_original_r2_path) return send(res, 400, { error: "Sube tu muestra de voz." });
        if (!profile.last_verify_r2_path) return send(res, 400, { error: "Graba la frase de verificación." });
        const name = String(profile.name || "").trim().slice(0, 50);
        if (!name) return send(res, 400, { error: "Ponle nombre al personaje." });

        // Obtener activación activa o última
        const { active, latest } = await getProfileActiveActivation(auth, profile.id);
        const source: any = active || latest;
        if (!source) return send(res, 400, { error: "Pide la frase de verificación primero." });
        if (!source.validate_task_id) return send(res, 400, { error: "Pide la frase de verificación primero." });
        if (!source.current_validate_phrase) return send(res, 400, { error: "La frase de verificación aún no está lista." });

        // Cobro 15 créditos (idempotente; si ya se cobró, no cobra 2)
        const charge = await chargeActivationIdempotent(auth, source.id);
        if (!charge.ok) return send(res, 402, { error: charge.message || "No puedo procesar el pago." });

        // Firmar verifyUrl para Suno voice/generate (URL FIRMADA TEMPORAL SOLAMENTE)
        const verifyPath = String(profile.last_verify_r2_path || "").trim();
        let verifySigned = "";
        if (typeof getSignedR2Url !== "function" || !verifyPath) {
          const eid = genErrorId();
          serverLog(eid, action, { step: "getSignedR2Url_verify_check", verifyPath, getSignedR2Url_type: typeof getSignedR2Url });
          return clientError(500, "No podemos preparar tu grabación en este momento. Inténtalo de nuevo o contacta a soporte.", eid);
        }
        try {
          verifySigned = String(await getSignedR2Url(verifyPath, PROVIDER_SOURCE_AUDIO_URL_TTL_SECONDS) || "").trim();
        } catch (r2e) {
          const eid = genErrorId();
          serverLog(eid, action, {
            step: "getSignedR2Url_verify_throw",
            errMessage: r2e instanceof Error ? r2e.message : String(r2e),
            errStack: r2e instanceof Error ? r2e.stack : undefined,
            verifyPath,
          });
          verifySigned = "";
        }
        if (!verifySigned) {
          const eid = genErrorId();
          serverLog(eid, action, { step: "verify_url_empty_after_throw", verifyPath });
          return clientError(500, "No podemos preparar tu grabación en este momento. Inténtalo de nuevo o contacta a soporte.", eid);
        }

        const callback = absoluteUrlFromReq ? absoluteUrlFromReq(req, "/api/webhooks/suno") : undefined;
        const voiceGeneratePayload: any = {
          taskId: source.validate_task_id,
          verifyUrl: verifySigned,
          voiceName: name,
          callBackUrl: callback,
        };
        const { data, ok, status } = await fetchJSON(auth, "POST", "/api/v1/voice/generate", voiceGeneratePayload);
        const generateTaskId = String(data?.data?.taskId || "").trim();
        if (!ok || !generateTaskId) return send(res, 502, { error: "El proveedor no pudo crear la voz." });
        await auth.admin
          .from("voice_activations")
          .update({ voice_generate_task_id: generateTaskId, status: "processing", updated_at: nowISO() })
          .eq("id", source.id)
          .eq("user_id", auth.user.id);

        return send(res, 200, {
          ok: true,
          activationId: source.id,
          status: "creando",
          cost_charged: ACTIVATION_COST,
          message: "Estoy creando tu personaje de voz 🎙️ Puede tardar un momento. Actualiza en unos segundos.",
        });
      }

      // 11) refresh-status · polling (backend consulta a Suno; NUNCA pongas polling agresivo; intervalo > 12s)
      if (action === "refresh-status") {
        if (!profileId) return send(res, 400, { error: "Falta profileId." });
        const { data: pRows, error: pErr } = await auth.admin
          .from("voice_profiles").select("*").eq("id", profileId).eq("user_id", auth.user.id).limit(1);
        if (pErr || !pRows?.length) return send(res, 404, { error: "Personaje no encontrado." });
        const profile = pRows[0] as any;

        const { active, latest } = await getProfileActiveActivation(auth, profile.id);
        const src: any = active || latest;
        if (!src) return send(res, 200, await buildPublicView(auth, profile));

        // 1. Si tenemos voice_generate_task_id PERO NO voice_record_task_id, consultar record-info hasta obtener voiceId
        if (src.voice_generate_task_id && !src.voice_record_task_id) {
          try {
            const { data: rinfo } = await fetchJSON(auth, "GET",
              `/api/v1/voice/record-info?taskId=${encodeURIComponent(src.voice_generate_task_id)}`);
            const voiceId = String(rinfo?.data?.voiceId || "").trim();
            const status = String(rinfo?.data?.status || "").toLowerCase();
            const upd: any = { updated_at: nowISO() };
            if (voiceId) { upd.suno_voice_id = voiceId; upd.voice_record_task_id = src.voice_generate_task_id; }
            if (status === "failed" || status === "error") upd.status = "failed_generate";
            if (Object.keys(upd).length > 1) {
              await auth.admin.from("voice_activations").update(upd).eq("id", src.id).eq("user_id", auth.user.id);
            }
          } catch { /* ignore */ }
        }

        // 2. Si tenemos suno_voice_id PERO NO is_active=true y NO ready, llamar check-voice
        const src2: any = (await getProfileActiveActivation(auth, profile.id)).active
                      || (await getProfileActiveActivation(auth, profile.id)).latest;
        if (src2?.suno_voice_id) {
          try {
            const { data: cv } = await fetchJSON(auth, "POST", "/api/v1/voice/check-voice", { task_id: src2.voice_record_task_id || src2.voice_generate_task_id || src2.suno_voice_id });
            const isAvailable = Boolean(cv?.data?.isAvailable);
            if (isAvailable) {
              const now = nowISO();
              // Actualizar actividad a ready + expires 24h. Y si hubiera otra activa, desactivar (filtro unique).
              try {
                await auth.admin.from("voice_activations")
                  .update({ is_active: false, updated_at: now })
                  .eq("voice_profile_id", profile.id).eq("user_id", auth.user.id).neq("id", src2.id).eq("is_active", true);
              } catch { /* unique index protege */ }
              await auth.admin.from("voice_activations")
                .update({
                  status: "ready",
                  is_active: true,
                  expires_at: addHoursISO(24),
                  voice_check_task_id: src2.voice_record_task_id || src2.voice_generate_task_id || null,
                  updated_at: now,
                })
                .eq("id", src2.id).eq("user_id", auth.user.id);
              await auth.admin.from("voice_profiles").update({ status: "ready", updated_at: now }).eq("id", profile.id).eq("user_id", auth.user.id);
            } else {
              const status = String(cv?.data?.status || "").toLowerCase();
              if (status === "failed" || status === "error" || cv?.data?.errorMessage) {
                await auth.admin
                  .from("voice_activations")
                  .update({ status: "failed_verify", updated_at: nowISO() })
                  .eq("id", src2.id).eq("user_id", auth.user.id);
                await auth.admin.from("voice_profiles").update({ status: "failed_verify", updated_at: nowISO() })
                  .eq("id", profile.id).eq("user_id", auth.user.id);
              }
            }
          } catch { /* ignore */ }
        }

        return send(res, 200, await buildPublicView(auth, profile));
      }

      // 12) reactivate · crear nueva activación usando la muestra original guardada
      if (action === "reactivate") {
        if (!profileId) return send(res, 400, { error: "Falta profileId." });
        const { data: pRows } = await auth.admin
          .from("voice_profiles").select("*").eq("id", profileId).eq("user_id", auth.user.id).limit(1);
        if (!pRows?.length) return send(res, 404, { error: "Personaje no encontrado." });
        const profile = pRows[0] as any;
        if (!profile.sample_original_r2_path) return send(res, 400, { error: "Primero sube una muestra original." });

        try { // desactivar previa activa
          await auth.admin.from("voice_activations").update({ is_active: false, updated_at: nowISO() })
            .eq("voice_profile_id", profile.id).eq("user_id", auth.user.id).eq("is_active", true);
        } catch { /* unique protege */ }
        const { data: arows } = await auth.admin.from("voice_activations")
          .insert({ user_id: auth.user.id, voice_profile_id: profile.id, status: "pending", is_active: true, created_at: nowISO(), updated_at: nowISO() })
          .select("id").limit(1);
        const activationId = (arows as any[])?.[0]?.id;

        // ⚠️ Flujo oficial Suno: CADA NUEVA activación necesita FRASE NUEVA + GRABACIÓN NUEVA.
        // No se puede reutilizar la grabación de verificación anterior (la frase es distinta).
        // Borramos la última ruta de verify para forzar que el UI muestre el paso "graba la frase".
        await auth.admin
          .from("voice_profiles")
          .update({ last_verify_r2_path: null, updated_at: nowISO() })
          .eq("id", profile.id)
          .eq("user_id", auth.user.id);

        return send(res, 200, { ok: true, activationId, status: "esperando_frase", message: "Personaje cargado. Ahora pide la frase de verificación." });
      }

      // 13) hide (soft delete) vs delete-permanent (confirmado en UI 2 pasos)
      if (action === "hide") {
        if (!profileId) return send(res, 400, { error: "Falta profileId." });
        await auth.admin
          .from("voice_profiles").update({ deleted_at: nowISO(), updated_at: nowISO() })
          .eq("id", profileId).eq("user_id", auth.user.id);
        return send(res, 200, { ok: true, message: "Personaje ocultado. Puedes pedirme que lo recupere." });
      }
      if (action === "delete-permanently") {
        if (!profileId) return send(res, 400, { error: "Falta profileId." });
        const confirm = String(payload?.confirm || "").trim();
        if (confirm !== "ELIMINAR_PERMANENTEMENTE") return send(res, 400, { error: "Confirmación requerida." });
        const { data: rows, error } = await auth.admin
          .from("voice_profiles").select("*").eq("id", profileId).eq("user_id", auth.user.id).limit(1);
        if (error || !rows?.length) return send(res, 404, { error: "Personaje no encontrado." });
        const profile = rows[0] as any;

        const toDelete: string[] = [];
        if (profile.sample_original_r2_path) toDelete.push(profile.sample_original_r2_path);
        if (profile.last_verify_r2_path) toDelete.push(profile.last_verify_r2_path);
        if (toDelete.length) { try { await deleteFromR2(toDelete); } catch { /* ignore */ } }
        // borrar activaciones + perfil (hard delete)
        await auth.admin.from("voice_activations").delete().eq("voice_profile_id", profile.id).eq("user_id", auth.user.id);
        await auth.admin.from("voice_profiles").delete().eq("id", profile.id).eq("user_id", auth.user.id);
        return send(res, 200, { ok: true, message: "Personaje eliminado de forma permanente junto con sus audios." });
      }

      return send(res, 404, { error: "Acción desconocida." });
    } catch (e) {
      const eid =
        (typeof (e as any)?.id === "string" && String((e as any).id).startsWith("VF-"))
          ? String((e as any).id)
          : (() => {
              const hh = String(new Date().getHours()).padStart(2, "0");
              const mm = String(new Date().getMinutes()).padStart(2, "0");
              let rnd = "";
              try {
                if (typeof (globalThis as any)?.crypto?.getRandomValues === "function") {
                  const buf = new Uint8Array(3); (globalThis as any).crypto.getRandomValues(buf);
                  rnd = Array.from(buf, (b: number) => b.toString(16).padStart(2, "0")).join("");
                } else if (typeof require !== "undefined") rnd = require("crypto")?.randomBytes?.(3)?.toString?.("hex") || "";
              } catch {}
              if (!rnd) rnd = Math.random().toString(16).slice(2, 8).padEnd(6, "0");
              return `VF-${hh}${mm}-${String(rnd).slice(0, 6)}`;
            })();
      try {
        // eslint-disable-next-line no-console
        console.error(`[${eid}] lucianaVoiceHandler action=${String((action as any) || "unknown")} step=top_catch_unhandled`,
          JSON.stringify({
            step: "top_catch_unhandled",
            errConstructor: e instanceof Error ? e.constructor.name : typeof e,
            errMessage: e instanceof Error ? e.message : String(e || ""),
            errStack: e instanceof Error ? e.stack : undefined,
            errToString: String(e || ""),
          }, (k, v) => (v === undefined ? null : typeof v === "bigint" ? String(v) : v), 2).slice(0, 4000));
      } catch {
        // eslint-disable-next-line no-console
        try { console.error(`[${eid}] lucianaVoiceHandler action=unknown step=top_catch_unhandled`, e instanceof Error ? e.stack || String(e) : String(e || "")); } catch {}
      }
      return send(res, 500, { error: "No pudimos procesar tu petición. Inténtalo de nuevo o contacta a soporte.", error_id: eid });
    }
  };
})();

export default async function handler(req: any, res: any) {
  try {
    const u = new URL(req.url, "http://localhost");
    let pathname = u.pathname;
    if (pathname.includes("[...route]")) {
      const qp = u.searchParams;
      const packed = (qp.get("path") || qp.get("p") || qp.get("route") || "").toString().trim();
      if (packed) {
        pathname = `/api/${packed.replace(/^\/+/, "")}`;
      } else {
        const h =
          (req.headers["x-vercel-original-url"] ||
            req.headers["x-forwarded-uri"] ||
            req.headers["x-original-uri"] ||
            req.headers["x-rewrite-url"] ||
            req.headers["x-url"] ||
            "") as any;
        const raw = (Array.isArray(h) ? h[0] : h || "").toString().trim();
        if (raw && raw.startsWith("/") && !raw.includes("[...route]")) pathname = raw.split("?")[0] || pathname;
      }
    }
    const parts = pathname.split("/").filter(Boolean);

    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    const third = isApi ? parts[3] : parts[2];

    if (head === "karaoke") return karaokeHandler(req, res);
    if (head === "suno") return sunoHandler(req, res);
    if (head === "mercadopago") return mercadoPagoHandler(req, res);
    if (head === "library") return libraryHandler(req, res);
    if (head === "mastering") return masteringHandler(req, res);
    if (head === "masterizar-unlimited") return masterizarUnlimitedHandler(req, res);
    if (head === "videos") return videosHandler(req, res);
    if (head === "admin") return adminHandler(req, res);
    if (head === "support") return supportHandler(req, res);
    if (head === "ai") return aiHandler(req, res);
    if (head === "luciana-bot") return lucianaBotHandler(req, res);
    if (head === "luciana" && next === "voice-flow") return lucianaVoiceHandler(req, res);
    if (head === "affiliates") return affiliatesHandler(req, res);
    if (head === "app") return appHandler(req, res);
    if (head === "social") return socialHandler(req, res);
    if (head === "vendor") return vendorHandler(req, res);
    if (head === "upload-audio") return uploadAudioHandler(req, res);
    if (head === "upload-audio-supabase") return uploadAudioSupabaseHandler(req, res);
    if (head === "r2" && next === "object") return r2ObjectHandler(req, res);
    if (head === "share" && next === "preview") return sharePreviewHandler(req, res);
    if (head === "share" && next === "song" && third === "audio") return shareSongAudioHandler(req, res);
    if (head === "share" && next === "song" && third === "cover") return shareSongCoverHandler(req, res);
    if (head === "share" && next === "song") return shareHandler(req, res);
    if (head === "share" && next === "profile") return shareProfileHandler(req, res);
    if (head === "profile") return profileHandler(req, res);
    if (head === "likes") return likesHandler(req, res);
    if (head === "account" && next === "bootstrap-profile") return bootstrapProfileHandler(req, res);
    if (head === "account" && next === "balance") return balanceHandler(req, res);
    if (head === "account" && next === "upload-profile-image") return uploadProfileImageHandler(req, res);
    if (head === "kits" && next === "voice-conversions") return kitsVoicesHandler(req, res);
    if (head === "kits" && next === "voices") return kitsVoicesHandler(req, res);
    if (head === "voices" && next === "list") return kitsVoicesHandler(req, res);
    if (head === "oauth") return oauthHandler(req, res);
    if (head === "gpt" && next === "token") return oauthHandler(req, res);
    if (head === "dify") return difyHandler(req, res);
    if (head === "gpt") return gptHandler(req, res);
    if (head === "rvc") return rvcHandler(req, res);
    if (head === "replicate" && next === "predictions" && third && parts[isApi ? 4 : 3] === "cancel") {
      const sendJson = (status: number, body: any) => {
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(body));
      };

      if ((req.method || "").toUpperCase() !== "POST") return sendJson(405, { error: "Método no permitido" });

      const predictionId = String(third || "").trim();
      const authHeader = (req.headers?.authorization || req.headers?.Authorization || "").toString();
      const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
      if (!token) return sendJson(401, { error: "No autorizado" });

      const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
      const supabaseAnon = (process.env.SUPABASE_ANON_KEY || "").toString().trim();
      if (!supabaseUrl || !supabaseAnon) return sendJson(500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY)" });

      const createClient = await getSupabaseCreateClient();
      const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) return sendJson(401, { error: "No autorizado" });

      const replicateApiKey = (process.env.REPLICATE_API_TOKEN || "").toString().trim();
      if (!replicateApiKey) return sendJson(500, { error: "Replicate API token no configurado" });

      const replicateRes = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(predictionId)}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Token ${replicateApiKey}`,
          "Content-Type": "application/json",
        },
      });

      const out = await replicateRes.json().catch(() => ({}));
      if (!replicateRes.ok) {
        return sendJson(replicateRes.status, { error: (out as any)?.detail || (out as any)?.error || "No pude cancelar en Replicate" });
      }

      return sendJson(200, out);
    }
    if (head === "webhooks" && next === "suno") return sunoWebhookHandler(req, res);
    if (head === "webhooks" && next === "replicate-cover") return replicateCoverWebhookHandler(req, res);
    if (head === "webhooks" && next === "replicate-voice-sample") return replicateVoiceSampleWebhookHandler(req, res);
    if (head === "webhooks" && next === "replicate") return replicateWebhookHandler(req, res);
    if (head === "chat") return chatHandler(req, res);

    return sendNotFound(res);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Error interno", detail: e instanceof Error ? e.message : String(e) }));
  }
}
