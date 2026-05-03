import { createClient } from "@supabase/supabase-js";

function readEnv(key: string) {
  const pe = (process.env as any) || {};
  const ime = (import.meta as any)?.env || {};
  return (
    (pe?.[key] as string | undefined) ||
    (ime?.[key] as string | undefined) ||
    ""
  );
}

const supabaseUrl =
  readEnv("SUPABASE_URL") ||
  readEnv("VITE_SUPABASE_URL") ||
  readEnv("NEXT_PUBLIC_SUPABASE_URL");

const supabaseAnonKey =
  readEnv("SUPABASE_ANON_KEY") ||
  readEnv("VITE_SUPABASE_ANON_KEY") ||
  readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

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
  const redirectTo = `${window.location.origin}/`;
  const { error } = await supabaseBrowser.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (error) return { ok: false as const, error: (error.message || "No pude iniciar sesión con Google").toString() };
  return { ok: true as const };
}
