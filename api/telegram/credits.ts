import { createClient } from "@supabase/supabase-js";

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
  const { data: profile, error: profErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (profErr) return send(res, 500, { error: "Error leyendo perfil", detail: profErr.message });

  const credits = creditsFromProfile(profile);
  return send(res, 200, { credits });
}
