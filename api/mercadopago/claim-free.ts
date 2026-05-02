import { createClient } from "@supabase/supabase-js";
import { CREDIT_COSTS, adjustUserCredits } from "../../src/lib/credits";

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
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

  const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return send(res, 401, { error: "No autorizado" });

  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

  const paymentId = `claim:${user.id}`;
  const { data: exists } = await admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
  if (Array.isArray(exists) && exists.length > 0) return send(res, 200, { ok: true, already: true });

  const credits = CREDIT_COSTS.generate_music * 5;
  const upd = await adjustUserCredits(admin, user.id, credits);
  if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });

  await admin.from("mp_transactions").insert({
    user_id: user.id,
    kind: "songs",
    pack_key: "gratis",
    amount_mxn: 0,
    payment_id: paymentId,
  });

  return send(res, 200, { ok: true, credited: true, credits });
}

