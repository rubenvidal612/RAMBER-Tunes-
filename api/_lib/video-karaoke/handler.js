import { youkaProvider } from "../providers/youka.js";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

let cachedR2Env = null;
let cachedR2Client = null;
let cachedR2Aws = null;
let cachedR2Presigner = null;

function reportVkCreateProjectDebug(hypothesisId, location, msg, data = {}) {
  try {
    let debugServerUrl = "http://127.0.0.1:7777/event";
    let sessionId = "vk-create-project";
    try {
      const env = readFileSync(".dbg/vk-create-project.env", "utf8");
      debugServerUrl = env.match(/^DEBUG_SERVER_URL=(.+)$/m)?.[1]?.trim() || debugServerUrl;
      sessionId = env.match(/^DEBUG_SESSION_ID=(.+)$/m)?.[1]?.trim() || sessionId;
    } catch {}
    fetch(debugServerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        runId: "pre-fix",
        hypothesisId,
        location,
        msg,
        data,
        ts: Date.now(),
      }),
    }).catch(() => {});
  } catch {}
}

function getR2Env() {
  if (cachedR2Env) return cachedR2Env;
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = String(process.env.R2_BUCKET_NAME || "").trim();
  const endpoint = String(process.env.R2_ENDPOINT || "").trim() || `https://${accountId}.r2.cloudflarestorage.com`;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error("Missing required R2 environment variables");
  }
  cachedR2Env = { accountId, accessKeyId, secretAccessKey, bucketName, endpoint };
  return cachedR2Env;
}

async function getR2AwsSdk() {
  if (cachedR2Aws) return cachedR2Aws;
  cachedR2Aws = await import("@aws-sdk/client-s3");
  return cachedR2Aws;
}

async function getR2Presigner() {
  if (cachedR2Presigner) return cachedR2Presigner;
  cachedR2Presigner = await import("@aws-sdk/s3-request-presigner");
  return cachedR2Presigner;
}

async function getR2Client() {
  if (cachedR2Client) return cachedR2Client;
  const env = getR2Env();
  const { S3Client } = await getR2AwsSdk();
  const hostname = (() => {
    try {
      return new URL(env.endpoint).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const shouldForcePathStyle = hostname ? !hostname.startsWith(`${env.bucketName.toLowerCase()}.`) : true;
  cachedR2Client = new S3Client({
    region: "auto",
    endpoint: env.endpoint,
    forcePathStyle: shouldForcePathStyle,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
  return cachedR2Client;
}

async function getSignedR2GetUrl(key, expiresIn = 60 * 15) {
  const env = getR2Env();
  const client = await getR2Client();
  const { GetObjectCommand } = await getR2AwsSdk();
  const { getSignedUrl } = await getR2Presigner();
  const command = new GetObjectCommand({ Bucket: env.bucketName, Key: key });
  return await getSignedUrl(client, command, { expiresIn });
}

function normalizeR2Key(raw) {
  const key = String(raw || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "");
  if (!key || key.length > 500) return "";
  if (key.includes("..")) return "";
  return key;
}

async function requireUser(req) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const supabaseAnon = String(process.env.SUPABASE_ANON_KEY || "").trim();
  if (!supabaseUrl || !supabaseAnon) {
    return { ok: false, status: 500, error: "Falta configurar Supabase." };
  }
  const tokenRaw = String(req?.headers?.authorization || "");
  const bearerToken = tokenRaw.toLowerCase().startsWith("bearer ") ? tokenRaw.slice(7).trim() : "";
  if (!bearerToken) return { ok: false, status: 401, error: "No autorizado" };
  try {
    const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearerToken);
    const user = userData?.user;
    if (userErr || !user) return { ok: false, status: 401, error: "No autorizado" };
    return { ok: true, userId: String(user.id || "") };
  } catch {
    return { ok: false, status: 401, error: "No autorizado" };
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function method(req) {
  return String(req.method || "GET").toUpperCase();
}

function idempotencyKey(req, body) {
  const header = req.headers?.["idempotency-key"];
  const value = Array.isArray(header) ? header[0] : header;
  return String(value || body.idempotencyKey || "").trim() || undefined;
}

function sanitizeProviderError(error) {
  const safe = error && typeof error === "object" ? { ...error } : {};
  const code = String(safe.code || "");

  if (code === "KARAOKE_PROVIDER_UNAUTHORIZED") {
    safe.message = "Servicio temporalmente no disponible.";
  }
  if (code === "KARAOKE_PROVIDER_DISABLED" || code === "KARAOKE_PROVIDER_NOT_IMPLEMENTED") {
    safe.message = "Servicio temporalmente no disponible.";
  }
  if (code === "KARAOKE_PROVIDER_ERROR" && !safe.message) {
    safe.message = "No fue posible completar la operación. Intenta de nuevo.";
  }

  if (typeof safe.message === "string") {
    safe.message = safe.message.replace(/youka/gi, "el servicio");
  }

  safe.provider = "karaoke";
  return safe;
}

function sendProviderResponse(res, result) {
  if (result?.ok) return send(res, 200, { ok: true, data: result.data });
  const status = result?.error?.code === "KARAOKE_INVALID_REQUEST" ? 400 : 503;
  const payload = {
    ok: false,
    error:
      sanitizeProviderError(result?.error) || {
        code: "KARAOKE_PROVIDER_DISABLED",
        message: "Video Karaoke no está habilitado.",
        retryable: false,
        provider: "karaoke",
      },
  };
  if (result?.debug && typeof result.debug === "object") payload.debug = result.debug;
  return send(res, status, payload);
}

function invalid(res, message) {
  return send(res, 400, {
    ok: false,
    error: sanitizeProviderError({ code: "KARAOKE_INVALID_REQUEST", message, retryable: false, provider: "karaoke" }),
  });
}

export async function handleVideoKaraokeApi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  const offset = parts[0] === "api" ? 2 : 1;
  const resource = parts[offset];
  const resourceId = parts[offset + 1];
  const child = parts[offset + 2];
  const body = parseBody(req);
  const key = idempotencyKey(req, body);

  if (resource === "uploads" && resourceId === "from-r2") {
    if (method(req) !== "POST") return send(res, 405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Método no permitido" } });
    const debugHeader = req.headers?.["x-vk-debug"];
    const debugEnabled = String(Array.isArray(debugHeader) ? debugHeader[0] : debugHeader || "").trim() === "1";
    const debug = debugEnabled ? { stage: "init", steps: [] } : null;
    const safeUrl = (value) => {
      try {
        const u = new URL(String(value || ""));
        return `${u.origin}${u.pathname}`;
      } catch {
        return "";
      }
    };
    const pushStep = (label, data) => {
      if (!debug) return;
      try {
        debug.steps.push({ label, ...data });
      } catch {}
    };
    const sendDebug = (status, payload) => {
      if (debug) {
        try {
          payload.debug = debug;
        } catch {}
      }
      return send(res, status, payload);
    };
    const auth = await requireUser(req);
    if (!auth.ok) {
      if (debug) debug.stage = "auth";
      pushStep("auth", { ok: false, status: auth.status, error: String(auth.error || "") });
      return sendDebug(auth.status, { ok: false, error: sanitizeProviderError({ code: "KARAOKE_PROVIDER_UNAUTHORIZED", message: auth.error, retryable: false, provider: "karaoke" }) });
    }

    const r2Key = normalizeR2Key(body.r2Key);
    const filename = String(body.filename || "").trim();
    const contentType = String(body.contentType || "").trim() || "audio/mpeg";
    const contentLength = Number(body.contentLength);
    const userPrefix = `uploads/audio/${auth.userId}/`;

    if (!r2Key || !r2Key.startsWith(userPrefix)) {
      if (debug) debug.stage = "validate";
      pushStep("validate", { ok: false, reason: "r2Key", r2Key: String(r2Key || ""), userPrefix });
      return sendDebug(400, { ok: false, error: sanitizeProviderError({ code: "KARAOKE_INVALID_REQUEST", message: "r2Key no es válido.", retryable: false, provider: "karaoke" }) });
    }
    if (!filename) {
      if (debug) debug.stage = "validate";
      pushStep("validate", { ok: false, reason: "filename" });
      return sendDebug(400, { ok: false, error: sanitizeProviderError({ code: "KARAOKE_INVALID_REQUEST", message: "filename es obligatorio.", retryable: false, provider: "karaoke" }) });
    }
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      if (debug) debug.stage = "validate";
      pushStep("validate", { ok: false, reason: "contentLength", contentLength });
      return sendDebug(400, { ok: false, error: sanitizeProviderError({ code: "KARAOKE_INVALID_REQUEST", message: "contentLength no es válido.", retryable: false, provider: "karaoke" }) });
    }

    let signedGetUrl = "";
    try {
      if (debug) debug.stage = "r2-sign";
      signedGetUrl = await getSignedR2GetUrl(r2Key, 60 * 15);
      pushStep("r2-sign", { ok: true, r2Key, signedGetUrl: safeUrl(signedGetUrl) });
    } catch {
      pushStep("r2-sign", { ok: false, r2Key });
      return sendDebug(500, { ok: false, error: sanitizeProviderError({ code: "KARAOKE_PROVIDER_ERROR", message: "No pude preparar el karaoke. Intenta de nuevo.", retryable: false, provider: "karaoke" }) });
    }

    const uploadReq = {
      filename,
      contentType,
      contentLength,
      idempotencyKey: key,
    };
    if (debug) debug.stage = "provider-create-upload";
    const uploadPrep = await youkaProvider.createUpload(uploadReq);
    if (!uploadPrep?.ok || !uploadPrep?.data?.uploadUrl || !uploadPrep?.data?.uploadId) {
      pushStep("provider-create-upload", {
        ok: false,
        result: uploadPrep && typeof uploadPrep === "object" ? { ok: Boolean(uploadPrep.ok), error: uploadPrep.error || null, data: null } : null,
      });
      const status = uploadPrep?.error?.code === "KARAOKE_INVALID_REQUEST" ? 400 : 503;
      return sendDebug(status, {
        ok: false,
        error:
          sanitizeProviderError(uploadPrep?.error) || {
            code: "KARAOKE_PROVIDER_DISABLED",
            message: "Video Karaoke no está habilitado.",
            retryable: false,
            provider: "karaoke",
          },
      });
    }

    const uploadUrl = String(uploadPrep.data.uploadUrl || "");
    const uploadId = String(uploadPrep.data.uploadId || "");
    pushStep("provider-create-upload", { ok: true, uploadId, uploadUrl: safeUrl(uploadUrl) });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4 * 60 * 1000);
    try {
      if (debug) debug.stage = "r2-fetch";
      const getRes = await fetch(signedGetUrl, { method: "GET", signal: ctrl.signal });
      if (!getRes.ok) {
        const responseText = await getRes.text().catch(() => "");
        pushStep("r2-fetch", {
          ok: false,
          status: getRes.status,
          url: safeUrl(signedGetUrl),
          responseText,
          contentType: String(getRes.headers?.get?.("content-type") || ""),
          contentLength: String(getRes.headers?.get?.("content-length") || ""),
        });
        return sendDebug(503, { ok: false, error: sanitizeProviderError({ code: "KARAOKE_PROVIDER_ERROR", message: "No pude preparar el karaoke. Intenta de nuevo.", retryable: true, provider: "karaoke" }) });
      }
      if (!getRes.body) {
        pushStep("r2-fetch", {
          ok: false,
          status: getRes.status,
          url: safeUrl(signedGetUrl),
          reason: "missing-body",
          contentType: String(getRes.headers?.get?.("content-type") || ""),
          contentLength: String(getRes.headers?.get?.("content-length") || ""),
        });
        return sendDebug(503, { ok: false, error: sanitizeProviderError({ code: "KARAOKE_PROVIDER_ERROR", message: "No pude preparar el karaoke. Intenta de nuevo.", retryable: true, provider: "karaoke" }) });
      }
      pushStep("r2-fetch", {
        ok: true,
        status: getRes.status,
        url: safeUrl(signedGetUrl),
        contentType: String(getRes.headers?.get?.("content-type") || ""),
        contentLength: String(getRes.headers?.get?.("content-length") || ""),
      });

      const headers = { "content-type": contentType };
      if (Number.isFinite(contentLength) && contentLength > 0) headers["content-length"] = String(contentLength);

      if (debug) debug.stage = "provider-put";
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers,
        body: getRes.body,
        duplex: "half",
        signal: ctrl.signal,
      });

      if (!putRes.ok) {
        const putText = await putRes.text().catch(() => "");
        pushStep("provider-put", { ok: false, status: putRes.status, url: safeUrl(uploadUrl), responseText: putText });
        return sendDebug(503, {
          ok: false,
          error: sanitizeProviderError({
            code: "KARAOKE_PROVIDER_ERROR",
            message: "No pude subir el archivo. Intenta de nuevo.",
            retryable: putRes.status === 429 || putRes.status >= 500,
            provider: "karaoke",
          }),
        });
      }
      pushStep("provider-put", { ok: true, status: putRes.status, url: safeUrl(uploadUrl) });

      if (debug) debug.stage = "done";
      return sendDebug(200, { ok: true, data: { uploadId } });
    } catch (error) {
      if (debug) debug.stage = "exception";
      pushStep("exception", { message: String(error?.message || error || ""), stack: String(error?.stack || "") });
      return sendDebug(503, { ok: false, error: sanitizeProviderError({ code: "KARAOKE_PROVIDER_ERROR", message: "No pude subir el archivo. Intenta de nuevo.", retryable: true, provider: "karaoke" }) });
    } finally {
      clearTimeout(timer);
    }
  }

  if (resource === "uploads") {
    if (method(req) !== "POST") return send(res, 405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Método no permitido" } });
    if (!body.filename || !body.contentType || !Number.isFinite(Number(body.contentLength))) return invalid(res, "filename, contentType y contentLength son obligatorios.");
    const request = { filename: String(body.filename), contentType: String(body.contentType), contentLength: Number(body.contentLength), idempotencyKey: key };
    return sendProviderResponse(res, await youkaProvider.createUpload(request));
  }

  if (resource === "quote" && method(req) === "POST") {
    const request = {
      inputFileId: body.inputFileId ? String(body.inputFileId) : undefined,
      durationSeconds: body.durationSeconds == null ? undefined : Number(body.durationSeconds),
      lyricsSource: body.lyricsSource ?? null,
      splitModel: String(body.splitModel || ""),
    };
    return sendProviderResponse(res, await youkaProvider.quoteProject(request));
  }

  if (resource === "projects" && !resourceId && method(req) === "POST") {
    const request = { ...body, idempotencyKey: key };
    // #region debug-point C:handler-create-project-request
    reportVkCreateProjectDebug("C", "api/_lib/video-karaoke/handler.js:projects:request", "[DEBUG] handler create-project request", {
      route: "/api/video-karaoke/projects",
      method: method(req),
      body: request,
    });
    // #endregion
    const providerResult = await youkaProvider.createProject(request);
    try {
      if (!providerResult?.ok && !providerResult?.debug && globalThis.__vk_last_create_project_debug) {
        providerResult.debug = globalThis.__vk_last_create_project_debug;
      }
    } catch {}
    // #region debug-point D:handler-create-project-response
    reportVkCreateProjectDebug("D", "api/_lib/video-karaoke/handler.js:projects:response", "[DEBUG] handler create-project response", {
      route: "/api/video-karaoke/projects",
      result: providerResult,
    });
    // #endregion
    return sendProviderResponse(res, providerResult);
  }

  if (resource === "projects" && resourceId && !child && method(req) === "GET") {
    return sendProviderResponse(res, await youkaProvider.getProject(resourceId));
  }

  if (resource === "projects" && resourceId && child === "settings" && method(req) === "PATCH") {
    return sendProviderResponse(res, youkaProvider.updateSettings(resourceId, body));
  }

  if (resource === "projects" && resourceId && child === "exports" && parts[offset + 3] === "quote" && method(req) === "POST") {
    return sendProviderResponse(res, await youkaProvider.quoteExport(resourceId, { ...body, idempotencyKey: key }));
  }

  if (resource === "projects" && resourceId && child === "exports" && !parts[offset + 3] && method(req) === "POST") {
    return sendProviderResponse(res, await youkaProvider.createExport(resourceId, { ...body, idempotencyKey: key }));
  }

  if (resource === "exports" && resourceId && method(req) === "GET") {
    return sendProviderResponse(res, await youkaProvider.getExport(resourceId));
  }

  if (resource === "tasks" && resourceId && method(req) === "GET") {
    const debugHeader = req.headers?.["x-vk-debug"];
    const debugEnabled = String(Array.isArray(debugHeader) ? debugHeader[0] : debugHeader || "").trim() === "1";
    return sendProviderResponse(res, await youkaProvider.getStatus(resourceId, debugEnabled ? { debug: true } : undefined));
  }

  if (resource === "projects" && resourceId && !child && method(req) === "DELETE") {
    return sendProviderResponse(res, await youkaProvider.deleteProject(resourceId, key));
  }

  return send(res, 404, { ok: false, error: { code: "KARAOKE_ROUTE_NOT_FOUND", message: "Ruta de Video Karaoke no encontrada." } });
}
