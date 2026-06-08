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

export default async function handler(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

  const secret = (process.env.TELEGRAM_BOT_SECRET || "").toString().trim();
  if (!secret) return send(res, 500, { error: "TELEGRAM_BOT_SECRET no configurado" });
  const got = String(req?.headers?.["x-telegram-secret"] || "").trim();
  if (!got || got !== secret) return send(res, 401, { error: "No autorizado" });

  const payload = await readJsonBody(req);
  if (!payload) return send(res, 400, { error: "Body inválido" });

  const telegram_user_id = payload.telegram_user_id;
  const telegram_username = typeof payload?.telegram_username === "string" ? payload.telegram_username.trim() : "";
  const tokenRaw = typeof payload?.token === "string" ? payload.token.trim() : "";
  const emailRaw = typeof payload?.email === "string" ? payload.email.trim() : "";
  const adminMode = Boolean(payload?.admin);

  if (telegram_user_id == null || telegram_user_id === "") return send(res, 400, { error: "Falta telegram_user_id" });

  const token = tokenRaw.replace(/\D+/g, "").slice(0, 6);

  const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
  const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
  if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });

  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

  if (adminMode && emailRaw) {
    const email = emailRaw.toLowerCase();
    const { data: prof, error: profErr } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (profErr) return send(res, 500, { error: "Error buscando usuario", detail: profErr.message });
    const userId = String((prof as any)?.id || "").trim();
    if (!userId) return send(res, 404, { error: "Usuario no encontrado" });

    const { error: linkErr } = await admin
      .from("telegram_links")
      .upsert(
        {
          telegram_user_id,
          user_id: userId,
          telegram_username: telegram_username || null,
          linked_at: new Date().toISOString(),
        },
        { onConflict: "telegram_user_id" },
      );
    if (linkErr) return send(res, 500, { error: "No pude vincular cuenta", detail: linkErr.message });
    return send(res, 200, { ok: true, user_id: userId });
  }

  if (!tokenRaw) return send(res, 400, { error: "Falta token" });
  if (token.length !== 6) return send(res, 400, { error: "Token inválido" });

  const cutoffIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: tokenRow, error: tokErr } = await admin
    .from("telegram_tokens")
    .select("id, user_id, used, created_at")
    .eq("token", token)
    .eq("used", false)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tokErr) return send(res, 500, { error: "Error validando token", detail: tokErr.message });
  if (!tokenRow?.user_id) return send(res, 401, { error: "Token inválido o expirado" });

  const userId = String(tokenRow.user_id);

  const { error: useErr } = await admin
    .from("telegram_tokens")
    .update({ used: true })
    .eq("id", tokenRow.id)
    .eq("used", false);
  if (useErr) return send(res, 500, { error: "No pude usar el token", detail: useErr.message });

  const { error: linkErr } = await admin
    .from("telegram_links")
    .upsert(
      {
        telegram_user_id,
        user_id: userId,
        telegram_username: telegram_username || null,
        linked_at: new Date().toISOString(),
      },
      { onConflict: "telegram_user_id" },
    );
  if (linkErr) return send(res, 500, { error: "No pude vincular cuenta", detail: linkErr.message });

  return send(res, 200, { ok: true, user_id: userId });
}
