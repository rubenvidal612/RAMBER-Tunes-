import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.SUPABASE_URL as string | undefined) || "";
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY as string | undefined) || "";
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL as string | undefined) || "";

export const supabaseBrowser = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function ensureAnonSession() {
  if (!supabaseBrowser) return { ok: false as const, error: "Falta SUPABASE_URL o SUPABASE_ANON_KEY" };

  const { data: sessionData } = await supabaseBrowser.auth.getSession();
  if (sessionData?.session) return { ok: true as const, session: sessionData.session };
  return { ok: false as const, error: "Necesitas iniciar sesión con Google para usar RAMBER Tunes." };
}

export async function getAccessToken() {
  const s = await ensureAnonSession();
  if (!s.ok) return { ok: false as const, error: s.error };
  const email = (s.session?.user?.email || "").toString().trim().toLowerCase();
  if (!email || (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com"))) {
    try {
      await supabaseBrowser?.auth?.signOut?.();
    } catch {
    }
    return { ok: false as const, error: "Necesitas entrar con una cuenta Gmail (Google) para usar RAMBER Tunes." };
  }
  return { ok: true as const, token: s.session.access_token };
}

export async function signInWithGoogle() {
  if (!supabaseBrowser) return { ok: false as const, error: "Falta SUPABASE_URL o SUPABASE_ANON_KEY" };
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const baseRaw = (isDev ? window.location.origin : (siteUrl || window.location.origin)).toString().trim();
  const base = /^https?:\/\//i.test(baseRaw) ? baseRaw : `https://${baseRaw.replace(/^\/+/, "")}`;
  const redirectTo = base.endsWith("/") ? base : `${base}/`;
  const { data, error } = await supabaseBrowser.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) return { ok: false as const, error: (error.message || "No pude iniciar sesión con Google").toString() };
  const url = (data as any)?.url ? String((data as any).url).trim() : "";
  if (url) {
    window.location.href = url;
    return { ok: true as const };
  }
  const r2 = await supabaseBrowser.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (r2.error) return { ok: false as const, error: (r2.error.message || "No pude iniciar sesión con Google").toString() };
  return { ok: true as const };
}
