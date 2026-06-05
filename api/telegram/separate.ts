import { createClient } from "@supabase/supabase-js";

const CREDIT_COSTS = {
  separate_vocal: 10,
  split_stem: 50,
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
    if (songBal > 0) return Math.max(0, songBal) * 12;
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
  const direct = req?.body;
  if (direct != null) {
    if (typeof direct === "object") return direct;
    if (typeof direct === "string") {
      try {
        return direct ? JSON.parse(direct) : null;
      } catch {
        return null;
      }
    }
  }
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

  const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
  const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
  const type = typeof payload?.type === "string" ? payload.type.trim() : "separate_vocal";
  if (!taskId && !audioId) return send(res, 400, { error: "Falta taskId o audioId" });
  if (!(type === "separate_vocal" || type === "split_stem")) return send(res, 400, { error: "type inválido. Usa 'separate_vocal' o 'split_stem'." });

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
  const cost = type === "split_stem" ? CREDIT_COSTS.split_stem : CREDIT_COSTS.separate_vocal;

  const consumed = await consumeUserCredits(admin, userId, cost);
  if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });

  const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
  const body = { taskId, audioId, type, callBackUrl };

  try {
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
      await adjustUserCredits(admin, userId, cost);
      return send(res, 502, { error: "Error separando", detail: "No pude contactar al proveedor" });
    }

    if (!r.ok) {
      const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
      await adjustUserCredits(admin, userId, cost);
      return send(res, 502, { error: "Error separando", code: r.status, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(data, "Error del proveedor");
      await adjustUserCredits(admin, userId, cost);
      return send(res, 502, { error: "Error separando", code, detail: String(msg).slice(0, 1200) });
    }

    const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
    if (!outTaskId) {
      await adjustUserCredits(admin, userId, cost);
      return send(res, 502, { error: "Respuesta inválida del proveedor" });
    }

    const { error: insErr } = await admin
      .from("suno_tasks")
      .insert({ task_id: outTaskId, user_id: userId, kind: `vocal-removal:${type}`, cost, consumed: true });
    if (insErr) {
      await adjustUserCredits(admin, userId, cost);
      return send(res, 500, { error: "No pude guardar tarea", detail: insErr.message });
    }

    return send(res, 200, { taskId: outTaskId });
  } catch (e) {
    await adjustUserCredits(admin, userId, cost);
    return send(res, 502, { error: "Error separando", detail: e instanceof Error ? e.message : String(e) });
  }
}

