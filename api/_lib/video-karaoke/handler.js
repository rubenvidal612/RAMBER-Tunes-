import { youkaProvider } from "../providers/youka.js";

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

function sendProviderResponse(res, result) {
  if (result?.ok) return send(res, 200, { ok: true, data: result.data });
  const status = result?.error?.code === "KARAOKE_INVALID_REQUEST" ? 400 : 503;
  return send(res, status, {
    ok: false,
    error:
      result?.error || {
        code: "KARAOKE_PROVIDER_DISABLED",
        message: "Video Karaoke no está habilitado.",
        retryable: false,
        provider: "youka",
      },
  });
}

function invalid(res, message) {
  return send(res, 400, {
    ok: false,
    error: { code: "KARAOKE_INVALID_REQUEST", message, retryable: false, provider: "youka" },
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
    return sendProviderResponse(res, await youkaProvider.createProject({ ...body, idempotencyKey: key }));
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
    return sendProviderResponse(res, await youkaProvider.getStatus(resourceId));
  }

  if (resource === "projects" && resourceId && !child && method(req) === "DELETE") {
    return sendProviderResponse(res, await youkaProvider.deleteProject(resourceId, key));
  }

  return send(res, 404, { ok: false, error: { code: "KARAOKE_ROUTE_NOT_FOUND", message: "Ruta de Video Karaoke no encontrada." } });
}

