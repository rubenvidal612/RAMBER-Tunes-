import { createClient } from "@supabase/supabase-js";
import { CREDIT_COSTS, adjustUserCredits, consumeUserCredits } from "../../src/lib/credits";
import { isAdminEmail } from "../../src/lib/authz";

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function sunoErrorMessage(data: any, fallback: string) {
  const msg =
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    (typeof data?.msg === "string" && data.msg) ||
    fallback;
  return String(msg);
}

function firstString(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
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
    return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" });
  }

  const authHeader = (req.headers.authorization || "").toString();
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return send(res, 401, { error: "No autorizado" });

  const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return send(res, 401, { error: "No autorizado" });

  const isAdmin = isAdminEmail(user.email);
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

  const taskId = firstString(payload, ["taskId", "task_id"]);
  const audioId = firstString(payload, ["audioId", "audio_id", "songId", "song_id"]);
  if (!taskId) return send(res, 400, { error: "Falta taskId" });
  if (!audioId) return send(res, 400, { error: "Falta audioId" });

  const author = firstString(payload, ["author"]);
  const domainName = firstString(payload, ["domainName", "domain_name"]);
  if (author.length > 50) return send(res, 400, { error: "author máximo 50 caracteres" });
  if (domainName.length > 50) return send(res, 400, { error: "domainName máximo 50 caracteres" });

  const cost = CREDIT_COSTS.music_video;

  try {
    if (!isAdmin) {
      const consumed = await consumeUserCredits(admin, user.id, cost);
      if (!consumed.ok) return send(res, 402, { error: consumed.error || "Créditos insuficientes. Recarga para continuar." });
    }

    const { res: r, data, text } = await sunoFetchJson("/api/v1/mp4/generate", {
      method: "POST",
      body: JSON.stringify({
        taskId,
        audioId,
        author: author || "RAMBER Tunes",
        domainName: domainName || "rambertunes",
      }),
    });

    if (!r.ok) {
      const msg = sunoErrorMessage(data, text || `HTTP ${r.status}`);
      if (!isAdmin) await adjustUserCredits(admin, user.id, cost);
      return send(res, 502, { error: "Error convirtiendo a MP4", code: r.status, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(data, "Error del proveedor");
      if (!isAdmin) await adjustUserCredits(admin, user.id, cost);
      return send(res, 502, { error: "Error convirtiendo a MP4", code, detail: String(msg).slice(0, 1200) });
    }

    const convTaskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
    if (!convTaskId) {
      const snippet = data ? JSON.stringify(data).slice(0, 900) : (text || "").replaceAll(/\s+/g, " ").trim().slice(0, 900);
      if (!isAdmin) await adjustUserCredits(admin, user.id, cost);
      return send(res, 502, { error: "Respuesta inválida del proveedor", code: 502, detail: snippet ? `Respuesta: ${snippet}` : "" });
    }

    await admin.from("suno_tasks").insert({
      task_id: convTaskId,
      user_id: user.id,
      kind: "mp4_generate",
      cost,
      consumed: true,
      parent_task_id: taskId,
    });

    return send(res, 200, { ok: true, mp4Url: null, taskId: convTaskId, raw: data ?? null });
  } catch (e) {
    if (!isAdmin) {
      await adjustUserCredits(admin, user.id, cost);
    }
    return send(res, 502, { error: "Error convirtiendo a MP4", detail: e instanceof Error ? e.message : String(e) });
  }
}

