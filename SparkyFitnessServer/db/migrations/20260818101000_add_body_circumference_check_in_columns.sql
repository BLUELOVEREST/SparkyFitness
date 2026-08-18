ALTER TABLE public.check_in_measurements
  ADD COLUMN IF NOT EXISTS shoulders numeric,
  ADD COLUMN IF NOT EXISTS chest numeric,
  ADD COLUMN IF NOT EXISTS abdomen numeric,
  ADD COLUMN IF NOT EXISTS left_biceps numeric,
  ADD COLUMN IF NOT EXISTS right_biceps numeric,
  ADD COLUMN IF NOT EXISTS left_thigh numeric,
  ADD COLUMN IF NOT EXISTS right_thigh numeric,
  ADD COLUMN IF NOT EXISTS left_calf numeric,
  ADD COLUMN IF NOT EXISTS right_calf numeric;
