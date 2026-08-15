export type KaraokeProjectStatus =
  | "draft"
  | "uploading"
  | "processing"
  | "ready"
  | "exporting"
  | "completed"
  | "failed"
  | "expired";

export type KaraokeExportStatus = "draft" | "processing" | "completed" | "failed" | "expired";

export type KaraokeLyricsSource =
  | { type: "transcribe"; language?: string }
  | { type: "align"; lyrics: string; language?: string }
  | { type: "timed"; lyrics: string };

export type KaraokeAudioMode = "remove-vocals" | "keep-backing-vocals" | "original";
export type KaraokeVideoFormat = "16:9" | "9:16" | "1:1";
export type KaraokeResolution = "720p" | "1080p";
export type KaraokeQuality = "standard" | "high";

export interface KaraokeUploadRequest {
  filename: string;
  contentType: string;
  contentLength: number;
  idempotencyKey?: string;
}

export interface KaraokeUploadTarget {
  uploadId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface KaraokeProjectSettings {
  audioMode?: KaraokeAudioMode;
  instrumentalVolume?: number;
  backingVocalsVolume?: number;
  pitch?: number;
  presetId?: string;
  format?: KaraokeVideoFormat;
  fontFamily?: string;
  fontSize?: number;
  lyricPosition?: "top" | "center" | "bottom";
  primaryColor?: string;
  highlightColor?: string;
  backgroundColor?: string;
  backgroundMediaId?: string;
  transparentBackground?: boolean;
  watermark?: boolean;
}

export interface KaraokeProjectCreateRequest {
  title: string;
  artist?: string;
  genre?: string;
  inputFileId: string;
  lyricsSource: KaraokeLyricsSource;
  splitModel?: string;
  settings?: KaraokeProjectSettings;
  idempotencyKey?: string;
}

export interface KaraokeProjectQuoteRequest {
  inputFileId?: string;
  durationSeconds?: number;
  lyricsSource?: Exclude<KaraokeLyricsSource, { type: "timed" }> | null;
  splitModel: string;
}

export interface KaraokeProject {
  id: string;
  status: KaraokeProjectStatus;
  title: string;
  artist?: string;
  inputFileId: string;
  providerTaskId?: string;
  settings: KaraokeProjectSettings;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface KaraokeExportRequest {
  resolution: KaraokeResolution;
  quality: KaraokeQuality;
  format: "mp4";
  videoFormat?: KaraokeVideoFormat;
  transparentBackground?: boolean;
  watermark?: boolean;
  idempotencyKey?: string;
}

export interface KaraokeExport {
  id: string;
  projectId: string;
  status: KaraokeExportStatus;
  providerTaskId?: string;
  downloadUrl?: string;
  downloadExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KaraokeCreditQuote {
  providerCredits: number;
  lucianaCredits: null;
  currency: "credits";
  isEstimate: false;
  durationSeconds: number;
  availableBalance: number;
  sufficientBalance: boolean;
  breakdown: {
    split: number;
    sync: number;
  };
}

export type YoukaOperation =
  | "create-upload"
  | "import-source"
  | "quote-project"
  | "create-project"
  | "get-project"
  | "transcribe-lyrics"
  | "align-lyrics"
  | "separate-stems"
  | "update-settings"
  | "quote-export"
  | "create-export"
  | "get-export"
  | "get-status"
  | "delete-project";

export interface YoukaProviderErrorShape {
  code: "KARAOKE_PROVIDER_DISABLED" | "KARAOKE_PROVIDER_NOT_IMPLEMENTED" | "KARAOKE_PROVIDER_UNAUTHORIZED" | "KARAOKE_PROVIDER_ERROR" | "KARAOKE_INVALID_REQUEST";
  message: string;
  operation?: YoukaOperation;
  retryable: boolean;
  provider: "youka";
  requestId?: string;
}

export interface KaraokeProviderResult<T> {
  ok: true;
  data: T;
}

export interface KaraokeProviderFailure {
  ok: false;
  error: YoukaProviderErrorShape;
}

export type KaraokeProviderResponse<T> = KaraokeProviderResult<T> | KaraokeProviderFailure;
