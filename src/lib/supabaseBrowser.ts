import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.SUPABASE_URL as string | undefined) || "";
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY as string | undefined) || "";

export const supabaseBrowser = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function ensureAnonSession() {
  if (!supabaseBrowser) return { ok: false as const, error: "Falta SUPABASE_URL o SUPABASE_ANON_KEY" };

  const { data: sessionData } = await supabaseBrowser.auth.getSession();
  if (sessionData?.session) return { ok: true as const, session: sessionData.session };

  const { data, error } = await supabaseBrowser.auth.signInAnonymously();
  if (error || !data.session) {
    const msg = (error?.message || "No pude iniciar sesión").toString();
    if (msg.toLowerCase().includes("anonymous sign-ins are disabled")) {
      return {
        ok: false as const,
        error:
          "Tu Supabase tiene desactivado el inicio de sesión anónimo. Actívalo en Supabase: Authentication → Providers → Anonymous → Enable. Luego recarga la app.",
      };
    }
    return { ok: false as const, error: msg };
  }
  return { ok: true as const, session: data.session };
}

export async function getAccessToken() {
  const s = await ensureAnonSession();
  if (!s.ok) return { ok: false as const, error: s.error };
  return { ok: true as const, token: s.session.access_token };
}
