import { createClient } from "@supabase/supabase-js";

function round2(n: number) {
  return Math.round(n * 100) / 100;
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

function pickWritableCreditsColumn(profile: any): "zingy_credits" | "ramber_credits" | "credits" | null {
  const p = profile ?? {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k);
  if (has("ramber_credits")) return "ramber_credits";
  if (has("zingy_credits")) return "zingy_credits";
  if (has("credits")) return "credits";
  return null;
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

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
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

async function sunoFetchJson(path: string, init: any = {}) {
  const baseEnv = (process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "").toString().trim();
  const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";
  const apiKey = sanitizeExternalUrl((process.env.SUNO_API_KEY || process.env.SUNO_KEY || "").toString().trim());
  if (!apiKey) throw new Error("Falta SUNO_API_KEY en las variables de entorno.");

  const headers = new Headers(init?.headers || {});
  if (!headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");

  const fullUrl = new URL(path.replace(/^\/+/, ""), base + (base.endsWith("/") ? "" : "/")).toString();
  const res = await fetch(fullUrl, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res, data, text };
}

function kindToQueryKind(kindRaw: string) {
  const k = (kindRaw || "").toLowerCase();
  if (k.includes("lyrics")) return "lyrics";
  if (k.includes("midi")) return "midi";
  if (k.includes("mp4") || k.includes("video")) return "mp4";
  if (k.includes("vocal-removal") || k.includes("separate") || k.includes("split_stem")) return "vocal-removal";
  if (k.includes("wav")) return "wav";
  return "generate";
}

function extractStatus(data: any, kind: string) {
  const statusRaw = data?.data?.status ?? data?.data?.successFlag ?? data?.data?.data?.status ?? data?.data?.data?.successFlag ?? "";
  if (kind === "midi") {
    const n = typeof statusRaw === "number" ? statusRaw : Number(String(statusRaw || "").trim());
    if (n === 0) return "PENDING";
    if (n === 1) return "SUCCESS";
    if (n === 2) return "CREATE_TASK_FAILED";
    if (n === 3) return "GENERATE_MIDI_FAILED";
  }
  return String(statusRaw || "").toUpperCase();
}

function isFailureStatus(status: string) {
  const s = String(status || "").toUpperCase();
  return (
    s === "FAILED" ||
    s === "CREATE_TASK_FAILED" ||
    s === "GENERATE_AUDIO_FAILED" ||
    s === "GENERATE_LYRICS_FAILED" ||
    s === "GENERATE_MIDI_FAILED" ||
    s === "GENERATE_MP4_FAILED" ||
    s === "GENERATE_WAV_FAILED" ||
    s === "CALLBACK_EXCEPTION" ||
    s === "SENSITIVE_WORD_ERROR"
  );
}

function extractSongsFromProviderPayload(payload: any) {
  const d = payload?.data || payload?.data?.data || payload;
  const candidates: any[] = [];
  if (Array.isArray(d?.response?.data)) candidates.push(d.response.data);
  if (Array.isArray(d?.response?.sunoData)) candidates.push(d.response.sunoData);
  if (Array.isArray(d?.response)) candidates.push(d.response);
  if (Array.isArray(d?.data)) candidates.push(d.data);
  if (Array.isArray(d?.data?.data)) candidates.push(d.data.data);
  const list = (candidates.find((x) => Array.isArray(x) && x.length) as any[]) || [];

  const cleanStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim();
  const pickUrl = (track: any) => {
    const raw =
      track?.audio_url ||
      track?.audioUrl ||
      track?.streamAudioUrl ||
      track?.stream_audio_url ||
      track?.stream_url ||
      track?.url ||
      "";
    const s = cleanStr(raw);
    return /^https?:\/\//i.test(s) ? s : "";
  };
  const pickId = (track: any) => cleanStr(track?.id || track?.audio_id || track?.audioId || track?.audioID || "");
  const pickTitle = (track: any) => cleanStr(track?.title || "");
  const pickImage = (track: any) =>
    cleanStr(
      track?.image_url ||
        track?.imageUrl ||
        track?.image_large_url ||
        track?.imageLargeUrl ||
        track?.cover_url ||
        track?.coverUrl ||
        track?.thumbnail_url ||
        track?.thumbnailUrl ||
        track?.metadata?.image_url ||
        track?.metadata?.imageUrl ||
        track?.metadata?.image_large_url ||
        track?.metadata?.imageLargeUrl ||
        track?.metadata?.cover_url ||
        track?.metadata?.coverUrl ||
        track?.metadata?.thumbnail_url ||
        track?.metadata?.thumbnailUrl ||
        track?.image?.url ||
        track?.image?.src ||
        track?.cover?.url ||
        track?.cover?.src ||
        "",
    );

  return (Array.isArray(list) ? list : [])
    .map((track: any) => ({
      audio_url: pickUrl(track),
      title: pickTitle(track),
      id: pickId(track),
      image_url: pickImage(track),
    }))
    .filter((x: any) => x.audio_url);
}

function normalizeTaskStatus(providerStatus: string) {
  const s = String(providerStatus || "").toUpperCase();
  if (isFailureStatus(s)) return "FAILED" as const;
  if (s === "SUCCESS" || s === "COMPLETED" || s === "COMPLETE" || s === "DONE" || s.includes("SUCCESS") || s.includes("COMPLETE")) {
    return "SUCCESS" as const;
  }
  return "PENDING" as const;
}

async function resolveTelegramUser(admin: any, telegramUserId: string) {
  const { data: link, error: linkErr } = await admin
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (linkErr) return { userId: "", error: linkErr.message || "Error buscando vínculo" };
  if (link?.user_id) return { userId: String(link.user_id), error: "" };

  const { data: profileByTelegram, error: profileByTelegramErr } = await admin
    .from("profiles")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (profileByTelegramErr) {
    const msg = String(profileByTelegramErr.message || "").toLowerCase();
    if (!msg.includes("column") || !msg.includes("telegram_user_id")) {
      return { userId: "", error: profileByTelegramErr.message || "Error buscando perfil" };
    }
  }
  if ((profileByTelegram as any)?.id) return { userId: String((profileByTelegram as any).id), error: "" };
  return { userId: "", error: "" };
}

export default async function handler(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

  const secret = (process.env.TELEGRAM_BOT_SECRET || "").toString().trim();
  if (!secret) return send(res, 500, { error: "TELEGRAM_BOT_SECRET no configurado" });
  const got = String(req?.headers?.["x-telegram-secret"] || "").trim();
  if (!got || got !== secret) return send(res, 401, { error: "No autorizado" });

  const payload = await readJsonBody(req);
  if (!payload) return send(res, 400, { error: "Body inválido" });

  const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
  const telegram_user_id = payload.telegram_user_id;
  if (!taskId) return send(res, 400, { error: "Falta taskId" });
  if (telegram_user_id == null || telegram_user_id === "") return send(res, 400, { error: "Falta telegram_user_id" });

  const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
  const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
  if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });

  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

  const resolved = await resolveTelegramUser(admin, String(telegram_user_id));
  if (resolved.error) return send(res, 500, { error: "Error buscando vínculo", detail: resolved.error });
  if (!resolved.userId) return send(res, 401, { error: "Cuenta no vinculada" });

  const userId = String(resolved.userId);

  const { data: taskRows, error: taskErr } = await admin
    .from("suno_tasks")
    .select("kind, cost, consumed")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .limit(1);
  if (taskErr) return send(res, 500, { error: "Error buscando tarea", detail: taskErr.message });
  const taskRow = Array.isArray(taskRows) ? taskRows[0] : null;
  if (!taskRow) return send(res, 404, { error: "Tarea no encontrada" });

  const queryKind = kindToQueryKind(String(taskRow.kind || "generate"));
  const enc = encodeURIComponent(taskId);
  const paths =
    queryKind === "lyrics"
      ? [`/api/v1/lyrics/record-info?taskId=${enc}`, `/api/v1/suno/lyrics/record-info?taskId=${enc}`]
      : queryKind === "midi"
      ? [`/api/v1/midi/record-info?taskId=${enc}`, `/api/v1/suno/midi/record-info?taskId=${enc}`]
      : queryKind === "mp4"
      ? [`/api/v1/mp4/record-info?taskId=${enc}`, `/api/v1/suno/mp4/record-info?taskId=${enc}`]
      : queryKind === "vocal-removal"
      ? [`/api/v1/vocal-removal/record-info?taskId=${enc}`, `/api/v1/suno/vocal-removal/record-info?taskId=${enc}`]
      : queryKind === "wav"
      ? [`/api/v1/wav/record-info?taskId=${enc}`, `/api/v1/suno/wav/record-info?taskId=${enc}`]
      : [
          `/api/v1/generate/record-info?taskId=${enc}`,
          `/api/v1/suno/generate/record-info?taskId=${enc}`,
          `/api/v1/task/${enc}`,
          `/api/v1/suno/task/${enc}`,
        ];

  try {
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

    const providerStatus = extractStatus(data, queryKind);
    if (isFailureStatus(providerStatus)) {
      const cost = Number(taskRow?.cost ?? 0);
      const consumed = Boolean(taskRow?.consumed);
      if (consumed && Number.isFinite(cost) && cost > 0) {
        await adjustUserCredits(admin, userId, cost);
        await admin.from("suno_tasks").update({ consumed: false }).eq("task_id", taskId).eq("user_id", userId);
      }
    }

    const status = normalizeTaskStatus(providerStatus);
    const songs = status === "SUCCESS" ? extractSongsFromProviderPayload(data) : [];
    return send(res, 200, { data, kind: queryKind, status, songs });
  } catch (e) {
    return send(res, 502, { error: "Error consultando task", detail: e instanceof Error ? e.message : String(e) });
  }
}
