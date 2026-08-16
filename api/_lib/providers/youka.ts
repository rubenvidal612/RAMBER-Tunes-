import type {
  KaraokeExport,
  KaraokeExportRequest,
  KaraokeCreditQuote,
  KaraokeProject,
  KaraokeProjectCreateRequest,
  KaraokeProjectQuoteRequest,
  KaraokeProjectSettings,
  KaraokeProviderResponse,
  KaraokeUploadRequest,
  KaraokeUploadTarget,
  YoukaOperation,
} from "../video-karaoke/types";

export interface YoukaServerConfig {
  enabled: boolean;
  apiBaseUrl: string;
  apiKeyConfigured: boolean;
  creditMultiplier: number;
  creditFixed: number;
  downloadTtlHours: number;
}

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

function finiteEnvNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getYoukaServerConfig(): YoukaServerConfig {
  return {
    enabled: String(process.env.KARAOKE_YOUKA_ENABLED || "false").toLowerCase() === "true",
    apiBaseUrl: String(process.env.YOUKA_API_BASE_URL || "https://api.youka.io/api/v1").replace(/\/+$/, ""),
    apiKeyConfigured: Boolean(String(process.env.YOUKA_API_KEY || "").trim()),
    creditMultiplier: Math.max(0, finiteEnvNumber(process.env.KARAOKE_CREDIT_MULTIPLIER, 1)),
    creditFixed: Math.max(0, finiteEnvNumber(process.env.KARAOKE_CREDIT_FIXED, 0)),
    downloadTtlHours: Math.max(1, finiteEnvNumber(process.env.KARAOKE_DOWNLOAD_TTL_HOURS, 72)),
  };
}

function providerFailure(code: "KARAOKE_PROVIDER_DISABLED" | "KARAOKE_PROVIDER_UNAUTHORIZED" | "KARAOKE_PROVIDER_ERROR" | "KARAOKE_INVALID_REQUEST", message: string, operation: YoukaOperation, retryable = false): KaraokeProviderResponse<never> {
  return { ok: false, error: { code, message, operation, retryable, provider: "youka" } };
}

function assertEnabled(operation: YoukaOperation) {
  const config = getYoukaServerConfig();
  const apiKey = String(process.env.YOUKA_API_KEY || "").trim();
  if (!config.enabled) return { ok: false, error: providerFailure("KARAOKE_PROVIDER_DISABLED", "La integración de Youka está desactivada en el servidor.", operation) };
  if (!apiKey) return { ok: false, error: providerFailure("KARAOKE_PROVIDER_UNAUTHORIZED", "Falta configurar la credencial privada de Youka.", operation) };
  return { ok: true, config, apiKey };
}

async function quoteProject(request: KaraokeProjectQuoteRequest): Promise<KaraokeProviderResponse<KaraokeCreditQuote>> {
  const enabled = assertEnabled("quote-project");
  if (!enabled.ok) return enabled.error;
  const { config, apiKey } = enabled;
  if (!ALLOWED_SPLIT_MODELS.has(String(request.splitModel || ""))) return providerFailure("KARAOKE_INVALID_REQUEST", "El modelo de separación no es válido.", "quote-project");
  const durationSeconds = Number(request.durationSeconds);
  if (!request.inputFileId && (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 1200)) {
    return providerFailure("KARAOKE_INVALID_REQUEST", "durationSeconds debe ser mayor que 0 y menor o igual que 1200.", "quote-project");
  }
  if (!request.inputFileId && !request.durationSeconds) return providerFailure("KARAOKE_INVALID_REQUEST", "Se requiere inputFileId o durationSeconds.", "quote-project");

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
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
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

function unavailable<T>(operation: YoukaOperation): KaraokeProviderResponse<T> {
  const config = getYoukaServerConfig();
  return {
    ok: false,
    error: {
      code: config.enabled ? "KARAOKE_PROVIDER_NOT_IMPLEMENTED" : "KARAOKE_PROVIDER_DISABLED",
      message: config.enabled
        ? "La integración de Youka aún no está habilitada para ejecutar operaciones."
        : "La integración de Youka está desactivada en el servidor.",
      operation,
      retryable: false,
      provider: "youka",
    },
  };
}

async function createUpload(request: KaraokeUploadRequest): Promise<KaraokeProviderResponse<KaraokeUploadTarget>> {
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
    if (!inputFileId || !uploadUrl) {
      return providerFailure("KARAOKE_PROVIDER_ERROR", "Youka devolvió una subida incompleta.", "create-upload");
    }
    return {
      ok: true,
      data: {
        uploadId: inputFileId,
        uploadUrl,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
    };
  } catch {
    return providerFailure("KARAOKE_PROVIDER_ERROR", "No fue posible comunicarse con Youka.", "create-upload", true);
  } finally {
    clearTimeout(timeout);
  }
}

async function createProject(request: KaraokeProjectCreateRequest): Promise<KaraokeProviderResponse<KaraokeProject>> {
  const enabled = assertEnabled("create-project");
  if (!enabled.ok) return enabled.error;
  const { config, apiKey } = enabled;
  if (!request?.title || !request?.inputFileId) return providerFailure("KARAOKE_INVALID_REQUEST", "title e inputFileId son obligatorios.", "create-project");
  if (!ALLOWED_SPLIT_MODELS.has(String(request.splitModel || "mdx23c"))) return providerFailure("KARAOKE_INVALID_REQUEST", "El modelo de separación no es válido.", "create-project");
  if (!request.lyricsSource || !request.lyricsSource.type) return providerFailure("KARAOKE_INVALID_REQUEST", "lyricsSource es obligatorio.", "create-project");
  if (request.lyricsSource.type === "align" && !String(request.lyricsSource.lyrics || "").trim()) return providerFailure("KARAOKE_INVALID_REQUEST", "lyricsSource.lyrics es obligatorio para align.", "create-project");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.apiBaseUrl}/projects`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(request.idempotencyKey ? { "idempotency-key": request.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        title: request.title,
        inputFileId: request.inputFileId,
        splitModel: request.splitModel || "mdx23c",
        lyricsSource: request.lyricsSource,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
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
  } catch {
    return providerFailure("KARAOKE_PROVIDER_ERROR", "No fue posible comunicarse con Youka.", "create-project", true);
  } finally {
    clearTimeout(timeout);
  }
}

async function getProject(projectId: string): Promise<KaraokeProviderResponse<KaraokeProject>> {
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
    const ready = stems.some((stem: any) => stem && stem.type === "instrumental");
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

async function getStatus(resourceId: string): Promise<KaraokeProviderResponse<any>> {
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
  importSource(_sourceUrl: string, _idempotencyKey?: string): KaraokeProviderResponse<KaraokeProject> {
    return unavailable("import-source");
  },
  quoteProject,
  createProject,
  getProject,
  transcribeLyrics(_projectId: string, _language?: string): KaraokeProviderResponse<KaraokeProject> {
    return unavailable("transcribe-lyrics");
  },
  alignLyrics(_projectId: string, _lyrics: string, _language?: string): KaraokeProviderResponse<KaraokeProject> {
    return unavailable("align-lyrics");
  },
  separateStems(_projectId: string, _model?: string): KaraokeProviderResponse<KaraokeProject> {
    return unavailable("separate-stems");
  },
  updateSettings(_projectId: string, _settings: KaraokeProjectSettings): KaraokeProviderResponse<KaraokeProject> {
    return unavailable("update-settings");
  },
  quoteExport(_projectId: string, _request: KaraokeExportRequest): KaraokeProviderResponse<never> {
    return unavailable("quote-export");
  },
  createExport(_projectId: string, _request: KaraokeExportRequest): KaraokeProviderResponse<KaraokeExport> {
    return unavailable("create-export");
  },
  getExport(_exportId: string): KaraokeProviderResponse<KaraokeExport> {
    return unavailable("get-export");
  },
  getStatus,
  deleteProject(_projectId: string, _idempotencyKey?: string): KaraokeProviderResponse<{ deleted: true }> {
    return unavailable("delete-project");
  },
};
