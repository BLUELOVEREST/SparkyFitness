-- Session measurements belong to the workout parent, never an arbitrary action.
-- Existing diary RLS and source-ownership policies apply unchanged.
ALTER TABLE exercise_preset_entries
  ADD COLUMN source_summary jsonb;

ALTER TABLE exercise_preset_entries ADD CONSTRAINT workout_source_summary_shape CHECK (
  source_summary IS NULL OR (
    jsonb_typeof(source_summary) = 'object'
    AND source_summary ?& ARRAY['duration_seconds', 'calories_kcal']
    AND source_summary - ARRAY['duration_seconds', 'calories_kcal'] = '{}'::jsonb
    AND jsonb_typeof(source_summary->'duration_seconds') IN ('number', 'null')
    AND jsonb_typeof(source_summary->'calories_kcal') IN ('number', 'null')
    AND (source_summary->>'duration_seconds')::numeric >= 0 IS NOT FALSE
    AND (source_summary->>'calories_kcal')::numeric >= 0 IS NOT FALSE
  )
);
