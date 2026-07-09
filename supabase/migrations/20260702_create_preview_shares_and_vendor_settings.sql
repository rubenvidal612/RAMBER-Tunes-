-- Configuracion de vendedor y previews con cuenta regresiva

CREATE TABLE IF NOT EXISTS public.vendor_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  countdown_default_hours INTEGER NOT NULL DEFAULT 24,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT vendor_settings_countdown_default_hours_chk
    CHECK (countdown_default_hours >= 1)
);

CREATE INDEX IF NOT EXISTS idx_vendor_settings_updated_at
  ON public.vendor_settings(updated_at DESC);

ALTER TABLE public.vendor_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vendor_settings'
      AND policyname = 'Users can view their own vendor settings'
  ) THEN
    CREATE POLICY "Users can view their own vendor settings"
      ON public.vendor_settings
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vendor_settings'
      AND policyname = 'Users can insert their own vendor settings'
  ) THEN
    CREATE POLICY "Users can insert their own vendor settings"
      ON public.vendor_settings
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vendor_settings'
      AND policyname = 'Users can update their own vendor settings'
  ) THEN
    CREATE POLICY "Users can update their own vendor settings"
      ON public.vendor_settings
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.preview_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id BIGINT NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_label TEXT,
  has_countdown BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMP WITH TIME ZONE NULL,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT preview_shares_client_label_len_chk
    CHECK (client_label IS NULL OR char_length(client_label) <= 120),
  CONSTRAINT preview_shares_expires_required_chk
    CHECK (
      (has_countdown = FALSE AND expires_at IS NULL)
      OR
      (has_countdown = TRUE AND expires_at IS NOT NULL)
    ),
  CONSTRAINT preview_shares_paid_at_chk
    CHECK (
      (is_paid = FALSE)
      OR
      (is_paid = TRUE AND paid_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_preview_shares_created_by
  ON public.preview_shares(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_preview_shares_song_id
  ON public.preview_shares(song_id);

CREATE INDEX IF NOT EXISTS idx_preview_shares_expires_at
  ON public.preview_shares(expires_at);

ALTER TABLE public.preview_shares ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'preview_shares'
      AND policyname = 'Users can view their own preview shares'
  ) THEN
    CREATE POLICY "Users can view their own preview shares"
      ON public.preview_shares
      FOR SELECT
      USING (auth.uid() = created_by);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'preview_shares'
      AND policyname = 'Users can insert their own preview shares'
  ) THEN
    CREATE POLICY "Users can insert their own preview shares"
      ON public.preview_shares
      FOR INSERT
      WITH CHECK (auth.uid() = created_by);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'preview_shares'
      AND policyname = 'Users can update their own preview shares'
  ) THEN
    CREATE POLICY "Users can update their own preview shares"
      ON public.preview_shares
      FOR UPDATE
      USING (auth.uid() = created_by)
      WITH CHECK (auth.uid() = created_by);
  END IF;
END
$$;
