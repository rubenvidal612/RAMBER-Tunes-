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

function providerFailure(code: "KARAOKE_PROVIDER_DISABLED" | "KARAOKE_PROVIDER_UNAUTHORIZED" | "KARAOKE_PROVIDER_ERROR" | "KARAOKE_INVALID_REQUEST", message: string, retryable = false): KaraokeProviderResponse<never> {
  return { ok: false, error: { code, message, operation: "quote-project", retryable, provider: "youka" } };
}

async function quoteProject(request: KaraokeProjectQuoteRequest): Promise<KaraokeProviderResponse<KaraokeCreditQuote>> {
  const config = getYoukaServerConfig();
  const apiKey = String(process.env.YOUKA_API_KEY || "").trim();
  if (!config.enabled) return providerFailure("KARAOKE_PROVIDER_DISABLED", "La cotización de Video Karaoke está desactivada.");
  if (!apiKey) return providerFailure("KARAOKE_PROVIDER_UNAUTHORIZED", "Falta configurar la credencial privada de Youka.");
  if (!ALLOWED_SPLIT_MODELS.has(String(request.splitModel || ""))) return providerFailure("KARAOKE_INVALID_REQUEST", "El modelo de separación no es válido.");
  const durationSeconds = Number(request.durationSeconds);
  if (!request.inputFileId && (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 1200)) {
    return providerFailure("KARAOKE_INVALID_REQUEST", "durationSeconds debe ser mayor que 0 y menor o igual que 1200.");
  }
  if (!request.inputFileId && !request.durationSeconds) return providerFailure("KARAOKE_INVALID_REQUEST", "Se requiere inputFileId o durationSeconds.");

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
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok) {
      const unauthorized = response.status === 401 || response.status === 403;
      return providerFailure(
        unauthorized ? "KARAOKE_PROVIDER_UNAUTHORIZED" : "KARAOKE_PROVIDER_ERROR",
        unauthorized ? "Youka rechazó la credencial configurada." : "No fue posible obtener la cotización de Youka.",
        response.status === 429 || response.status >= 500,
      );
    }
    if (!payload || !Number.isInteger(payload.creditsRequired) || !payload.breakdown) {
      return providerFailure("KARAOKE_PROVIDER_ERROR", "Youka devolvió una cotización incompleta.");
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
    return providerFailure("KARAOKE_PROVIDER_ERROR", "No fue posible comunicarse con Youka.", true);
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

// Este adaptador define el límite con Youka. En esta etapa solo la cotización
// puede llamar al proveedor; las operaciones que consumen créditos siguen bloqueadas.
export const youkaProvider = {
  createUpload(_request: KaraokeUploadRequest): KaraokeProviderResponse<KaraokeUploadTarget> {
    return unavailable("create-upload");
  },
  importSource(_sourceUrl: string, _idempotencyKey?: string): KaraokeProviderResponse<KaraokeProject> {
    return unavailable("import-source");
  },
  quoteProject,
  createProject(_request: KaraokeProjectCreateRequest): KaraokeProviderResponse<KaraokeProject> {
    return unavailable("create-project");
  },
  getProject(_projectId: string): KaraokeProviderResponse<KaraokeProject> {
    return unavailable("get-project");
  },
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
  getStatus(_resourceId: string): KaraokeProviderResponse<KaraokeProject | KaraokeExport> {
    return unavailable("get-status");
  },
  deleteProject(_projectId: string, _idempotencyKey?: string): KaraokeProviderResponse<{ deleted: true }> {
    return unavailable("delete-project");
  },
};
