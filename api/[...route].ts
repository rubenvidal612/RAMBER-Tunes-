const CREDIT_COSTS = {
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
  midi: 0,
  generate_persona: 0,
  music_cover: 0,
} as const;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toCounts(credits: number) {
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
    midi: safeFloor(CREDIT_COSTS.midi),
  };
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
    if (songBal > 0) return Math.max(0, songBal) * CREDIT_COSTS.generate_music;
  }

  return 0;
}

function pickWritableCreditsColumn(profile: any): "zingy_credits" | "ramber_credits" | "credits" | "song_balance" | null {
  const p = profile ?? {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k);
  if (has("ramber_credits")) return "ramber_credits";
  if (has("zingy_credits")) return "zingy_credits";
  if (has("credits")) return "credits";
  if (has("song_balance")) return "song_balance";
  return null;
}

function isMissingColumnError(err: any) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    (msg.includes("column") && msg.includes("does not exist")) ||
    msg.includes("unknown column") ||
    (msg.includes("columna") && msg.includes("no existe"))
  );
}

async function ensureProfileExists(admin: any, userId: string) {
  const r = await admin.from("profiles").upsert({ id: userId }, { onConflict: "id" });
  if (!r?.error) return { ok: true as const };
  return { ok: false as const, error: String(r.error?.message || "No pude crear el perfil.") };
}

async function updateCreditsAnyColumn(admin: any, userId: string, nextCredits: number) {
  const next = round2(Math.max(0, Number(nextCredits)));
  if (!Number.isFinite(next)) return { ok: false as const, error: "Créditos inválidos" };

  const candidates: Array<"ramber_credits" | "zingy_credits" | "credits" | "song_balance"> = [
    "ramber_credits",
    "zingy_credits",
    "credits",
    "song_balance",
  ];

  for (const col of candidates) {
    const patch: any = {};
    if (col === "song_balance") patch[col] = toCounts(next).songs;
    else patch[col] = next;
    const { error } = await admin.from("profiles").update(patch).eq("id", userId);
    if (!error) return { ok: true as const, credits: next, col };
    if (isMissingColumnError(error)) continue;
    return { ok: false as const, error: String(error.message || "No pude actualizar créditos.") };
  }

  return { ok: false as const, error: "Falta columna de créditos en profiles." };
}

function parseProviderCreditsValue(raw: any) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const cleaned = raw
      .trim()
      .replaceAll("Credits", "")
      .replaceAll("credits", "")
      .replaceAll(" ", "")
      .replaceAll(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function normalizeSunoBaseUrl(rawBase: string) {
  let base = (rawBase || "").toString().trim();
  if (!base) return "";
  while (base.endsWith("/")) base = base.slice(0, -1);
  if (base.toLowerCase().endsWith("/api/v1")) base = base.slice(0, -"/api/v1".length);
  while (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

async function providerFetchJson(path: string, init?: RequestInit) {
  const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
  const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";

  const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";

  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  if (apiKey && !headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);

  const url = new URL(path, base).toString();
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res, data, text };
}

async function adjustUserCredits(admin: any, userId: string, deltaCredits: number) {
  const delta = Number(deltaCredits);
  if (!Number.isFinite(delta) || !delta) return { ok: true as const };

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (readErr) return { ok: false as const, error: readErr.message };
    if (!profile) {
      const created = await ensureProfileExists(admin, userId);
      if (!created.ok) return { ok: false as const, error: created.error };
      continue;
    }

    const current = creditsFromProfile(profile);
    const next = round2(Math.max(0, current + delta));
    const upd = await updateCreditsAnyColumn(admin, userId, next);
    if (upd.ok) return { ok: true as const, credits: next };
    return { ok: false as const, error: upd.error };
  }

  return { ok: false as const, error: "No pude actualizar créditos (intenta otra vez)." };
}

async function consumeUserCredits(admin: any, userId: string, costCredits: number) {
  const cost = round2(Number(costCredits));
  if (!Number.isFinite(cost) || cost <= 0) return { ok: true as const };

  try {
    const plan = await getUserPlan(admin, userId);
    const key = String((plan as any)?.plan_key || "").toLowerCase();
    const exp = (plan as any)?.plan_expires_at;
    const active = Boolean((plan as any)?.plan_active);
    if ((key === "inicio" || key === "productor") && exp && !active) {
      return { ok: false as const, error: "Tu paquete venció. Para seguir usando, renueva tu plan.", plan_expires_at: exp };
    }
  } catch {
  }

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (readErr) return { ok: false as const, error: readErr.message };
    if (!profile) {
      const created = await ensureProfileExists(admin, userId);
      if (!created.ok) return { ok: false as const, error: created.error };
      continue;
    }

    const current = creditsFromProfile(profile);
    if (current < cost) return { ok: false as const, error: "Créditos insuficientes. Recarga para continuar.", credits: current };

    const next = round2(Math.max(0, current - cost));
    const upd = await updateCreditsAnyColumn(admin, userId, next);
    if (upd.ok) return { ok: true as const, credits: next };
    return { ok: false as const, error: upd.error };
  }

  return { ok: false as const, error: "No pude consumir créditos (intenta otra vez)." };
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

async function getUserPlan(admin: any, userId: string) {
  const { data: tx } = await admin
    .from("mp_transactions")
    .select("payment_id, pack_key, kind, created_at, amount_mxn")
    .eq("user_id", userId)
    .eq("kind", "songs")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = Array.isArray(tx) ? tx : [];

  const pickPlanKey = (raw: any) => {
    const k = String(raw || "").trim().toLowerCase();
    return k === "inicio" || k === "productor" || k === "ninguno" ? k : "";
  };

  const override = rows.find((t: any) => String(t?.payment_id || "").startsWith("admin_plan:"));
  const overridePlan = pickPlanKey(override?.pack_key);

  const hasInicio = rows.some((t: any) => String(t?.pack_key || "").toLowerCase() === "inicio");
  const hasProductor = rows.some((t: any) => String(t?.pack_key || "").toLowerCase() === "productor");
  const plan_key = overridePlan || (hasProductor ? "productor" : hasInicio ? "inicio" : "ninguno");

  const planStartIso = (() => {
    if (overridePlan && overridePlan !== "ninguno") return String(override?.created_at || "").trim() || null;
    const paid = rows.find((t: any) => {
      const pk = String(t?.pack_key || "").toLowerCase();
      if (!(pk === "inicio" || pk === "productor")) return false;
      const pid = String(t?.payment_id || "");
      if (pid.startsWith("claim:")) return false;
      return true;
    });
    const iso = String(paid?.created_at || "").trim();
    return iso || null;
  })();

  const plan_expires_at = (() => {
    if (!planStartIso) return null;
    const t = new Date(planStartIso).getTime();
    if (!Number.isFinite(t) || t <= 0) return null;
    const ms = t + 30 * 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString();
  })();

  const plan_active = (() => {
    if (!plan_expires_at) return false;
    const t = new Date(plan_expires_at).getTime();
    if (!Number.isFinite(t) || t <= 0) return false;
    return Date.now() < t;
  })();

  const downloads_allowed = plan_active && (plan_key === "inicio" || plan_key === "productor");

  return { plan_key, downloads_allowed, plan_active, plan_expires_at, hasProductor };
}

async function getSupabaseCreateClient() {
  const mod = await import("@supabase/supabase-js");
  return mod.createClient;
}

async function buildRealUserIdSet(admin: any) {
  const ids = new Set<string>();
  try {
    const { data: songs } = await admin
      .from("library_items")
      .select("user_id")
      .eq("type", "song")
      .is("deleted_at", null)
      .limit(20000);
    const rows = Array.isArray(songs) ? songs : [];
    for (const r of rows) {
      const uid = String((r as any)?.user_id || "").trim();
      if (uid) ids.add(uid);
    }
  } catch {
  }

  try {
    const { data: tx } = await admin.from("mp_transactions").select("user_id, kind, pack_key, amount_mxn").limit(20000);
    const rows = Array.isArray(tx) ? tx : [];
    for (const r of rows) {
      const uid = String((r as any)?.user_id || "").trim();
      if (!uid) continue;
      const kind = String((r as any)?.kind || "").trim().toLowerCase();
      const pack = String((r as any)?.pack_key || "").trim().toLowerCase();
      const amt = Number((r as any)?.amount_mxn ?? 0) || 0;
      const isPaidSongs = kind === "songs" && amt > 0;
      const isPlan = kind === "songs" && (pack === "inicio" || pack === "productor");
      if (isPaidSongs || isPlan) ids.add(uid);
    }
  } catch {
  }

  return ids;
}

const sunoHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function originFromReq(req: any) {
    const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
    return `${proto}://${host}`;
  }

  function absoluteUrlFromReq(req: any, pathname: string) {
    return new URL(pathname, originFromReq(req)).toString();
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
        .replaceAll(" ", "")
        .replaceAll(",", ".");
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  async function sunoFetchJson(path: string, init?: RequestInit) {
    const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
    const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";

    const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";

    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (apiKey && !headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);

    const url = new URL(path, base).toString();
    const res = await fetch(url, { ...init, headers });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { res, data, text };
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

  function pickQuery(req: any, key: string) {
    try {
      const u = new URL(req.url, "http://localhost");
      return (u.searchParams.get(key) || "").toString();
    } catch {
      return "";
    }
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin, supabaseUrl, supabaseAnon, supabaseService };
  }

  function normalizeModel(mvOrModel: string) {
    const v = (mvOrModel || "").trim().toUpperCase();
    if (v === "V5_5" || v === "V5" || v === "V4_5PLUS" || v === "V4_5ALL" || v === "V4_5" || v === "V4") return v;
    if (v === "V5.5" || v === "V5_5" || v === "V55") return "V5_5";
    if (v === "V4.5" || v === "V45") return "V4_5PLUS";
    if (v === "MFV2.0") return "V5_5";
    if (v === "MFV1.5X") return "V5";
    if (v === "MFV1.5") return "V4_5PLUS";
    return "V4_5PLUS";
  }

  function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
  }

  function firstString(obj: any, keys: string[]) {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  async function handleGenerate(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    const style = typeof payload?.style === "string" ? payload.style.trim() : "";
    const instrumental = Boolean(payload?.instrumental);
    const mv = typeof payload?.mv === "string" ? payload.mv.trim() : "";
    const modelRaw = typeof payload?.model === "string" ? payload.model.trim() : "";
    const model = normalizeModel(modelRaw || mv);
    const title = typeof payload?.title === "string" ? payload.title.trim() : "";
    if (!prompt) return send(res, 400, { error: "Falta prompt" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");

    const body: any = { model, callBackUrl, instrumental };
    const wantsCustomMode = typeof payload?.customMode === "boolean" ? payload.customMode : null;
    const customMode = wantsCustomMode ?? (Boolean(style) || Boolean(title));
    body.customMode = customMode;

    if (!customMode) {
      if (prompt.length > 500) return send(res, 400, { error: "En modo Simple el prompt máximo es 500 caracteres." });
      body.prompt = prompt.slice(0, 500);
    } else {
      if (!style) return send(res, 400, { error: "En modo Personalizado falta style." });
      if (style.length > 1000) return send(res, 400, { error: "El style máximo es 1,000 caracteres." });
      if (!title) return send(res, 400, { error: "En modo Personalizado falta title." });
      if (title.length > 100) return send(res, 400, { error: "El title máximo es 100 caracteres." });
      if (!instrumental) {
        if (!prompt.trim()) return send(res, 400, { error: "Si no es instrumental, el prompt (letras) es obligatorio." });
        if (prompt.length > 5000) return send(res, 400, { error: "El prompt (letras) máximo es 5,000 caracteres." });
      } else {
        if (prompt.length > 5000) return send(res, 400, { error: "El prompt máximo es 5,000 caracteres." });
      }
      body.prompt = (prompt || " ").slice(0, 5000);
      body.style = (style || "General").slice(0, 1000);
      body.title = title.slice(0, 100);

      const negativeTags = typeof payload?.negativeTags === "string" ? payload.negativeTags.trim() : "";
      if (negativeTags) body.negativeTags = negativeTags.slice(0, 1000);

      const personaId = typeof payload?.personaId === "string" ? payload.personaId.trim() : "";
      if (personaId) {
        if (!(model === "V5" || model === "V5_5")) return send(res, 400, { error: "personaId solo se permite con modelos V5/V5.5." });
        body.personaId = personaId.slice(0, 200);
      }

      const personaModel = typeof payload?.personaModel === "string" ? payload.personaModel.trim() : "";
      if (personaModel) body.personaModel = personaModel.slice(0, 200);

      const vocalGender = typeof payload?.vocalGender === "string" ? payload.vocalGender.trim().toLowerCase() : "";
      if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender;

      const styleWeight = Number(payload?.styleWeight);
      if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
      const weirdnessConstraint = Number(payload?.weirdnessConstraint);
      if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
      const audioWeight = Number(payload?.audioWeight);
      if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);
    }

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.generate_music;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const { res: r, data, text } = await sunoFetchJson("/api/v1/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando música", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando música", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "generate", cost, consumed: true });
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error creando música", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleExtend(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    const style = typeof payload?.style === "string" ? payload.style.trim() : "";
    const mv = typeof payload?.mv === "string" ? payload.mv.trim() : "";
    const modelRaw = typeof payload?.model === "string" ? payload.model.trim() : "";
    const model = normalizeModel(modelRaw || mv);
    const title = typeof payload?.title === "string" ? payload.title.trim() : "";
    if (!audioId) return send(res, 400, { error: "Falta audioId" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");

    const defaultParamFlag = Boolean(payload?.defaultParamFlag);
    const body: any = { defaultParamFlag, audioId, model, callBackUrl };
    const wantsCustomMode = typeof payload?.customMode === "boolean" ? payload.customMode : null;
    const customMode = wantsCustomMode ?? (Boolean(style) || Boolean(title));
    body.customMode = customMode;

    if (!customMode) {
      if (prompt.length > 500) return send(res, 400, { error: "En modo Simple el prompt máximo es 500 caracteres." });
      body.prompt = (prompt || " ").slice(0, 500);
    } else {
      if (!style) return send(res, 400, { error: "En modo Personalizado falta style." });
      if (style.length > 1000) return send(res, 400, { error: "El style máximo es 1,000 caracteres." });
      if (!title) return send(res, 400, { error: "En modo Personalizado falta title." });
      if (title.length > 100) return send(res, 400, { error: "El title máximo es 100 caracteres." });
      if (!prompt.trim()) return send(res, 400, { error: "En modo Personalizado falta prompt." });
      if (prompt.length > 5000) return send(res, 400, { error: "El prompt máximo es 5,000 caracteres." });
      body.prompt = (prompt || " ").slice(0, 5000);
      body.style = (style || "General").slice(0, 1000);
      body.title = title.slice(0, 100);

      const negativeTags = typeof payload?.negativeTags === "string" ? payload.negativeTags.trim() : "";
      if (negativeTags) body.negativeTags = negativeTags.slice(0, 1000);

      const personaId = typeof payload?.personaId === "string" ? payload.personaId.trim() : "";
      if (personaId) {
        if (!(model === "V5" || model === "V5_5")) return send(res, 400, { error: "personaId solo se permite con modelos V5/V5.5." });
        body.personaId = personaId.slice(0, 200);
      }

      const personaModel = typeof payload?.personaModel === "string" ? payload.personaModel.trim() : "";
      if (personaModel) body.personaModel = personaModel.slice(0, 200);

      const vocalGender = typeof payload?.vocalGender === "string" ? payload.vocalGender.trim().toLowerCase() : "";
      if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender;

      const styleWeight = Number(payload?.styleWeight);
      if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
      const weirdnessConstraint = Number(payload?.weirdnessConstraint);
      if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
      const audioWeight = Number(payload?.audioWeight);
      if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);
    }

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.extend_music;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const { res: r, data, text } = await sunoFetchJson("/api/v1/extend", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error extendiendo música", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error extendiendo música", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "extend", cost, consumed: true });
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error extendiendo música", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleUploadCover(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const uploadUrl = firstString(payload, ["uploadUrl", "upload_url"]);
    const uploadBucket = firstString(payload, ["uploadBucket", "upload_bucket"]) || "ramber-tunes";
    const uploadPath = firstString(payload, ["uploadPath", "upload_path"]);
    const instrumental = Boolean(payload?.instrumental);
    const prompt = firstString(payload, ["prompt", "lyrics", "text"]) || " ";
    const style = firstString(payload, ["style", "tags", "genre"]) || "General";
    const title = firstString(payload, ["title"]) || "Cover";
    const mv = firstString(payload, ["mv"]);
    const modelRaw = firstString(payload, ["model"]);
    const model = normalizeModel(modelRaw || mv);
    if (!uploadUrl && !uploadPath) return send(res, 400, { error: "Falta uploadUrl o uploadPath" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body: any = {
      model,
      callBackUrl,
      uploadUrl,
      prompt: (prompt || " ").slice(0, 5000),
      title: title.slice(0, 100),
      style: style.slice(0, 1000),
      tags: style.slice(0, 1000),
      instrumental,
      customMode: true,
    };

    if (uploadPath) {
      try {
        const signed = await auth.admin.storage.from(uploadBucket).createSignedUrl(uploadPath, 60 * 60 * 2);
        const signedUrl = (signed?.data as any)?.signedUrl || (signed?.data as any)?.signedURL || "";
        if (typeof signedUrl === "string" && signedUrl.trim()) body.uploadUrl = signedUrl.trim();
      } catch {
      }
    }

    const styleWeight = Number(payload?.styleWeight);
    if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
    const weirdnessConstraint = Number(payload?.weirdnessConstraint);
    if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
    const audioWeight = Number(payload?.audioWeight);
    if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);

    const negativeTags = firstString(payload, ["negativeTags", "negative_tags"]);
    if (negativeTags) body.negativeTags = negativeTags.slice(0, 1000);
    const vocalGender = firstString(payload, ["vocalGender", "vocal_gender"]);
    if (vocalGender) body.vocalGender = vocalGender.slice(0, 10);

    const personaId = firstString(payload, ["personaId", "persona_id"]);
    if (personaId) {
      if (!(model === "V5" || model === "V5_5")) return send(res, 400, { error: "personaId solo se permite con modelos V5/V5.5." });
      body.personaId = personaId.slice(0, 200);
    }
    const personaModel = firstString(payload, ["personaModel", "persona_model"]);
    if (personaModel) body.personaModel = personaModel.slice(0, 200);

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.upload_and_cover;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = [
        "/api/v1/generate/upload-cover",
        "/api/v1/upload-cover",
        "/api/v1/suno/generate/upload-cover",
        "/api/v1/suno/upload-cover",
      ];

      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "No se pudo hacer el cover.", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "No se pudo hacer el cover.", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "No se pudo hacer el cover.", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "upload-cover", cost, consumed: true });
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "No se pudo hacer el cover.", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleAddInstrumental(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const uploadUrl = firstString(payload, ["uploadUrl", "upload_url"]);
    const uploadBucket = firstString(payload, ["uploadBucket", "upload_bucket"]) || "ramber-tunes";
    const uploadPath = firstString(payload, ["uploadPath", "upload_path"]);
    const title = firstString(payload, ["title"]) || "Instrumental";
    const tags = firstString(payload, ["tags", "style"]) || "Instrumental";
    const negativeTags = firstString(payload, ["negativeTags", "negative_tags"]) || "None";

    const modelRaw = firstString(payload, ["model", "mv"]);
    const normalized = normalizeModel(modelRaw);
    const model = normalized === "V5" || normalized === "V5_5" ? normalized : "V4_5PLUS";

    if (!uploadUrl && !uploadPath) return send(res, 400, { error: "Falta uploadUrl o uploadPath" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body: any = {
      uploadUrl,
      title: title.slice(0, 100),
      tags: tags.slice(0, 1000),
      negativeTags: negativeTags.slice(0, 1000),
      callBackUrl,
      model,
    };

    if (uploadPath) {
      try {
        const signed = await auth.admin.storage.from(uploadBucket).createSignedUrl(uploadPath, 60 * 60 * 2);
        const signedUrl = (signed?.data as any)?.signedUrl || (signed?.data as any)?.signedURL || "";
        if (typeof signedUrl === "string" && signedUrl.trim()) body.uploadUrl = signedUrl.trim();
      } catch {
      }
    }

    const vocalGender = firstString(payload, ["vocalGender", "vocal_gender"]).toLowerCase();
    if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender;

    const styleWeight = Number(payload?.styleWeight);
    if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
    const weirdnessConstraint = Number(payload?.weirdnessConstraint);
    if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
    const audioWeight = Number(payload?.audioWeight);
    if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.add_instrumental;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/generate/add-instrumental", "/api/v1/suno/generate/add-instrumental"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando instrumental", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando instrumental", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando instrumental", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "add-instrumental", cost, consumed: true });
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error agregando instrumental", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleAddVocals(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const uploadUrl = firstString(payload, ["uploadUrl", "upload_url"]);
    const uploadBucket = firstString(payload, ["uploadBucket", "upload_bucket"]) || "ramber-tunes";
    const uploadPath = firstString(payload, ["uploadPath", "upload_path"]);
    const prompt = firstString(payload, ["prompt", "lyrics", "text"]) || " ";
    const style = firstString(payload, ["style", "tags"]) || "General";
    const title = firstString(payload, ["title"]) || "Voces";
    const negativeTags = firstString(payload, ["negativeTags", "negative_tags"]) || "None";

    const modelRaw = firstString(payload, ["model", "mv"]);
    const normalized = normalizeModel(modelRaw);
    const model = normalized === "V5" || normalized === "V5_5" ? normalized : "V4_5PLUS";

    if (!uploadUrl && !uploadPath) return send(res, 400, { error: "Falta uploadUrl o uploadPath" });
    if (!prompt.trim()) return send(res, 400, { error: "Falta prompt" });
    if (!style.trim()) return send(res, 400, { error: "Falta style" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body: any = {
      uploadUrl,
      prompt: prompt.slice(0, 5000),
      style: style.slice(0, 1000),
      title: title.slice(0, 100),
      negativeTags: negativeTags.slice(0, 1000),
      callBackUrl,
      model,
    };

    if (uploadPath) {
      try {
        const signed = await auth.admin.storage.from(uploadBucket).createSignedUrl(uploadPath, 60 * 60 * 2);
        const signedUrl = (signed?.data as any)?.signedUrl || (signed?.data as any)?.signedURL || "";
        if (typeof signedUrl === "string" && signedUrl.trim()) body.uploadUrl = signedUrl.trim();
      } catch {
      }
    }

    const vocalGender = firstString(payload, ["vocalGender", "vocal_gender"]).toLowerCase();
    if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender;

    const styleWeight = Number(payload?.styleWeight);
    if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
    const weirdnessConstraint = Number(payload?.weirdnessConstraint);
    if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
    const audioWeight = Number(payload?.audioWeight);
    if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.add_vocals;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/generate/add-vocals", "/api/v1/suno/generate/add-vocals"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando voces", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando voces", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error agregando voces", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "add-vocals", cost, consumed: true });
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error agregando voces", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleSeparate(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
    const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
    const type = typeof payload?.type === "string" ? payload.type.trim() : "";
    if (!taskId && !audioId) return send(res, 400, { error: "Falta taskId o audioId" });
    if (!(type === "separate_vocal" || type === "split_stem")) return send(res, 400, { error: "type inválido. Usa 'separate_vocal' o 'split_stem'." });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body = { taskId, audioId, type, callBackUrl };

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = type === "split_stem" ? CREDIT_COSTS.split_stem : CREDIT_COSTS.separate_vocal;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = [
        "/api/v1/vocal-removal/generate",
        "/api/v1/suno/vocal-removal/generate",
        "/api/v1/separate",
        "/api/v1/suno/separate",
      ];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error separando", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error separando", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error separando", code, detail: String(msg).slice(0, 1200) });
      }

      const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!outTaskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: outTaskId, user_id: user.id, kind: `vocal-removal:${type}`, cost, consumed: true });
      return send(res, 200, { taskId: outTaskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error separando", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleGeneratePersona(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
    const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
    const personaName = typeof payload?.name === "string" ? payload.name.trim() : "";
    const description = typeof payload?.description === "string" ? payload.description.trim() : "";
    const style = typeof payload?.style === "string" ? payload.style.trim() : "";
    const vocalStart = Number(payload?.vocalStart);
    const vocalEnd = Number(payload?.vocalEnd);
    if (!taskId || !audioId || !personaName) return send(res, 400, { error: "Falta taskId, audioId o name" });

    try {
      try {
        const enc = encodeURIComponent(taskId);
        const { res: sr, data: sd } = await sunoFetchJson(`/api/v1/generate/record-info?taskId=${enc}`, { method: "GET" });
        if (sr?.ok) {
          const statusRaw = sd?.data?.status ?? sd?.data?.data?.status ?? "";
          const status = String(statusRaw || "").toUpperCase();
          if (status && status !== "SUCCESS") {
            return send(res, 409, { error: "La canción aún no termina. Espera a que esté lista y vuelve a intentar." });
          }
        }
      } catch {
      }

      const body: any = {
        taskId,
        audioId,
        name: personaName.slice(0, 80),
        description: (description || personaName).slice(0, 2000),
      };
      if (style) body.style = style.slice(0, 200);
      if (Number.isFinite(vocalStart) && Number.isFinite(vocalEnd)) {
        const start = Math.max(0, vocalStart);
        const end = Math.max(0, vocalEnd);
        const len = end - start;
        if (len >= 10 && len <= 30) {
          body.vocalStart = start;
          body.vocalEnd = end;
        } else {
          return send(res, 400, { error: "El segmento de voz debe durar entre 10 y 30 segundos." });
        }
      }

      const paths = [
        "/api/v1/generate/generate-persona",
        "/api/v1/suno/generate/generate-persona",
        "/api/v1/generate-persona",
        "/api/v1/suno/generate-persona",
      ];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        return send(res, 502, { error: "Error creando Persona", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        return send(res, 502, { error: "Error creando Persona", code, detail: String(msg).slice(0, 1200) });
      }

      const personaId = typeof data?.data?.personaId === "string" ? data.data.personaId.trim() : "";
      return send(res, 200, {
        ok: true,
        personaId,
        data: data?.data ?? null,
      });
    } catch (e) {
      return send(res, 502, { error: "Error creando Persona", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleMp4(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
    const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
    const author = typeof payload?.author === "string" ? payload.author.trim() : "";
    const domainName = typeof payload?.domainName === "string" ? payload.domainName.trim() : "";
    if (!taskId && !audioId) return send(res, 400, { error: "Falta taskId o audioId" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.music_video;

    try {
      if (!isAdmin) {
        const plan = await getUserPlan(auth.admin, user.id).catch(() => ({ downloads_allowed: false }));
        if (!plan.downloads_allowed) return send(res, 403, { error: "Tu plan no incluye descargas. Compra un plan para poder descargar." });
      }

      let hasProductor = false;
      try {
        const { data: tx } = await auth.admin
          .from("mp_transactions")
          .select("pack_key")
          .eq("user_id", user.id)
          .eq("kind", "songs")
          .limit(200);
        hasProductor = Array.isArray(tx) && tx.some((t: any) => String(t?.pack_key || "").toLowerCase() === "productor");
      } catch {
        hasProductor = false;
      }

      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const body: any = { taskId, audioId, callBackUrl };
      if (author) body.author = author.slice(0, 50);
      if (hasProductor) {
        if (domainName) body.domainName = domainName.slice(0, 50);
      } else {
        body.domainName = "RAMBER Tunes";
      }

      const paths = ["/api/v1/mp4/generate", "/api/v1/suno/mp4/generate", "/api/v1/mp4", "/api/v1/suno/mp4"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando video", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando video", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando video", code, detail: String(msg).slice(0, 1200) });
      }

      const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!outTaskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: outTaskId, user_id: user.id, kind: "mp4", cost, consumed: true });
      return send(res, 200, { taskId: outTaskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error creando video", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleTask(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const taskId = (pickQuery(req, "taskId") || "").trim();
    if (!taskId) return send(res, 400, { error: "Falta taskId" });
    const kind = (pickQuery(req, "kind") || "").trim().toLowerCase() || "generate";

    try {
      const enc = encodeURIComponent(taskId);
      const paths =
        kind === "lyrics"
          ? [
              `/api/v1/lyrics/record-info?taskId=${enc}`,
              `/api/v1/suno/lyrics/record-info?taskId=${enc}`,
            ]
          : kind === "midi"
          ? [
              `/api/v1/midi/record-info?taskId=${enc}`,
              `/api/v1/suno/midi/record-info?taskId=${enc}`,
            ]
          : kind === "mp4" || kind === "video" || kind === "music-video"
          ? [
              `/api/v1/mp4/record-info?taskId=${enc}`,
              `/api/v1/suno/mp4/record-info?taskId=${enc}`,
            ]
          : kind === "vocal-removal" || kind === "separate" || kind === "separate_vocal" || kind === "split_stem"
          ? [
              `/api/v1/vocal-removal/record-info?taskId=${enc}`,
              `/api/v1/suno/vocal-removal/record-info?taskId=${enc}`,
            ]
          : kind === "wav"
          ? [
              `/api/v1/wav/record-info?taskId=${enc}`,
              `/api/v1/suno/wav/record-info?taskId=${enc}`,
            ]
          : [
              `/api/v1/generate/record-info?taskId=${enc}`,
              `/api/v1/suno/generate/record-info?taskId=${enc}`,
              `/api/v1/task/${enc}`,
              `/api/v1/suno/task/${enc}`,
            ];

      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "GET" });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) return send(res, 502, { error: "Error consultando task", detail: "No pude contactar al proveedor" });

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        return send(res, 502, { error: "Error consultando task", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        return send(res, 502, { error: "Error consultando task", code, detail: String(msg).slice(0, 1200) });
      }

      const statusRaw = data?.data?.status ?? data?.data?.successFlag ?? data?.data?.data?.status ?? data?.data?.data?.successFlag ?? "";
      const status =
        kind === "midi"
          ? (() => {
              const n = typeof statusRaw === "number" ? statusRaw : Number(String(statusRaw || "").trim());
              if (n === 0) return "PENDING";
              if (n === 1) return "SUCCESS";
              if (n === 2) return "CREATE_TASK_FAILED";
              if (n === 3) return "GENERATE_MIDI_FAILED";
              return String(statusRaw || "").toUpperCase();
            })()
          : String(statusRaw || "").toUpperCase();
      const user = auth.user;
      const isAdmin = isAdminEmail(user.email);

      if (
        status === "FAILED" ||
        status === "CREATE_TASK_FAILED" ||
        status === "GENERATE_AUDIO_FAILED" ||
        status === "GENERATE_LYRICS_FAILED" ||
        status === "GENERATE_MIDI_FAILED" ||
        status === "GENERATE_MP4_FAILED" ||
        status === "GENERATE_WAV_FAILED" ||
        status === "CALLBACK_EXCEPTION" ||
        status === "SENSITIVE_WORD_ERROR"
      ) {
        if (!isAdmin) {
          const { data: rows } = await auth.admin.from("suno_tasks").select("cost, consumed").eq("task_id", taskId).limit(1);
          const row = Array.isArray(rows) ? rows[0] : null;
          const cost = Number(row?.cost ?? 0);
          const consumed = Boolean(row?.consumed);
          if (consumed && Number.isFinite(cost) && cost > 0) {
            await adjustUserCredits(auth.admin, user.id, cost);
            await auth.admin.from("suno_tasks").update({ consumed: false }).eq("task_id", taskId).eq("user_id", user.id);
          }
        }
      }

      return send(res, 200, { data, kind });
    } catch (e) {
      return send(res, 502, { error: "Error consultando task", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleTimestampedLyrics(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
    const audioId = typeof payload?.audioId === "string" ? payload.audioId.trim() : "";
    if (!taskId && !audioId) return send(res, 400, { error: "Falta taskId o audioId" });

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.timestamped_lyrics;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = [
        "/api/v1/generate/get-timestamped-lyrics",
        "/api/v1/suno/generate/get-timestamped-lyrics",
        "/api/v1/get-timestamped-lyrics",
        "/api/v1/suno/get-timestamped-lyrics",
        "/api/v1/timestamped-lyrics",
        "/api/v1/suno/timestamped-lyrics",
      ];

      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify({ taskId, audioId }) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando letras", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error creando letras", code, detail: String(msg).slice(0, 1200) });
      }

      return send(res, 200, { ok: true, data: data?.data ?? null });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error creando letras", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleLyrics(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    if (!prompt) return send(res, 400, { error: "Falta prompt" });
    if (prompt.length > 200) return send(res, 400, { error: "El prompt máximo para letras es 200 caracteres." });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body = { prompt, callBackUrl };

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.lyrics;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/lyrics", "/api/v1/suno/lyrics"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando letra", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando letra", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando letra", code, detail: String(msg).slice(0, 1200) });
      }

      const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!taskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "lyrics", cost, consumed: true });
      return send(res, 200, { taskId });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error generando letra", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleWav(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = firstString(payload, ["taskId", "task_id"]);
    const audioId = firstString(payload, ["audioId", "audio_id"]);
    if (!taskId) return send(res, 400, { error: "Falta taskId" });
    if (!audioId) return send(res, 400, { error: "Falta audioId" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body = { taskId, audioId, callBackUrl };

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.wav;

    try {
      if (!isAdmin) {
        const plan = await getUserPlan(auth.admin, user.id).catch(() => ({ downloads_allowed: false }));
        if (!plan.downloads_allowed) return send(res, 403, { error: "Tu plan no incluye descargas. Compra un plan para poder descargar." });
      }

      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/wav/generate", "/api/v1/suno/wav/generate"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error convirtiendo a WAV", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error convirtiendo a WAV", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";

      if (code !== 200 && code !== 409) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error convirtiendo a WAV", code, detail: String(msg).slice(0, 1200) });
      }

      if (!outTaskId) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({
        task_id: outTaskId,
        user_id: user.id,
        kind: `wav:${taskId.slice(0, 120)}:${audioId.slice(0, 120)}`,
        cost,
        consumed: true,
      });
      return send(res, 200, { taskId: outTaskId, already: code === 409 });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error convirtiendo a WAV", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleMidi(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = firstString(payload, ["taskId", "task_id"]);
    const audioId = firstString(payload, ["audioId", "audio_id"]);
    if (!taskId) return send(res, 400, { error: "Falta taskId" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body: any = { taskId, callBackUrl };
    if (audioId) body.audioId = audioId;

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.midi;

    try {
      if (!isAdmin) {
        const plan = await getUserPlan(auth.admin, user.id).catch(() => ({ downloads_allowed: false }));
        if (!plan.downloads_allowed) return send(res, 403, { error: "Tu plan no incluye descargas. Compra un plan para poder descargar." });
      }

      if (!isAdmin && cost > 0) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/midi/generate", "/api/v1/suno/midi/generate"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin && cost > 0) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando MIDI", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin && cost > 0) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando MIDI", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin && cost > 0) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando MIDI", code, detail: String(msg).slice(0, 1200) });
      }

      const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (!outTaskId) {
        if (!isAdmin && cost > 0) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Respuesta inválida del proveedor" });
      }

      await auth.admin.from("suno_tasks").insert({
        task_id: outTaskId,
        user_id: user.id,
        kind: `midi:${taskId.slice(0, 120)}:${audioId ? audioId.slice(0, 120) : ""}`,
        cost,
        consumed: cost > 0,
      });

      return send(res, 200, { taskId: outTaskId });
    } catch (e) {
      if (!isAdmin && cost > 0) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error generando MIDI", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleBoostStyle(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const content = typeof payload?.content === "string" ? payload.content.trim() : "";
    if (!content) return send(res, 400, { error: "Falta content" });
    if (content.length > 5000) return send(res, 400, { error: "El content máximo es 5,000 caracteres." });

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.boost_style;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/style/generate", "/api/v1/suno/style/generate"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify({ content }) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error optimizando estilo", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error optimizando estilo", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(data, "Error del proveedor");
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error optimizando estilo", code, detail: String(msg).slice(0, 1200) });
      }

      const result = typeof data?.data?.result === "string" ? data.data.result.trim() : "";
      return send(res, 200, { result, data: data?.data ?? null });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error optimizando estilo", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleMusicCover(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
    if (!taskId) return send(res, 400, { error: "Falta taskId" });

    const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
    const body = { taskId, callBackUrl };

    const user = auth.user;
    const isAdmin = isAdminEmail(user.email);
    const cost = CREDIT_COSTS.music_cover;

    try {
      if (!isAdmin) {
        const consumed = await consumeUserCredits(auth.admin, user.id, cost);
        if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
      }

      const paths = ["/api/v1/suno/cover/generate", "/api/v1/cover/generate", "/api/v1/suno/cover-suno", "/api/v1/suno/cover"];
      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "POST", body: JSON.stringify(body) });
        last = r;
        if (r.res.status !== 404) break;
      }
      const { res: r, data, text } = last || {};
      if (!r) {
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando portada", detail: "No pude contactar al proveedor" });
      }

      if (!r.ok) {
        const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
        if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
        return send(res, 502, { error: "Error generando portada", code: r.status, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(data?.code);
      const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
      if (code === 200) {
        if (!outTaskId) return send(res, 502, { error: "Respuesta inválida del proveedor" });
        await auth.admin.from("suno_tasks").insert({ task_id: outTaskId, user_id: user.id, kind: `music-cover:${taskId.slice(0, 120)}`, cost, consumed: true });
        return send(res, 200, { taskId: outTaskId });
      }

      if (code === 400 && outTaskId) {
        await auth.admin
          .from("suno_tasks")
          .insert({ task_id: outTaskId, user_id: user.id, kind: `music-cover:${taskId.slice(0, 120)}`, cost, consumed: true });
        return send(res, 200, { taskId: outTaskId, already: true });
      }

      const msg = sunoErrorMessage(data, "Error del proveedor");
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error generando portada", code, detail: String(msg).slice(0, 1200) });
    } catch (e) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error generando portada", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleCredits(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    try {
      const paths = [
        "/api/v1/generate/credit",
        "/api/v1/get-credits",
        "/api/v1/suno/get-credits",
        "/api/v1/suno/generate/credit",
        "/api/v1/suno/credits",
        "/api/v1/suno/credit",
      ];

      let last: any = null;
      for (const p of paths) {
        const r = await sunoFetchJson(p, { method: "GET" });
        last = r;
        if (r.res.status !== 404) break;
      }
      const r = last;

      if (!r?.res?.ok) {
        const msg = sunoErrorMessage(r?.data, r?.text || `HTTP ${r?.res?.status || 0}`);
        return send(res, 502, { error: "Error consultando créditos", code: r?.res?.status || 0, detail: String(msg).slice(0, 1200) });
      }

      const code = Number(r.data?.code);
      if (code && code !== 200) {
        const msg = sunoErrorMessage(r.data, "Error del proveedor");
        return send(res, 502, { error: "Error consultando créditos", code, detail: String(msg).slice(0, 1200) });
      }

      const raw = r.data?.data?.credits ?? r.data?.data;
      const parsed = parseCreditsValue(raw);
      const credits = Number.isFinite(parsed) ? parsed : 0;
      return send(res, 200, { credits, data: credits });
    } catch (e) {
      return send(res, 502, { error: "Error consultando créditos", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  return async function handler(req: any, res: any) {
    try {
      const action = (pickQuery(req, "action") || "").trim().toLowerCase() || "";
      const fallback = (() => {
        const pathname = new URL(req.url, "http://localhost").pathname;
        const parts = pathname.split("/").filter(Boolean);
        const i = parts.findIndex((p) => p === "suno");
        const next = i >= 0 ? parts[i + 1] : "";
        return (next || "").toLowerCase();
      })();
      const a = action || fallback;

      if (a === "generate") return handleGenerate(req, res);
      if (a === "extend") return handleExtend(req, res);
      if (a === "upload-cover") return handleUploadCover(req, res);
      if (a === "add-instrumental") return handleAddInstrumental(req, res);
      if (a === "add-vocals") return handleAddVocals(req, res);
      if (a === "separate") return handleSeparate(req, res);
      if (a === "generate-persona") return handleGeneratePersona(req, res);
      if (a === "mp4") return handleMp4(req, res);
      if (a === "task") return handleTask(req, res);
      if (a === "timestamped-lyrics") return handleTimestampedLyrics(req, res);
      if (a === "lyrics") return handleLyrics(req, res);
      if (a === "wav") return handleWav(req, res);
      if (a === "midi") return handleMidi(req, res);
      if (a === "boost-style") return handleBoostStyle(req, res);
      if (a === "music-cover") return handleMusicCover(req, res);
      if (a === "credits") return handleCredits(req, res);

      return send(res, 404, { error: "Ruta no encontrada", action: a || null });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const mercadoPagoHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function originFromReq(req: any) {
    const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
    return `${proto}://${host}`;
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

  function pickQuery(req: any, key: string) {
    try {
      const u = new URL(req.url, "http://localhost");
      return (u.searchParams.get(key) || "").toString();
    } catch {
      return "";
    }
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin, supabaseUrl, supabaseAnon, supabaseService };
  }

  type PackKey = "inicio" | "productor";

  const PACKS: Record<PackKey, { title: string; amount_mxn: number; credits: number; songs: number }> = {
    inicio: { title: "Pack Inicio", amount_mxn: 275, credits: 1200, songs: 100 },
    productor: { title: "Pack Productor", amount_mxn: 545, credits: 3000, songs: 250 },
  };

  async function fetchPayment(mpToken: string, paymentId: string) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { authorization: `Bearer ${mpToken}` },
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  }

  async function handleCreatePreference(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
    if (!mpToken) return send(res, 500, { error: "Falta MERCADO_PAGO_ACCESS_TOKEN en Vercel" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const packKeyRaw = typeof payload?.packKey === "string" ? payload.packKey.trim().toLowerCase() : "";
    const packKey = (packKeyRaw === "inicio" || packKeyRaw === "productor" ? packKeyRaw : "") as PackKey | "";
    if (!packKey) return send(res, 400, { error: "packKey inválido (usa 'inicio' o 'productor')" });

    const pack = PACKS[packKey];
    const origin = originFromReq(req);

    const preferenceBody: any = {
      items: [{ title: `${pack.title} - ${pack.songs} canciones`, quantity: 1, currency_id: "MXN", unit_price: pack.amount_mxn }],
      external_reference: `ramber:${auth.user.id}:${packKey}`,
      metadata: { user_id: auth.user.id, kind: "songs", pack_key: packKey, amount_mxn: pack.amount_mxn, credits: pack.credits, songs: pack.songs },
      back_urls: { success: `${origin}/?mp=success`, failure: `${origin}/?mp=failure`, pending: `${origin}/?mp=pending` },
      auto_return: "approved",
      notification_url: `${origin}/api/mercadopago/webhook`,
    };

    try {
      const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { authorization: `Bearer ${mpToken}`, "content-type": "application/json" },
        body: JSON.stringify(preferenceBody),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) return send(res, 502, { error: "Error creando pago", detail: data || null });

      const initPoint = typeof data?.init_point === "string" ? data.init_point : "";
      if (!initPoint) return send(res, 502, { error: "Respuesta inválida de MercadoPago" });
      return send(res, 200, { init_point: initPoint, preference_id: data?.id || null });
    } catch (e) {
      return send(res, 502, { error: "Error creando pago", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleVerify(req: any, res: any) {
    if (!["GET", "POST"].includes((req.method || "").toUpperCase())) return send(res, 405, { error: "Método no permitido" });

    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
    if (!mpToken) return send(res, 500, { error: "Falta MERCADO_PAGO_ACCESS_TOKEN en Vercel" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req) || {};
    const paymentId =
      (typeof body?.payment_id === "string" ? body.payment_id : "") ||
      (typeof body?.paymentId === "string" ? body.paymentId : "") ||
      pickQuery(req, "payment_id") ||
      pickQuery(req, "paymentId");
    if (!paymentId) return send(res, 400, { error: "Falta payment_id" });

    const { ok, status, data } = await fetchPayment(mpToken, paymentId);
    if (!ok) return send(res, 502, { error: "No pude verificar el pago", code: status, detail: data || null });

    const paymentStatus = (data?.status || "").toString();
    const meta = data?.metadata || {};
    const metaUserId = (meta?.user_id || meta?.userId || "").toString();
    if (metaUserId && metaUserId !== auth.user.id) return send(res, 403, { error: "Pago no pertenece a este usuario" });

    if (paymentStatus !== "approved") return send(res, 200, { ok: true, status: paymentStatus, credited: false });

    const txKind = (meta?.kind || "songs").toString() || "songs";
    const packKey = (meta?.pack_key || meta?.packKey || "").toString();
    const amountMxn = Number(meta?.amount_mxn ?? meta?.amountMxn ?? 0);
    const credits = Number(meta?.credits ?? 0);

    const { data: exists } = await auth.admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
    if (Array.isArray(exists) && exists.length > 0) return send(res, 200, { ok: true, status: paymentStatus, credited: true, already: true });

    if (Number.isFinite(credits) && credits > 0) {
      const upd = await adjustUserCredits(auth.admin, auth.user.id, credits);
      if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });
    }

    await auth.admin.from("mp_transactions").insert({
      user_id: auth.user.id,
      kind: txKind,
      pack_key: packKey || "unknown",
      amount_mxn: Number.isFinite(amountMxn) ? amountMxn : 0,
      payment_id: paymentId,
    });

    return send(res, 200, { ok: true, status: paymentStatus, credited: true });
  }

  async function handleWebhook(req: any, res: any) {
    if (!["POST", "GET"].includes((req.method || "").toUpperCase())) return send(res, 405, { error: "Método no permitido" });

    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
    if (!mpToken) return send(res, 500, { error: "Falta MERCADO_PAGO_ACCESS_TOKEN en Vercel" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });

    const body = parseJsonBody(req) || {};
    const paymentId =
      pickQuery(req, "data.id") ||
      pickQuery(req, "id") ||
      pickQuery(req, "payment_id") ||
      (typeof body?.data?.id === "string" ? body.data.id : "") ||
      (typeof body?.id === "string" ? body.id : "");
    if (!paymentId) return send(res, 200, { ok: true });

    const { ok, status, data } = await fetchPayment(mpToken, paymentId);
    if (!ok) return send(res, 200, { ok: true, code: status });

    const paymentStatus = (data?.status || "").toString();
    if (paymentStatus !== "approved") return send(res, 200, { ok: true, status: paymentStatus });

    const meta = data?.metadata || {};
    const userId = (meta?.user_id || meta?.userId || "").toString();
    if (!userId) return send(res, 200, { ok: true, status: paymentStatus, skipped: true });

    const createClient = await getSupabaseCreateClient();
    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

    const { data: exists } = await admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
    if (Array.isArray(exists) && exists.length > 0) return send(res, 200, { ok: true, status: paymentStatus, already: true });

    const txKind = (meta?.kind || "songs").toString() || "songs";
    const packKey = (meta?.pack_key || meta?.packKey || "").toString();
    const amountMxn = Number(meta?.amount_mxn ?? meta?.amountMxn ?? 0);
    const credits = Number(meta?.credits ?? 0);

    if (Number.isFinite(credits) && credits > 0) await adjustUserCredits(admin, userId, credits);

    await admin.from("mp_transactions").insert({
      user_id: userId,
      kind: txKind,
      pack_key: packKey || "unknown",
      amount_mxn: Number.isFinite(amountMxn) ? amountMxn : 0,
      payment_id: paymentId,
    });

    return send(res, 200, { ok: true, status: paymentStatus, credited: true });
  }

  async function handleClaimFree(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    return send(res, 410, { error: "El plan gratis fue desactivado." });
  }

  return async function handler(req: any, res: any) {
    const action = (pickQuery(req, "action") || "").trim().toLowerCase() || "";
    const fallback = (() => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const parts = pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => p === "mercadopago");
      const next = i >= 0 ? parts[i + 1] : "";
      return (next || "").toLowerCase();
    })();
    const a = action || fallback;

    if (a === "create-preference") return handleCreatePreference(req, res);
    if (a === "verify") return handleVerify(req, res);
    if (a === "webhook") return handleWebhook(req, res);
    if (a === "claim-free") return handleClaimFree(req, res);

    return send(res, 404, { error: "Ruta no encontrada", action: a || null });
  };
})();

const libraryHandler = (() => {
  const TABLE = "library_items";
  const ITEM_TYPE = "song";
  const BUCKET = "ramber-tunes";
  const COVERS_BUCKET = "covers";

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

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin, supabaseUrl };
  }

  async function hasPaid(admin: any, userId: string) {
    const { data } = await admin.from("mp_transactions").select("id").eq("user_id", userId).eq("kind", "songs").gt("amount_mxn", 0).limit(1);
    return Array.isArray(data) && data.length > 0;
  }

  function storagePathFromPublicUrl(supabaseUrl: string, bucket: string, url: string) {
    try {
      const u = new URL(url);
      if (!supabaseUrl) return null;
      const supa = new URL(supabaseUrl);
      void supa;
      const marker = `/storage/v1/object/public/${bucket}/`;
      const idx = u.pathname.indexOf(marker);
      if (idx < 0) return null;
      const path = u.pathname.slice(idx + marker.length);
      const decoded = decodeURIComponent(path);
      if (!decoded) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  function shouldDeletePhysicalFile(path: string) {
    return path.startsWith("uploads/") || path.startsWith("personas/");
  }

  async function deletePhysicalFiles(admin: any, supabaseUrl: string, rows: any[]) {
    const paths: string[] = [];
    for (const r of rows) {
      const a = typeof r?.audio_url === "string" ? r.audio_url : "";
      const c = typeof r?.cover_url === "string" ? r.cover_url : "";
      for (const url of [a, c]) {
        if (!url) continue;
        const p = storagePathFromPublicUrl(supabaseUrl, BUCKET, url);
        if (!p) continue;
        if (!shouldDeletePhysicalFile(p)) continue;
        paths.push(p);
      }
    }
    const unique = Array.from(new Set(paths)).filter(Boolean);
    if (unique.length === 0) return 0;
    const { error } = await admin.storage.from(BUCKET).remove(unique);
    if (error) return 0;
    return unique.length;
  }

  async function listSongs(admin: any, userId: string, deleted: boolean) {
    const q = admin.from(TABLE).select("*").eq("user_id", userId).eq("type", ITEM_TYPE).order(deleted ? "deleted_at" : "created_at", { ascending: false }).limit(200);
    if (deleted) q.not("deleted_at", "is", null);
    else q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, songs: Array.isArray(data) ? data : [] };
  }

  async function handleList(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const deleted = ["1", "true", "yes"].includes((pickQuery(req, "deleted") || "").toLowerCase());
    const r = await listSongs(auth.admin, auth.user.id, deleted);
    if (!r.ok) return send(res, 500, { error: "Error cargando canciones", detail: r.error });
    return send(res, 200, { songs: r.songs, cleanup_deleted: 0 });
  }

  async function handleCreate(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "Nueva Canción";
    const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
    const lyrics = typeof body?.lyrics === "string" ? body.lyrics.trim().slice(0, 8000) : null;
    const gender = typeof body?.gender === "string" ? body.gender.trim().slice(0, 20) : null;
    const audioUrl = typeof body?.audioUrl === "string" ? body.audioUrl.trim().slice(0, 2000) : null;
    const coverUrl = typeof body?.coverUrl === "string" ? body.coverUrl.trim().slice(0, 2000) : null;
    const sunoTaskId = typeof body?.sunoTaskId === "string" ? body.sunoTaskId.trim().slice(0, 200) : null;
    const sunoAudioId = typeof body?.sunoAudioId === "string" ? body.sunoAudioId.trim().slice(0, 200) : null;
    const isCover = Boolean(body?.isCover);

    if (sunoAudioId) {
      const { data: existing } = await auth.admin
        .from(TABLE)
        .select("*")
        .eq("user_id", auth.user.id)
        .eq("type", ITEM_TYPE)
        .eq("suno_audio_id", sunoAudioId)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return send(res, 200, {
          song: existing,
          deleted_oldest: false,
          deleted_id: null,
          deleted_count: 0,
          deleted_titles: [],
        });
      }
    }

    const insertRow: any = {
      user_id: auth.user.id,
      type: ITEM_TYPE,
      title,
      description: description || null,
      lyrics,
      gender,
      audio_url: audioUrl,
      cover_url: coverUrl,
      suno_task_id: sunoTaskId,
      suno_audio_id: sunoAudioId,
      is_cover: isCover,
    };

    const { data, error } = await auth.admin.from(TABLE).insert(insertRow).select("*").single();
    if (error) return send(res, 500, { error: "No pude guardar la canción", detail: error.message });

    return send(res, 200, {
      song: data,
      deleted_oldest: false,
      deleted_id: null,
      deleted_count: 0,
      deleted_titles: [],
    });
  }

  async function handleDelete(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return send(res, 400, { error: "Falta id" });

    const { error } = await auth.admin.from(TABLE).update({ deleted_at: new Date().toISOString(), deleted_reason: "user_deleted" }).eq("id", id).eq("user_id", auth.user.id).eq("type", ITEM_TYPE);
    if (error) return send(res, 500, { error: "No pude eliminar", detail: error.message });
    return send(res, 200, { ok: true });
  }

  async function handleRestore(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return send(res, 400, { error: "Falta id" });

    const { error } = await auth.admin.from(TABLE).update({ deleted_at: null, deleted_reason: null }).eq("id", id).eq("user_id", auth.user.id).eq("type", ITEM_TYPE);
    if (error) return send(res, 500, { error: "No pude recuperar", detail: error.message });

    return send(res, 200, {
      ok: true,
      deleted_oldest: false,
      deleted_id: null,
      deleted_count: 0,
      deleted_titles: [],
    });
  }

  function safeFileBase(nameRaw: string) {
    const name = (nameRaw || "").toString().trim() || "cover";
    const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
    const cleaned = base.replaceAll(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
    return cleaned || "cover";
  }

  function parseBase64Data(raw: string) {
    const s = (raw || "").toString().trim();
    if (!s) return null;
    if (s.startsWith("data:")) {
      const comma = s.indexOf(",");
      if (comma < 0) return null;
      const meta = s.slice(5, comma);
      const b64 = s.slice(comma + 1);
      const mime = meta.split(";")[0] || "";
      return { base64: b64, mime: mime || "" };
    }
    return { base64: s, mime: "" };
  }

  async function ensureCoversBucket(admin: any) {
    try {
      if (!admin?.storage) return;
      const getBucket = (admin.storage as any).getBucket;
      const createBucket = (admin.storage as any).createBucket;
      if (typeof getBucket === "function") {
        const r = await getBucket.call(admin.storage, COVERS_BUCKET);
        if (!r?.error) return;
      }
      if (typeof createBucket === "function") {
        await createBucket.call(admin.storage, COVERS_BUCKET, { public: true });
      }
    } catch {
    }
  }

  async function handleSetCover(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });

    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const base64DataRaw = typeof body?.base64Data === "string" ? body.base64Data : "";
    const fileUrlRaw = typeof body?.fileUrl === "string" ? body.fileUrl.trim() : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "cover.jpg";
    if (!id) return send(res, 400, { error: "Falta id" });
    if (!base64DataRaw && !fileUrlRaw) return send(res, 400, { error: "Falta base64Data o fileUrl" });

    const { data: row, error: rowErr } = await auth.admin
      .from(TABLE)
      .select("id, user_id, type, deleted_at")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("type", ITEM_TYPE)
      .maybeSingle();
    if (rowErr) return send(res, 500, { error: "No pude validar la canción", detail: rowErr.message });
    if (!row || row.deleted_at) return send(res, 404, { error: "Canción no encontrada" });

    const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
    if (!apiKey) return send(res, 500, { error: "Falta SUNO_API_KEY en variables de entorno" });

    const uploadPath = `covers/${auth.user.id}/${id}`.slice(0, 200);

    let buf: Buffer | null = null;
    let contentType = "";
    const isClientUpload = Boolean(base64DataRaw);

    if (base64DataRaw) {
      const base64Parsed = parseBase64Data(base64DataRaw);
      if (!base64Parsed) return send(res, 400, { error: "base64Data inválido" });
      contentType = base64Parsed.mime || "";
      try {
        const b = Buffer.from(base64Parsed.base64, "base64");
        if (b && b.length > 0) buf = b;
      } catch {
        buf = null;
      }
    }

    if (!buf && fileUrlRaw) {
      let downloadUrl = "";
      try {
        new URL(fileUrlRaw);
      } catch {
        return send(res, 400, { error: "fileUrl inválido" });
      }
      try {
        const r = await fetch("https://sunoapiorg.redpandaai.co/api/file-url-upload", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            fileUrl: fileUrlRaw,
            uploadPath,
            fileName: fileName ? `${safeFileBase(fileName)}.jpg` : undefined,
          }),
        });
        const text = await r.text();
        const data = text ? JSON.parse(text) : null;
        if (r.ok && data?.success && Number(data?.code) === 200) {
          downloadUrl = String(data?.data?.downloadUrl || "").trim();
          const mt = String(data?.data?.mimeType || "").trim();
          if (mt) contentType = mt;
        }
      } catch {
        downloadUrl = "";
      }

      if (downloadUrl) {
        try {
          const r = await fetch(downloadUrl, { method: "GET" });
          if (r.ok) {
            const ct = (r.headers.get("content-type") || "").toString();
            const b = Buffer.from(await r.arrayBuffer());
            if (b && b.length > 0) {
              buf = b;
              if (ct) contentType = ct;
            }
          }
        } catch {
        }
      }
    }

    if (!buf || buf.length === 0) return send(res, 400, { error: "No pude procesar la imagen" });
    if (buf.length > 25_000_000) return send(res, 413, { error: "La imagen está muy pesada. Usa una foto más pequeña." });

    await ensureCoversBucket(auth.admin);

    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const finalCt = contentType || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
    const path = `${auth.user.id}/${id}/${Date.now()}_${safeFileBase(fileName)}.${ext}`.slice(0, 500);

    if (isClientUpload) {
      let downloadUrl = "";
      try {
        const fileBlob = new Blob([buf], { type: finalCt });
        const form = new FormData();
        form.append("file", fileBlob, `${safeFileBase(fileName)}.${ext}`);
        form.append("uploadPath", uploadPath);
        form.append("fileName", `${safeFileBase(fileName)}.${ext}`);

        const r = await fetch("https://sunoapiorg.redpandaai.co/api/file-stream-upload", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}` },
          body: form as any,
        });
        const text = await r.text();
        const data = text ? JSON.parse(text) : null;
        if (r.ok && data?.success && Number(data?.code) === 200) {
          downloadUrl = String(data?.data?.downloadUrl || "").trim();
        }
      } catch {
        downloadUrl = "";
      }

      if (downloadUrl) {
        try {
          const r = await fetch(downloadUrl, { method: "GET" });
          if (r.ok) {
            const ct = (r.headers.get("content-type") || "").toString();
            const b = Buffer.from(await r.arrayBuffer());
            if (b && b.length > 0) {
              buf = b;
              if (ct) contentType = ct;
            }
          }
        } catch {
        }
      }
    }

    const up = await auth.admin.storage.from(COVERS_BUCKET).upload(path, buf, {
      upsert: true,
      contentType: finalCt,
      cacheControl: "31536000",
    });
    if (up.error) {
      return send(res, 500, {
        error: "No pude guardar la portada",
        detail: up.error.message,
        hint: "Verifica que exista el bucket 'covers' en Supabase Storage y esté en modo Public.",
      });
    }

    const pub = auth.admin.storage.from(COVERS_BUCKET).getPublicUrl(path);
    const publicUrl = (pub?.data as any)?.publicUrl || "";
    const coverUrl = typeof publicUrl === "string" ? publicUrl.trim().slice(0, 2000) : "";
    if (!coverUrl) return send(res, 500, { error: "No pude obtener URL pública de la portada" });

    const { error: updErr } = await auth.admin.from(TABLE).update({ cover_url: coverUrl }).eq("id", id).eq("user_id", auth.user.id).eq("type", ITEM_TYPE);
    if (updErr) return send(res, 500, { error: "No pude actualizar la canción", detail: updErr.message });

    return send(res, 200, { ok: true, coverUrl });
  }

  return async function handler(req: any, res: any) {
    const action = (pickQuery(req, "action") || "").trim().toLowerCase() || "";
    const fallback = (() => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const parts = pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => p === "library");
      const next = i >= 0 ? parts[i + 1] : "";
      return (next || "").toLowerCase();
    })();
    const a = action || fallback || "list";

    if (a === "list") return handleList(req, res);
    if (a === "create") return handleCreate(req, res);
    if (a === "delete") return handleDelete(req, res);
    if (a === "restore") return handleRestore(req, res);
    if (a === "set-cover") return handleSetCover(req, res);

    return send(res, 404, { error: "Ruta no encontrada", action: a || null });
  };
})();

const balanceHandler = (() => {
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
    const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
    const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";

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

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const useProvider = (pickQuery(req, "source") || "").toLowerCase() === "provider";
    if (useProvider) {
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
        return send(res, 200, { credits, song_balance: counts.songs, counts, downloads_allowed: true, free_claimed: false, source: "provider" });
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

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return send(res, 401, { error: "No autorizado" });
    const is_admin = isAdminEmail(user.email);

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

    const plan = await getUserPlan(admin, user.id).catch(() => ({
      plan_key: "ninguno",
      downloads_allowed: false,
      plan_active: false,
      plan_expires_at: null,
      hasProductor: false,
    }));
    const plan_key = String((plan as any)?.plan_key || "ninguno");
    const plan_expires_at = (plan as any)?.plan_expires_at ?? null;
    const plan_active = is_admin ? true : Boolean((plan as any)?.plan_active);
    const downloads_allowed = is_admin ? true : Boolean((plan as any)?.downloads_allowed);
    const free_claimed = false;
    const show_free_claim_popup = false;

    let { data: profile, error: profErr } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (profErr) return send(res, 500, { error: "Error consultando saldo", detail: profErr.message });

    if (!profile) {
      const created = await ensureProfileExists(admin, user.id);
      if (!created.ok) return send(res, 500, { error: "Error creando perfil", detail: created.error });
      const r2 = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
      profile = r2.data ?? null;
    }

    const internal_credits = round2(creditsFromProfile(profile));
    let provider_credits: number | null = null;
    let provider_error = "";

    if (is_admin) {
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
            const v = round2(Number.isFinite(parsed) ? parsed : 0);
            if (Number.isFinite(v) && v >= 0) provider_credits = v;
          } else {
            provider_error = "Error del proveedor";
          }
        } else {
          provider_error = "No pude consultar créditos del proveedor";
        }
      } catch (e) {
        provider_error = e instanceof Error ? e.message : String(e);
      }
    }

    const credits = is_admin && typeof provider_credits === "number" ? provider_credits : internal_credits;

    const counts = toCounts(credits);
    return send(res, 200, {
      credits,
      song_balance: counts.songs,
      counts,
      downloads_allowed,
      free_claimed,
      show_free_claim_popup,
      plan_key,
      plan_active,
      plan_expires_at,
      mp4_watermark_disabled: is_admin ? true : Boolean((plan as any)?.hasProductor),
      is_admin,
      internal_credits,
      provider_credits,
      provider_error: provider_error || null,
      source: is_admin && typeof provider_credits === "number" ? "provider_admin" : "local",
    });
  };
})();

const bootstrapProfileHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    const authHeader = (req.headers.authorization || "").toString();
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return send(res, 401, { error: "No autorizado" });

    try {
      const createClient = await getSupabaseCreateClient();
      const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      const user = userData?.user;
      if (userErr || !user) return send(res, 401, { error: "No autorizado" });

      const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
      const is_admin = isAdminEmail(user.email);
      let welcome_granted = false;
      let welcome_error: string | null = null;
      const grantWelcomeIfEligible = async () => {
        if (is_admin) return;
        try {
          const paymentId = `welcome:${user.id}`;
          const { data: exists } = await admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
          if (Array.isArray(exists) && exists.length > 0) return;
          const created = await ensureProfileExists(admin, user.id);
          if (!created.ok) {
            welcome_error = created.error || "No pude crear tu perfil.";
            return;
          }
          const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
          const current = creditsFromProfile(profile);
          if (current > 0) return;
          const credits = CREDIT_COSTS.generate_music * 5;
          const upd = await adjustUserCredits(admin, user.id, credits);
          if (!upd.ok) {
            welcome_error = upd.error || "No pude acreditar créditos de bienvenida.";
            return;
          }
          await admin.from("mp_transactions").insert({
            user_id: user.id,
            kind: "welcome",
            pack_key: "welcome",
            amount_mxn: 0,
            payment_id: paymentId,
          });
          welcome_granted = true;
        } catch (e) {
          welcome_error = e instanceof Error ? e.message : String(e);
        }
      };
      const up = await ensureProfileExists(admin, user.id);
      if (!up.ok) return send(res, 500, { error: "No pude crear perfil", detail: up.error });

      await grantWelcomeIfEligible();

      return send(res, 200, { ok: true, created: true, welcome_granted, welcome_error });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const sunoWebhookHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  return async function handler(req: any, res: any) {
    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) return send(res, 200, { ok: true });

    let body: any = null;
    try {
      if (typeof req.body === "string") body = JSON.parse(req.body);
      else body = req.body ?? null;
    } catch {
      body = null;
    }

    const code = Number(body?.code);
    const msg = String(body?.msg || "");
    const data = body?.data ?? {};
    const callbackType = String(data?.callbackType || data?.callback_type || "").toLowerCase();
    const taskId = String(data?.task_id || data?.taskId || body?.taskId || body?.task_id || "").trim();
    const tracks = Array.isArray(data?.data) ? data.data : [];
    const coverImages = Array.isArray(data?.images) ? data.images : [];
    const audioWavUrl = String(data?.audioWavUrl || data?.audio_wav_url || "").trim();

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService);
      const ensureCoversBucket = async () => {
        try {
          const getBucket = (admin.storage as any)?.getBucket;
          const createBucket = (admin.storage as any)?.createBucket;
          if (typeof getBucket === "function") {
            const r = await getBucket.call(admin.storage, "covers");
            if (!r?.error) return;
          }
          if (typeof createBucket === "function") {
            await createBucket.call(admin.storage, "covers", { public: true });
          }
        } catch {
        }
      };

      if (taskId) {
        const { data: taskRows } = await admin.from("suno_tasks").select("user_id, kind, cost, consumed").eq("task_id", taskId).limit(1);
        const taskRow = Array.isArray(taskRows) ? taskRows[0] : null;
        const userId = String(taskRow?.user_id || "").trim();
        const kind = String(taskRow?.kind || "").trim().toLowerCase();
        const isCover = kind.includes("cover");
        const isMusicCover = kind.startsWith("music-cover:");
        const isWav = kind.startsWith("wav:");

        if (isWav && userId) {
          if (Number.isFinite(code) && code !== 200) {
            const cost = Number(taskRow?.cost ?? 0);
            const consumed = Boolean(taskRow?.consumed);
            if (consumed && Number.isFinite(cost) && cost > 0) {
              await adjustUserCredits(admin, userId, cost);
              await admin.from("suno_tasks").update({ consumed: false }).eq("task_id", taskId).eq("user_id", userId);
            }
          }
        } else if (isMusicCover && userId) {
          const originalTaskId = kind.split("music-cover:").slice(1).join("music-cover:").trim();
          if (code === 200 && coverImages.length > 0 && originalTaskId) {
            await ensureCoversBucket();
            const bucket = "covers";
            const tryDownloadAndStore = async (urlRaw: any, index: number) => {
              const url = String(urlRaw || "").trim();
              if (!url) return "";
              try {
                const r = await fetch(url, { method: "GET" });
                if (!r.ok) return "";
                const ct = (r.headers.get("content-type") || "").toString();
                const buf = Buffer.from(await r.arrayBuffer());
                if (!buf || buf.length === 0) return "";
                const ext = ct.includes("jpeg") ? "jpg" : ct.includes("webp") ? "webp" : "png";
                const path = `${userId}/${originalTaskId.slice(0, 120)}/${taskId}_${index + 1}.${ext}`;
                const up = await admin.storage.from(bucket).upload(path, buf, {
                  upsert: true,
                  contentType: ct || `image/${ext}`,
                  cacheControl: "31536000",
                });
                if (up.error) return "";
                const pub = admin.storage.from(bucket).getPublicUrl(path);
                const publicUrl = (pub?.data as any)?.publicUrl || "";
                return typeof publicUrl === "string" ? publicUrl.trim() : "";
              } catch {
                return "";
              }
            };

            let chosen = "";
            for (let i = 0; i < coverImages.length; i++) {
              chosen = await tryDownloadAndStore(coverImages[i], i);
              if (chosen) break;
            }

            const finalUrl = chosen.slice(0, 2000);
            if (finalUrl) {
              await admin
                .from("library_items")
                .update({ cover_url: finalUrl })
                .eq("user_id", userId)
                .eq("type", "song")
                .eq("suno_task_id", originalTaskId.slice(0, 200))
                .is("deleted_at", null);
            }
          } else if (Number.isFinite(code) && code !== 200) {
            const cost = Number(taskRow?.cost ?? 0);
            const consumed = Boolean(taskRow?.consumed);
            if (consumed && Number.isFinite(cost) && cost > 0) {
              await adjustUserCredits(admin, userId, cost);
              await admin.from("suno_tasks").update({ consumed: false }).eq("task_id", taskId).eq("user_id", userId);
            }
          }
        } else if (code === 200 && (callbackType === "first" || callbackType === "complete") && userId) {
          const normalized = tracks
            .map((t: any, idx: number) => ({
              idx,
              sunoAudioId: String(t?.id || "").trim(),
              audioUrl: String(t?.audio_url || t?.audioUrl || t?.stream_audio_url || t?.streamAudioUrl || "").trim(),
              coverUrl: String(t?.image_url || t?.imageUrl || "").trim(),
              title: String(t?.title || "").trim(),
              tags: String(t?.tags || "").trim(),
            }))
            .filter((t: any) => t.sunoAudioId && t.audioUrl);

          const ids = Array.from(new Set(normalized.map((x: any) => x.sunoAudioId)));
          if (ids.length > 0) {
            const { data: existing } = await admin
              .from("library_items")
              .select("suno_audio_id")
              .eq("user_id", userId)
              .eq("type", "song")
              .in("suno_audio_id", ids)
              .is("deleted_at", null);
            const existingIds = new Set(
              (Array.isArray(existing) ? existing : []).map((r: any) => String(r?.suno_audio_id || "").trim()).filter(Boolean)
            );

            const inserts = normalized
              .filter((x: any) => !existingIds.has(x.sunoAudioId))
              .map((x: any) => ({
                user_id: userId,
                type: "song",
                title: (() => {
                  const base = (x.title || "Canción").toString().trim();
                  const suffix = normalized.length === 2 ? (x.idx === 0 ? "A" : x.idx === 1 ? "B" : String(x.idx + 1)) : normalized.length > 1 ? String(x.idx + 1) : "";
                  if (!suffix) return base.slice(0, 120);
                  const hasSuffix = new RegExp(`\\s${suffix}$`, "i").test(base);
                  return (hasSuffix ? base : `${base} ${suffix}`).slice(0, 120);
                })(),
                description: x.tags ? x.tags.slice(0, 2000) : null,
                lyrics: null,
                gender: null,
                audio_url: x.audioUrl.slice(0, 2000),
                cover_url: x.coverUrl ? x.coverUrl.slice(0, 2000) : null,
                suno_task_id: taskId.slice(0, 200),
                suno_audio_id: x.sunoAudioId.slice(0, 200),
                is_cover: Boolean(isCover),
              }));

            if (inserts.length > 0) {
              await admin.from("library_items").insert(inserts);
            }
          }
        } else if (userId && (callbackType === "error" || (Number.isFinite(code) && code !== 200))) {
          const cost = Number(taskRow?.cost ?? 0);
          const consumed = Boolean(taskRow?.consumed);
          if (consumed && Number.isFinite(cost) && cost > 0) {
            await adjustUserCredits(admin, userId, cost);
            await admin.from("suno_tasks").update({ consumed: false }).eq("task_id", taskId).eq("user_id", userId);
          }
        }
      }
    } catch {
    }

    return send(res, 200, { ok: true, received: true, code: Number.isFinite(code) ? code : null, msg: msg ? msg.slice(0, 120) : null });
  };
})();

const shareHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  return async function handler(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const id = pickQuery(req, "id").trim();
    if (!id) return send(res, 400, { error: "Falta id" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    try {
      const createClient = await getSupabaseCreateClient();
      const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
      const { data, error } = await admin
        .from("library_items")
        .select("id, title, audio_url, cover_url, deleted_at, type")
        .eq("id", id.slice(0, 200))
        .eq("type", "song")
        .maybeSingle();
      if (error) return send(res, 500, { error: "No pude buscar la canción", detail: error.message });
      if (!data || data.deleted_at) return send(res, 404, { error: "No encontrada" });

      const audioUrl = typeof (data as any).audio_url === "string" ? (data as any).audio_url.trim() : "";
      const title = typeof (data as any).title === "string" ? (data as any).title.trim() : "";
      const coverUrl = typeof (data as any).cover_url === "string" ? (data as any).cover_url.trim() : "";
      if (!audioUrl) return send(res, 404, { error: "No hay audio para compartir" });

      return send(res, 200, { id: String((data as any).id || ""), title, audioUrl, coverUrl });
    } catch (e) {
      return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const videosHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  function getAuthToken(req: any) {
    const authHeader = (req.headers.authorization || "").toString();
    return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  }

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "videos") return send(res, 404, { error: "Ruta no encontrada" });

    const action = (next || "").toString().trim().toLowerCase();
    if (action !== "list") return send(res, 404, { error: "Ruta no encontrada" });
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const limitRaw = Number(pickQuery(req, "limit") || 50);
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 50, 200));

    try {
      const userId = String(auth.user.id || "").trim();
      const admin = auth.admin;
      let rows: any[] = [];
      const r1 = await admin
        .from("suno_tasks")
        .select("task_id, kind, created_at")
        .eq("user_id", userId)
        .eq("kind", "mp4")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!r1.error) {
        rows = Array.isArray(r1.data) ? r1.data : [];
      } else {
        const r2 = await admin.from("suno_tasks").select("task_id, kind").eq("user_id", userId).eq("kind", "mp4").limit(limit);
        if (r2.error) return send(res, 500, { error: "No pude listar videos", detail: r2.error.message });
        rows = Array.isArray(r2.data) ? r2.data : [];
      }

      const items = rows
        .map((x: any) => ({
          taskId: String(x?.task_id || "").trim(),
          created_at: typeof x?.created_at === "string" ? x.created_at : "",
        }))
        .filter((x: any) => x.taskId);

      return send(res, 200, { ok: true, items });
    } catch (e) {
      return send(res, 500, { error: "No pude listar videos", detail: e instanceof Error ? e.message : String(e) });
    }
  };
})();

const supportHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
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

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "support" || next !== "feedback") return send(res, 404, { error: "Ruta no encontrada" });
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    const token = getAuthToken(req);
    if (!token) return send(res, 401, { error: "No autorizado" });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const name = (payload?.name || "").toString().trim().slice(0, 120);
    const whatsapp = (payload?.whatsapp || "").toString().trim().slice(0, 80);
    const message = (payload?.message || "").toString().trim().slice(0, 4000);
    if (!name) return send(res, 400, { error: "Falta nombre" });
    if (!whatsapp) return send(res, 400, { error: "Falta WhatsApp" });
    if (!message) return send(res, 400, { error: "Falta mensaje" });

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return send(res, 401, { error: "No autorizado" });

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from("support_feedback")
      .insert({
        user_id: user.id,
        user_email: user.email || null,
        name,
        whatsapp,
        message,
        is_read: false,
      })
      .select("id")
      .maybeSingle();
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { ok: true, id: data?.id || null });
  };
})();

const adminHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
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

  function pickQuery(req: any, key: string) {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
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

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };
    if (!isAdminEmail(user.email)) return { ok: false as const, status: 403, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin, supabaseUrl, supabaseService };
  }

  function explainAuthAdminError(err: any) {
    const msg = err?.message ? String(err.message) : String(err || "");
    const lower = msg.toLowerCase();
    const hint =
      lower.includes("401") ||
      lower.includes("403") ||
      lower.includes("not authorized") ||
      lower.includes("forbidden") ||
      lower.includes("invalid jwt")
        ? " Revisa SUPABASE_SERVICE_ROLE_KEY en Vercel (debe ser la service_role key, no la anon key)."
        : "";
    return (msg || "Error de Supabase Auth Admin") + hint;
  }

  async function listUsersViaHttp(supabaseUrl: string, serviceKey: string, page: number, perPage: number) {
    const base = String(supabaseUrl || "").replace(/\/+$/, "");
    const url = `${base}/auth/v1/admin/users?page=${encodeURIComponent(String(page))}&per_page=${encodeURIComponent(String(perPage))}`;
    const r = await fetch(url, {
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
    });
    const text = await r.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!r.ok) {
      const msg =
        (data && (data?.msg || data?.message || data?.error)) ||
        `HTTP ${Number(r.status || 0) || 0}`;
      return { ok: false as const, status: Number(r.status || 500) || 500, error: String(msg), detail: String(text || "").slice(0, 600) };
    }
    const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
    let total: number | null = null;
    const cr = (r.headers.get("content-range") || r.headers.get("Content-Range") || "").toString();
    const m = cr.match(/\/(\d+)\s*$/);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) total = n;
    }
    return { ok: true as const, users, total };
  }

  async function deleteUserViaHttp(supabaseUrl: string, serviceKey: string, userId: string) {
    const base = String(supabaseUrl || "").replace(/\/+$/, "");
    const uid = String(userId || "").trim();
    if (!uid) return { ok: false as const, status: 400, error: "user_id inválido" };
    const url = `${base}/auth/v1/admin/users/${encodeURIComponent(uid)}`;
    const r = await fetch(url, {
      method: "DELETE",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
    });
    const text = await r.text().catch(() => "");
    if (!r.ok) return { ok: false as const, status: Number(r.status || 500) || 500, error: `HTTP ${Number(r.status || 0) || 0}`, detail: String(text || "").slice(0, 600) };
    return { ok: true as const };
  }

  async function findUserIdByEmail(authCtx: any, email: string) {
    const clean = (email || "").toString().trim().toLowerCase();
    if (!clean) return { ok: false as const, status: 400, error: "Email inválido" };

    const supabaseUrl = String(authCtx?.supabaseUrl || "").trim();
    const supabaseService = String(authCtx?.supabaseService || "").trim();
    if (supabaseUrl && supabaseService) {
      const perPage = 200;
      const maxPages = 25;
      for (let page = 1; page <= maxPages; page++) {
        const r = await listUsersViaHttp(supabaseUrl, supabaseService, page, perPage);
        if (!r.ok) {
          const hint = explainAuthAdminError({ message: r.error });
          return { ok: false as const, status: r.status, error: hint, detail: r.detail || "" };
        }
        const users = Array.isArray(r.users) ? r.users : [];
        if (!users.length) break;
        const found = users.find((u: any) => String(u?.email || "").trim().toLowerCase() === clean);
        const uid = String(found?.id || found?.user?.id || "").trim();
        if (uid) return { ok: true as const, userId: uid };
      }
    }

    const adminClient = authCtx?.admin;
    const v2 = adminClient?.auth?.admin;
    const v1 = adminClient?.auth?.api;

    const getByEmail = v2?.getUserByEmail || v1?.getUserByEmail;
    if (typeof getByEmail === "function") {
      const r = await getByEmail(clean);
      const err = r?.error;
      const uid = String(r?.data?.user?.id || "").trim();
      if (uid) return { ok: true as const, userId: uid };
      if (err) return { ok: false as const, status: 500, error: explainAuthAdminError(err), detail: String(err?.message || "").slice(0, 600) };
      return { ok: false as const, status: 404, error: "No encontré ese usuario por correo." };
    }

    const listUsers = v2?.listUsers || v1?.listUsers;
    if (typeof listUsers === "function") {
      const perPage = 200;
      const maxPages = 20;
      for (let page = 1; page <= maxPages; page++) {
        const r = await listUsers({ page, perPage });
        const err = r?.error;
        if (err) return { ok: false as const, status: 500, error: explainAuthAdminError(err), detail: String(err?.message || "").slice(0, 600) };
        const users = Array.isArray(r?.data?.users) ? r.data.users : [];
        if (!users.length) break;
        const found = users.find((u: any) => String(u?.email || "").trim().toLowerCase() === clean);
        const uid = String(found?.id || "").trim();
        if (uid) return { ok: true as const, userId: uid };
      }
      return { ok: false as const, status: 404, error: "No encontré ese usuario por correo." };
    }

    return { ok: false as const, status: 500, error: "Supabase Auth Admin no disponible (getUserByEmail/listUsers)" };
  }

  async function sumPayments(admin: any, sinceIso: string | null) {
    let q = admin.from("mp_transactions").select("amount_mxn, created_at").eq("kind", "songs").gt("amount_mxn", 0);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { data, error } = await q.limit(10000);
    if (error) return { ok: false as const, error: error.message, count: 0, mxn: 0 };
    const rows = Array.isArray(data) ? data : [];
    const mxn = rows.reduce((acc: number, r: any) => acc + (Number(r?.amount_mxn) || 0), 0);
    return { ok: true as const, count: rows.length, mxn };
  }

  async function handleStats(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const now = new Date();
    const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startWeek = new Date(startToday);
    startWeek.setUTCDate(startWeek.getUTCDate() - 7);
    const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const start30d = new Date(startToday);
    start30d.setUTCDate(start30d.getUTCDate() - 30);
    const startDaily7d = new Date(startToday);
    startDaily7d.setUTCDate(startDaily7d.getUTCDate() - 6);

    const admin = auth.admin;

    const supabaseUrl = String((auth as any)?.supabaseUrl || "").trim();
    const supabaseService = String((auth as any)?.supabaseService || "").trim();
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase Auth" });

    const realIds = await buildRealUserIdSet(admin);
    const safeTime = (s: any) => {
      const v = typeof s === "string" ? s : "";
      if (!v) return 0;
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const isSince = (iso: any, since: Date) => {
      const t = safeTime(iso);
      return t > 0 && t >= since.getTime();
    };

    let totalCount = 0;
    let active30dCount = 0;
    let new7dCount = 0;
    let realTotal = 0;
    let realActive30d = 0;
    let realNew7d = 0;

    const perPage = 200;
    const maxPages = 10;
    for (let page = 1; page <= maxPages; page++) {
      const r = await listUsersViaHttp(supabaseUrl, supabaseService, page, perPage);
      if (!r.ok) return send(res, r.status, { error: explainAuthAdminError({ message: r.error }), detail: r.detail || null });
      const users = Array.isArray(r.users) ? r.users : [];
      if (!users.length) break;
      for (const u of users) {
        const email = (u?.email || "").toString().trim();
        if (!email) continue;
        if (isAdminEmail(email)) continue;
        totalCount += 1;
        const createdAt = String((u as any)?.created_at || "");
        const lastSignInAt = String((u as any)?.last_sign_in_at || "");
        const isNew7d = isSince(createdAt, startWeek);
        const isActive30d = isSince(lastSignInAt, start30d);
        if (isNew7d) new7dCount += 1;
        if (isActive30d) active30dCount += 1;
        const uid = String((u as any)?.id || "").trim();
        if (uid && realIds.has(uid)) {
          realTotal += 1;
          if (isNew7d) realNew7d += 1;
          if (isActive30d) realActive30d += 1;
        }
      }
      if (typeof r.total === "number" && Number.isFinite(r.total) && r.total <= perPage * page) break;
    }

    const [today, week, month, all] = await Promise.all([
      sumPayments(admin, startToday.toISOString()),
      sumPayments(admin, startWeek.toISOString()),
      sumPayments(admin, startMonth.toISOString()),
      sumPayments(admin, null),
    ]);

    const dailyMap = new Map<string, { mxn: number; count: number }>();
    try {
      const { data, error } = await admin
        .from("mp_transactions")
        .select("amount_mxn, created_at")
        .eq("kind", "songs")
        .gt("amount_mxn", 0)
        .gte("created_at", startDaily7d.toISOString())
        .limit(20000);
      if (!error) {
        const rows = Array.isArray(data) ? data : [];
        for (const r of rows) {
          const createdAt = typeof (r as any)?.created_at === "string" ? (r as any).created_at : "";
          let key = "";
          try {
            const d = new Date(createdAt);
            if (Number.isFinite(d.getTime())) key = d.toISOString().slice(0, 10);
          } catch {
            key = "";
          }
          if (!key) continue;
          const amt = Number((r as any)?.amount_mxn ?? 0) || 0;
          const prev = dailyMap.get(key) || { mxn: 0, count: 0 };
          dailyMap.set(key, { mxn: prev.mxn + amt, count: prev.count + 1 });
        }
      }
    } catch {
    }

    const daily_7d: any[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDaily7d);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      const v = dailyMap.get(key) || { mxn: 0, count: 0 };
      daily_7d.push({ day: key, mxn: Math.round((v.mxn || 0) * 100) / 100, count: v.count || 0 });
    }

    return send(res, 200, {
      users: {
        total: totalCount,
        active30d: active30dCount,
        new7d: new7dCount,
        real_total: realTotal,
        real_active30d: realActive30d,
        real_new7d: realNew7d,
      },
      payments: {
        today: { mxn: today.ok ? today.mxn : 0, count: today.ok ? today.count : 0 },
        week: { mxn: week.ok ? week.mxn : 0, count: week.ok ? week.count : 0 },
        month: { mxn: month.ok ? month.mxn : 0, count: month.ok ? month.count : 0 },
        all: { mxn: all.ok ? all.mxn : 0, count: all.ok ? all.count : 0 },
        daily_7d,
      },
      generated_at: now.toISOString(),
    });
  }

  async function handleDiag(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const env = {
      has_supabase_url: Boolean(process.env.SUPABASE_URL),
      has_supabase_anon: Boolean(process.env.SUPABASE_ANON_KEY),
      has_supabase_service: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      has_suno_base: Boolean(process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL),
      has_suno_key: Boolean(process.env.SUNO_API_KEY || process.env.SUNO_KEY),
    };

    let provider: any = null;
    try {
      const paths = [
        "/api/v1/generate/credit",
        "/api/v1/get-credits",
        "/api/v1/suno/get-credits",
        "/api/v1/suno/generate/credit",
        "/api/v1/suno/credits",
        "/api/v1/suno/credit",
      ];
      let last: any = null;
      for (const p of paths) {
        const r = await providerFetchJson(p, { method: "GET" });
        last = r;
        if (r?.res?.status !== 404) break;
      }
      const r = last;
      const code = Number(r?.data?.code);
      const raw = r?.data?.data?.credits ?? r?.data?.data;
      const parsed = parseProviderCreditsValue(raw);
      provider = {
        ok: Boolean(r?.res?.ok),
        status: Number(r?.res?.status || 0),
        code: Number.isFinite(code) ? code : null,
        credits: Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null,
        text: String(r?.text || "").slice(0, 300),
      };
    } catch (e) {
      provider = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    return send(res, 200, { ok: true, env, provider });
  }

  async function handleGrantCredits(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const email = (body?.email || "").toString().trim().toLowerCase();
    const credits = Number(body?.credits ?? 0);
    if (!email) return send(res, 400, { error: "Falta email" });
    if (!Number.isFinite(credits) || credits <= 0) return send(res, 400, { error: "Créditos inválidos" });

    const admin = auth.admin;
    const found = await findUserIdByEmail(auth, email);
    if (!found.ok) return send(res, found.status, { error: found.error, detail: (found as any)?.detail || null });
    const userId = found.userId;

    const upd = await adjustUserCredits(admin, userId, credits);
    if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });

    await admin.from("mp_transactions").insert({
      user_id: userId,
      kind: "admin_grant",
      pack_key: "admin",
      amount_mxn: 0,
      payment_id: `admin_grant:${auth.user.id}:${Date.now()}`,
    });

    return send(res, 200, { ok: true, user_id: userId, credited: credits, new_credits: upd.credits ?? null });
  }

  async function handleTransferCredits(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const email = (body?.email || "").toString().trim().toLowerCase();
    const credits = round2(Number(body?.credits ?? 0));
    if (!email) return send(res, 400, { error: "Falta email" });
    if (!Number.isFinite(credits) || credits <= 0) return send(res, 400, { error: "Créditos inválidos" });

    const admin = auth.admin;
    const found = await findUserIdByEmail(auth, email);
    if (!found.ok) return send(res, found.status, { error: found.error, detail: (found as any)?.detail || null });
    const fromUserId = found.userId;
    const toUserId = auth.user.id;

    const ensureFrom = await ensureProfileExists(admin, fromUserId);
    if (!ensureFrom.ok) return send(res, 500, { error: "No pude preparar el usuario.", detail: ensureFrom.error });
    const ensureTo = await ensureProfileExists(admin, toUserId);
    if (!ensureTo.ok) return send(res, 500, { error: "No pude preparar tu cuenta.", detail: ensureTo.error });

    const fromProfile = await admin.from("profiles").select("*").eq("id", fromUserId).maybeSingle();
    if (fromProfile.error) return send(res, 500, { error: "No pude leer el saldo del usuario.", detail: fromProfile.error.message });
    const fromCreditsBefore = round2(creditsFromProfile(fromProfile.data));
    const toProfileBefore = await admin.from("profiles").select("*").eq("id", toUserId).maybeSingle();
    const toCreditsBefore = toProfileBefore.error ? null : round2(creditsFromProfile(toProfileBefore.data));
    if (fromCreditsBefore < credits) {
      return send(res, 400, { error: `El usuario solo tiene ${fromCreditsBefore} créditos.` });
    }
    const transferId = `admin_transfer:${toUserId}:${fromUserId}:${Date.now()}`;


    const out = await consumeUserCredits(admin, fromUserId, credits);
    if (!out.ok) return send(res, 500, { error: out.error || "No pude quitar créditos." });

    const inc = await adjustUserCredits(admin, toUserId, credits);
    if (!inc.ok) {
      await adjustUserCredits(admin, fromUserId, credits);
      return send(res, 500, { error: inc.error || "No pude regresarte los créditos (revertido)." });
    }

    await admin.from("mp_transactions").insert([
      { user_id: fromUserId, kind: "admin_transfer_out", pack_key: "admin", amount_mxn: 0, payment_id: `${transferId}:out` },
      { user_id: toUserId, kind: "admin_transfer_in", pack_key: "admin", amount_mxn: 0, payment_id: `${transferId}:in` },
    ]);

    const fromProfileAfter = await admin.from("profiles").select("*").eq("id", fromUserId).maybeSingle();
    const fromCreditsAfter = fromProfileAfter.error ? null : round2(creditsFromProfile(fromProfileAfter.data));
    const toProfileAfter = await admin.from("profiles").select("*").eq("id", toUserId).maybeSingle();
    const toCreditsAfter = toProfileAfter.error ? null : round2(creditsFromProfile(toProfileAfter.data));

    return send(res, 200, {
      ok: true,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      transferred: credits,
      from_credits_before: fromCreditsBefore,
      from_credits_after: fromCreditsAfter,
      to_credits_before: toCreditsBefore,
      to_credits_after: toCreditsAfter,
      note: "Esto mueve el saldo interno (profiles). El saldo del proveedor (Suno) no se puede mover.",
    });
  }

  async function setUserCreditsAbsolute(admin: any, userId: string, nextCredits: number) {
    const next = round2(Math.max(0, Number(nextCredits)));
    if (!Number.isFinite(next)) return { ok: false as const, error: "Créditos inválidos" };

    for (let i = 0; i < 4; i++) {
      const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (readErr) return { ok: false as const, error: readErr.message };
      if (!profile) {
        const created = await ensureProfileExists(admin, userId);
        if (!created.ok) return { ok: false as const, error: created.error };
        continue;
      }
      const upd = await updateCreditsAnyColumn(admin, userId, next);
      if (upd.ok) return { ok: true as const, credits: next };
      return { ok: false as const, error: upd.error };
    }

    return { ok: false as const, error: "No pude actualizar créditos (intenta otra vez)." };
  }

  async function handleSetPlan(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const email = (body?.email || "").toString().trim().toLowerCase();
    const plan_key = (body?.plan_key || "").toString().trim().toLowerCase();
    const credits_mode = (body?.credits_mode || "none").toString().trim().toLowerCase();
    const credits = Number(body?.credits ?? 0);

    if (!email) return send(res, 400, { error: "Falta email" });
    if (!(plan_key === "ninguno" || plan_key === "inicio" || plan_key === "productor")) {
      return send(res, 400, { error: "Plan inválido" });
    }
    if (!(credits_mode === "none" || credits_mode === "default" || credits_mode === "set")) {
      return send(res, 400, { error: "Modo de créditos inválido" });
    }

    const admin = auth.admin;
    const found = await findUserIdByEmail(auth, email);
    if (!found.ok) return send(res, found.status, { error: found.error, detail: (found as any)?.detail || null });
    const userId = found.userId;

    const payment_id = `admin_plan:${auth.user.id}:${userId}:${Date.now()}`;
    await admin.from("mp_transactions").insert({
      user_id: userId,
      kind: "songs",
      pack_key: plan_key,
      amount_mxn: 0,
      payment_id,
    });

    if (credits_mode === "default") {
      let add = 0;
      if (plan_key === "inicio") add = 1200;
      if (plan_key === "productor") add = 3000;
      if (add > 0) {
        const upd = await adjustUserCredits(admin, userId, add);
        if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });
      }
    } else if (credits_mode === "set") {
      if (!Number.isFinite(credits) || credits < 0) return send(res, 400, { error: "Créditos inválidos" });
      const upd = await setUserCreditsAbsolute(admin, userId, credits);
      if (!upd.ok) return send(res, 500, { error: upd.error || "No pude fijar créditos" });
    }

    return send(res, 200, { ok: true, user_id: userId, plan_key, credits_mode });
  }

  async function handleFeedback(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const mode = (pickQuery(req, "mode") || "").toString().trim().toLowerCase();
    const admin = auth.admin;
    try {
      let unread_count = 0;
      try {
        const r = await admin.from("support_feedback").select("id", { count: "exact", head: true }).eq("is_read", false);
        if (!r.error) unread_count = Number(r.count || 0);
      } catch {
        unread_count = 0;
      }
      if (mode === "count") return send(res, 200, { unread_count });

      const { data, error } = await admin
        .from("support_feedback")
        .select("id, user_id, user_email, name, whatsapp, message, created_at, is_read, read_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return send(res, 500, { error: error.message });
      const items = Array.isArray(data) ? data : [];
      return send(res, 200, { unread_count, items });
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleFeedbackMarkRead(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const id = (body?.id || "").toString().trim();
    if (!id) return send(res, 400, { error: "Falta id" });

    const admin = auth.admin;
    const { error } = await admin.from("support_feedback").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { ok: true });
  }

  async function handleUsers(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const searchRaw = (pickQuery(req, "search") || pickQuery(req, "q") || "").toString().trim().toLowerCase();
    const limitRaw = Number(pickQuery(req, "limit") || 200);
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 200, 500));
    const mode = (pickQuery(req, "mode") || "real").toString().trim().toLowerCase(); // real | all
    const onlyReal = mode !== "all";

    const supabaseUrl = String((auth as any)?.supabaseUrl || "").trim();
    const supabaseService = String((auth as any)?.supabaseService || "").trim();
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase Auth" });

    let activeUserIds: Set<string> | null = null;
    if (onlyReal) {
      try {
        activeUserIds = await buildRealUserIdSet((auth as any).admin);
      } catch {
        activeUserIds = new Set<string>();
      }
    }

    const items: any[] = [];
    let total: number | null = null;
    let adminSeen = 0;
    let total_filtered = 0;
    const perPage = 200;
    const maxPages = 10;

    for (let page = 1; page <= maxPages; page++) {
      const r = await listUsersViaHttp(supabaseUrl, supabaseService, page, perPage);
      if (!r.ok) return send(res, r.status, { error: explainAuthAdminError({ message: r.error }), detail: r.detail || null });
      if (typeof r.total === "number" && Number.isFinite(r.total)) total = r.total;
      const users = Array.isArray(r.users) ? r.users : [];
      if (!users.length) break;

      for (const u of users) {
        const email = (u?.email || "").toString().trim();
        if (!email) continue;
        const lower = email.toLowerCase();
        if (isAdminEmail(lower)) {
          adminSeen += 1;
          continue;
        }
        const uid = String(u?.id || "").trim();
        if (onlyReal && activeUserIds && uid && !activeUserIds.has(uid)) continue;
        if (searchRaw && !lower.includes(searchRaw)) continue;
        total_filtered += 1;
        const meta = (u as any)?.user_metadata ?? (u as any)?.user_meta_data ?? (u as any)?.raw_user_meta_data ?? {};
        const full_name = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : "";
        const birthdate =
          typeof meta?.birthdate === "string"
            ? meta.birthdate
            : typeof meta?.birthday === "string"
              ? meta.birthday
              : typeof meta?.dob === "string"
                ? meta.dob
                : "";
        items.push({
          id: uid,
          email,
          created_at: String(u?.created_at || ""),
          last_sign_in_at: String(u?.last_sign_in_at || ""),
          full_name: String(full_name || "").slice(0, 120),
          birthdate: String(birthdate || "").slice(0, 32),
        });
        if (items.length >= limit) break;
      }
      if (items.length >= limit && !searchRaw && total != null && total <= perPage * page) break;
    }

    const total_non_admin = total == null ? null : Math.max(0, Number(total || 0) - Number(adminSeen || 0));
    return send(res, 200, {
      ok: true,
      mode: onlyReal ? "real" : "all",
      total: total ?? null,
      total_non_admin,
      total_filtered,
      count: items.length,
      items,
    });
  }

  async function handleUserDetail(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const emailRaw = (pickQuery(req, "email") || "").toString().trim().toLowerCase();
    const userIdRaw = (pickQuery(req, "user_id") || pickQuery(req, "id") || "").toString().trim();
    if (!emailRaw && !userIdRaw) return send(res, 400, { error: "Falta email o user_id" });

    const supabaseUrl = String((auth as any)?.supabaseUrl || "").trim();
    const supabaseService = String((auth as any)?.supabaseService || "").trim();
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase Auth" });

    const perPage = 200;
    const maxPages = 25;
    let found: any = null;
    for (let page = 1; page <= maxPages; page++) {
      const r = await listUsersViaHttp(supabaseUrl, supabaseService, page, perPage);
      if (!r.ok) return send(res, r.status, { error: explainAuthAdminError({ message: r.error }), detail: r.detail || null });
      const users = Array.isArray(r.users) ? r.users : [];
      if (!users.length) break;
      found =
        users.find((u: any) => (userIdRaw ? String(u?.id || "").trim() === userIdRaw : false)) ||
        users.find((u: any) => (emailRaw ? String(u?.email || "").trim().toLowerCase() === emailRaw : false)) ||
        null;
      if (found) break;
    }
    if (!found) return send(res, 404, { error: "No encontré ese usuario." });
    const uid = String(found?.id || "").trim();
    if (!uid) return send(res, 404, { error: "No encontré ese usuario." });
    if (isAdminEmail(String(found?.email || "").trim().toLowerCase())) return send(res, 403, { error: "No puedes ver este usuario." });

    const meta = (found as any)?.user_metadata ?? (found as any)?.user_meta_data ?? (found as any)?.raw_user_meta_data ?? {};
    const full_name = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : "";
    const birthdate =
      typeof meta?.birthdate === "string"
        ? meta.birthdate
        : typeof meta?.birthday === "string"
          ? meta.birthday
          : typeof meta?.dob === "string"
            ? meta.dob
            : "";

    const admin = (auth as any).admin;
    const prof = await admin.from("profiles").select("*").eq("id", uid).maybeSingle();
    const internal_credits = prof.error ? null : round2(creditsFromProfile(prof.data));

    const plan = await getUserPlan(admin, uid).catch(() => ({
      plan_key: "ninguno",
      downloads_allowed: false,
      plan_active: false,
      plan_expires_at: null,
      hasProductor: false,
    }));

    return send(res, 200, {
      ok: true,
      user: {
        id: uid,
        email: String(found?.email || ""),
        created_at: String(found?.created_at || ""),
        last_sign_in_at: String(found?.last_sign_in_at || ""),
        full_name: String(full_name || "").slice(0, 120),
        birthdate: String(birthdate || "").slice(0, 32),
      },
      internal_credits,
      plan: {
        plan_key: String((plan as any)?.plan_key || "ninguno"),
        plan_active: Boolean((plan as any)?.plan_active),
        plan_expires_at: (plan as any)?.plan_expires_at ?? null,
        downloads_allowed: Boolean((plan as any)?.downloads_allowed),
      },
    });
  }

  async function handleDeleteUser(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req);
    if (!body) return send(res, 400, { error: "Body inválido" });
    const email = (body?.email || "").toString().trim().toLowerCase();
    if (!email) return send(res, 400, { error: "Falta email" });
    if (isAdminEmail(email)) return send(res, 403, { error: "No puedes borrar este usuario." });

    const supabaseUrl = String((auth as any)?.supabaseUrl || "").trim();
    const supabaseService = String((auth as any)?.supabaseService || "").trim();
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase Auth" });

    const found = await findUserIdByEmail(auth, email);
    if (!found.ok) return send(res, found.status, { error: found.error, detail: (found as any)?.detail || null });
    const uid = found.userId;

    const del = await deleteUserViaHttp(supabaseUrl, supabaseService, uid);
    if (!del.ok) return send(res, del.status, { error: "No pude borrar el usuario", detail: del.detail || del.error || null });

    const admin = (auth as any).admin;
    try {
      await admin.from("profiles").delete().eq("id", uid);
    } catch {
    }
    try {
      await admin.from("mp_transactions").delete().eq("user_id", uid);
    } catch {
    }
    try {
      await admin.from("library_items").delete().eq("user_id", uid);
    } catch {
    }
    try {
      await admin.from("suno_tasks").delete().eq("user_id", uid);
    } catch {
    }
    try {
      await admin.from("support_feedback").delete().eq("user_id", uid);
    } catch {
    }

    return send(res, 200, { ok: true, user_id: uid, email });
  }

  async function handlePruneUsers(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
    const auth = await requireAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const body = parseJsonBody(req) || {};
    const mode = String(body?.mode || "dry").trim().toLowerCase(); // dry | execute
    const days = Math.max(0, Math.min(Number(body?.days ?? 7) || 7, 365));
    const limit = Math.max(1, Math.min(Number(body?.limit ?? 500) || 500, 5000));

    const supabaseUrl = String((auth as any)?.supabaseUrl || "").trim();
    const supabaseService = String((auth as any)?.supabaseService || "").trim();
    if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase Auth" });

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffMs = cutoff.getTime();

    const admin = (auth as any).admin;
    const realIds = await buildRealUserIdSet(admin);
    const safeTime = (s: any) => {
      const v = typeof s === "string" ? s : "";
      if (!v) return 0;
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : 0;
    };

    const candidates: Array<{ id: string; email: string; created_at: string; last_sign_in_at: string }> = [];
    const perPage = 200;
    const maxPages = 50;
    for (let page = 1; page <= maxPages; page++) {
      const r = await listUsersViaHttp(supabaseUrl, supabaseService, page, perPage);
      if (!r.ok) return send(res, r.status, { error: explainAuthAdminError({ message: r.error }), detail: r.detail || null });
      const users = Array.isArray(r.users) ? r.users : [];
      if (!users.length) break;
      for (const u of users) {
        const email = String(u?.email || "").trim();
        if (!email) continue;
        if (isAdminEmail(email)) continue;
        const uid = String(u?.id || "").trim();
        if (!uid) continue;
        if (realIds.has(uid)) continue;
        const createdAt = String(u?.created_at || "");
        const lastSignInAt = String(u?.last_sign_in_at || "");
        const createdMs = safeTime(createdAt);
        const lastSignInMs = safeTime(lastSignInAt);
        const isRecent = (createdMs > 0 && createdMs >= cutoffMs) || (lastSignInMs > 0 && lastSignInMs >= cutoffMs);
        if (isRecent) continue;
        candidates.push({ id: uid, email, created_at: createdAt, last_sign_in_at: lastSignInAt });
        if (candidates.length >= limit && mode === "execute") break;
      }
      if (candidates.length >= limit && mode === "execute") break;
      if (typeof r.total === "number" && Number.isFinite(r.total) && r.total <= perPage * page) break;
    }

    if (mode !== "execute") {
      return send(res, 200, {
        ok: true,
        mode: "dry",
        days,
        found: candidates.length,
        preview: candidates.slice(0, 50).map((x) => ({ email: x.email, created_at: x.created_at, last_sign_in_at: x.last_sign_in_at })),
      });
    }

    let deleted = 0;
    let failed = 0;
    const failedEmails: string[] = [];
    const did = candidates.slice(0, limit);
    for (const c of did) {
      const del = await deleteUserViaHttp(supabaseUrl, supabaseService, c.id);
      if (!del.ok) {
        failed += 1;
        failedEmails.push(c.email);
        continue;
      }
      deleted += 1;
      try {
        await admin.from("profiles").delete().eq("id", c.id);
      } catch {
      }
      try {
        await admin.from("mp_transactions").delete().eq("user_id", c.id);
      } catch {
      }
      try {
        await admin.from("library_items").delete().eq("user_id", c.id);
      } catch {
      }
    }

    return send(res, 200, { ok: true, mode: "execute", days, attempted: did.length, deleted, failed, failed_emails: failedEmails.slice(0, 20) });
  }

  return async function handler(req: any, res: any) {
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
    if (a === "diag") return handleDiag(req, res);
    if (a === "grant-credits") return handleGrantCredits(req, res);
    if (a === "transfer-credits") return handleTransferCredits(req, res);
    if (a === "set-plan") return handleSetPlan(req, res);
    if (a === "feedback") return handleFeedback(req, res);
    if (a === "feedback-mark-read") return handleFeedbackMarkRead(req, res);
    if (a === "users") return handleUsers(req, res);
    if (a === "user-detail") return handleUserDetail(req, res);
    if (a === "delete-user") return handleDeleteUser(req, res);
    if (a === "prune-users") return handlePruneUsers(req, res);
    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

const aiHandler = (() => {
  function send(res: any, status: number, body: any) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
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

  async function requireUser(req: any) {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
    }

    const token = getAuthToken(req);
    if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

    const createClient = await getSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    return { ok: true as const, user, admin };
  }

  const toBase64 = (buf: ArrayBuffer) => Buffer.from(buf).toString("base64");

  const safeUrl = (u: string) => {
    try {
      const url = new URL(u);
      if (!(url.protocol === "https:" || url.protocol === "http:")) return null;
      return url.toString();
    } catch {
      return null;
    }
  };

  const normalizeAudioMimeType = (raw: string) => {
    const s = (raw || "").toString().trim().toLowerCase();
    if (!s) return "";
    const mime = s.split(";")[0].trim();
    if (!mime) return "";
    if (mime === "audio/mp3") return "audio/mpeg";
    if (mime === "audio/x-m4a") return "audio/mp4";
    if (mime === "audio/m4a") return "audio/mp4";
    if (mime === "video/mp4") return "audio/mp4";
    if (mime.startsWith("audio/")) return mime;
    return "";
  };

  async function transcribeLyricsWithGemini(audioBuf: ArrayBuffer, mimeType: string) {
    const apiKey = (process.env.GEMINI_API_KEY || "").toString().trim();
    if (!apiKey) {
      return {
        ok: false as const,
        error: "Falta GEMINI_API_KEY en Vercel",
        userMessage: "La transcripción no está configurada. Falta GEMINI_API_KEY en Vercel.",
      };
    }

    const mod: any = await import("@google/genai");
    const GoogleGenAI = mod?.GoogleGenAI || mod?.default?.GoogleGenAI;
    if (!GoogleGenAI) return { ok: false as const, error: "No pude cargar Gemini (@google/genai)" };

    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction =
      "Eres un experto en transcripción de audio difícil (con ruido, eco, baja calidad y voces mezcladas). " +
      "Debes limpiar el ruido mentalmente y enfocarte en la coherencia de las frases. " +
      "No inventes contenido: si una palabra no se entiende, usa [inaudible]. " +
      "Entrega únicamente la letra, sin explicaciones.";
    const prompt =
      "Transcribe únicamente la letra cantada en este audio. " +
      "Respeta saltos de línea. " +
      "Si identificas estructura, usa etiquetas como [Verso], [Coro], [Puente]. " +
      "Si NO hay voz/canto, responde exactamente: SIN_LETRA. " +
      "Si el audio es de plano ilegible y no se puede transcribir, responde exactamente: ILEGIBLE.";

    const mime = normalizeAudioMimeType(mimeType) || "audio/mpeg";
    const baseModels = [
      "gemini-3.1-flash-lite-preview",
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
      "gemini-3-flash-preview",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-1.5-flash",
      "gemini-pro-latest",
      "gemini-3.1-pro-preview",
    ];

    let lastErr: any = null;
    for (const base of baseModels) {
      const modelsToTry = base.startsWith("models/") ? [base] : [base, `models/${base}`];
      try {
        let r: any = null;
        let ok = false;
        for (const model of modelsToTry) {
          try {
            r = await ai.models.generateContent({
              model,
              systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
              contents: [
                {
                  role: "user",
                  parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: toBase64(audioBuf) } }],
                },
              ],
            });
            ok = true;
            break;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            lastErr = msg;
            const lower = msg.toLowerCase();
            const is404 = lower.includes("404") || lower.includes("not found");
            if (is404) continue;
            throw e;
          }
        }
        if (!ok) {
          const msg = String(lastErr || "Modelo no disponible");
          return {
            ok: false as const,
            error: msg,
            userMessage:
              "No pude encontrar un modelo de transcripción disponible (404). " +
              "Esto puede pasar si el modelo cambió o tu API Key no tiene acceso. Intenta de nuevo en unos minutos.",
          };
        }

        const text = String(r?.text || "").trim();
        if (!text) {
          return {
            ok: false as const,
            error: "Gemini no devolvió texto",
            userMessage: "No pude transcribir la letra. Intenta con un audio más claro o más corto.",
          };
        }
        const upper = text.toUpperCase();
        if (upper === "SIN_LETRA") return { ok: true as const, lyrics: "", status: "SIN_LETRA" as const };
        if (upper === "ILEGIBLE") return { ok: true as const, lyrics: "", status: "ILEGIBLE" as const };
        return { ok: true as const, lyrics: text, status: "OK" as const };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastErr = msg;
        const lower = msg.toLowerCase();
        const is404 = lower.includes("404") || lower.includes("not found");
        if (is404) {
          continue;
        }
        const is401 = lower.includes("401") || lower.includes("unauthorized");
        const is403 = lower.includes("403") || lower.includes("permission") || lower.includes("forbidden");
        const is429 = lower.includes("429") || lower.includes("rate limit") || lower.includes("quota");
        const userMessage = is429
          ? "La transcripción está saturada en este momento. Intenta de nuevo en unos minutos."
          : is401 || is403
            ? "La transcripción no está disponible por permisos (API Key). Revisa tu GEMINI_API_KEY en Vercel."
            : "No pude transcribir la letra. Intenta con un audio más claro o más corto.";
        return { ok: false as const, error: msg, userMessage };
      }
    }

    return {
      ok: false as const,
      error: String(lastErr || "Modelo no disponible"),
      userMessage:
        "La transcripción no está disponible en este momento. " +
        "Si sigue igual, revisa que GEMINI_API_KEY esté bien configurada en Vercel y vuelve a intentar.",
    };
  }

  async function handleTranscribeLyrics(req: any, res: any) {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const payload = parseJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const uploadUrl = typeof payload?.uploadUrl === "string" ? payload.uploadUrl.trim() : "";
    const mimeTypeHint = typeof payload?.mimeType === "string" ? payload.mimeType.trim() : "";
    const url = safeUrl(uploadUrl);
    if (!url) return send(res, 400, { error: "uploadUrl inválido" });

    try {
      const fr = await fetch(url);
      if (!fr.ok) return send(res, 502, { error: "No pude leer tu audio", detail: `HTTP ${fr.status}` });

      const contentType = (fr.headers.get("content-type") || "").toString();
      const mimeType = normalizeAudioMimeType(mimeTypeHint) || normalizeAudioMimeType(contentType) || "audio/mpeg";
      const ab = await fr.arrayBuffer();
      const size = ab.byteLength || 0;
      if (size <= 0) return send(res, 400, { error: "El audio está vacío" });
      if (size > 15 * 1024 * 1024) return send(res, 413, { error: "Audio muy pesado para transcribir. Sube un fragmento más corto." });

      const out = await transcribeLyricsWithGemini(ab, mimeType);
      if (!out.ok) return send(res, 200, { ok: false, error: out.error || "No pude transcribir", message: (out as any).userMessage || "No pude transcribir la letra." });
      if ((out as any).status === "ILEGIBLE") return send(res, 200, { ok: true, lyrics: "", status: "ILEGIBLE", message: "No pude entender la letra con este audio. Prueba con un fragmento más corto o con menos ruido." });
      if ((out as any).status === "SIN_LETRA") return send(res, 200, { ok: true, lyrics: "", status: "SIN_LETRA", message: "No detecté voz/canto en ese audio." });
      return send(res, 200, { ok: true, lyrics: out.lyrics || "", status: "OK" });
    } catch (e) {
      return send(res, 200, {
        ok: false,
        error: "Error transcribiendo",
        message: "No pude transcribir la letra. Intenta con un audio más claro o más corto.",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return async function handler(req: any, res: any) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];
    if (head !== "ai") return send(res, 404, { error: "Ruta no encontrada" });

    let action = "";
    try {
      action = (new URL(req.url, "http://localhost").searchParams.get("action") || "").toString();
    } catch {
      action = "";
    }
    action = action.trim().toLowerCase();
    const a = action || (next || "").toLowerCase();
    if (a === "transcribe-lyrics") return handleTranscribeLyrics(req, res);
    return send(res, 404, { error: "Ruta no encontrada" });
  };
})();

function sendNotFound(res: any) {
  res.statusCode = 404;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: "Ruta no encontrada" }));
}

export default async function handler(req: any, res: any) {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);

    const isApi = parts[0] === "api";
    const head = isApi ? parts[1] : parts[0];
    const next = isApi ? parts[2] : parts[1];

    if (head === "suno") return sunoHandler(req, res);
    if (head === "mercadopago") return mercadoPagoHandler(req, res);
    if (head === "library") return libraryHandler(req, res);
    if (head === "videos") return videosHandler(req, res);
    if (head === "admin") return adminHandler(req, res);
    if (head === "support") return supportHandler(req, res);
    if (head === "ai") return aiHandler(req, res);
    if (head === "share" && next === "song") return shareHandler(req, res);
    if (head === "account" && next === "bootstrap-profile") return bootstrapProfileHandler(req, res);
    if (head === "account" && next === "balance") return balanceHandler(req, res);
    if (head === "webhooks" && next === "suno") return sunoWebhookHandler(req, res);

    return sendNotFound(res);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Error interno", detail: e instanceof Error ? e.message : String(e) }));
  }
}
