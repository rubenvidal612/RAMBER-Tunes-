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
  const zingy = 
    typeof profile?.zingy_credits === "number" && Number.isFinite(profile.zingy_credits) ? Number(profile.zingy_credits) : null; 
  if (zingy !== null) return Math.max(0, zingy); 
  return 0; 
} 

export async function adjustUserCredits(admin: any, userId: string, deltaCredits: number) { 
  const delta = Number(deltaCredits); 
  if (!Number.isFinite(delta) || !delta) return { ok: true as const }; 

  for (let i = 0; i < 4; i++) { 
    const { data: profile, error: readErr } = await admin 
      .from("profiles") 
      .select("id, zingy_credits") 
      .eq("id", userId) 
      .maybeSingle(); 
    if (readErr) return { ok: false as const, error: readErr.message }; 

    const current = creditsFromProfile(profile); 
    const next = round2(Math.max(0, current + delta)); 

    const { error: updErr } = await admin 
      .from("profiles") 
      .update({ zingy_credits: next }) 
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
      .select("id, zingy_credits") 
      .eq("id", userId) 
      .maybeSingle(); 
    if (readErr) return { ok: false as const, error: readErr.message }; 

    const current = creditsFromProfile(profile); 
    if (current < cost) return { ok: false as const, error: "Créditos insuficientes. Recarga para continuar.", credits: current }; 

    const next = round2(Math.max(0, current - cost)); 

    const { error: updErr } = await admin 
      .from("profiles") 
      .update({ zingy_credits: next }) 
      .eq("id", userId); 

    if (!updErr) return { ok: true as const, credits: next }; 
  } 

  return { ok: false as const, error: "No pude consumir créditos (intenta otra vez)." }; 
}
