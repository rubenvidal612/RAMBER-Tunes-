import { createClient } from "@supabase/supabase-js";

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

async function sunoFetchJson(path: string, init?: RequestInit) {
  const base = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
  if (!base) throw new Error("Falta SUNO_API_BASE_URL en variables de entorno");

  const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";

  const headers = new Headers(init?.headers);
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

function pickQuery(req: any, key: string) {
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get(key) || "";
}

export default async function handler(req: any, res: any) {
  const method = (req.method || "GET").toUpperCase();
  if (!(method === "GET" || method === "POST")) return send(res, 405, { error: "Método no permitido" });

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseAnon) return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY)" });

  const authHeader = (req.headers.authorization || "").toString();
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return send(res, 401, { error: "No autorizado" });

  const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return send(res, 401, { error: "No autorizado" });

  const payload =
    method === "POST"
      ? typeof req.body === "string"
        ? (() => {
            try {
              return JSON.parse(req.body);
            } catch {
              return null;
            }
          })()
        : req.body
      : null;

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

