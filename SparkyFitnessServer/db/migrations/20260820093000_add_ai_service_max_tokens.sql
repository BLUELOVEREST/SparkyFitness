ALTER TABLE public.ai_service_settings
  ADD COLUMN IF NOT EXISTS max_tokens integer;

DO $$
BEGIN
  ALTER TABLE public.ai_service_settings
    ADD CONSTRAINT ai_service_settings_max_tokens_positive
    CHECK (max_tokens IS NULL OR max_tokens > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
