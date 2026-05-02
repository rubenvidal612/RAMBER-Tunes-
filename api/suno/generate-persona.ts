import { createClient } from "@supabase/supabase-js";

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function sunoErrorMessage(data: any, fallback: string) {
  const msg =
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    (typeof data?.msg === "string" && data.msg) ||
    fallback;
  return String(msg);
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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseAnon || !supabaseService) {
    return send(res, 500, {
      error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)",
    });
  }

  const authHeader = (req.headers.authorization || "").toString();
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return send(res, 401, { error: "No autorizado" });

  const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return send(res, 401, { error: "No autorizado" });

  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

  const payload =
    typeof req.body === "string"
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
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

  const vocalStartRaw = Number(payload?.vocalStart);
  const vocalEndRaw = Number(payload?.vocalEnd);
  const hasVocalRange = Number.isFinite(vocalStartRaw) || Number.isFinite(vocalEndRaw);
  const vocalStart = Number.isFinite(vocalStartRaw) ? clamp(vocalStartRaw, 0, 10_000) : 0;
  const vocalEnd = Number.isFinite(vocalEndRaw) ? clamp(vocalEndRaw, 0, 10_000) : 30;
  if (hasVocalRange) {
    const len = vocalEnd - vocalStart;
    if (!(len >= 10 && len <= 30)) {
      return send(res, 400, { error: "El rango vocalEnd - vocalStart debe ser entre 10 y 30 segundos." });
    }
  }

  const body: any = {
    taskId,
    audioId,
    name: name.slice(0, 120),
    description: description.slice(0, 2000),
  };
  if (style) body.style = style.slice(0, 200);
  if (hasVocalRange) {
    body.vocalStart = vocalStart;
    body.vocalEnd = vocalEnd;
  }

  try {
    let r = await sunoFetchJson("/api/v1/generate/persona", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (r.res.status === 404) {
      r = await sunoFetchJson("/api/v1/generate/generate-persona", {
        method: "POST",
        body: JSON.stringify(body),
      });
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

    const { error } = await admin.from("suno_personas").upsert(
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
      { onConflict: "user_id,audio_id" }
    );
    if (error) return send(res, 500, { error: "No pude guardar la persona", detail: error.message });

    if (saveToLibrary) {
      const coverUrl = typeof payload?.coverUrl === "string" ? payload.coverUrl.trim() : "";
      const audioUrl = typeof payload?.audioUrl === "string" ? payload.audioUrl.trim() : "";
      const notesText = typeof payload?.notes === "string" ? payload.notes.trim() : "";

      await admin.from("library_items").insert({
        user_id: user.id,
        type: "voice_persona",
        title: name.slice(0, 120),
        cover_url: coverUrl || null,
        audio_url: audioUrl || null,
        commercial_license: true,
        notes: JSON.stringify(
          {
            persona_id: personaId,
            persona_model: "voice_persona",
            description: description.slice(0, 2000),
            notes: notesText.slice(0, 2000),
            source: "suno_persona",
          },
          null,
          0
        ),
      });
    }

    return send(res, 200, { personaId });
  } catch (e) {
    return send(res, 502, { error: "Error creando persona", detail: e instanceof Error ? e.message : String(e) });
  }
}

