import { createClient } from "@supabase/supabase-js";
import { CREDIT_COSTS, adjustUserCredits } from "../src/lib/credits";

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

  const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
  return { ok: true as const, user, admin, supabaseUrl, supabaseAnon, supabaseService };
}

type PackKey = "inicio" | "productor";

const PACKS: Record<PackKey, { title: string; amount_mxn: number; credits: number; songs: number }> = {
  inicio: { title: "Pack Inicio", amount_mxn: 275, credits: 1200, songs: 100 },
  productor: { title: "Pack Productor", amount_mxn: 545, credits: 3000, songs: 250 },
};

async function fetchPayment(mpToken: string, paymentId: string) {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${mpToken}` },
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
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

  return send(res, 200, { ok: true, status: paymentStatus, credited: true });
}

async function handleClaimFree(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

  const auth = await requireUser(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });

  const paymentId = `claim:${auth.user.id}`;
  const { data: exists } = await auth.admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
  if (Array.isArray(exists) && exists.length > 0) return send(res, 200, { ok: true, already: true });

  const credits = CREDIT_COSTS.generate_music * 5;
  const upd = await adjustUserCredits(auth.admin, auth.user.id, credits);
  if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });

  await auth.admin.from("mp_transactions").insert({
    user_id: auth.user.id,
    kind: "songs",
    pack_key: "gratis",
    amount_mxn: 0,
    payment_id: paymentId,
  });

  return send(res, 200, { ok: true, credited: true, credits });
}

export default async function handler(req: any, res: any) {
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
}

