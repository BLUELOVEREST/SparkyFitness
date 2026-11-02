// Aggregate observations, not action rows: an authoritative parent replaces
// child energy/time while child distance and steps remain action observations.
export const workoutTotalsRowsSql = `
  SELECT ee.user_id, ee.entry_date, ee.exercise_name, ee.exercise_preset_entry_id,
    CASE WHEN p.source_summary IS NULL THEN ee.calories_burned END AS calories_burned,
    CASE WHEN p.source_summary IS NULL THEN ee.calories_applied END AS calories_applied,
    CASE WHEN p.source_summary IS NULL THEN ee.duration_minutes END AS duration_minutes,
    ee.distance, ee.steps, 1 AS entry_count_weight
  FROM exercise_entries ee
  LEFT JOIN exercise_preset_entries p ON p.id = ee.exercise_preset_entry_id AND p.user_id = ee.user_id
  UNION ALL
  SELECT user_id, entry_date, name, id,
    (source_summary->>'calories_kcal')::numeric,
    NULL::numeric,
    (source_summary->>'duration_seconds')::numeric / 60,
    NULL::numeric, NULL::integer,
    CASE WHEN EXISTS (SELECT 1 FROM exercise_entries child WHERE child.exercise_preset_entry_id = parent.id AND child.user_id = parent.user_id) THEN 0 ELSE 1 END
  FROM exercise_preset_entries parent WHERE source_summary IS NOT NULL
`;
