-- Projection identity only. Core pairing/inbox/entity/media tables are owned by
-- the preceding SparkyGym migration. Existing native-table RLS still applies.
ALTER TABLE public.exercise_preset_entries ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE public.exercise_entry_sets
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS source_owner_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS sparkygym_set_source_identity
  ON public.exercise_entry_sets (exercise_entry_id, source_id) WHERE source = 'opengym';
CREATE UNIQUE INDEX IF NOT EXISTS sparkygym_parent_source_identity
  ON public.exercise_preset_entries (user_id, source_id) WHERE source = 'opengym';
CREATE INDEX IF NOT EXISTS sparkygym_exercise_source_identity
  ON public.exercises (user_id, source_id) WHERE source = 'opengym';

-- Invoker rights are intentional: this helper must not bypass native RLS.
-- Both OLD and NEW are checked, so stripping a source or reparenting a child
-- cannot turn a source-owned object into an editable local one.
CREATE OR REPLACE FUNCTION public.sparkygym_guard_native_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_owner uuid;
  v_parent_owner uuid;
  v_source text;
  v_parent_source text;
BEGIN
  IF current_setting('app.sparkygym_import', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  FOREACH v_row IN ARRAY ARRAY[v_old, v_new] LOOP
    IF v_row IS NULL THEN CONTINUE; END IF;
    v_owner := NULL;
    v_parent_owner := NULL;
    v_source := v_row->>'source';
    v_parent_source := NULL;
    IF TG_TABLE_NAME IN ('exercises', 'exercise_entries', 'exercise_preset_entries') THEN
      v_owner := (v_row->>'user_id')::uuid;
    ELSE
      SELECT e.user_id, e.source INTO v_parent_owner, v_parent_source
        FROM public.exercise_entries e WHERE e.id = (v_row->>'exercise_entry_id')::uuid;
      v_owner := COALESCE((v_row->>'source_owner_id')::uuid, v_parent_owner);
    END IF;
    IF v_source = 'opengym' OR v_parent_source = 'opengym' THEN
      -- Account deletion is the sole ordinary cascade exception. A vanished
      -- connection, entry, template or mapping is not sufficient authority.
      IF TG_OP <> 'INSERT' AND v_owner IS NOT NULL AND
         NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = v_owner) THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION USING ERRCODE = 'P7001', MESSAGE = 'source_owned';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER sparkygym_guard_exercises BEFORE INSERT OR UPDATE OR DELETE ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION public.sparkygym_guard_native_source();
CREATE TRIGGER sparkygym_guard_exercise_entries BEFORE INSERT OR UPDATE OR DELETE ON public.exercise_entries
  FOR EACH ROW EXECUTE FUNCTION public.sparkygym_guard_native_source();
CREATE TRIGGER sparkygym_guard_exercise_entry_sets BEFORE INSERT OR UPDATE OR DELETE ON public.exercise_entry_sets
  FOR EACH ROW EXECUTE FUNCTION public.sparkygym_guard_native_source();
CREATE TRIGGER sparkygym_guard_exercise_preset_entries BEFORE INSERT OR UPDATE OR DELETE ON public.exercise_preset_entries
  FOR EACH ROW EXECUTE FUNCTION public.sparkygym_guard_native_source();
CREATE TRIGGER sparkygym_guard_exercise_activity_details BEFORE INSERT OR UPDATE OR DELETE ON public.exercise_entry_activity_details
  FOR EACH ROW EXECUTE FUNCTION public.sparkygym_guard_native_source();
CREATE TRIGGER sparkygym_guard_exercise_laps BEFORE INSERT OR UPDATE OR DELETE ON public.exercise_entry_laps
  FOR EACH ROW EXECUTE FUNCTION public.sparkygym_guard_native_source();
CREATE TRIGGER sparkygym_guard_exercise_hr_zones BEFORE INSERT OR UPDATE OR DELETE ON public.exercise_entry_hr_zones
  FOR EACH ROW EXECUTE FUNCTION public.sparkygym_guard_native_source();
CREATE TRIGGER sparkygym_guard_exercise_gps_points BEFORE INSERT OR UPDATE OR DELETE ON public.exercise_entry_gps_points
  FOR EACH ROW EXECUTE FUNCTION public.sparkygym_guard_native_source();
CREATE TRIGGER sparkygym_guard_exercise_distance_series BEFORE INSERT OR UPDATE OR DELETE ON public.exercise_entry_distance_series
  FOR EACH ROW EXECUTE FUNCTION public.sparkygym_guard_native_source();
