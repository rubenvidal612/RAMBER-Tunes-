export type CreditCounts = { 
  songs: number; 
  voice_separate: number; 
  split_stem: number; 
  music_video: number; 
  sounds: number; 
  replace_section: number; 
  wav: number; 
  lyrics: number; 
  timestamped_lyrics: number; 
  boost_style: number; 
}; 

export const CREDIT_COSTS = { 
  generate_music: 12, 
  extend_music: 12, 
  upload_and_cover: 12, 
  upload_and_extend: 12, 
  add_instrumental: 12, 
  add_vocals: 12, 
  sounds: 2.5, 
  separate_vocal: 10, 
  split_stem: 50, 
  music_video: 2, 
  mastering: 12,
  replace_section: 5, 
  wav: 0.4, 
  lyrics: 0.4, 
  timestamped_lyrics: 0.5, 
  boost_style: 0.4, 
  generate_persona: 0, 
  music_cover: 0, 
} as const; 

export function round2(n: number) { 
  return Math.round(n * 100) / 100; 
}

function isIsoInPast(iso: any) {
  const s = String(iso || "").trim();
  if (!s) return false;
  const ms = new Date(s).getTime();
  if (!Number.isFinite(ms)) return false;
  return ms < Date.now();
}

function isMissingColumnError(error: any) {
  const msg = String((error as any)?.message || error || "");
  return /column.*does not exist|relation.*does not exist/i.test(msg);
}

export async function getActiveBatchCredits(admin: any, userId: string): Promise<number> {
  try {
    const { data, error } = await admin
      .from("credit_batches")
      .select("remaining_credits, expires_at, is_expired")
      .eq("user_id", userId)
      .eq("is_expired", false);
    if (error) {
      if (isMissingColumnError(error) || /relation.*credit_batches.*does not exist/i.test(String(error?.message || error || ""))) {
        return 0;
      }
      return 0;
    }
    const now = Date.now();
    let total = 0;
    const rows = Array.isArray(data) ? data : [];
    for (const r of rows) {
      const remaining = Number((r as any).remaining_credits ?? 0);
      if (!Number.isFinite(remaining) || remaining <= 0) continue;
      const expIso = String((r as any).expires_at || "").trim();
      if (expIso) {
        const expMs = new Date(expIso).getTime();
        if (Number.isFinite(expMs) && expMs <= now) continue;
      }
      total += remaining;
    }
    return round2(total);
  } catch {
    return 0;
  }
}

export async function totalUserCreditsAvailable(admin: any, userId: string, profile?: any): Promise<number> {
  const p = profile ?? null;
  const prof = p ?? (await (async () => {
    try {
      const { data } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data ?? {};
    } catch {
      return {};
    }
  })());
  const globalExpired = isIsoInPast((prof as any)?.credits_expires_at);
  const profileCredits = globalExpired ? 0 : creditsFromProfile(prof);
  const batchCredits = await getActiveBatchCredits(admin, userId);
  return round2(profileCredits + batchCredits);
} 

export function toCounts(credits: number): CreditCounts { 
  const c = Number.isFinite(credits) ? Math.max(0, credits) : 0; 
  const safeFloor = (div: number) => (div > 0 ? Math.floor(c / div) : 0); 
  return { 
    songs: safeFloor(CREDIT_COSTS.generate_music), 
    voice_separate: safeFloor(CREDIT_COSTS.separate_vocal), 
    split_stem: safeFloor(CREDIT_COSTS.split_stem), 
    music_video: safeFloor(CREDIT_COSTS.music_video), 
    sounds: safeFloor(CREDIT_COSTS.sounds), 
    replace_section: safeFloor(CREDIT_COSTS.replace_section), 
    wav: safeFloor(CREDIT_COSTS.wav), 
    lyrics: safeFloor(CREDIT_COSTS.lyrics), 
    timestamped_lyrics: safeFloor(CREDIT_COSTS.timestamped_lyrics), 
    boost_style: safeFloor(CREDIT_COSTS.boost_style), 
  }; 
} 

export function creditsFromProfile(profile: any): number { 
  const p = profile ?? {}; 
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k); 

  const exp = (p as any)?.credits_expires_at; 
  if (exp) { 
    const ms = new Date(String(exp)).getTime(); 
    if (Number.isFinite(ms) && ms < Date.now()) return 0; 
  } 

  for (const k of ["ramber_credits", "zingy_credits", "credits"]) { 
    if (!has(k)) continue; 
    const v = (p as any)[k]; 
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Number(v)); 
  } 

  if (has("song_balance")) { 
    const songBal = typeof p?.song_balance === "number" && Number.isFinite(p.song_balance) ? Number(p.song_balance) : 0; 
    if (songBal > 0) return Math.max(0, songBal) * CREDIT_COSTS.generate_music; 
  } 

  return 0; 
} 

function pickWritableCreditsColumn(profile: any): "zingy_credits" | "ramber_credits" | "credits" | null { 
  const p = profile ?? {}; 
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k); 
  if (has("ramber_credits")) return "ramber_credits"; 
  if (has("zingy_credits")) return "zingy_credits"; 
  if (has("credits")) return "credits"; 
  return null; 
} 

export async function adjustUserCredits(admin: any, userId: string, deltaCredits: number) {
  const delta = Number(deltaCredits);
  if (!Number.isFinite(delta) || !delta) return { ok: true as const };

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await admin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (readErr) return { ok: false as const, error: readErr.message };

    const currentProfileCredits = creditsFromProfile(profile);
    const batchCredits = await getActiveBatchCredits(admin, userId);
    const globalExpired = isIsoInPast((profile as any)?.credits_expires_at);
    const current = globalExpired && delta < 0 ? 0 : currentProfileCredits;
    let next = round2(Math.max(0, current + delta));
    if (delta > 0) {
      const cap = 2000;
      const maxProfileAllowed = round2(Math.max(0, cap - batchCredits));
      next = Math.min(next, maxProfileAllowed);
    }
    const col = pickWritableCreditsColumn(profile);
    if (!col) return { ok: false as const, error: "Falta columna de créditos en profiles (zingy_credits o ramber_credits)." };
    const patch: any = { [col]: next };
    if (delta > 0) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);
      patch.credits_expires_at = expiresAt.toISOString();
    }

    const { error: updErr } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", userId);

    if (!updErr) return { ok: true as const, credits: next };
  }

  return { ok: false as const, error: "No pude actualizar créditos (intenta otra vez)." };
}

export async function consumeUserCredits(admin: any, userId: string, costCredits: number) {
  const cost = round2(Number(costCredits));
  if (!Number.isFinite(cost) || cost <= 0) return { ok: true as const };

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await admin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (readErr) return { ok: false as const, error: readErr.message };

    const batchCredits = await getActiveBatchCredits(admin, userId);
    const globalExpired = isIsoInPast((profile as any)?.credits_expires_at);
    const profileCredits = globalExpired ? 0 : creditsFromProfile(profile);
    const totalAvailable = round2(profileCredits + batchCredits);

    if (globalExpired && batchCredits <= 0) {
      return { ok: false as const, error: "Tus créditos han vencido, adquiere un nuevo paquete para continuar.", credits: 0 };
    }

    if (totalAvailable < cost) {
      return { ok: false as const, error: "Créditos insuficientes. Recarga para continuar.", credits: totalAvailable };
    }

    const current = creditsFromProfile(profile);
    const next = round2(Math.max(0, current - cost));
    const col = pickWritableCreditsColumn(profile);
    if (!col) return { ok: false as const, error: "Falta columna de créditos en profiles (zingy_credits o ramber_credits)." };

    const { error: updErr } = await admin
      .from("profiles")
      .update({ [col]: next })
      .eq("id", userId);

    if (!updErr) return { ok: true as const, credits: next };
  }

  return { ok: false as const, error: "No pude consumir créditos (intenta otra vez)." };
}
