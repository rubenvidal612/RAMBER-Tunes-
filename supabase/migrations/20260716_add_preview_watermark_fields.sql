-- Watermark configurable por vendedor y audio temporal para previews con cuenta regresiva

ALTER TABLE public.vendor_settings
  ADD COLUMN IF NOT EXISTS watermark_version TEXT NOT NULL DEFAULT 'v1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vendor_settings_watermark_version_chk'
  ) THEN
    ALTER TABLE public.vendor_settings
      ADD CONSTRAINT vendor_settings_watermark_version_chk
      CHECK (watermark_version IN ('v1', 'v2'));
  END IF;
END
$$;

ALTER TABLE public.preview_shares
  ADD COLUMN IF NOT EXISTS watermarked_audio_key TEXT NULL;

ALTER TABLE public.preview_shares
  ADD COLUMN IF NOT EXISTS watermark_version_used TEXT NULL;

ALTER TABLE public.preview_shares
  ADD COLUMN IF NOT EXISTS watermarked_generated_at TIMESTAMP WITH TIME ZONE NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'preview_shares_watermark_version_used_chk'
  ) THEN
    ALTER TABLE public.preview_shares
      ADD CONSTRAINT preview_shares_watermark_version_used_chk
      CHECK (watermark_version_used IS NULL OR watermark_version_used IN ('v1', 'v2'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_preview_shares_watermarked_audio_key
  ON public.preview_shares(watermarked_audio_key)
  WHERE watermarked_audio_key IS NOT NULL;
