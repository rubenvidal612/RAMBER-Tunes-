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
  if (!["POST", "GET"].includes((req.method || "").toUpperCase())) return send(res, 405, { error: "Método no permitido" });

  const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
  if (!mpToken) return send(res, 500, { error: "Falta MERCADO_PAGO_ACCESS_TOKEN en Vercel" });

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });

  const paymentId =
    pickQuery(req, "data.id") ||
    pickQuery(req, "id") ||
    pickQuery(req, "payment_id") ||
    (typeof req.body?.data?.id === "string" ? req.body.data.id : "") ||
    (typeof req.body?.id === "string" ? req.body.id : "");
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

  if (Number.isFinite(credits) && credits > 0) {
    await adjustUserCredits(admin, userId, credits);
  }

  await admin.from("mp_transactions").insert({
    user_id: userId,
    kind: txKind,
    pack_key: packKey || "unknown",
    amount_mxn: Number.isFinite(amountMxn) ? amountMxn : 0,
    payment_id: paymentId,
  });

  return send(res, 200, { ok: true, status: paymentStatus, credited: true });
}

