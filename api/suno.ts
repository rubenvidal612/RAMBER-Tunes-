import { createClient } from "@supabase/supabase-js";
import { CREDIT_COSTS, adjustUserCredits, consumeUserCredits } from "../src/lib/credits";
import { isAdminEmail } from "../src/lib/authz";

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
  if (!audioId) return send(res, 400, { error: "Falta audioId" });

  const mv = typeof payload?.mv === "string" ? payload.mv.trim() : "";
  const modelRaw = typeof payload?.model === "string" ? payload.model.trim() : "";
  const model = normalizeModel(modelRaw || mv);

  const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
  const defaultParamFlag = typeof payload?.defaultParamFlag === "boolean" ? payload.defaultParamFlag : true;

  const continueAtRaw = Number(payload?.continueAt);
  const continueAt = Number.isFinite(continueAtRaw) ? Math.max(0, Math.floor(continueAtRaw)) : null;

  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
  const style = typeof payload?.style === "string" ? payload.style.trim() : "";
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";

  const promptLimit = model === "V4" ? 3000 : 5000;
  const styleLimit = model === "V4" ? 200 : 1000;
  const titleLimit = model === "V4" || model === "V4_5ALL" ? 80 : 100;

  const body: any = { defaultParamFlag, audioId, model, callBackUrl };

  if (defaultParamFlag) {
    if (!prompt) return send(res, 400, { error: "Falta prompt" });
    if (prompt.length > promptLimit) return send(res, 400, { error: `El prompt máximo es ${promptLimit} caracteres.` });
    if (!style) return send(res, 400, { error: "Falta style" });
    if (style.length > styleLimit) return send(res, 400, { error: `El style máximo es ${styleLimit} caracteres.` });
    if (!title) return send(res, 400, { error: "Falta title" });
    if (title.length > titleLimit) return send(res, 400, { error: `El title máximo es ${titleLimit} caracteres.` });
    if (continueAt === null || continueAt <= 0) return send(res, 400, { error: "Falta continueAt (segundos)." });

    body.prompt = prompt.slice(0, promptLimit);
    body.style = style.slice(0, styleLimit);
    body.title = title.slice(0, titleLimit);
    body.continueAt = continueAt;
  }

  const negativeTags = typeof payload?.negativeTags === "string" ? payload.negativeTags.trim() : "";
  if (negativeTags) body.negativeTags = negativeTags.slice(0, 1000);

  const personaId = typeof payload?.personaId === "string" ? payload.personaId.trim() : "";
  if (personaId) body.personaId = personaId.slice(0, 200);

  const personaModel = typeof payload?.personaModel === "string" ? payload.personaModel.trim() : "";
  if (personaModel) {
    const pm = personaModel.slice(0, 200);
    if (pm === "voice_persona" && !(model === "V5" || model === "V5_5")) {
      return send(res, 400, { error: "personaModel=voice_persona solo está disponible con modelos V5/V5.5." });
    }
    body.personaModel = pm;
  }

  const vocalGender = typeof payload?.vocalGender === "string" ? payload.vocalGender.trim().toLowerCase() : "";
  if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender;

  const styleWeight = Number(payload?.styleWeight);
  if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
  const weirdnessConstraint = Number(payload?.weirdnessConstraint);
  if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
  const audioWeight = Number(payload?.audioWeight);
  if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);

  const user = auth.user;
  const isAdmin = isAdminEmail(user.email);
  const cost = CREDIT_COSTS.extend_music;

  try {
    if (!isAdmin) {
      const consumed = await consumeUserCredits(auth.admin, user.id, cost);
      if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
    }

    const { res: r, data, text } = await sunoFetchJson("/api/v1/generate/extend", {
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

  const uploadUrl = typeof payload?.uploadUrl === "string" ? payload.uploadUrl.trim() : "";
  if (!uploadUrl) return send(res, 400, { error: "Falta uploadUrl" });

  const instrumental = Boolean(payload?.instrumental);
  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
  const style = typeof payload?.style === "string" ? payload.style.trim() : "";
  const title = typeof payload?.title === "string" ? payload.title.trim() : "Untitled";
  const model = normalizeModel(typeof payload?.model === "string" ? payload.model : payload?.mv);
  const vocalGender = typeof payload?.vocalGender === "string" ? payload.vocalGender.trim().toLowerCase() : "";
  const styleWeight = Number(payload?.styleWeight);
  const weirdnessConstraint = Number(payload?.weirdnessConstraint);
  const audioWeight = Number(payload?.audioWeight);

  const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");

  const body: any = {
    uploadUrl,
    customMode: true,
    callBackUrl,
    model,
    instrumental,
    style: (style || "General").slice(0, 1000),
    title: title.slice(0, 100),
  };
  if (!instrumental) body.prompt = (prompt || " ").slice(0, 5000);
  if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender;
  if (Number.isFinite(styleWeight)) body.styleWeight = clamp01(styleWeight);
  if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = clamp01(weirdnessConstraint);
  if (Number.isFinite(audioWeight)) body.audioWeight = clamp01(audioWeight);

  const personaId = typeof payload?.personaId === "string" ? payload.personaId.trim() : "";
  if (personaId) body.personaId = personaId.slice(0, 200);
  const personaModel = typeof payload?.personaModel === "string" ? payload.personaModel.trim() : "";
  if (personaModel) {
    const pm = personaModel.slice(0, 200);
    if (pm === "voice_persona" && !(model === "V5" || model === "V5_5")) {
      return send(res, 400, { error: "personaModel=voice_persona solo está disponible con modelos V5/V5.5." });
    }
    body.personaModel = pm;
  }

  const user = auth.user;
  const isAdmin = isAdminEmail(user.email);
  const cost = CREDIT_COSTS.upload_and_cover;

  try {
    if (!isAdmin) {
      const consumed = await consumeUserCredits(auth.admin, user.id, cost);
      if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
    }

    const { res: r, data, text } = await sunoFetchJson("/api/v1/generate/upload-cover", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error transformando audio", code: r.status, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(data, "Error del proveedor");
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error transformando audio", code, detail: String(msg).slice(0, 1200) });
    }

    const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
    if (!taskId) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Respuesta inválida del proveedor" });
    }

    await auth.admin.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "upload_cover", cost, consumed: true });
    return send(res, 200, { taskId });
  } catch (e) {
    if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
    return send(res, 502, { error: "Error transformando audio", detail: e instanceof Error ? e.message : String(e) });
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
  const typeRaw = typeof payload?.type === "string" ? payload.type.trim() : "separate_vocal";
  const type = typeRaw || "separate_vocal";
  if (!taskId) return send(res, 400, { error: "Falta taskId" });
  if (!audioId) return send(res, 400, { error: "Falta audioId" });
  if (!(type === "separate_vocal" || type === "split_stem")) return send(res, 400, { error: "type inválido. Usa 'separate_vocal' o 'split_stem'." });

  const user = auth.user;
  const isAdmin = isAdminEmail(user.email);

  if (!isAdmin) {
    const { data: paidTx, error: paidErr } = await auth.admin
      .from("mp_transactions")
      .select("payment_id")
      .eq("user_id", user.id)
      .eq("kind", "songs")
      .eq("pack_key", "productor")
      .gt("amount_mxn", 0)
      .limit(1);
    if (paidErr) return send(res, 500, { error: paidErr.message });
    const ok = Array.isArray(paidTx) && paidTx.length > 0;
    if (!ok) return send(res, 403, { error: "Necesitas el Pack Productor ($545) para Karaoke y STEMS.", needPlan: true });
  }

  const cost = type === "split_stem" ? CREDIT_COSTS.split_stem : CREDIT_COSTS.separate_vocal;
  const callBackUrl = absoluteUrlFromReq(req, "/api/webhooks/suno");
  const body = { taskId, audioId, type, callBackUrl };

  try {
    if (!isAdmin) {
      const consumed = await consumeUserCredits(auth.admin, user.id, cost);
      if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
    }

    const { res: r, data, text } = await sunoFetchJson("/api/v1/vocal-removal/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error separando pistas", code: r.status, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(data, "Error del proveedor");
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error separando pistas", code, detail: String(msg).slice(0, 1200) });
    }

    const outTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
    if (!outTaskId) {
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Respuesta inválida del proveedor" });
    }

    await auth.admin.from("suno_tasks").insert({
      task_id: outTaskId,
      user_id: user.id,
      kind: "separate",
      cost,
      consumed: true,
      parent_task_id: taskId,
    });

    return send(res, 200, { taskId: outTaskId });
  } catch (e) {
    if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
    return send(res, 502, { error: "Error separando pistas", detail: e instanceof Error ? e.message : String(e) });
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
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const description = typeof payload?.description === "string" ? payload.description.trim() : "";
  const style = typeof payload?.style === "string" ? payload.style.trim() : "";
  const saveToLibrary = Boolean(payload?.saveToLibrary);

  if (!taskId) return send(res, 400, { error: "Falta taskId" });
  if (!audioId) return send(res, 400, { error: "Falta audioId" });
  if (!name) return send(res, 400, { error: "Falta name" });
  if (!description) return send(res, 400, { error: "Falta description" });

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const vocalStartRaw = Number(payload?.vocalStart);
  const vocalEndRaw = Number(payload?.vocalEnd);
  const hasVocalRange = Number.isFinite(vocalStartRaw) || Number.isFinite(vocalEndRaw);
  const vocalStart = Number.isFinite(vocalStartRaw) ? clamp(vocalStartRaw, 0, 10_000) : 0;
  const vocalEnd = Number.isFinite(vocalEndRaw) ? clamp(vocalEndRaw, 0, 10_000) : 30;
  if (hasVocalRange) {
    const len = vocalEnd - vocalStart;
    if (!(len >= 10 && len <= 30)) return send(res, 400, { error: "El rango vocalEnd - vocalStart debe ser entre 10 y 30 segundos." });
  }

  const body: any = { taskId, audioId, name: name.slice(0, 120), description: description.slice(0, 2000) };
  if (style) body.style = style.slice(0, 200);
  if (hasVocalRange) {
    body.vocalStart = vocalStart;
    body.vocalEnd = vocalEnd;
  }

  const user = auth.user;

  try {
    let r = await sunoFetchJson("/api/v1/generate/persona", { method: "POST", body: JSON.stringify(body) });
    if (r.res.status === 404) {
      r = await sunoFetchJson("/api/v1/generate/generate-persona", { method: "POST", body: JSON.stringify(body) });
    }

    if (!r.res.ok) {
      const msg = sunoErrorMessage(r.data, r.text || `HTTP ${r.res.status}`);
      return send(res, 502, { error: "Error creando persona", code: r.res.status, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(r.data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(r.data, "Error del proveedor");
      const st = code === 409 ? 409 : 502;
      return send(res, st, { error: "Error creando persona", code, detail: String(msg).slice(0, 1200) });
    }

    const personaId =
      (typeof r.data?.data?.personaId === "string" ? r.data.data.personaId : "") ||
      (typeof r.data?.data?.persona_id === "string" ? r.data.data.persona_id : "") ||
      (typeof r.data?.data?.id === "string" ? r.data.data.id : "");
    if (!personaId) return send(res, 502, { error: "Respuesta inválida del proveedor" });

    const { error } = await auth.admin.from("suno_personas").upsert(
      {
        user_id: user.id,
        task_id: taskId,
        audio_id: audioId,
        persona_id: personaId,
        name: name.slice(0, 120),
        description: description.slice(0, 2000),
        style: style ? style.slice(0, 200) : null,
        vocal_start: hasVocalRange ? vocalStart : null,
        vocal_end: hasVocalRange ? vocalEnd : null,
      },
      { onConflict: "user_id,audio_id" },
    );
    if (error) return send(res, 500, { error: "No pude guardar la persona", detail: error.message });

    if (saveToLibrary) {
      const coverUrl = typeof payload?.coverUrl === "string" ? payload.coverUrl.trim() : "";
      const audioUrl = typeof payload?.audioUrl === "string" ? payload.audioUrl.trim() : "";
      const notesText = typeof payload?.notes === "string" ? payload.notes.trim() : "";
      await auth.admin.from("library_items").insert({
        user_id: user.id,
        type: "voice_persona",
        title: name.slice(0, 120),
        cover_url: coverUrl || null,
        audio_url: audioUrl || null,
        commercial_license: true,
        notes: JSON.stringify(
          { persona_id: personaId, persona_model: "voice_persona", description: description.slice(0, 2000), notes: notesText.slice(0, 2000), source: "suno_persona" },
          null,
          0,
        ),
      });
    }

    return send(res, 200, { personaId });
  } catch (e) {
    return send(res, 502, { error: "Error creando persona", detail: e instanceof Error ? e.message : String(e) });
  }
}

async function handleMp4(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

  const auth = await requireUser(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });

  const payload = parseJsonBody(req);
  if (!payload) return send(res, 400, { error: "Body inválido" });

  const taskId = firstString(payload, ["taskId", "task_id"]);
  const audioId = firstString(payload, ["audioId", "audio_id", "songId", "song_id"]);
  if (!taskId) return send(res, 400, { error: "Falta taskId" });
  if (!audioId) return send(res, 400, { error: "Falta audioId" });

  const author = firstString(payload, ["author"]);
  const domainName = firstString(payload, ["domainName", "domain_name"]);
  if (author.length > 50) return send(res, 400, { error: "author máximo 50 caracteres" });
  if (domainName.length > 50) return send(res, 400, { error: "domainName máximo 50 caracteres" });

  const user = auth.user;
  const isAdmin = isAdminEmail(user.email);
  const cost = CREDIT_COSTS.music_video;

  try {
    if (!isAdmin) {
      const consumed = await consumeUserCredits(auth.admin, user.id, cost);
      if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
    }

    const { res: r, data, text } = await sunoFetchJson("/api/v1/mp4/generate", {
      method: "POST",
      body: JSON.stringify({ taskId, audioId, author: author || "RAMBER Tunes", domainName: domainName || "rambertunes" }),
    });

    if (!r.ok) {
      const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error convirtiendo a MP4", code: r.status, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(data, "Error del proveedor");
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error convirtiendo a MP4", code, detail: String(msg).slice(0, 1200) });
    }

    const convTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
    if (!convTaskId) {
      const snippet = data ? JSON.stringify(data).slice(0, 900) : (text || "").replaceAll(/\s+/g, " ").trim().slice(0, 900);
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Respuesta inválida del proveedor", code: 502, detail: snippet ? `Respuesta: ${snippet}` : "" });
    }

    await auth.admin.from("suno_tasks").insert({ task_id: convTaskId, user_id: user.id, kind: "mp4_generate", cost, consumed: true, parent_task_id: taskId });
    return send(res, 200, { ok: true, mp4Url: null, taskId: convTaskId, raw: data ?? null });
  } catch (e) {
    if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
    return send(res, 502, { error: "Error convirtiendo a MP4", detail: e instanceof Error ? e.message : String(e) });
  }
}

async function handleTask(req: any, res: any) {
  const method = (req.method || "GET").toUpperCase();
  if (!(method === "GET" || method === "POST")) return send(res, 405, { error: "Método no permitido" });

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseAnon) return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY)" });

  const token = getAuthToken(req);
  if (!token) return send(res, 401, { error: "No autorizado" });

  const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return send(res, 401, { error: "No autorizado" });

  const payload = method === "POST" ? parseJsonBody(req) : null;

  const taskId = (method === "GET" ? pickQuery(req, "taskId") : (typeof payload?.taskId === "string" ? payload.taskId : ""))?.trim();
  const kind = (method === "GET" ? pickQuery(req, "kind") : (typeof payload?.kind === "string" ? payload.kind : ""))?.trim();
  if (!taskId) return send(res, 400, { error: "Falta taskId" });

  const k = (kind || "generate").toLowerCase();
  const mapPath = () => {
    if (k === "separate" || k === "vocal-removal") return `/api/v1/vocal-removal/record-info?taskId=${encodeURIComponent(taskId)}`;
    if (k === "mp4" || k === "video") return `/api/v1/mp4/record-info?taskId=${encodeURIComponent(taskId)}`;
    if (k === "lyrics") return `/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`;
    return `/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`;
  };

  try {
    const { res: r, data, text } = await sunoFetchJson(mapPath(), { method: "GET" });
    if (!r.ok) {
      const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
      return send(res, 502, { error: "Error consultando tarea", code: r.status, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(data, "Error del proveedor");
      return send(res, 502, { error: "Error consultando tarea", code, detail: String(msg).slice(0, 1200) });
    }

    return send(res, 200, { data: data?.data ?? data });
  } catch (e) {
    return send(res, 502, { error: "Error consultando tarea", detail: e instanceof Error ? e.message : String(e) });
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
  if (!taskId) return send(res, 400, { error: "Falta taskId" });
  if (!audioId) return send(res, 400, { error: "Falta audioId" });

  const user = auth.user;
  const isAdmin = isAdminEmail(user.email);
  const cost = CREDIT_COSTS.timestamped_lyrics;

  try {
    if (!isAdmin) {
      const consumed = await consumeUserCredits(auth.admin, user.id, cost);
      if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
    }

    const { res: r, data, text } = await sunoFetchJson("/api/v1/generate/get-timestamped-lyrics", {
      method: "POST",
      body: JSON.stringify({ taskId, audioId }),
    });

    if (!r.ok) {
      const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error obteniendo letras con tiempo", code: r.status, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(data, "Error del proveedor");
      if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
      return send(res, 502, { error: "Error obteniendo letras con tiempo", code, detail: String(msg).slice(0, 1200) });
    }

    return send(res, 200, { data: data?.data ?? data });
  } catch (e) {
    if (!isAdmin) await adjustUserCredits(auth.admin, user.id, cost);
    return send(res, 502, { error: "Error obteniendo letras con tiempo", detail: e instanceof Error ? e.message : String(e) });
  }
}

async function handleCredits(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
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
    return send(res, 200, { credits });
  } catch (e) {
    return send(res, 502, { error: "Error consultando créditos", detail: e instanceof Error ? e.message : String(e) });
  }
}

export default async function handler(req: any, res: any) {
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
    if (a === "separate") return handleSeparate(req, res);
    if (a === "generate-persona") return handleGeneratePersona(req, res);
    if (a === "mp4") return handleMp4(req, res);
    if (a === "task") return handleTask(req, res);
    if (a === "timestamped-lyrics") return handleTimestampedLyrics(req, res);
    if (a === "credits") return handleCredits(req, res);

    return send(res, 404, { error: "Ruta no encontrada", action: a || null });
  } catch (e) {
    return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
  }
}
