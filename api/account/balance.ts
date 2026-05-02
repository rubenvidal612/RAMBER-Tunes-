import { createClient } from "@supabase/supabase-js";
import { creditsFromProfile, round2, toCounts } from "../../src/lib/credits";
import { isAdminEmail } from "../../src/lib/authz";

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function pickQuery(req: any, key: string) {
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get(key) || "";
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
    const cleaned = raw
      .trim()
      .replaceAll("Credits", "")
      .replaceAll("credits", "")
      .replaceAll("CR", "")
      .replaceAll(" ", "")
      .replaceAll(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

async function sunoFetchJson(path: string) {
  const base = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
  if (!base) throw new Error("Falta SUNO_API_BASE_URL en variables de entorno");

  const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
  if (!apiKey) throw new Error("Falta SUNO_API_KEY en variables de entorno");

  const r = await fetch(new URL(path, base).toString(), {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res: r, data, text };
}

export default async function handler(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

  const useProvider = (pickQuery(req, "source") || "").toLowerCase() === "provider";
  if (useProvider) {
    try {
      const paths = [
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

      if (!r?.res?.ok) {
        const msg = sunoErrorMessage(r?.data, r?.text || `HTTP ${r?.res?.status || 0}`);
        return send(res, 502, { error: "Error consultando saldo", code: r?.res?.status || 0, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(r.data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(r.data, "Error del proveedor");
        return send(res, 502, { error: "Error consultando saldo", code, detail: String(msg).slice(0, 1200) });
      }

      const raw = r.data?.data?.credits ?? r.data?.data;
      const parsed = parseCreditsValue(raw);
      const credits = round2(Number.isFinite(parsed) ? parsed : 0);
      const counts = toCounts(credits);
      return send(res, 200, { credits, song_balance: counts.songs, counts, downloads_allowed: false, free_claimed: false, source: "provider" });
    } catch (e) {
      return send(res, 502, { error: "Error consultando saldo", detail: e instanceof Error ? e.message : String(e) });
    }
  }

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

  const { data: paidTx } = await admin
    .from("mp_transactions")
    .select("payment_id")
    .eq("user_id", user.id)
    .eq("kind", "songs")
    .gt("amount_mxn", 0)
    .limit(1);
  const downloads_allowed = Array.isArray(paidTx) && paidTx.length > 0;

  const { data: freeTx } = await admin
    .from("mp_transactions")
    .select("payment_id, pack_key")
    .eq("user_id", user.id)
    .eq("kind", "songs")
    .limit(50);
  const free_claimed =
    Array.isArray(freeTx) &&
    freeTx.some((t: any) => {
      const pid = typeof t?.payment_id === "string" ? t.payment_id : "";
      const pk = typeof t?.pack_key === "string" ? t.pack_key : "";
      return pid.startsWith("claim:") || pk === "gratis" || pk === "free";
    });

  let { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, song_balance, ramber_credits, zingy_credits")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr) return send(res, 500, { error: "Error consultando saldo", detail: profErr.message });

  if (!profile) {
    const { error: insErr } = await admin.from("profiles").upsert({ id: user.id }, { onConflict: "id" });
    if (insErr) return send(res, 500, { error: "Error creando perfil", detail: insErr.message });
    const r2 = await admin.from("profiles").select("id, song_balance, ramber_credits, zingy_credits").eq("id", user.id).maybeSingle();
    profile = r2.data ?? null;
  }

  const credits = round2(creditsFromProfile(profile));
  const counts = toCounts(credits);
  return send(res, 200, { credits, song_balance: counts.songs, counts, downloads_allowed, free_claimed, source: "local" });
}
