ALTER TABLE public.ai_service_settings
  ADD COLUMN IF NOT EXISTS profile_settings JSONB;
