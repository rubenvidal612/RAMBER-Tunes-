import { readFileSync } from "node:fs";

const ALLOWED_SPLIT_MODELS = new Set([
  "mdx23c",
  "audioshakeai",
  "audioshake_vocals_lead",
  "musicai_instrumental_only",
  "musicai_lead_backing_other",
  "musicai_with_backing_vocals",
  "musicai_without_backing_vocals",
  "uvr_mdxnet_kara_2",
  "bs_roformer",
  "mel_band_roformer_instrumental_becruily",
  "mel_band_roformer_instrumental_instv7_gabox",
  "demucs",
]);

function finiteEnvNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getYoukaServerConfig() {
  return {
    enabled: String(process.env.KARAOKE_YOUKA_ENABLED || "false").toLowerCase() === "true",
    apiBaseUrl: String(process.env.YOUKA_API_BASE_URL || "https://api.youka.io/api/v1").replace(/\/+$/, ""),
    apiKeyConfigured: Boolean(String(process.env.YOUKA_API_KEY || "").trim()),
    creditMultiplier: Math.max(0, finiteEnvNumber(process.env.KARAOKE_CREDIT_MULTIPLIER, 1)),
    creditFixed: Math.max(0, finiteEnvNumber(process.env.KARAOKE_CREDIT_FIXED, 0)),
    downloadTtlHours: Math.max(1, finiteEnvNumber(process.env.KARAOKE_DOWNLOAD_TTL_HOURS, 72)),
  };
}

function providerFailure(code, message, operation, retryable = false) {
  return { ok: false, error: { code, message, operation, retryable, provider: "youka" } };
}

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

function assertEnabled(operation) {
  const config = getYoukaServerConfig();
  const apiKey = String(process.env.YOUKA_API_KEY || "").trim();
  if (!config.enabled) return { ok: false, error: providerFailure("KARAOKE_PROVIDER_DISABLED", "La integración de Youka está desactivada en el servidor.", operation) };
  if (!apiKey) return { ok: false, error: providerFailure("KARAOKE_PROVIDER_UNAUTHORIZED", "Falta configurar la credencial privada de Youka.", operation) };
  return { ok: true, config, apiKey };
}

async function quoteProject(request) {
  const enabled = assertEnabled("quote-project");
  if (!enabled.ok) return enabled.error;
  const { config, apiKey } = enabled;
  if (!ALLOWED_SPLIT_MODELS.has(String(request.splitModel || ""))) return providerFailure("KARAOKE_INVALID_REQUEST", "El modelo de separación no es válido.", "quote-project");

  const payloadRequest = { ...request };
  if (payloadRequest.inputFileId) {
    delete payloadRequest.durationSeconds;
  }

  const durationSeconds = Number(payloadRequest.durationSeconds);
  if (!payloadRequest.inputFileId && (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 1200)) {
    return providerFailure("KARAOKE_INVALID_REQUEST", "durationSeconds debe ser mayor que 0 y menor o igual que 1200.", "quote-project");
  }
  if (!payloadRequest.inputFileId && !payloadRequest.durationSeconds) return providerFailure("KARAOKE_INVALID_REQUEST", "Se requiere inputFileId o durationSeconds.", "quote-project");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.apiBaseUrl}/projects/quote`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payloadRequest),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      try {
        const lyrics = payloadRequest?.lyricsSource?.type === "align" ? String(payloadRequest?.lyricsSource?.lyrics || "") : "";
        console.error("[youka] quote-project failed", {
          status: response.status,
          request: {
            inputFileId: payloadRequest?.inputFileId ? String(payloadRequest.inputFileId) : null,
            hasDurationSeconds: payloadRequest?.durationSeconds != null,
            splitModel: payloadRequest?.splitModel ? String(payloadRequest.splitModel) : null,
            lyricsType: payloadRequest?.lyricsSource?.type ? String(payloadRequest.lyricsSource.type) : null,
            language: payloadRequest?.lyricsSource?.language ? String(payloadRequest.lyricsSource.language) : null,
            lyricsChars: lyrics ? lyrics.length : 0,
          },
          response: payload,
        });
      } catch {}
      const unauthorized = response.status === 401 || response.status === 403;
      return providerFailure(
        unauthorized ? "KARAOKE_PROVIDER_UNAUTHORIZED" : "KARAOKE_PROVIDER_ERROR",
        unauthorized ? "Youka rechazó la credencial configurada." : "No fue posible obtener la cotización de Youka.",
        "quote-project",
        response.status === 429 || response.status >= 500,
      );
    }
    if (!payload || !Number.isInteger(payload.creditsRequired) || !payload.breakdown) {
      return providerFailure("KARAOKE_PROVIDER_ERROR", "Youka devolvió una cotización incompleta.", "quote-project");
    }
    return {
      ok: true,
      data: {
        providerCredits: payload.creditsRequired,
        lucianaCredits: null,
        currency: "credits",
        isEstimate: false,
        durationSeconds: Number(payload.durationSeconds),
        availableBalance: Number(payload.availableBalance),
        sufficientBalance: Boolean(payload.sufficientBalance),
        breakdown: { split: Number(payload.breakdown.split), sync: Number(payload.breakdown.sync) },
      },
    };
  } catch {
    return providerFailure("KARAOKE_PROVIDER_ERROR", "No fue posible comunicarse con Youka.", "quote-project", true);
  } finally {
    clearTimeout(timeout);
  }
}

function unavailable(operation) {
  const config = getYoukaServerConfig();
  return {
    ok: false,
    error: {
      code: config.enabled ? "KARAOKE_PROVIDER_NOT_IMPLEMENTED" : "KARAOKE_PROVIDER_DISABLED",
      message: config.enabled ? "La integración de Youka aún no está habilitada para ejecutar operaciones." : "La integración de Youka está desactivada en el servidor.",
      operation,
      retryable: false,
      provider: "youka",
    },
  };
}

async function createUpload(request) {
  const enabled = assertEnabled("create-upload");
  if (!enabled.ok) return enabled.error;
  const { config, apiKey } = enabled;
  if (!request.filename || !request.contentType || !Number.isFinite(Number(request.contentLength)) || Number(request.contentLength) <= 0) {
    return providerFailure("KARAOKE_INVALID_REQUEST", "filename, contentType y contentLength son obligatorios.", "create-upload");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.apiBaseUrl}/uploads`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(request.idempotencyKey ? { "idempotency-key": request.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        filename: request.filename,
        contentType: request.contentType,
        contentLength: request.contentLength,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const unauthorized = response.status === 401 || response.status === 403;
      return providerFailure(
        unauthorized ? "KARAOKE_PROVIDER_UNAUTHORIZED" : "KARAOKE_PROVIDER_ERROR",
        unauthorized ? "Youka rechazó la credencial configurada." : "No fue posible preparar la subida del archivo.",
        "create-upload",
        response.status === 429 || response.status >= 500,
      );
    }
    const inputFileId = String(payload?.inputFileId || payload?.fileId || "").trim();
    const uploadUrl = String(payload?.uploadUrl || "").trim();
    if (!inputFileId || !uploadUrl) return providerFailure("KARAOKE_PROVIDER_ERROR", "Youka devolvió una subida incompleta.", "create-upload");
    return { ok: true, data: { uploadId: inputFileId, uploadUrl, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() } };
  } catch {
    return providerFailure("KARAOKE_PROVIDER_ERROR", "No fue posible comunicarse con Youka.", "create-upload", true);
  } finally {
    clearTimeout(timeout);
  }
}

async function createProject(request) {
  const enabled = assertEnabled("create-project");
  if (!enabled.ok) return enabled.error;
  const { config, apiKey } = enabled;

  if (!request || !request.title || !request.inputFileId) return providerFailure("KARAOKE_INVALID_REQUEST", "title e inputFileId son obligatorios.", "create-project");
  if (!ALLOWED_SPLIT_MODELS.has(String(request.splitModel || "mdx23c"))) return providerFailure("KARAOKE_INVALID_REQUEST", "El modelo de separación no es válido.", "create-project");
  if (!request.lyricsSource || !request.lyricsSource.type) return providerFailure("KARAOKE_INVALID_REQUEST", "lyricsSource es obligatorio.", "create-project");
  if (request.lyricsSource.type === "align" && !String(request.lyricsSource.lyrics || "").trim()) return providerFailure("KARAOKE_INVALID_REQUEST", "lyricsSource.lyrics es obligatorio para align.", "create-project");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const providerUrl = `${config.apiBaseUrl}/projects`;
    const providerPayload = {
      title: request.title,
      inputFileId: request.inputFileId,
      splitModel: request.splitModel || "mdx23c",
      lyricsSource: request.lyricsSource,
    };
    const providerHeaders = {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(request.idempotencyKey ? { "idempotency-key": request.idempotencyKey } : {}),
    };
    // #region debug-point A:create-project-request
    reportVkCreateProjectDebug("A", "api/_lib/providers/youka.js:createProject:request", "[DEBUG] create-project request", {
      providerUrl,
      payload: providerPayload,
      headers: {
        ...providerHeaders,
        authorization: providerHeaders.authorization ? "Bearer [REDACTED]" : "",
      },
    });
    // #endregion
    const response = await fetch(providerUrl, {
      method: "POST",
      headers: providerHeaders,
      body: JSON.stringify(providerPayload),
      signal: controller.signal,
    });
    const responseText = await response.text().catch(() => "");
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = null;
    }
    // #region debug-point B:create-project-response
    reportVkCreateProjectDebug("B", "api/_lib/providers/youka.js:createProject:response", "[DEBUG] create-project response", {
      providerUrl,
      status: response.status,
      ok: response.ok,
      responseText,
      responseJson: payload,
      message: payload?.message ?? null,
      error: payload?.error ?? null,
      detail: payload?.detail ?? null,
      errors: payload?.errors ?? null,
    });
    // #endregion
    if (!response.ok) {
      const unauthorized = response.status === 401 || response.status === 403;
      return providerFailure(
        unauthorized ? "KARAOKE_PROVIDER_UNAUTHORIZED" : "KARAOKE_PROVIDER_ERROR",
        unauthorized ? "Youka rechazó la credencial configurada." : "No fue posible crear el proyecto en Youka.",
        "create-project",
        response.status === 429 || response.status >= 500,
      );
    }
    const projectId = String(payload?.projectId || "").trim();
    const taskId = String(payload?.taskId || "").trim();
    if (!projectId) return providerFailure("KARAOKE_PROVIDER_ERROR", "Youka no devolvió projectId.", "create-project");
    const now = new Date().toISOString();
    return {
      ok: true,
      data: {
        id: projectId,
        status: "processing",
        title: request.title,
        inputFileId: request.inputFileId,
        providerTaskId: taskId || undefined,
        settings: request.settings || {},
        createdAt: now,
        updatedAt: now,
        provider: payload,
      },
    };
  } catch (error) {
    // #region debug-point E:create-project-exception
    reportVkCreateProjectDebug("E", "api/_lib/providers/youka.js:createProject:exception", "[DEBUG] create-project exception", {
      providerUrl: `${config.apiBaseUrl}/projects`,
      errorText: String(error?.message || error || ""),
      stack: String(error?.stack || ""),
    });
    // #endregion
    return providerFailure("KARAOKE_PROVIDER_ERROR", "No fue posible comunicarse con Youka.", "create-project", true);
  } finally {
    clearTimeout(timeout);
  }
}

async function getProject(projectId) {
  const enabled = assertEnabled("get-project");
  if (!enabled.ok) return enabled.error;
  const { config, apiKey } = enabled;
  if (!projectId) return providerFailure("KARAOKE_INVALID_REQUEST", "projectId es obligatorio.", "get-project");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.apiBaseUrl}/projects/${encodeURIComponent(projectId)}`, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const unauthorized = response.status === 401 || response.status === 403;
      return providerFailure(
        unauthorized ? "KARAOKE_PROVIDER_UNAUTHORIZED" : "KARAOKE_PROVIDER_ERROR",
        unauthorized ? "Youka rechazó la credencial configurada." : "No fue posible obtener el proyecto de Youka.",
        "get-project",
        response.status === 429 || response.status >= 500,
      );
    }
    const stems = Array.isArray(payload?.stems) ? payload.stems : [];
    const ready = stems.some((stem) => stem && stem.type === "instrumental");
    const failed = Boolean(payload?.task?.error);
    const now = new Date().toISOString();
    return {
      ok: true,
      data: {
        id: String(payload?.id || projectId),
        status: failed ? "failed" : ready ? "ready" : "processing",
        title: String(payload?.title || "Video Karaoke"),
        inputFileId: String(payload?.inputFileId || ""),
        providerTaskId: String(payload?.task?.id || "").trim() || undefined,
        settings: payload?.settings || {},
        createdAt: String(payload?.createdAt || now),
        updatedAt: String(payload?.updatedAt || now),
        provider: payload,
      },
    };
  } catch {
    return providerFailure("KARAOKE_PROVIDER_ERROR", "No fue posible comunicarse con Youka.", "get-project", true);
  } finally {
    clearTimeout(timeout);
  }
}

function safeLogUrl(value) {
  try {
    const url = new URL(String(value));
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

async function quoteExport(projectId, request) {
  const enabled = assertEnabled("quote-export");
  if (!enabled.ok) return enabled.error;
  const { config, apiKey } = enabled;
  if (!projectId) return providerFailure("KARAOKE_INVALID_REQUEST", "projectId es obligatorio.", "quote-export");
  if (!request || !request.resolution || !request.quality || request.fps == null || request.transparent == null || !request.renderMode) {
    return providerFailure("KARAOKE_INVALID_REQUEST", "resolution, quality, fps, transparent y renderMode son obligatorios.", "quote-export");
  }

  const payloadRequest = { ...request };
  delete payloadRequest.idempotencyKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.apiBaseUrl}/projects/${encodeURIComponent(projectId)}/exports/quote`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(request.idempotencyKey ? { "idempotency-key": request.idempotencyKey } : {}),
      },
      body: JSON.stringify(payloadRequest),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      try {
        const clone = payload && typeof payload === "object" ? payload : { message: String(payload || "") };
        if (clone && clone.downloadUrl) clone.downloadUrl = safeLogUrl(clone.downloadUrl);
        console.error("[youka] quote-export failed", { status: response.status, projectId, request: { resolution: request.resolution, quality: request.quality, fps: request.fps, transparent: request.transparent, renderMode: request.renderMode }, response: clone });
      } catch {}
      const unauthorized = response.status === 401;
      let message = unauthorized ? "Youka rechazó la credencial configurada." : "No fue posible cotizar la exportación.";
      if (!unauthorized) {
        const maybe =
          payload && typeof payload === "object"
            ? String(payload.message || payload?.error?.message || payload?.error || "")
            : "";
        if (maybe) message = maybe;
      }
      return providerFailure(
        unauthorized ? "KARAOKE_PROVIDER_UNAUTHORIZED" : "KARAOKE_PROVIDER_ERROR",
        message,
        "quote-export",
        response.status === 429 || response.status >= 500,
      );
    }
    return { ok: true, data: payload };
  } catch {
    return providerFailure("KARAOKE_PROVIDER_ERROR", "No fue posible comunicarse con Youka.", "quote-export", true);
  } finally {
    clearTimeout(timeout);
  }
}

async function createExport(projectId, request) {
  const enabled = assertEnabled("create-export");
  if (!enabled.ok) return enabled.error;
  const { config, apiKey } = enabled;
  if (!projectId) return providerFailure("KARAOKE_INVALID_REQUEST", "projectId es obligatorio.", "create-export");
  if (!request || !request.resolution || !request.quality || request.fps == null || request.transparent == null || !request.renderMode) {
    return providerFailure("KARAOKE_INVALID_REQUEST", "resolution, quality, fps, transparent y renderMode son obligatorios.", "create-export");
  }

  const payloadRequest = { ...request };
  delete payloadRequest.idempotencyKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.apiBaseUrl}/projects/${encodeURIComponent(projectId)}/exports`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(request.idempotencyKey ? { "idempotency-key": request.idempotencyKey } : {}),
      },
      body: JSON.stringify(payloadRequest),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      try {
        const clone = payload && typeof payload === "object" ? payload : { message: String(payload || "") };
        if (clone && clone.downloadUrl) clone.downloadUrl = safeLogUrl(clone.downloadUrl);
        console.error("[youka] create-export failed", { status: response.status, projectId, request: { resolution: request.resolution, quality: request.quality, fps: request.fps, transparent: request.transparent, renderMode: request.renderMode }, response: clone });
      } catch {}
      const unauthorized = response.status === 401;
      let message = unauthorized ? "Youka rechazó la credencial configurada." : "No fue posible iniciar la exportación.";
      if (!unauthorized) {
        const maybe =
          payload && typeof payload === "object"
            ? String(payload.message || payload?.error?.message || payload?.error || "")
            : "";
        if (maybe) message = maybe;
      }
      return providerFailure(
        unauthorized ? "KARAOKE_PROVIDER_UNAUTHORIZED" : "KARAOKE_PROVIDER_ERROR",
        message,
        "create-export",
        response.status === 429 || response.status >= 500,
      );
    }
    return { ok: true, data: payload };
  } catch {
    return providerFailure("KARAOKE_PROVIDER_ERROR", "No fue posible comunicarse con Youka.", "create-export", true);
  } finally {
    clearTimeout(timeout);
  }
}

async function getExport(exportId) {
  const enabled = assertEnabled("get-export");
  if (!enabled.ok) return enabled.error;
  const { config, apiKey } = enabled;
  if (!exportId) return providerFailure("KARAOKE_INVALID_REQUEST", "exportId es obligatorio.", "get-export");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.apiBaseUrl}/exports/${encodeURIComponent(exportId)}`, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const unauthorized = response.status === 401;
      let message = unauthorized ? "Youka rechazó la credencial configurada." : "No fue posible obtener el estado de la exportación.";
      if (!unauthorized) {
        const maybe =
          payload && typeof payload === "object"
            ? String(payload.message || payload?.error?.message || payload?.error || "")
            : "";
        if (maybe) message = maybe;
      }
      return providerFailure(
        unauthorized ? "KARAOKE_PROVIDER_UNAUTHORIZED" : "KARAOKE_PROVIDER_ERROR",
        message,
        "get-export",
        response.status === 429 || response.status >= 500,
      );
    }
    return { ok: true, data: payload };
  } catch {
    return providerFailure("KARAOKE_PROVIDER_ERROR", "No fue posible comunicarse con Youka.", "get-export", true);
  } finally {
    clearTimeout(timeout);
  }
}

async function getStatus(resourceId) {
  const enabled = assertEnabled("get-status");
  if (!enabled.ok) return enabled.error;
  const { config, apiKey } = enabled;
  if (!resourceId) return providerFailure("KARAOKE_INVALID_REQUEST", "resourceId es obligatorio.", "get-status");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.apiBaseUrl}/tasks/${encodeURIComponent(resourceId)}`, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const unauthorized = response.status === 401 || response.status === 403;
      return providerFailure(
        unauthorized ? "KARAOKE_PROVIDER_UNAUTHORIZED" : "KARAOKE_PROVIDER_ERROR",
        unauthorized ? "Youka rechazó la credencial configurada." : "No fue posible obtener el estado de Youka.",
        "get-status",
        response.status === 429 || response.status >= 500,
      );
    }
    return { ok: true, data: payload };
  } catch {
    return providerFailure("KARAOKE_PROVIDER_ERROR", "No fue posible comunicarse con Youka.", "get-status", true);
  } finally {
    clearTimeout(timeout);
  }
}

export const youkaProvider = {
  createUpload,
  importSource() {
    return unavailable("import-source");
  },
  quoteProject,
  createProject,
  getProject,
  transcribeLyrics() {
    return unavailable("transcribe-lyrics");
  },
  alignLyrics() {
    return unavailable("align-lyrics");
  },
  separateStems() {
    return unavailable("separate-stems");
  },
  updateSettings() {
    return unavailable("update-settings");
  },
  quoteExport,
  createExport,
  getExport,
  getStatus,
  deleteProject() {
    return unavailable("delete-project");
  },
};
