CREATE TABLE IF NOT EXISTS user_goal_meal_macro_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  goal_date DATE NOT NULL,
  slot_key TEXT NOT NULL,
  label TEXT NOT NULL,
  calories NUMERIC NOT NULL DEFAULT 0,
  protein NUMERIC NOT NULL DEFAULT 0,
  carbs NUMERIC NOT NULL DEFAULT 0,
  fat NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, goal_date, slot_key)
);

CREATE INDEX IF NOT EXISTS idx_user_goal_meal_macro_targets_user_date
  ON user_goal_meal_macro_targets (user_id, goal_date);
