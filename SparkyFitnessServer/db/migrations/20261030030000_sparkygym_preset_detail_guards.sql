-- Activity details may belong to a whole session without an exercise child.
-- Check both parent paths under existing invoker rights and native RLS.
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
  v_preset_owner uuid;
  v_preset_source text;
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
      IF TG_TABLE_NAME = 'exercise_entry_activity_details' THEN
        SELECT p.user_id, p.source INTO v_preset_owner, v_preset_source
          FROM public.exercise_preset_entries p WHERE p.id = (v_row->>'exercise_preset_entry_id')::uuid;
        IF v_preset_source = 'opengym' THEN
          v_parent_owner := v_preset_owner;
          v_parent_source := v_preset_source;
        END IF;
      END IF;
      v_owner := COALESCE((v_row->>'source_owner_id')::uuid, v_parent_owner);
    END IF;
    IF v_source = 'opengym' OR v_parent_source = 'opengym' THEN
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
