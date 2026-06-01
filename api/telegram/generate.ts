import { createClient } from "@supabase/supabase-js";

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

function pickWritableCreditsColumn(profile: any): "zingy_credits" | "ramber_credits" | "credits" | null {
  const p = profile ?? {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k);
  if (has("ramber_credits")) return "ramber_credits";
  if (has("zingy_credits")) return "zingy_credits";
  if (has("credits")) return "credits";
  return null;
}

async function adjustUserCredits(admin: any, userId: string, deltaCredits: number) {
  const delta = Number(deltaCredits);
  if (!Number.isFinite(delta) || !delta) return { ok: true as const };

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (readErr) return { ok: false as const, error: readErr.message };

    const current = creditsFromProfile(profile);
    const next = round2(Math.max(0, current + delta));
    const col = pickWritableCreditsColumn(profile);
    if (!col) return { ok: false as const, error: "Falta columna de créditos en profiles (zingy_credits o ramber_credits)." };

    const { error: updErr } = await admin.from("profiles").update({ [col]: next }).eq("id", userId);
    if (!updErr) return { ok: true as const, credits: next };
  }

  return { ok: false as const, error: "No pude actualizar créditos (intenta otra vez)." };
}

async function consumeUserCredits(admin: any, userId: string, costCredits: number) {
  const cost = round2(Number(costCredits));
  if (!Number.isFinite(cost) || cost <= 0) return { ok: true as const };

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (readErr) return { ok: false as const, error: readErr.message };

    const current = creditsFromProfile(profile);
    if (current < cost) return { ok: false as const, error: "Créditos insuficientes. Recarga para continuar.", credits: current };

    const next = round2(Math.max(0, current - cost));
    const col = pickWritableCreditsColumn(profile);
    if (!col) return { ok: false as const, error: "Falta columna de créditos en profiles (zingy_credits o ramber_credits)." };

    const { error: updErr } = await admin.from("profiles").update({ [col]: next }).eq("id", userId);
    if (!updErr) return { ok: true as const, credits: next };
  }

  return { ok: false as const, error: "No pude consumir créditos (intenta otra vez)." };
}

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: any) {
  try {
    const chunks: any[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function absoluteUrlFromReq(req: any, pathname: string) {
  const proto = String(req?.headers?.["x-forwarded-proto"] || "https").split(",")[0]?.trim() || "https";
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "").split(",")[0]?.trim();
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!host) return p;
  return `${proto}://${host}${p}`;
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

function sunoErrorMessage(data: any, fallback: string) {
  const msg =
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    (typeof data?.msg === "string" && data.msg) ||
    fallback;
  return String(msg);
}

function normalizeSunoBaseUrl(url: string) {
  let s = (url || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, "");
}

function sanitizeExternalUrl(raw: string) {
  const s = (raw || "").toString().trim();
  return s.replace(/^[`"' ]+/, "").replace(/[`"' ]+$/, "").trim();
}

async function sleep(ms: number) {
  await new Promise<void>(r => setTimeout(r, ms));
}

async function sunoFetchJson(path: string, init: any = {}) {
  const baseEnv = (process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "").toString().trim();
  const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";
  const apiKey = sanitizeExternalUrl((process.env.SUNO_API_KEY || process.env.SUNO_KEY || "").toString().trim());
  if (!apiKey) throw new Error("Falta SUNO_API_KEY en las variables de entorno.");

  const headers = new Headers(init?.headers || {});
  if (!headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");

  const fullUrl = new URL(path.replace(/^\/+/, ""), base + (base.endsWith("/") ? "" : "/")).toString();
  const res = await fetch(fullUrl, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res, data, text };
}

async function sunoFetchJsonWithRetry(path: string, init: any = {}) {
  const attempts = 3;
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const out = await sunoFetchJson(path, init);
      const status = out?.res?.status;
      const text = String(out?.text || "");
      const msg = String(out?.data?.message || out?.data?.error || out?.data?.msg || "");
      const shouldRetry =
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        text.toLowerCase().includes("internal error") ||
        text.toLowerCase().includes("try again later") ||
        msg.toLowerCase().includes("internal error") ||
        msg.toLowerCase().includes("try again later");

      if (i < attempts - 1 && shouldRetry) {
        await sleep(500 * (i + 1));
        continue;
      }
      return out;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await sleep(500 * (i + 1));
        continue;
      }
    }
  }
  throw lastErr || new Error("No pude contactar al proveedor");
}

export default async function handler(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

  const secret = (process.env.TELEGRAM_BOT_SECRET || "").toString().trim();
  if (!secret) return send(res, 500, { error: "TELEGRAM_BOT_SECRET no configurado" });
  const got = String(req?.headers?.["x-telegram-secret"] || "").trim();
  if (!got || got !== secret) return send(res, 401, { error: "No autorizado" });

  const payload = await readJsonBody(req);
  if (!payload) return send(res, 400, { error: "Body inválido" });

  const telegram_user_id = payload.telegram_user_id;
  if (telegram_user_id == null || telegram_user_id === "") return send(res, 400, { error: "Falta telegram_user_id" });

  const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
  const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
  if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });

  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

  const { data: link, error: linkErr } = await admin
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_user_id", telegram_user_id)
    .maybeSingle();
  if (linkErr) return send(res, 500, { error: "Error buscando vínculo", detail: linkErr.message });
  if (!link?.user_id) return send(res, 401, { error: "Cuenta no vinculada" });

  const userId = String(link.user_id);

  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
  const style = typeof payload?.style === "string" ? payload.style.trim() : "";
  const instrumental = Boolean(payload?.instrumental);
  const mv = typeof payload?.mv === "string" ? payload.mv.trim() : "";
  const modelRaw = typeof payload?.model === "string" ? payload.model.trim() : "";
  const personaModelHint = typeof payload?.personaModel === "string" ? payload.personaModel.trim() : "";
  let model = normalizeModel(modelRaw || mv);
  if (personaModelHint === "voice_persona") model = "V5";
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

  const consumed = await consumeUserCredits(admin, userId, CREDIT_COSTS.generate_music);
  if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });

  try {
    const paths = ["/api/v1/generate", "/api/v1/suno/generate"];
    let last: any = null;
    for (const p of paths) {
      const r = await sunoFetchJsonWithRetry(p, { method: "POST", body: JSON.stringify(body) });
      last = r;
      if (r?.res?.status !== 404) break;
    }
    const { res: r, data, text } = last || {};
    if (!r) {
      await adjustUserCredits(admin, userId, CREDIT_COSTS.generate_music);
      return send(res, 502, { error: "Error creando música", detail: "No pude contactar al proveedor" });
    }

    if (!r.ok) {
      const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
      await adjustUserCredits(admin, userId, CREDIT_COSTS.generate_music);
      return send(res, 502, { error: "Error creando música", code: r.status, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(data, "Error del proveedor");
      await adjustUserCredits(admin, userId, CREDIT_COSTS.generate_music);
      return send(res, 502, { error: "Error creando música", code, detail: String(msg).slice(0, 1200) });
    }

    const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
    if (!taskId) {
      await adjustUserCredits(admin, userId, CREDIT_COSTS.generate_music);
      return send(res, 502, { error: "Respuesta inválida del proveedor" });
    }

    const { error: insErr } = await admin
      .from("suno_tasks")
      .insert({ task_id: taskId, user_id: userId, kind: "generate", cost: CREDIT_COSTS.generate_music, consumed: true });
    if (insErr) {
      await adjustUserCredits(admin, userId, CREDIT_COSTS.generate_music);
      return send(res, 500, { error: "No pude guardar tarea", detail: insErr.message });
    }

    return send(res, 200, { taskId });
  } catch (e) {
    await adjustUserCredits(admin, userId, CREDIT_COSTS.generate_music);
    return send(res, 502, { error: "Error creando música", detail: e instanceof Error ? e.message : String(e) });
  }
}
