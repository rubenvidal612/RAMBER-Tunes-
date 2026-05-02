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

  const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
  const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
  const typeRaw = typeof payload?.type === "string" ? payload.type.trim() : "separate_vocal";
  const type = typeRaw || "separate_vocal";
  if (!taskId) return send(res, 400, { error: "Falta taskId" });
  if (!audioId) return send(res, 400, { error: "Falta audioId" });
  if (!(type === "separate_vocal" || type === "split_stem")) {
    return send(res, 400, { error: "type inválido. Usa 'separate_vocal' o 'split_stem'." });
  }

  if (!isAdmin) {
    const { data: paidTx, error: paidErr } = await admin
      .from("mp_transactions")
      .select("payment_id")
      .eq("user_id", user.id)
      .eq("kind", "songs")
      .eq("pack_key", "productor")
      .gt("amount_mxn", 0)
      .limit(1);
    if (paidErr) return send(res, 500, { error: paidErr.message });
    const ok = Array.isArray(paidTx) && paidTx.length > 0;
    if (!ok) return send(res, 403, { error: "Necesitas el Pack Productor ($545) para Karaoke y STEMS.", needPlan: true });
  }

  const cost = type === "split_stem" ? CREDIT_COSTS.split_stem : CREDIT_COSTS.separate_vocal;
  const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");

  const body = { taskId, audioId, type, callBackUrl };

  try {
    if (!isAdmin) {
      const consumed = await consumeUserCredits(admin, user.id, cost);
      if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
    }

    const { res: r, data, text } = await sunoFetchJson("/api/v1/vocal-removal/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
      if (!isAdmin) await adjustUserCredits(admin, user.id, cost);
      return send(res, 502, { error: "Error separando pistas", code: r.status, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(data, "Error del proveedor");
      if (!isAdmin) await adjustUserCredits(admin, user.id, cost);
      return send(res, 502, { error: "Error separando pistas", code, detail: String(msg).slice(0, 1200) });
    }

    const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
    if (!outTaskId) {
      if (!isAdmin) await adjustUserCredits(admin, user.id, cost);
      return send(res, 502, { error: "Respuesta inválida del proveedor" });
    }

    await admin.from("suno_tasks").insert({
      task_id: outTaskId,
      user_id: user.id,
      kind: "separate",
      cost,
      consumed: true,
      parent_task_id: taskId,
    });

    return send(res, 200, { taskId: outTaskId });
  } catch (e) {
    if (!isAdmin) {
      await adjustUserCredits(admin, user.id, cost);
    }
    return send(res, 502, { error: "Error separando pistas", detail: e instanceof Error ? e.message : String(e) });
  }
}

