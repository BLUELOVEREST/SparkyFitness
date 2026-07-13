ALTER TABLE workout_plan_templates
ADD COLUMN IF NOT EXISTS plan_mode TEXT NOT NULL DEFAULT 'detailed';

ALTER TABLE workout_plan_templates
DROP CONSTRAINT IF EXISTS chk_workout_plan_templates_plan_mode;

ALTER TABLE workout_plan_templates
ADD CONSTRAINT chk_workout_plan_templates_plan_mode
CHECK (plan_mode IN ('detailed', 'training_focus'));

CREATE TABLE IF NOT EXISTS workout_plan_focus_sessions (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES workout_plan_templates(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    time_slot TEXT NOT NULL CHECK (time_slot IN ('morning', 'noon', 'afternoon', 'evening')),
    training_focus TEXT NOT NULL DEFAULT 'rest',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_workout_plan_focus_session_slot UNIQUE (template_id, day_of_week, time_slot),
    CONSTRAINT chk_workout_plan_focus_session_primary CHECK (
        is_primary = FALSE OR training_focus <> 'rest'
    )
);

CREATE INDEX IF NOT EXISTS idx_workout_plan_focus_sessions_template_id
ON workout_plan_focus_sessions (template_id);

DROP TRIGGER IF EXISTS update_workout_plan_focus_sessions_timestamp ON workout_plan_focus_sessions;

CREATE TRIGGER update_workout_plan_focus_sessions_timestamp
BEFORE UPDATE ON workout_plan_focus_sessions
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
