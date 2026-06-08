import { createClient } from "@supabase/supabase-js";

function send(res: any, status: number, body: any) {
  try {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  } catch {
    try {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Error enviando respuesta" }));
    } catch {}
  }
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

const toBase64 = (buf: ArrayBuffer) => Buffer.from(buf).toString("base64");

function safeUrl(raw: string) {
  try {
    const url = new URL((raw || "").trim());
    if (!(url.protocol === "https:" || url.protocol === "http:")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function tryDecodeB64Url(b64: string) {
  try {
    const s = Buffer.from(String(b64 || "").trim(), "base64").toString("utf8").trim();
    return s || null;
  } catch {
    return null;
  }
}

function getTelegramBotToken() {
  const t = (process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || "").toString().trim();
  return t || "";
}

async function resolveTelegramFileUrlFromFileId(fileId: string) {
  const token = getTelegramBotToken();
  if (!token) return { ok: false as const, error: "Falta TELEGRAM_BOT_TOKEN en Vercel" };

  const base = `https://api.telegram.org/bot${token}`;
  const r = await fetch(`${base}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String((data as any)?.description || (data as any)?.error || `HTTP ${r.status}` || "").trim();
    return { ok: false as const, error: msg || `HTTP ${r.status}` };
  }
  const filePath = String((data as any)?.result?.file_path || "").trim();
  if (!filePath) return { ok: false as const, error: "Telegram no devolvió file_path" };
  return { ok: true as const, url: `https://api.telegram.org/file/bot${token}/${filePath}` };
}

function normalizeAudioMimeType(raw: string) {
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
}

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
    "gemini-3-flash-preview",
    "gemini-1.5-flash",
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
      if (is404) continue;
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

export default async function handler(req: any, res: any) {
  try {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const secret = (process.env.TELEGRAM_BOT_SECRET || "").toString().trim();
    if (!secret) return send(res, 500, { error: "TELEGRAM_BOT_SECRET no configurado" });
    const got = String(req?.headers?.["x-telegram-secret"] || "").trim();
    if (!got || got !== secret) return send(res, 401, { error: "No autorizado" });

    const payload = await readJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const telegram_user_id = (payload as any)?.telegram_user_id;
    if (telegram_user_id == null || telegram_user_id === "") return send(res, 400, { error: "Falta telegram_user_id" });

    const uploadUrlRaw = typeof (payload as any)?.uploadUrl === "string" ? (payload as any).uploadUrl.trim() : "";
    const uploadUrlB64 =
      typeof (payload as any)?.uploadUrl_b64 === "string"
        ? (payload as any).uploadUrl_b64.trim()
        : typeof (payload as any)?.uploadUrlB64 === "string"
          ? (payload as any).uploadUrlB64.trim()
          : "";
    const telegramFileId =
      typeof (payload as any)?.telegram_file_id === "string"
        ? (payload as any).telegram_file_id.trim()
        : typeof (payload as any)?.file_id === "string"
          ? (payload as any).file_id.trim()
          : "";
    const mimeTypeHint = typeof (payload as any)?.mimeType === "string" ? (payload as any).mimeType.trim() : "";

    let resolvedUrl = safeUrl(uploadUrlRaw);
    if (!resolvedUrl && uploadUrlB64) {
      const decoded = tryDecodeB64Url(uploadUrlB64);
      resolvedUrl = decoded ? safeUrl(decoded) : null;
    }
    if (!resolvedUrl && telegramFileId) {
      const out = await resolveTelegramFileUrlFromFileId(telegramFileId);
      if (!out.ok) return send(res, 400, { error: out.error || "No pude resolver el archivo de Telegram" });
      resolvedUrl = safeUrl(out.url);
    }
    if (!resolvedUrl) {
      return send(res, 400, { error: "Falta uploadUrl (o uploadUrl_b64 / file_id)" });
    }

    const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
    const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
    if (!supabaseUrl || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
    const { data: link, error: linkErr } = await admin
      .from("telegram_links")
      .select("user_id")
      .eq("telegram_user_id", telegram_user_id)
      .maybeSingle();
    if (linkErr) return send(res, 500, { error: "Error buscando vínculo", detail: linkErr.message });
    if (!link?.user_id) return send(res, 401, { error: "Cuenta no vinculada" });

    const fr = await fetch(resolvedUrl, { redirect: "follow" });
    if (!fr.ok) return send(res, 502, { error: "No pude leer tu audio", detail: `HTTP ${fr.status}` });

    const contentType = (fr.headers.get("content-type") || "").toString();
    const mimeType = normalizeAudioMimeType(mimeTypeHint) || normalizeAudioMimeType(contentType) || "audio/mpeg";
    const ab = await fr.arrayBuffer();
    const size = ab.byteLength || 0;
    if (size <= 0) return send(res, 400, { error: "El audio está vacío" });
    if (size > 15 * 1024 * 1024) return send(res, 413, { error: "Audio muy pesado para transcribir. Sube un fragmento más corto." });

    const out = await transcribeLyricsWithGemini(ab, mimeType);
    if (!out.ok) {
      return send(res, 200, {
        ok: false,
        error: out.error || "No pude transcribir",
        message: (out as any).userMessage || "No pude transcribir la letra.",
      });
    }
    if ((out as any).status === "ILEGIBLE") {
      return send(res, 200, {
        ok: true,
        lyrics: "",
        status: "ILEGIBLE",
        message: "No pude entender la letra con este audio. Prueba con un fragmento más corto o con menos ruido.",
      });
    }
    if ((out as any).status === "SIN_LETRA") {
      return send(res, 200, {
        ok: true,
        lyrics: "",
        status: "SIN_LETRA",
        message: "No detecté voz/canto en ese audio.",
      });
    }
    return send(res, 200, { ok: true, lyrics: out.lyrics || "", status: "OK" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return send(res, 500, { error: "Error interno", detail: msg.slice(0, 900) });
  }
}
