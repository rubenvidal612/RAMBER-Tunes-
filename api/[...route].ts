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
  replace_section: 5,
  wav: 0.4,
  lyrics: 0.4,
  timestamped_lyrics: 0.5,
  boost_style: 0.4,
  midi: 0,
  generate_persona: 0,
  music_cover: 0,
  clone_voice: 15,
} as const;

function round2(n: number) {
  return Math.round(n * 100) / 100;
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
  
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return null;
  }
  
  if (typeof output === "object") {
    const candidates = [
      output?.url,
      output?.output,
      output?.output_url,
      output?.audio_url,
      output?.audioUrl,
      output?.file_url,
      output?.fileUrl,
      output?.download_url,
      output?.downloadUrl,
      output?.result_url,
      output?.resultUrl,
    ];
    
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const trimmed = candidate.trim();
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          return trimmed;
        }
      }
    }
  }
  
  return null;
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

function getR2Env(): R2Env {
  if (cachedR2Env) return cachedR2Env;
  const accountId = (process.env.R2_ACCOUNT_ID || "").toString().trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").toString().trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").toString().trim();
  const bucketName = (process.env.R2_BUCKET_NAME || "").toString().trim();
  const endpoint =
    ((process.env.R2_ENDPOINT || "") as string).toString().trim() || `https://${accountId}.r2.cloudflarestorage.com`;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error("Missing required R2 environment variables");
  }
  cachedR2Env = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
    publicBaseUrl: `https://${bucketName}.${accountId}.r2.cloudflarestorage.com`,
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
  cachedR2Client = new S3Client({
    region: "auto",
    endpoint: env.endpoint,
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

async function getSignedR2PutUrl(key: string, contentType: string, expiresIn: number = 600): Promise<string> {
  const env = getR2Env();
  const client = await getR2Client();
  const { PutObjectCommand } = await getR2AwsSdk();
  const { getSignedUrl } = await getR2Presigner();
  const command = new PutObjectCommand({
    Bucket: env.bucketName,
    Key: key,
    ContentType: contentType,
  });
  return await getSignedUrl(client, command, { expiresIn });
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

async function ensureProfileExists(admin: any, userId: string) {
  const r = await admin.from("profiles").upsert({ id: userId }, { onConflict: "id" });
  if (!r?.error) return { ok: true as const };
  return { ok: false as const, error: String(r.error?.message || "No pude crear el perfil.") };
}

async function updateCreditsAnyColumn(admin: any, userId: string, nextCredits: number) {
  const next = round2(Math.max(0, Number(nextCredits)));
  if (!Number.isFinite(next)) return { ok: false as const, error: "Créditos inválidos" };

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
    didReset = true;
    await updateCreditsAnyColumn(admin, userId, 0);
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
  if (!base) return "";
  while (base.endsWith("/")) base = base.slice(0, -1);
  if (base.toLowerCase().endsWith("/api/v1")) base = base.slice(0, -"/api/v1".length);
  while (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

async function providerFetchJson(path: string, init?: RequestInit) {
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
    const next = round2(Math.max(0, current + delta));
    const upd = await updateCreditsAnyColumn(admin, userId, next);
    if (upd.ok) return { ok: true as const, credits: next };
    return { ok: false as const, error: upd.error };
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

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (readErr) return { ok: false as const, error: readErr.message };
    if (!profile) {
      const created = await ensureProfileExists(admin, userId);
      if (!created.ok) return { ok: false as const, error: created.error };
      continue;
    }

    const current = creditsFromProfile(profile);
    if (current < cost) return { ok: false as const, error: "Créditos insuficientes. Recarga para continuar.", credits: current };

    const next = round2(Math.max(0, current - cost));
    const upd = await updateCreditsAnyColumn(admin, userId, next);
    if (upd.ok) return { ok: true as const, credits: next };
    return { ok: false as const, error: upd.error };
  }

  return { ok: false as const, error: "No pude consumir créditos (intenta otra vez)." };
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

async function getUserPlan(admin: any, userId: string) {
  const { data: tx } = await admin
    .from("mp_transactions")
    .select("payment_id, pack_key, kind, created_at, amount_mxn")
    .eq("user_id", userId)
    .eq("kind", "songs")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = Array.isArray(tx) ? tx : [];

  const pickPlanKey = (raw: any) => {
    const k = String(raw || "").trim().toLowerCase();
    return k === "inicio" || k === "productor" || k === "ninguno" ? k : "";
  };

  const override = rows.find((t: any) => String(t?.payment_id || "").startsWith("admin_plan:"));
  const overridePlan = pickPlanKey(override?.pack_key);

  const hasInicio = rows.some((t: any) => String(t?.pack_key || "").toLowerCase() === "inicio");
  const hasProductor = rows.some((t: any) => String(t?.pack_key || "").toLowerCase() === "productor");
  const plan_key = overridePlan || (hasProductor ? "productor" : hasInicio ? "inicio" : "ninguno");

  const planStartIso = (() => {
    if (overridePlan && overridePlan !== "ninguno") return String(override?.created_at || "").trim() || null;
    const paid = rows.find((t: any) => {
      const pk = String(t?.pack_key || "").toLowerCase();
      if (!(pk === "inicio" || pk === "productor")) return false;
      const pid = String(t?.payment_id || "");
      if (pid.startsWith("claim:")) return false;
      return true;
    });
    const iso = String(paid?.created_at || "").trim();
    return iso || null;
  })();

  const plan_expires_at = (() => {
    if (!planStartIso) return null;
    const t = new Date(planStartIso).getTime();
    if (!Number.isFinite(t) || t <= 0) return null;
    const ms = t + 30 * 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString();
  })();

  const plan_active = (() => {
    if (!plan_expires_at) return false;
    const t = new Date(plan_expires_at).getTime();
    if (!Number.isFinite(t) || t <= 0) return false;
    return Date.now() < t;
  })();

  const downloads_allowed = plan_active && (plan_key === "inicio" || plan_key === "productor");

  return { plan_key, downloads_allowed, plan_active, plan_expires_at, hasProductor };
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
    if (v === "V5_5" || v === "V5" || v === "V4_5PLUS" || v === "V4_5ALL" || v === "V4_5" || v === "V4") return v;
    if (v === "V5.5" || v === "V5_5" || v === "V55") return "V5_5";
    if (v === "V4.5" || v === "V45") return "V4_5PLUS";
    if (v === "MFV2.0") return "V5_5";
    if (v === "MFV1.5X") return "V5";
    if (v === "MFV1.5") return "V4_5PLUS";
    return "V4_5PLUS";
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
    const model = normalizeModel(modelRaw || mv);
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
        if (!(model === "V5" || model === "V5_5")) return send(res, 400, { error: "personaId solo se permite con modelos V5/V5.5." });
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

      const { res: r, data, text } = await sunoFetchJson("/api/v1/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });

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

      await auth.admin.from("suno_tasks").insert({ 
        task_id: taskId, 
        user_id: user.id, 
        kind: "generate", 
        cost, 
        consumed: true
      });
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
    const model = normalizeModel(modelRaw || mv);
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
        if (!(model === "V5" || model === "V5_5")) return send(res, 400, { error: "personaId solo se permite con modelos V5/V5.5." });
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

      await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "extend", cost, consumed: true });
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
    const model = normalizeModel(modelRaw || mv);
    if (!uploadUrl && !uploadPath) return send(res, 400, { error: "Falta uploadUrl o uploadPath" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body: any = {
      model,
      callBackUrl,
      uploadUrl,
      prompt: (prompt || " ").slice(0, 5000),
      title: title.slice(0, 100),
      style: style.slice(0, 1000),
      tags: style.slice(0, 1000),
      instrumental,
      customMode: true,
    };

    if (uploadPath) {
      try {
        const signedUrl = await getSignedR2Url(uploadPath, 60 * 60 * 2);
        if (typeof signedUrl === "string" && signedUrl.trim()) body.uploadUrl = signedUrl.trim();
      } catch {
      }
    }

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
      if (!(model === "V5" || model === "V5_5")) return send(res, 400, { error: "personaId solo se permite con modelos V5/V5.5." });
      body.personaId = personaId.slice(0, 200);
    }
    const personaModel = firstString(payload, ["personaModel", "persona_model"]);
    if (personaModel) body.personaModel = personaModel.slice(0, 200);

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.upload_and_cover;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = [
        "/api/v1/generate/upload-cover",
        "/api/v1/upload-cover",
        "/api/v1/suno/generate/upload-cover",
        "/api/v1/suno/upload-cover",
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

      await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "upload-cover", cost, consumed: true });
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
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
    const normalized = normalizeModel(modelRaw);
    const model = normalized === "V5" || normalized === "V5_5" ? normalized : "V4_5PLUS";

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
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
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
    const normalized = normalizeModel(modelRaw);
    const model = normalized === "V5" || normalized === "V5_5" ? normalized : "V4_5PLUS";

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
        body.domainName = "RAMBER Tunes";
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
        kind === "midi"
          ? (() => {
              const n = typeof statusRaw === "number" ? statusRaw : Number(String(statusRaw || "").trim());
              if (n === 0) return "PENDING";
              if (n === 1) return "SUCCESS";
              if (n === 2) return "CREATE_TASK_FAILED";
              if (n === 3) return "GENERATE_MIDI_FAILED";
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

  async function handleCloneVoice(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const uploadUrl = firstString(payload, ["uploadUrl", "upload_url"]);
    const uploadPath = firstString(payload, ["uploadPath", "upload_path"]);
    const voiceName = firstString(payload, ["voiceName", "voice_name"]) || "Mi Voz";
    const description = firstString(payload, ["description"]) || "Voz clonada desde RAMBER Tunes";
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
        
        return send(res, 502, { error: errorMessage, detail: errorDetail, status: replicateResponse.status });
      }

      const predictionId = replicateData?.id;
      if (!predictionId) {
        return send(res, 502, { error: "Respuesta inválida de Replicate API" });
      }
      console.log(`Prediction ID obtenido: ${predictionId}`);

      // Guardar en la base de datos
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
      let finalTitle = rawTitle || "Cover Personalizado";
      if (songId) {
        const { data: baseSong, error: baseErr } = await auth.admin
          .from("library_items")
          .select("id, user_id, title, audio_url, deleted_at, type")
          .eq("id", songId.slice(0, 200))
          .eq("user_id", user.id)
          .eq("type", "song")
          .maybeSingle();
        if (baseErr) return send(res, 500, { error: "No pude buscar la canción", detail: baseErr.message });
        if (!baseSong || (baseSong as any).deleted_at) return send(res, 404, { error: "Canción no encontrada" });
        const aurl = String((baseSong as any).audio_url || "").trim();
        if (!aurl) return send(res, 404, { error: "La canción no tiene audio" });
        finalTitle = rawTitle || `${String((baseSong as any).title || "Canción").trim().slice(0, 90)} (Voz clonada)`;
        finalUploadUrl = aurl;
      } else if (uploadUrl || uploadPath) {
        finalUploadUrl = uploadUrl;
        if (uploadPath) {
          try {
            finalUploadUrl = await getSignedR2Url(uploadPath, 60 * 60 * 2);
          } catch (e) {
            return send(res, 502, { error: "Error generando URL firmada para el audio", detail: e instanceof Error ? e.message : String(e) });
          }
        }
      }

      if (!finalUploadUrl) return send(res, 400, { error: "Falta songId o uploadUrl/uploadPath" });

      // Determinar la URL del modelo de voz
      let modelUrl = voiceModelUrl;
      if (voiceId && !voiceModelUrl) {
        // Buscar la voz en la base de datos
        const { data: voiceRows } = await auth.admin
          .from("kits_voices")
          .select("replicate_id, output")
          .eq("id", voiceId)
          .eq("user_id", user.id)
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
        const outObj = parseOutput((voiceRow as any)?.output);
        const modelFromDb = typeof outObj?.model_url === "string" ? outObj.model_url.trim() : "";
        if (modelFromDb) {
          modelUrl = modelFromDb;
        } else if (voiceRow?.replicate_id) {
          // Si no tenemos URL del modelo, usar el replicate_id para obtener el modelo
          const replicateToken = process.env.REPLICATE_API_TOKEN;
          if (replicateToken) {
            const replicateResponse = await fetch(`https://api.replicate.com/v1/predictions/${voiceRow.replicate_id}`, {
              headers: { 'Authorization': `Token ${replicateToken}` },
            });
            if (replicateResponse.ok) {
              const replicateData = await replicateResponse.json();
              modelUrl = replicateData.output?.model_url;
            }
          }
        }
      }

      if (!modelUrl) {
        return send(res, 400, { error: "No se pudo obtener la URL del modelo de voz" });
      }

      // Llamar a Replicate API para crear el cover
      const replicateToken = process.env.REPLICATE_API_TOKEN;
      if (!replicateToken) {
        return send(res, 500, { error: "Replicate API token no configurado", detail: "Contacta al administrador del sistema" });
      }

      const replicateResponse = await fetch("https://api.replicate.com/v1/models/zsxkib/realistic-voice-cloning/versions/a0076ea1/predictions", {
        method: 'POST',
        headers: {
          'Authorization': `Token ${replicateToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            song_input: finalUploadUrl,
            rvc_model: "CUSTOM",
            custom_rvc_model_download_url: modelUrl,
            pitch_change: pitchChange,
            index_rate: indexRate,
            protect: protect,
            output_format: outputFormat
          },
          webhook: absoluteUrlFromReq(req, "/api/webhooks/replicate-cover")
        }),
      });

      const replicateData = await replicateResponse.json();

      if (!replicateResponse.ok) {
        let errorMessage = "Error creando cover";
        let errorDetail = replicateData?.detail || `HTTP ${replicateResponse.status}`;
        
        if (replicateResponse.status === 401 || replicateResponse.status === 403) {
          errorMessage = "Error de autenticación con Replicate API";
          errorDetail = "El token de API no es válido o ha expirado";
        } else if (replicateResponse.status === 422) {
          errorMessage = "Datos de solicitud inválidos";
          errorDetail = "El archivo de audio o el modelo de voz no cumplen con los requisitos";
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

      // Guardar en la base de datos
      await auth.admin.from("rvc_covers").insert({
        user_id: user.id,
        title: finalTitle,
        original_audio_url: finalUploadUrl,
        voice_id: voiceId,
        voice_model_url: modelUrl,
        prediction_id: predictionId,
        cost: cost,
        pitch_change: pitchChange,
        index_rate: indexRate,
        protect: protect,
        output_format: outputFormat,
        status: 'processing',
        created_at: new Date().toISOString(),
      });

      return send(res, 200, { 
        coverId: predictionId,
        predictionId,
        message: "Cover en proceso. Recibirás una notificación cuando esté listo.",
        status: 'processing',
        cost: cost
      });
    } catch (e) {
      return send(res, 502, { error: "Error creando cover", detail: e instanceof Error ? e.message : String(e) });
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
      if (a === "clone-voice") return handleCloneVoice(req, res);
      if (a === "kits-voices") return handleKitsVoices(req, res);
      if (a === "create-cover") return handleCreateCover(req, res);

      return send(res, 404, { error: "Ruta no encontrada", action: a || null });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
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

  type PackKey = "inicio" | "productor";

  const PACKS: Record<PackKey, { title: string; amount_mxn: number; credits: number; songs: number }> = {
    inicio: { title: "Pack Inicio", amount_mxn: 375, credits: 1200, songs: 100 },
    productor: { title: "Pack Productor", amount_mxn: 545, credits: 3000, songs: 250 },
  };

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
          description: "Comisión Afiliados - RAMBER Tunes",
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
    const packKey = (packKeyRaw === "inicio" || packKeyRaw === "productor" ? packKeyRaw : "") as PackKey | "";
    if (!packKey) return send(res, 400, { error: "packKey inválido (usa 'inicio' o 'productor')" });

    const pack = PACKS[packKey];
    const origin = originFromReq(req);

    const preferenceBody: any = {
      items: [{ title: `${pack.title} - ${pack.songs} canciones`, quantity: 1, currency_id: "MXN", unit_price: pack.amount_mxn }],
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

    const { data: exists } = await auth.admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
    if (Array.isArray(exists) && exists.length > 0) return send(res, 200, { ok: true, status: paymentStatus, credited: true, already: true });

    if (Number.isFinite(credits) && credits > 0) {
      const upd = await adjustUserCredits(auth.admin, auth.user.id, credits);
      if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });
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
    const userId = (meta?.user_id || meta?.userId || "").toString();
    if (!userId) return send(res, 200, { ok: true, status: paymentStatus, skipped: true });

    const createClient = await getSupabaseCreateClient();
    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

    const { data: exists } = await admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
    if (Array.isArray(exists) && exists.length > 0) return send(res, 200, { ok: true, status: paymentStatus, already: true });

    const txKind = (meta?.kind || "songs").toString() || "songs";
    const packKey = (meta?.pack_key || meta?.packKey || "").toString();
    const amountMxn = Number(meta?.amount_mxn ?? meta?.amountMxn ?? 0);
    const credits = Number(meta?.credits ?? 0);

    if (Number.isFinite(credits) && credits > 0) await adjustUserCredits(admin, userId, credits);

    await admin.from("mp_transactions").insert({
      user_id: userId,
      kind: txKind,
      pack_key: packKey || "unknown",
      amount_mxn: Number.isFinite(amountMxn) ? amountMxn : 0,
      payment_id: paymentId,
    });

    await tryPayAffiliateCommission(admin, mpToken, paymentId, userId, packKey || "", amountMxn);

    return send(res, 200, { ok: true, status: paymentStatus, credited: true });
  }

  async function handleClaimFree(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    return send(res, 410, { error: "El plan gratis fue desactivado." });
  }

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

  async function handleList(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const deleted = ["1", "true", "yes"].includes((pickQuery(req, "deleted") || "").toLowerCase());
    const r = await listSongs(auth.admin, auth.user.id, deleted);
    if (!r.ok) return send(res, 500, { error: "Error cargando canciones", detail: r.error });

    if (!deleted) {
      try {
        await migrateSunoSongsToSunoLinks(auth.admin, r.songs);
      } catch {
      }
    }
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

    return send(res, 200, { songs, cleanup_deleted: 0 });
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
        return send(res, 200, {
          song: existing,
          deleted_oldest: false,
          deleted_id: null,
          deleted_count: 0,
          deleted_titles: [],
        });
      }
    }

    const insertRow: any = {
      user_id: auth.user.id,
      type: ITEM_TYPE,
      title,
      description: description || null,
      lyrics,
      gender,
      audio_url: audioUrl,
      cover_url: coverUrl,
      suno_task_id: sunoTaskId,
      suno_audio_id: sunoAudioId,
      is_cover: isCover,
    };

    const { data, error } = await auth.admin.from(TABLE).insert(insertRow).select("*").single();
    if (error) return send(res, 500, { error: "No pude guardar la canción", detail: error.message });

    return send(res, 200, {
      song: data,
      deleted_oldest: false,
      deleted_id: null,
      deleted_count: 0,
      deleted_titles: [],
    });
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

    const audioUrl = await uploadToR2(path, buf, contentType);

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

    const { error } = await auth.admin.from(TABLE).update({ deleted_at: new Date().toISOString(), deleted_reason: "user_deleted" }).eq("id", id).eq("user_id", auth.user.id).eq("type", ITEM_TYPE);
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

    const { error } = await auth.admin.from(TABLE).update({ deleted_at: null, deleted_reason: null }).eq("id", id).eq("user_id", auth.user.id).eq("type", ITEM_TYPE);
    if (error) return send(res, 500, { error: "No pude recuperar", detail: error.message });

    return send(res, 200, {
      ok: true,
      deleted_oldest: false,
      deleted_id: null,
      deleted_count: 0,
      deleted_titles: [],
    });
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

  function safeFileBase(nameRaw: string) {
    const name = (nameRaw || "").toString().trim() || "cover";
    const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
    const cleaned = base.replaceAll(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
    return cleaned || "cover";
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
    const base64DataRaw = typeof body?.base64Data === "string" ? body.base64Data : "";
    const fileUrlRaw = typeof body?.fileUrl === "string" ? body.fileUrl.trim() : "";
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

    const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
    if (!apiKey) return send(res, 500, { error: "Falta SUNO_API_KEY en variables de entorno" });

    const uploadPath = `covers/${auth.user.id}/${id}`.slice(0, 200);

    let buf: Buffer | null = null;
    let contentType = "";
    const isClientUpload = Boolean(base64DataRaw);

    if (base64DataRaw) {
      const base64Parsed = parseBase64Data(base64DataRaw);
      if (!base64Parsed) return send(res, 400, { error: "base64Data inválido" });
      contentType = base64Parsed.mime || "";
      try {
        const b = Buffer.from(base64Parsed.base64, "base64");
        if (b && b.length > 0) buf = b;
      } catch {
        buf = null;
      }
    }

    if (!buf && fileUrlRaw) {
      let downloadUrl = "";
      try {
        new URL(fileUrlRaw);
      } catch {
        return send(res, 400, { error: "fileUrl inválido" });
      }
      try {
        const r = await fetch("https://sunoapiorg.redpandaai.co/api/file-url-upload", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            fileUrl: fileUrlRaw,
            uploadPath,
            fileName: fileName ? `${safeFileBase(fileName)}.jpg` : undefined,
          }),
        });
        const text = await r.text();
        const data = text ? JSON.parse(text) : null;
        if (r.ok && data?.success && Number(data?.code) === 200) {
          downloadUrl = String(data?.data?.downloadUrl || "").trim();
          const mt = String(data?.data?.mimeType || "").trim();
          if (mt) contentType = mt;
        }
      } catch {
        downloadUrl = "";
      }

      if (downloadUrl) {
        try {
          const r = await fetch(downloadUrl, { method: "GET" });
          if (r.ok) {
            const ct = (r.headers.get("content-type") || "").toString();
            const b = Buffer.from(await r.arrayBuffer());
            if (b && b.length > 0) {
              buf = b;
              if (ct) contentType = ct;
            }
          }
        } catch {
        }
      }
    }

    if (!buf || buf.length === 0) return send(res, 400, { error: "No pude procesar la imagen" });
    if (buf.length > 25_000_000) return send(res, 413, { error: "La imagen está muy pesada. Usa una foto más pequeña." });

    await ensureCoversBucket(auth.admin);

    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const finalCt = contentType || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
    const path = `${auth.user.id}/${id}/${Date.now()}_${safeFileBase(fileName)}.${ext}`.slice(0, 500);

    if (isClientUpload) {
      let downloadUrl = "";
      try {
        const fileBlob = new Blob([buf], { type: finalCt });
        const form = new FormData();
        form.append("file", fileBlob, `${safeFileBase(fileName)}.${ext}`);
        form.append("uploadPath", uploadPath);
        form.append("fileName", `${safeFileBase(fileName)}.${ext}`);

        const r = await fetch("https://sunoapiorg.redpandaai.co/api/file-stream-upload", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}` },
          body: form as any,
        });
        const text = await r.text();
        const data = text ? JSON.parse(text) : null;
        if (r.ok && data?.success && Number(data?.code) === 200) {
          downloadUrl = String(data?.data?.downloadUrl || "").trim();
        }
      } catch {
        downloadUrl = "";
      }

      if (downloadUrl) {
        try {
          const r = await fetch(downloadUrl, { method: "GET" });
          if (r.ok) {
            const ct = (r.headers.get("content-type") || "").toString();
            const b = Buffer.from(await r.arrayBuffer());
            if (b && b.length > 0) {
              buf = b;
              if (ct) contentType = ct;
            }
          }
        } catch {
        }
      }
    }

    const coverUrl = await uploadToR2(path, buf, finalCt);

    const { error: updErr } = await auth.admin.from(TABLE).update({ cover_url: coverUrl }).eq("id", id).eq("user_id", auth.user.id).eq("type", ITEM_TYPE);
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
    if (a === "import-audio") return handleImportAudio(req, res);
    if (a === "zip-stems") return handleZipStems(req, res);
    if (a === "delete") return handleDelete(req, res);
    if (a === "restore") return handleRestore(req, res);
    if (a === "update-audio") return handleUpdateAudio(req, res);
    if (a === "update-lyrics") return handleUpdateLyrics(req, res);
    if (a === "set-cover") return handleSetCover(req, res);
    if (a === "charge-download") return handleChargeDownload(req, res);

    return send(res, 404, { error: "Ruta no encontrada", action: a || null });
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
    const downloads_allowed = is_admin ? true : Boolean((plan as any)?.downloads_allowed);
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

    let internal_credits = round2(creditsFromProfile(profile));
    const cycle = await ensureMonthlyCreditsCycle(admin, user.id).catch(() => null as any);
    if (cycle?.did_reset) internal_credits = 0;
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
      provider_credits,
      provider_error: provider_error || null,
      source: is_admin && typeof provider_credits === "number" ? "provider_admin" : "local",
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
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const path = typeof payload?.path === "string" ? payload.path.trim() : "";
    const data = payload?.data;
    const contentType = typeof payload?.contentType === "string" ? payload.contentType.trim() : "image/webp";

    if (!path) return send(res, 400, { error: "Falta path" });

    try {
      const url = `${originFromReq(req)}/api/r2/object?key=${encodeURIComponent(path)}`;

      if (!data || !Array.isArray(data)) {
        const uploadUrl = await getSignedR2PutUrl(path, contentType || "application/octet-stream", 60 * 10);
        return send(res, 200, { ok: true, uploadUrl, url, key: path, via: "direct" });
      }

      const buf = Buffer.from(data);
      if (shouldModeratePath(path) && buf.length > 0) {
        const check = await moderateImageWithGoogleVision(buf);
        if (!check.ok) {
          const needsKey = String(check.error || "").toLowerCase().includes("api key");
          const hint = needsKey
            ? "Falta configurar GOOGLE_VISION_API_KEY en Vercel (Google Cloud Vision API)."
            : "";
          return send(res, 400, { error: check.error || "Imagen no permitida", hint: hint || undefined });
        }
      }
      await uploadToR2(path, buf, contentType);
      return send(res, 200, { ok: true, url, key: path, via: "server" });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const msg = /Missing required R2 environment variables/i.test(detail || "")
        ? "Falta configurar Cloudflare R2 en Vercel"
        : "Error subiendo imagen";
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
        .select("id, user_id, status, cost")
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

const sunoWebhookHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
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
        const { data: taskRows } = await admin.from("suno_tasks").select("user_id, kind, cost, consumed").eq("task_id", taskId).limit(1);
        const taskRow = Array.isArray(taskRows) ? taskRows[0] : null;
        const userId = String(taskRow?.user_id || "").trim();
        const kind = String(taskRow?.kind || "").trim().toLowerCase();
        const isCover = kind.includes("cover");
        const isMusicCover = kind.startsWith("music-cover:");
        const isWav = kind.startsWith("wav:");

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
              .select("suno_audio_id")
              .eq("user_id", userId)
              .eq("type", "song")
              .in("suno_audio_id", ids)
              .is("deleted_at", null);
            const existingIds = new Set(
              (Array.isArray(existing) ? existing : []).map((r: any) => String(r?.suno_audio_id || "").trim()).filter(Boolean)
            );

            const inserts = normalized
              .filter((x: any) => !existingIds.has(x.sunoAudioId))
              .map((x: any) => ({
                user_id: userId,
                type: "song",
                title: (() => {
                  const base = (x.title || "Canción").toString().trim();
                  const suffix = normalized.length === 2 ? (x.idx === 0 ? "A" : x.idx === 1 ? "B" : String(x.idx + 1)) : normalized.length > 1 ? String(x.idx + 1) : "";
                  if (!suffix) return base.slice(0, 120);
                  const hasSuffix = new RegExp(`\\s${suffix}$`, "i").test(base);
                  return (hasSuffix ? base : `${base} ${suffix}`).slice(0, 120);
                })(),
                description: x.tags ? x.tags.slice(0, 2000) : null,
                lyrics: null,
                gender: null,
                audio_url: x.audioUrl.slice(0, 2000),
                cover_url: x.coverUrl ? x.coverUrl.slice(0, 2000) : null,
                suno_task_id: taskId.slice(0, 200),
                suno_audio_id: x.sunoAudioId.slice(0, 200),
                is_cover: Boolean(isCover),
              }));

            if (inserts.length > 0) {
              await admin.from("library_items").insert(inserts);
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
      const { data, error } = await admin
        .from("library_items")
        .select("id, title, audio_url, cover_url, deleted_at, type")
        .eq("id", id.slice(0, 200))
        .eq("type", "song")
        .maybeSingle();
      if (error) return send(res, 500, { error: "No pude buscar la canción", detail: error.message });
      if (!data || data.deleted_at) return send(res, 404, { error: "No encontrada" });

      const audioUrl = typeof (data as any).audio_url === "string" ? (data as any).audio_url.trim() : "";
      const title = typeof (data as any).title === "string" ? (data as any).title.trim() : "";
      const coverUrl = typeof (data as any).cover_url === "string" ? (data as any).cover_url.trim() : "";
      if (!audioUrl) return send(res, 404, { error: "No hay audio para compartir" });

      const encId = encodeURIComponent(String((data as any).id || id));
      const audioProxy = `/api/share/song/audio?id=${encId}`;
      const coverProxy = coverUrl ? `/api/share/song/cover?id=${encId}` : "";
      return send(res, 200, { id: String((data as any).id || ""), title, audioUrl: audioProxy, coverUrl: coverProxy || "" });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
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

  async function serveR2Object(req: any, res: any, key: string) {
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

    const ct = typeof out?.ContentType === "string" && out.ContentType.trim() ? out.ContentType.trim() : "audio/mpeg";
    res.setHeader("content-type", ct);
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
      const { data, error } = await admin
        .from("library_items")
        .select("id, title, audio_url, cover_url, deleted_at, type, suno_task_id, suno_audio_id")
        .eq("id", id.slice(0, 200))
        .eq("type", "song")
        .maybeSingle();
      if (error) return sendJson(res, 500, { error: "No pude buscar la canción", detail: error.message });
      if (!data || (data as any).deleted_at) return sendJson(res, 404, { error: "No encontrada" });

      const title = typeof (data as any).title === "string" ? (data as any).title.trim() : "";
      let audioUrl = typeof (data as any).audio_url === "string" ? (data as any).audio_url.trim() : "";
      const sunoTaskId = typeof (data as any).suno_task_id === "string" ? (data as any).suno_task_id.trim() : "";

      const initialR2Key = extractR2KeyFromUrlOrKey(audioUrl);
      const shouldRefresh = !audioUrl || looksExpiringUrl(audioUrl) || /^http:\/\//i.test(audioUrl) || Boolean(initialR2Key);
      if (shouldRefresh && sunoTaskId) {
        const fresh = await resolveFreshFromSuno(sunoTaskId, title || "");
        if (fresh.ok && fresh.audioUrl) {
          audioUrl = fresh.audioUrl;
          const patch: any = { audio_url: audioUrl.slice(0, 2000) };
          if (fresh.audioId) patch.suno_audio_id = fresh.audioId.slice(0, 200);
          if (fresh.coverUrl && !(typeof (data as any).cover_url === "string" && (data as any).cover_url.trim())) {
            patch.cover_url = fresh.coverUrl.slice(0, 2000);
          }
          await admin.from("library_items").update(patch).eq("id", id.slice(0, 200)).eq("type", "song");
        }
      }

      const r2Key = extractR2KeyFromUrlOrKey(audioUrl);
      const audioLooksR2 =
        Boolean(r2Key) &&
        ((typeof audioUrl === "string" && audioUrl.includes(".r2.cloudflarestorage.com/")) ||
          (typeof audioUrl === "string" && /https?:\/\/[^/]+\.r2\.dev\//i.test(audioUrl)) ||
          !/^https?:\/\//i.test((audioUrl || "").toString().trim()));
      if (audioLooksR2 && r2Key) {
        try {
          await serveR2Object(req, res, r2Key);
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
          const patch: any = { audio_url: audioUrl.slice(0, 2000) };
          if (fresh.audioId) patch.suno_audio_id = fresh.audioId.slice(0, 200);
          if (fresh.coverUrl && !(typeof (data as any).cover_url === "string" && (data as any).cover_url.trim())) {
            patch.cover_url = fresh.coverUrl.slice(0, 2000);
          }
          await admin.from("library_items").update(patch).eq("id", id.slice(0, 200)).eq("type", "song");
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
            audioUrl: `/api/share/song/audio?id=${encodeURIComponent(String(x?.id || ""))}`,
            coverUrl: String(x?.cover_url || "").trim() ? `/api/share/song/cover?id=${encodeURIComponent(String(x?.id || ""))}` : null,
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
        audioUrl: `/api/share/song/audio?id=${encodeURIComponent(String(x?.id || ""))}`,
        coverUrl: String(x?.cover_url || "").trim() ? `/api/share/song/cover?id=${encodeURIComponent(String(x?.id || ""))}` : "",
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
      const q = admin.from(PUBLIC_TABLE).select("*").order("published_at", { ascending: false }).limit(limit);
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
      const { data, error } = await admin.from(PUBLIC_TABLE).select("genre, cover_url").order("published_at", { ascending: false }).limit(200);
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
    if (!isAdminEmail(user.email)) return { ok: false as const, status: 403, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin, supabaseUrl, supabaseService };
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

    return send(res, 200, {
      users: {
        total: totalCount,
        active30d: active30dCount,
        new7d: new7dCount,
        real_total: realTotal,
        real_active30d: realActive30d,
        real_new7d: realNew7d,
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
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const email = (body?.email || "").toString().trim().toLowerCase();
    const credits = Number(body?.credits ?? 0);
    if (!email) return send(res, 400, { error: "Falta email" });
    if (!Number.isFinite(credits) || credits <= 0) return send(res, 400, { error: "Créditos inválidos" });

    const admin = auth.admin;
    const found = await findUserIdByEmail(auth, email);
    if (!found.ok) return send(res, found.status, { error: found.error, detail: (found as any)?.detail || null });
    const userId = found.userId;

    const upd = await adjustUserCredits(admin, userId, credits);
    if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });

    await admin.from("mp_transactions").insert({
      user_id: userId,
      kind: "admin_grant",
      pack_key: "admin",
      amount_mxn: 0,
      payment_id: `admin_grant:${auth.user.id}:${Date.now()}`,
    });

    return send(res, 200, { ok: true, user_id: userId, credited: credits, new_credits: upd.credits ?? null });
  }

  async function handleTransferCredits(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const email = (body?.email || "").toString().trim().toLowerCase();
    const credits = round2(Number(body?.credits ?? 0));
    if (!email) return send(res, 400, { error: "Falta email" });
    if (!Number.isFinite(credits) || credits <= 0) return send(res, 400, { error: "Créditos inválidos" });

    const admin = auth.admin;
    const found = await findUserIdByEmail(auth, email);
    if (!found.ok) return send(res, found.status, { error: found.error, detail: (found as any)?.detail || null });
    const fromUserId = found.userId;
    const toUserId = auth.user.id;

    const ensureFrom = await ensureProfileExists(admin, fromUserId);
    if (!ensureFrom.ok) return send(res, 500, { error: "No pude preparar el usuario.", detail: ensureFrom.error });
    const ensureTo = await ensureProfileExists(admin, toUserId);
    if (!ensureTo.ok) return send(res, 500, { error: "No pude preparar tu cuenta.", detail: ensureTo.error });

    const fromProfile = await admin.from("profiles").select("*").eq("id", fromUserId).maybeSingle();
    if (fromProfile.error) return send(res, 500, { error: "No pude leer el saldo del usuario.", detail: fromProfile.error.message });
    const fromCreditsBefore = round2(creditsFromProfile(fromProfile.data));
    const toProfileBefore = await admin.from("profiles").select("*").eq("id", toUserId).maybeSingle();
    const toCreditsBefore = toProfileBefore.error ? null : round2(creditsFromProfile(toProfileBefore.data));
    if (fromCreditsBefore < credits) {
      return send(res, 400, { error: `El usuario solo tiene ${fromCreditsBefore} créditos.` });
    }
    const transferId = `admin_transfer:${toUserId}:${fromUserId}:${Date.now()}`;


    const out = await consumeUserCredits(admin, fromUserId, credits);
    if (!out.ok) return send(res, 500, { error: out.error || "No pude quitar créditos." });

    const inc = await adjustUserCredits(admin, toUserId, credits);
    if (!inc.ok) {
      await adjustUserCredits(admin, fromUserId, credits);
      return send(res, 500, { error: inc.error || "No pude regresarte los créditos (revertido)." });
    }

    await admin.from("mp_transactions").insert([
      { user_id: fromUserId, kind: "admin_transfer_out", pack_key: "admin", amount_mxn: 0, payment_id: `${transferId}:out` },
      { user_id: toUserId, kind: "admin_transfer_in", pack_key: "admin", amount_mxn: 0, payment_id: `${transferId}:in` },
    ]);

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
    });
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
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const email = (body?.email || "").toString().trim().toLowerCase();
    const plan_key = (body?.plan_key || "").toString().trim().toLowerCase();
    const credits_mode = (body?.credits_mode || "none").toString().trim().toLowerCase();
    const credits = Number(body?.credits ?? 0);

    if (!email) return send(res, 400, { error: "Falta email" });
    if (!(plan_key === "ninguno" || plan_key === "inicio" || plan_key === "productor")) {
      return send(res, 400, { error: "Plan inválido" });
    }
    if (!(credits_mode === "none" || credits_mode === "default" || credits_mode === "set")) {
      return send(res, 400, { error: "Modo de créditos inválido" });
    }

    const admin = auth.admin;
    const found = await findUserIdByEmail(auth, email);
    if (!found.ok) return send(res, found.status, { error: found.error, detail: (found as any)?.detail || null });
    const userId = found.userId;

    const payment_id = `admin_plan:${auth.user.id}:${userId}:${Date.now()}`;
    await admin.from("mp_transactions").insert({
      user_id: userId,
      kind: "songs",
      pack_key: plan_key,
      amount_mxn: 0,
      payment_id,
    });

    if (credits_mode === "default") {
      let add = 0;
      if (plan_key === "inicio") add = 1200;
      if (plan_key === "productor") add = 3000;
      if (add > 0) {
        const upd = await adjustUserCredits(admin, userId, add);
        if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });
      }
    } else if (credits_mode === "set") {
      if (!Number.isFinite(credits) || credits < 0) return send(res, 400, { error: "Créditos inválidos" });
      const upd = await setUserCreditsAbsolute(admin, userId, credits);
      if (!upd.ok) return send(res, 500, { error: upd.error || "No pude fijar créditos" });
    }

    return send(res, 200, { ok: true, user_id: userId, plan_key, credits_mode });
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
      const next = i >= 0 ? parts[i + 1] : "";
      return (next || "").toLowerCase();
    })();
    const a = action || fallback;

    if (a === "stats") return handleStats(req, res);
    if (a === "diag") return handleDiag(req, res);
    if (a === "grant-credits") return handleGrantCredits(req, res);
    if (a === "transfer-credits") return handleTransferCredits(req, res);
    if (a === "set-plan") return handleSetPlan(req, res);
    if (a === "feedback") return handleFeedback(req, res);
    if (a === "feedback-mark-read") return handleFeedbackMarkRead(req, res);
    if (a === "users") return handleUsers(req, res);
    if (a === "user-detail") return handleUserDetail(req, res);
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
    const apiKey = (process.env.GEMINI_API_KEY || "").toString().trim();
    if (!apiKey) {
      return {
        ok: false as const,
        error: "Falta GEMINI_API_KEY en Vercel",
        userMessage: "La transcripción no está configurada. Falta GEMINI_API_KEY en Vercel.",
      };
    }

    const mod: any = await import("@google/genai");
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
      "gemini-3.1-flash-lite-preview",
      "gemini-flash-lite-latest",
      "gemini-3-flash-preview",
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

  async function generateLyricsWithGemini(topic: string, gender: string, style: string) {
    const apiKey = (process.env.GEMINI_API_KEY || "").toString().trim();
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
      "Usa etiquetas: [Intro], [Verso], [Coro], [Puente], [Outro]. " +
      "Tema: " +
      topic +
      "\nGénero vocal: " +
      gender +
      "\nEstilo musical: " +
      style +
      "\nNo uses comillas ni markdown.";

    const baseModels = [
      "gemini-3.1-flash-lite-preview",
      "gemini-flash-lite-latest",
      "gemini-3-flash-preview",
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

      const out = await generateLyricsWithGemini(topic, gender, style);
      
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
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const uploadUrl = typeof payload?.uploadUrl === "string" ? payload.uploadUrl.trim() : "";
    const mimeTypeHint = typeof payload?.mimeType === "string" ? payload.mimeType.trim() : "";
    const url = safeUrl(uploadUrl);
    if (!url) return send(res, 400, { error: "uploadUrl inválido" });

    try {
      const fr = await fetch(url);
      if (!fr.ok) return send(res, 502, { error: "No pude leer tu audio", detail: `HTTP ${fr.status}` });

      const contentType = (fr.headers.get("content-type") || "").toString();
      const mimeType = normalizeAudioMimeType(mimeTypeHint) || normalizeAudioMimeType(contentType) || "audio/mpeg";
      const ab = await fr.arrayBuffer();
      const size = ab.byteLength || 0;
      if (size <= 0) return send(res, 400, { error: "El audio está vacío" });
      if (size > 15 * 1024 * 1024) return send(res, 413, { error: "Audio muy pesado para transcribir. Sube un fragmento más corto." });

      const out = await transcribeLyricsWithGemini(ab, mimeType);
      if (!out.ok) return send(res, 200, { ok: false, error: out.error || "No pude transcribir", message: (out as any).userMessage || "No pude transcribir la letra." });
      if ((out as any).status === "ILEGIBLE") return send(res, 200, { ok: true, lyrics: "", status: "ILEGIBLE", message: "No pude entender la letra con este audio. Prueba con un fragmento más corto o con menos ruido." });
      if ((out as any).status === "SIN_LETRA") return send(res, 200, { ok: true, lyrics: "", status: "SIN_LETRA", message: "No detecté voz/canto en ese audio." });
      return send(res, 200, { ok: true, lyrics: out.lyrics || "", status: "OK" });
    } catch (e) {
      return send(res, 200, {
        ok: false,
        error: "Error transcribiendo",
        message: "No pude transcribir la letra. Intenta con un audio más claro o más corto.",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

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

        return send(res, 200, { voices: voices || [] });
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
    return { ok: true as const, user, admin };
  }

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const title = typeof payload?.title === "string" ? payload.title.trim() : "audio.mp3";
    const contentType = (typeof payload?.contentType === "string" ? payload.contentType.trim() : "audio/mpeg") || "audio/mpeg";
    const fname = safeFileName(title);
    const rand = Math.random().toString(36).slice(2, 10);
    const key = `uploads/audio/${auth.user.id}/${Date.now()}_${rand}_${fname}`;

    try {
      const inline = fileArrayToUint8(payload?.file);
      if (inline) {
        const maxBytes = 4 * 1024 * 1024;
        if (inline.byteLength > maxBytes) {
          return send(res, 413, {
            ok: false,
            error: "Audio muy pesado",
            message: "Ese MP3 está muy pesado para subirlo por el servidor. Intenta con un MP3 más ligero o habilita CORS en R2 para subida directa.",
          });
        }
        await uploadToR2(key, inline, contentType);
        const url = await getSignedR2Url(key, 60 * 60 * 2);
        return send(res, 200, { ok: true, url, key, contentType, via: "server" });
      }

      const uploadUrl = await getSignedR2PutUrl(key, contentType, 60 * 10);
      const url = await getSignedR2Url(key, 60 * 60 * 2);
      return send(res, 200, { ok: true, uploadUrl, url, key, contentType, via: "direct" });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const msg = /Missing required R2 environment variables/i.test(detail || "")
        ? "Falta configurar Cloudflare R2 en Vercel"
        : "No pude preparar la subida del audio";
      return send(res, 500, { ok: false, error: msg, detail });
    }
  };
})();

function sendNotFound(res: any) {
  res.statusCode = 404;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: "Ruta no encontrada" }));
}

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

    if (head === "suno") return sunoHandler(req, res);
    if (head === "mercadopago") return mercadoPagoHandler(req, res);
    if (head === "library") return libraryHandler(req, res);
    if (head === "videos") return videosHandler(req, res);
    if (head === "admin") return adminHandler(req, res);
    if (head === "support") return supportHandler(req, res);
    if (head === "ai") return aiHandler(req, res);
    if (head === "affiliates") return affiliatesHandler(req, res);
    if (head === "app") return appHandler(req, res);
    if (head === "social") return socialHandler(req, res);
    if (head === "upload-audio") return uploadAudioHandler(req, res);
    if (head === "r2" && next === "object") return r2ObjectHandler(req, res);
    if (head === "share" && next === "song" && third === "audio") return shareSongAudioHandler(req, res);
    if (head === "share" && next === "song" && third === "cover") return shareSongCoverHandler(req, res);
    if (head === "share" && next === "song") return shareHandler(req, res);
    if (head === "share" && next === "profile") return shareProfileHandler(req, res);
    if (head === "profile") return profileHandler(req, res);
    if (head === "account" && next === "bootstrap-profile") return bootstrapProfileHandler(req, res);
    if (head === "account" && next === "balance") return balanceHandler(req, res);
    if (head === "account" && next === "upload-profile-image") return uploadProfileImageHandler(req, res);
    if (head === "kits" && next === "voice-conversions") return kitsVoicesHandler(req, res);
    if (head === "kits" && next === "voices") return kitsVoicesHandler(req, res);
    if (head === "voices" && next === "list") return kitsVoicesHandler(req, res);
    if (head === "webhooks" && next === "suno") return sunoWebhookHandler(req, res);
    if (head === "webhooks" && next === "replicate-cover") return replicateCoverWebhookHandler(req, res);
    if (head === "webhooks" && next === "replicate") return replicateWebhookHandler(req, res);

    return sendNotFound(res);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Error interno", detail: e instanceof Error ? e.message : String(e) }));
  }
}
