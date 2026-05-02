import { createClient } from "@supabase/supabase-js";
import { adjustUserCredits } from "../src/lib/credits";
import { isAdminEmail } from "../src/lib/authz";

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
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

async function requireAdmin(req: any) {
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

  if (!isAdminEmail(user.email)) return { ok: false as const, status: 403, error: "Solo admin" };

  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
  return { ok: true as const, user, admin };
}

async function handleStats(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

  const auth = await requireAdmin(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });

  const out: any = {};
  try {
    const users = await auth.admin.from("profiles").select("id", { count: "exact", head: true });
    out.users_total = users.count ?? null;
  } catch {
    out.users_total = null;
  }

  try {
    const personas = await auth.admin.from("suno_personas").select("id", { count: "exact", head: true });
    out.personas_total = personas.count ?? null;
  } catch {
    out.personas_total = null;
  }

  try {
    const tx = await auth.admin.from("mp_transactions").select("id", { count: "exact", head: true });
    out.payments_total = tx.count ?? null;
  } catch {
    out.payments_total = null;
  }

  return send(res, 200, out);
}

async function handleTransfer(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

  const auth = await requireAdmin(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });

  const body = parseJsonBody(req);
  if (!body) return send(res, 400, { error: "Body inválido" });

  const toEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const creditsRaw = Number(body?.credits);
  const credits = Number.isFinite(creditsRaw) ? Math.floor(creditsRaw * 100) / 100 : NaN;
  if (!toEmail) return send(res, 400, { error: "Falta email" });
  if (!Number.isFinite(credits) || credits <= 0) return send(res, 400, { error: "Créditos inválidos" });

  const { data: target, error: findErr } = await auth.admin
    .from("profiles")
    .select("id, email")
    .ilike("email", toEmail)
    .limit(2);

  if (findErr) {
    return send(res, 500, { error: "No pude buscar el usuario", detail: findErr.message });
  }
  if (!Array.isArray(target) || target.length === 0) {
    return send(res, 404, { error: "No encontré ese correo. Ese usuario debe iniciar sesión al menos una vez para quedar registrado." });
  }
  if (target.length > 1) {
    return send(res, 409, { error: "Hay más de un usuario con ese correo. Revisa tu Supabase." });
  }

  const userId = String(target[0].id || "");
  if (!userId) return send(res, 500, { error: "Usuario inválido" });

  const upd = await adjustUserCredits(auth.admin, userId, credits);
  if (!upd.ok) return send(res, 500, { error: upd.error || "No pude enviar créditos" });

  const paymentId = `admin_transfer:${auth.user.id}:${userId}:${Date.now()}`;
  await auth.admin.from("mp_transactions").insert({
    user_id: userId,
    kind: "admin_transfer",
    pack_key: "admin",
    amount_mxn: 0,
    payment_id: paymentId,
  });

  return send(res, 200, { ok: true, user_id: userId, credits_added: credits });
}

export default async function handler(req: any, res: any) {
  const action = (pickQuery(req, "action") || "").trim().toLowerCase() || "";
  const fallback = (() => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const i = parts.findIndex((p) => p === "admin");
    const next = i >= 0 ? parts[i + 1] : "";
    return (next || "").toLowerCase();
  })();
  const a = action || fallback;

  if (a === "stats") return handleStats(req, res);
  if (a === "transfer") return handleTransfer(req, res);

  return send(res, 404, { error: "Ruta no encontrada", action: a || null });
}

