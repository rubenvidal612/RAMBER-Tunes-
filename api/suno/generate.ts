import { createClient } from "@supabase/supabase-js";
import { CREDIT_COSTS, adjustUserCredits, consumeUserCredits } from "../../src/lib/credits";
import { isAdminEmail } from "../../src/lib/authz";

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

async function sunoFetchJson(path: string, init?: RequestInit) {
  const base = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
  if (!base) throw new Error("Falta SUNO_API_BASE_URL en variables de entorno");

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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseAnon || !supabaseService) {
    return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" });
  }

  const authHeader = (req.headers.authorization || "").toString();
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return send(res, 401, { error: "No autorizado" });

  const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return send(res, 401, { error: "No autorizado" });

  const isAdmin = isAdminEmail(user.email);
  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

  const payload = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
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
      if (model !== "V5_5") return send(res, 400, { error: "personaId solo se permite con el modelo V5.5." });
      body.personaId = personaId.slice(0, 200);
    }

    const personaModel = typeof payload?.personaModel === "string" ? payload.personaModel.trim() : "";
    if (personaModel) body.personaModel = personaModel.slice(0, 200);

    const vocalGender = typeof payload?.vocalGender === "string" ? payload.vocalGender.trim().toLowerCase() : "";
    if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender;

    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const styleWeight = Number(payload?.styleWeight);
    if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
    const weirdnessConstraint = Number(payload?.weirdnessConstraint);
    if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
    const audioWeight = Number(payload?.audioWeight);
    if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);
  }

  const cost = CREDIT_COSTS.generate_music;

  try {
    if (!isAdmin) {
      const consumed = await consumeUserCredits(admin, user.id, cost);
      if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
    }

    const { res: r, data, text } = await sunoFetchJson("/api/v1/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
      if (!isAdmin) await adjustUserCredits(admin, user.id, cost);
      return send(res, 502, { error: "Error creando música", code: r.status, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(data, "Error del proveedor");
      if (!isAdmin) await adjustUserCredits(admin, user.id, cost);
      return send(res, 502, { error: "Error creando música", code, detail: String(msg).slice(0, 1200) });
    }

    const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
    if (!taskId) {
      if (!isAdmin) await adjustUserCredits(admin, user.id, cost);
      return send(res, 502, { error: "Respuesta inválida del proveedor" });
    }

    await admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "generate", cost, consumed: true });
    return send(res, 200, { taskId });
  } catch (e) {
    if (!isAdmin) {
      await adjustUserCredits(admin, user.id, cost);
    }
    return send(res, 502, { error: "Error creando música", detail: e instanceof Error ? e.message : String(e) });
  }
}

