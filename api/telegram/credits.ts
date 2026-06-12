import { createClient } from "@supabase/supabase-js";

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
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

function isAdminEmail(email?: string | null) {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;

  const hardcoded = ["rubenfiverr612@gmail.com", "rubenvidal612@gmail.com"];

  const raw = (typeof process !== "undefined" && (process as any)?.env && ((process as any).env.ADMIN_EMAILS || (process as any).env.ADMIN_EMAIL)) || "";
  const list = String(raw)
    .split(/[,\s]+/g)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  if (list.length === 0) {
    return hardcoded.includes(e);
  }
  return list.includes(e) || hardcoded.includes(e);
}

function normalizeSunoBaseUrl(url: string) {
  let s = (url || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, "");
}

function sanitizeExternalUrl(raw: string) {
  const s = (raw || "").toString().trim();
  return s.replace(/^[`"' ]+/, "").replace(/[`"' ]+$/, "").trim();
}

function sunoErrorMessage(data: any, fallback: string) {
  const msg =
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    (typeof data?.msg === "string" && data.msg) ||
    fallback;
  return String(msg);
}

function parseCreditsValue(raw: any) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const cleaned = raw.trim().replaceAll("Credits", "").replaceAll("credits", "").replaceAll("CR", "").replaceAll(" ", "").replaceAll(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

async function resolveTelegramUser(admin: any, telegramUserId: string) {
  //#region debug-point credits-resolve-link
  const out: any = {
    userId: "",
    source: "",
    detail: "",
  };
  //#endregion debug-point credits-resolve-link

  const { data: link, error: linkErr } = await admin
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (linkErr) {
    out.detail = linkErr.message || "Error buscando vínculo";
    return out;
  }
  if (link?.user_id) {
    out.userId = String(link.user_id);
    out.source = "telegram_links";
    return out;
  }

  const { data: profileByTelegram, error: profileByTelegramErr } = await admin
    .from("profiles")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (profileByTelegramErr) {
    const msg = String(profileByTelegramErr.message || "").toLowerCase();
    if (!msg.includes("column") || !msg.includes("telegram_user_id")) {
      out.detail = profileByTelegramErr.message || "Error buscando perfil por telegram_user_id";
      return out;
    }
  }

  if ((profileByTelegram as any)?.id) {
    out.userId = String((profileByTelegram as any).id);
    out.source = "profiles.telegram_user_id";
    return out;
  }

  return out;
}

async function sunoFetchJson(path: string) {
  const baseEnv = (process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "").toString().trim();
  const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";
  const apiKey = sanitizeExternalUrl((process.env.SUNO_API_KEY || process.env.SUNO_KEY || "").toString().trim());
  if (!apiKey) throw new Error("Falta SUNO_API_KEY en las variables de entorno.");

  const fullUrl = new URL(path.replace(/^\/+/, ""), base + (base.endsWith("/") ? "" : "/")).toString();
  const res = await fetch(fullUrl, { method: "GET", headers: { authorization: `Bearer ${apiKey}` } });
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
  const resolved = await resolveTelegramUser(admin, String(telegram_user_id));
  if (resolved.detail) return send(res, 500, { error: "Error buscando vínculo", detail: resolved.detail });
  if (!resolved.userId) return send(res, 401, { error: "Cuenta no vinculada" });

  const userId = String(resolved.userId);
  const { data: profile, error: profErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (profErr) return send(res, 500, { error: "Error leyendo perfil", detail: profErr.message });

  const internalCredits = round2(creditsFromProfile(profile));
  const email = typeof profile?.email === "string" ? profile.email : "";
  const isAdmin = isAdminEmail(email);

  if (isAdmin) {
    try {
      const paths = [
        "/api/v1/generate/credit",
        "/api/v1/get-credits",
        "/api/v1/generate/credit",
        "/api/v1/suno/get-credits",
        "/api/v1/suno/generate/credit",
        "/api/v1/suno/credits",
        "/api/v1/suno/credit",
      ];

      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p);
        last = r;
        if (r.res.status !== 404) break;
      }

      const r = last;
      if (r?.res?.ok) {
        const code = Number(r.data?.code);
        if (!code || code === 200) {
          const raw = r.data?.data?.credits ?? r.data?.data;
          const parsed = parseCreditsValue(raw);
          const providerCredits = round2(Number.isFinite(parsed) ? parsed : 0);
          if (Number.isFinite(providerCredits) && providerCredits >= 0) return send(res, 200, { credits: providerCredits });
        }
      }

      const msg = sunoErrorMessage(r?.data, r?.text || `HTTP ${r?.res?.status || 0}`);
      return send(res, 200, { credits: internalCredits, provider_error: String(msg).slice(0, 1200) });
    } catch (e) {
      return send(res, 200, { credits: internalCredits, provider_error: e instanceof Error ? e.message : String(e) });
    }
  }

  return send(res, 200, { credits: internalCredits });
}
