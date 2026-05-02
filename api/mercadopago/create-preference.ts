import { createClient } from "@supabase/supabase-js";

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

type PackKey = "inicio" | "productor";

const PACKS: Record<PackKey, { title: string; amount_mxn: number; credits: number; songs: number }> = {
  inicio: { title: "Pack Inicio", amount_mxn: 275, credits: 1200, songs: 100 },
  productor: { title: "Pack Productor", amount_mxn: 545, credits: 3000, songs: 250 },
};

export default async function handler(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

  const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
  if (!mpToken) return send(res, 500, { error: "Falta MERCADO_PAGO_ACCESS_TOKEN en Vercel" });

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseAnon) return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY)" });

  const authHeader = (req.headers.authorization || "").toString();
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return send(res, 401, { error: "No autorizado" });

  const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return send(res, 401, { error: "No autorizado" });

  const payload =
    typeof req.body === "string"
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!payload) return send(res, 400, { error: "Body inválido" });

  const packKeyRaw = typeof payload?.packKey === "string" ? payload.packKey.trim().toLowerCase() : "";
  const packKey = (packKeyRaw === "inicio" || packKeyRaw === "productor" ? packKeyRaw : "") as PackKey | "";
  if (!packKey) return send(res, 400, { error: "packKey inválido (usa 'inicio' o 'productor')" });

  const pack = PACKS[packKey];
  const origin = originFromReq(req);

  const preferenceBody: any = {
    items: [
      {
        title: `${pack.title} - ${pack.songs} canciones`,
        quantity: 1,
        currency_id: "MXN",
        unit_price: pack.amount_mxn,
      },
    ],
    external_reference: `ramber:${user.id}:${packKey}`,
    metadata: {
      user_id: user.id,
      kind: "songs",
      pack_key: packKey,
      amount_mxn: pack.amount_mxn,
      credits: pack.credits,
      songs: pack.songs,
    },
    back_urls: {
      success: `${origin}/?mp=success`,
      failure: `${origin}/?mp=failure`,
      pending: `${origin}/?mp=pending`,
    },
    auto_return: "approved",
    notification_url: `${origin}/api/mercadopago/webhook`,
  };

  try {
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        authorization: `Bearer ${mpToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(preferenceBody),
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return send(res, 502, { error: "Error creando pago", detail: data || null });
    }

    const initPoint = typeof data?.init_point === "string" ? data.init_point : "";
    if (!initPoint) return send(res, 502, { error: "Respuesta inválida de MercadoPago" });

    return send(res, 200, { init_point: initPoint, preference_id: data?.id || null });
  } catch (e) {
    return send(res, 502, { error: "Error creando pago", detail: e instanceof Error ? e.message : String(e) });
  }
}

