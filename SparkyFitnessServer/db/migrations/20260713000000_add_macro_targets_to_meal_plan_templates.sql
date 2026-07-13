ALTER TABLE meal_plan_templates
  ADD COLUMN IF NOT EXISTS macro_targets JSONB NOT NULL DEFAULT '{}'::jsonb;
