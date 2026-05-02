import { createClient } from "@supabase/supabase-js";
import { adjustUserCredits } from "../../src/lib/credits";

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function pickQuery(req: any, key: string) {
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get(key) || "";
}

async function fetchPayment(mpToken: string, paymentId: string) {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${mpToken}` },
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

export default async function handler(req: any, res: any) {
  if (!["GET", "POST"].includes((req.method || "").toUpperCase())) return send(res, 405, { error: "Método no permitido" });

  const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
  if (!mpToken) return send(res, 500, { error: "Falta MERCADO_PAGO_ACCESS_TOKEN en Vercel" });

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

  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

  const paymentId =
    (typeof req.body?.payment_id === "string" ? req.body.payment_id : "") ||
    (typeof req.body?.paymentId === "string" ? req.body.paymentId : "") ||
    pickQuery(req, "payment_id") ||
    pickQuery(req, "paymentId");
  if (!paymentId) return send(res, 400, { error: "Falta payment_id" });

  const { ok, status, data } = await fetchPayment(mpToken, paymentId);
  if (!ok) return send(res, 502, { error: "No pude verificar el pago", code: status, detail: data || null });

  const paymentStatus = (data?.status || "").toString();
  const meta = data?.metadata || {};
  const metaUserId = (meta?.user_id || meta?.userId || "").toString();
  if (metaUserId && metaUserId !== user.id) return send(res, 403, { error: "Pago no pertenece a este usuario" });

  if (paymentStatus !== "approved") {
    return send(res, 200, { ok: true, status: paymentStatus, credited: false });
  }

  const txKind = (meta?.kind || "songs").toString() || "songs";
  const packKey = (meta?.pack_key || meta?.packKey || "").toString();
  const amountMxn = Number(meta?.amount_mxn ?? meta?.amountMxn ?? 0);
  const credits = Number(meta?.credits ?? 0);

  const { data: exists } = await admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
  if (Array.isArray(exists) && exists.length > 0) {
    return send(res, 200, { ok: true, status: paymentStatus, credited: true, already: true });
  }

  if (Number.isFinite(credits) && credits > 0) {
    const upd = await adjustUserCredits(admin, user.id, credits);
    if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });
  }

  await admin.from("mp_transactions").insert({
    user_id: user.id,
    kind: txKind,
    pack_key: packKey || "unknown",
    amount_mxn: Number.isFinite(amountMxn) ? amountMxn : 0,
    payment_id: paymentId,
  });

  return send(res, 200, { ok: true, status: paymentStatus, credited: true });
}

