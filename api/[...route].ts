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

function pickWritableCreditsColumn(profile: any): "zingy_credits" | "ramber_credits" | "credits" | null {
  const p = profile ?? {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k);
  if (has("ramber_credits")) return "ramber_credits";
  if (has("zingy_credits")) return "zingy_credits";
  if (has("credits")) return "credits";
  return null;
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

async function providerFetchJson(path: string, init?: RequestInit) {
  const base = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
  if (!base) throw new Error("Falta SUNO_API_BASE_URL en variables de entorno");

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

    const current = creditsFromProfile(profile);
    const next = round2(Math.max(0, current + delta));
    const col = pickWritableCreditsColumn(profile);
    if (!col) return { ok: false as const, error: "Falta columna de créditos en profiles (zingy_credits o ramber_credits)." };

    const { error: updErr } = await admin.from("profiles").update({ [col]: next }).eq("id", userId);

    if (!updErr) return { ok: true as const, credits: next };
  }

  return { ok: false as const, error: "No pude actualizar créditos (intenta otra vez)." };
}

async function consumeUserCredits(admin: any, userId: string, costCredits: number) {
  const cost = round2(Number(costCredits));
  if (!Number.isFinite(cost) || cost <= 0) return { ok: true as const };

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (readErr) return { ok: false as const, error: readErr.message };

    const current = creditsFromProfile(profile);
    if (current < cost) return { ok: false as const, error: "Créditos insuficientes. Recarga para continuar.", credits: current };

    const next = round2(Math.max(0, current - cost));
    const col = pickWritableCreditsColumn(profile);
    if (!col) return { ok: false as const, error: "Falta columna de créditos en profiles (zingy_credits o ramber_credits)." };

    const { error: updErr } = await admin.from("profiles").update({ [col]: next }).eq("id", userId);
    if (!updErr) return { ok: true as const, credits: next };
  }

  return { ok: false as const, error: "No pude consumir créditos (intenta otra vez)." };
}

function isAdminEmail(email?: string | null) {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;

  const raw = (typeof process !== "undefined" && (process as any)?.env && ((process as any).env.ADMIN_EMAILS || (process as any).env.ADMIN_EMAIL)) || "";
  const list = String(raw)
    .split(/[,\s]+/g)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  if (list.length === 0) {
    return e === "rubenfiverr612@gmail.com";
  }
  return list.includes(e);
}

async function getUserPlan(admin: any, userId: string) {
  const { data: tx } = await admin.from("mp_transactions").select("payment_id, pack_key, kind").eq("user_id", userId).eq("kind", "songs").limit(200);
  const rows = Array.isArray(tx) ? tx : [];

  const free_claimed = rows.some((t: any) => {
    const pid = typeof t?.payment_id === "string" ? t.payment_id : "";
    const pk = typeof t?.pack_key === "string" ? t.pack_key : "";
    return pid.startsWith("claim:") || pk === "gratis" || pk === "free";
  });
  const hasInicio = rows.some((t: any) => String(t?.pack_key || "").toLowerCase() === "inicio");
  const hasProductor = rows.some((t: any) => String(t?.pack_key || "").toLowerCase() === "productor");
  const plan_key = hasProductor ? "productor" : hasInicio ? "inicio" : free_claimed ? "gratis" : "ninguno";
  const downloads_allowed = plan_key === "inicio" || plan_key === "productor";

  return { plan_key, downloads_allowed, free_claimed };
}

async function getSupabaseCreateClient() {
  const mod = await import("@supabase/supabase-js");
  return mod.createClient;
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
        .replaceAll(" ", "")
        .replaceAll(",", ".");
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  async function sunoFetchJson(path: string, init?: RequestInit) {
    const base = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
    if (!base) throw new Error("Falta SUNO_API_BASE_URL en variables de entorno");

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

    const auth = await requireUser(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });

    const paymentId = `claim:${auth.user.id}`;
    const { data: exists } = await auth.admin.from("mp_transactions").select("id").eq("payment_id", paymentId).limit(1);
    if (Array.isArray(exists) && exists.length > 0) return send(res, 200, { ok: true, already: true });

    const credits = CREDIT_COSTS.generate_music * 5;
    const upd = await adjustUserCredits(auth.admin, auth.user.id, credits);
    if (!upd.ok) return send(res, 500, { error: upd.error || "No pude acreditar créditos" });

    await auth.admin.from("mp_transactions").insert({
      user_id: auth.user.id,
      kind: "songs",
      pack_key: "gratis",
      amount_mxn: 0,
      payment_id: paymentId,
    });

    return send(res, 200, { ok: true, credited: true, credits });
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

    const { data: freeTx } = await admin.from("mp_transactions").select("payment_id, pack_key").eq("user_id", user.id).eq("kind", "songs").limit(50);
    const free_claimed =
      Array.isArray(freeTx) &&
      freeTx.some((t: any) => {
        const pid = typeof t?.payment_id === "string" ? t.payment_id : "";
        const pk = typeof t?.pack_key === "string" ? t.pack_key : "";
        return pid.startsWith("claim:") || pk === "gratis" || pk === "free";
      });
    const hasInicio = Array.isArray(freeTx) && freeTx.some((t: any) => String(t?.pack_key || "").toLowerCase() === "inicio");
    const hasProductor = Array.isArray(freeTx) && freeTx.some((t: any) => String(t?.pack_key || "").toLowerCase() === "productor");
    const plan_key = hasProductor ? "productor" : hasInicio ? "inicio" : free_claimed ? "gratis" : "ninguno";
    const downloads_allowed = plan_key === "inicio" || plan_key === "productor";
    const show_free_claim_popup = !is_admin && plan_key === "ninguno" && !free_claimed;

    let { data: profile, error: profErr } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (profErr) return send(res, 500, { error: "Error consultando saldo", detail: profErr.message });

    if (!profile) {
      const base: any = { id: user.id };
      base.ramber_credits = 0;
      const { error: insErr } = await admin.from("profiles").upsert(base, { onConflict: "id" });
      if (insErr && String(insErr.message || "").toLowerCase().includes("column")) {
        const { error: insErr2 } = await admin.from("profiles").upsert({ id: user.id }, { onConflict: "id" });
        if (insErr2) return send(res, 500, { error: "Error creando perfil", detail: insErr2.message });
      } else if (insErr) {
        return send(res, 500, { error: "Error creando perfil", detail: insErr.message });
      }
      const r2 = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
      profile = r2.data ?? null;
    }

    const credits = round2(creditsFromProfile(profile));
    const counts = toCounts(credits);
    return send(res, 200, {
      credits,
      song_balance: counts.songs,
      counts,
      downloads_allowed,
      free_claimed,
      show_free_claim_popup,
      plan_key,
      mp4_watermark_disabled: hasProductor,
      is_admin,
      source: "local",
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
      const payloadBase: any = { id: user.id };
      payloadBase.ramber_credits = 0;

      const up = await admin.from("profiles").upsert(payloadBase, { onConflict: "id" });
      if (up.error) {
        const msg = String(up.error.message || "");
        if (msg.toLowerCase().includes("column")) {
          const up2 = await admin.from("profiles").upsert({ id: user.id }, { onConflict: "id" });
          if (up2.error) return send(res, 500, { error: "No pude crear perfil", detail: up2.error.message });
          return send(res, 200, { ok: true, created: true });
        }
        return send(res, 500, { error: "No pude crear perfil", detail: up.error.message });
      }

      return send(res, 200, { ok: true, created: true });
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
    return { ok: true as const, user, admin };
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

    const { data: sampleProfiles } = await admin.from("profiles").select("*").limit(1);
    const sample = Array.isArray(sampleProfiles) ? sampleProfiles[0] : null;
    const createdCol = sample && typeof sample?.created_at === "string" ? "created_at" : "created_at";
    const activeCol =
      sample && typeof sample?.last_seen_at === "string"
        ? "last_seen_at"
        : sample && typeof sample?.updated_at === "string"
          ? "updated_at"
          : sample && typeof sample?.created_at === "string"
            ? "created_at"
            : "updated_at";

    let totalCount = 0;
    try {
      const r = await admin.from("profiles").select("id", { count: "exact", head: true });
      if (!r.error) totalCount = Number(r.count || 0);
    } catch {
      totalCount = 0;
    }

    let active30dCount = 0;
    try {
      const r = await admin.from("profiles").select("id", { count: "exact", head: true }).gte(activeCol, start30d.toISOString());
      if (!r.error) active30dCount = Number(r.count || 0);
    } catch {
      active30dCount = 0;
    }

    let new7dCount = 0;
    try {
      const r = await admin.from("profiles").select("id", { count: "exact", head: true }).gte(createdCol, startWeek.toISOString());
      if (!r.error) new7dCount = Number(r.count || 0);
    } catch {
      new7dCount = 0;
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
    let userId = "";
    try {
      const r = await (admin as any).auth?.admin?.getUserByEmail?.(email);
      userId = String(r?.data?.user?.id || "").trim();
    } catch {
      userId = "";
    }

    if (!userId) return send(res, 404, { error: "No encontré ese usuario por correo." });

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
    if (a === "grant-credits") return handleGrantCredits(req, res);
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
    if (head === "admin") return adminHandler(req, res);
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
