-- Add native circumference columns; existing check-in RLS policies apply unchanged.
ALTER TABLE public.check_in_measurements
  ADD COLUMN IF NOT EXISTS left_forearm numeric,
  ADD COLUMN IF NOT EXISTS right_forearm numeric,
  ADD COLUMN IF NOT EXISTS left_wrist numeric,
  ADD COLUMN IF NOT EXISTS right_wrist numeric,
  ADD COLUMN IF NOT EXISTS left_ankle numeric,
  ADD COLUMN IF NOT EXISTS right_ankle numeric;

-- Keep capture and snapshots on the same finite built-in metric set.
CREATE OR REPLACE FUNCTION sparkygym_private.capture_body() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_row jsonb; after_row jsonb; row_data jsonb; owner uuid; metric text; def jsonb; val jsonb; payload jsonb;
  zone text; category jsonb; old_entity text; new_entity text;
BEGIN
  IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW); END IF;
  row_data:=coalesce(after_row,before_row); owner:=(row_data->>'user_id')::uuid;
  -- An FK account cascade already holds the user tuple lock. Do not invert
  -- user -> owner against import's owner -> connection/FK order, or emit for
  -- a vanished account. Ordinary source-row deletes still capture tombstones.
  IF TG_OP='DELETE' AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id=owner) THEN RETURN OLD; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sparkygym-owner:'||owner::text,0));
  SELECT coalesce(p.timezone,'UTC') INTO zone FROM public.user_preferences p WHERE p.user_id=owner;
  zone:=coalesce(zone,'UTC');
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN zone:='UTC'; END IF;
  IF TG_TABLE_NAME='check_in_measurements' THEN
    FOREACH metric IN ARRAY ARRAY['weight','height','neck','waist','hips','shoulders','chest','abdomen','left_biceps','right_biceps','left_thigh','right_thigh','left_calf','right_calf','left_forearm','right_forearm','left_wrist','right_wrist','left_ankle','right_ankle','body_fat_percentage','muscle_mass_kg','bone_mass_kg','body_water_percentage','steps','bmr'] LOOP
      old_entity:=(before_row->>'entry_date')||':'||metric;
      new_entity:=(after_row->>'entry_date')||':'||metric;
      IF TG_OP='UPDATE' AND before_row->metric IS NOT DISTINCT FROM after_row->metric AND old_entity IS NOT DISTINCT FROM new_entity THEN CONTINUE; END IF;
      IF old_entity IS NOT NULL AND (TG_OP='DELETE' OR old_entity IS DISTINCT FROM new_entity) AND before_row->metric <> 'null'::jsonb THEN
        PERFORM sparkygym_private.emit(owner,'body_measurement',old_entity,NULL);
      END IF;
      IF after_row IS NOT NULL AND (after_row->metric) IS NOT NULL THEN
        val:=after_row->metric;
        IF val='null'::jsonb THEN
          IF before_row->metric IS NOT NULL AND before_row->metric<>'null'::jsonb AND old_entity=new_entity THEN PERFORM sparkygym_private.emit(owner,'body_measurement',new_entity,NULL); END IF;
        ELSE
          def:=sparkygym_private.builtin_definition(metric);
          PERFORM sparkygym_private.emit(owner,'body_definition',metric,def);
          payload:=sparkygym_private.measurement_payload(metric,after_row->>'entry_date',val,def,zone,NULL);
          PERFORM sparkygym_private.emit(owner,'body_measurement',new_entity,payload);
        END IF;
      END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME='onboarding_data' THEN
    IF TG_OP='UPDATE' AND before_row->'target_weight' IS NOT DISTINCT FROM after_row->'target_weight' THEN RETURN NULL; END IF;
    val:=after_row->'target_weight'; payload:=NULL;
    IF jsonb_typeof(val)='number' AND (val#>>'{}')::numeric>0 THEN
      payload:=jsonb_build_object('metric_id','target_weight','value',val,'unit','kg','effective_date',NULL);
    END IF;
    PERFORM sparkygym_private.emit(owner,'body_goal','target_weight',payload);
  ELSIF TG_TABLE_NAME='custom_categories' THEN
    metric:='custom:'||(row_data->>'id');
    IF TG_OP='DELETE' THEN PERFORM sparkygym_private.emit(owner,'body_definition',metric,NULL);
    ELSE PERFORM sparkygym_private.emit(owner,'body_definition',metric,sparkygym_private.custom_definition(after_row)); END IF;
  ELSE
    -- A custom row is an intrinsic sample, including hourly records on one day.
    old_entity:=before_row->>'id'; new_entity:=after_row->>'id';
    IF old_entity IS NOT NULL AND (TG_OP='DELETE' OR old_entity IS DISTINCT FROM new_entity) THEN
      PERFORM sparkygym_private.emit(owner,'body_measurement',old_entity,NULL);
    END IF;
    IF after_row IS NOT NULL THEN
      SELECT to_jsonb(cc) INTO category FROM public.custom_categories cc WHERE cc.id=(after_row->>'category_id')::uuid AND cc.user_id=owner;
      IF category IS NOT NULL THEN
        metric:='custom:'||(after_row->>'category_id'); def:=sparkygym_private.custom_definition(category);
        payload:=sparkygym_private.measurement_payload(metric,after_row->>'entry_date',after_row->'value',def,zone,(after_row->>'entry_timestamp')::timestamptz);
        PERFORM sparkygym_private.emit(owner,'body_measurement',new_entity,payload);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.sparkygym_body_snapshot() RETURNS TABLE(resource text,entity_id text,payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner uuid:=nullif(current_setting('app.authenticated_user_id',true),'')::uuid;
  zone text; metric text; def jsonb; row_data jsonb; measurement record;
BEGIN
  IF owner IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sparkygym-owner:'||owner::text,0));
  SELECT coalesce(p.timezone,'UTC') INTO zone FROM public.user_preferences p WHERE p.user_id=owner;
  zone:=coalesce(zone,'UTC');
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN zone:='UTC'; END IF;
  FOREACH metric IN ARRAY ARRAY['weight','height','neck','waist','hips','shoulders','chest','abdomen','left_biceps','right_biceps','left_thigh','right_thigh','left_calf','right_calf','left_forearm','right_forearm','left_wrist','right_wrist','left_ankle','right_ankle','body_fat_percentage','muscle_mass_kg','bone_mass_kg','body_water_percentage','steps','bmr'] LOOP
    def:=sparkygym_private.builtin_definition(metric);
    resource:='body_definition'; entity_id:=metric; payload:=def; RETURN NEXT;
    FOR row_data IN SELECT to_jsonb(cm) FROM public.check_in_measurements cm WHERE cm.user_id=owner LOOP
      IF row_data->metric IS NOT NULL AND row_data->metric<>'null'::jsonb THEN
        resource:='body_measurement'; entity_id:=(row_data->>'entry_date')||':'||metric;
        payload:=sparkygym_private.measurement_payload(metric,row_data->>'entry_date',row_data->metric,def,zone,NULL); RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
  FOR row_data IN SELECT to_jsonb(cc) FROM public.custom_categories cc WHERE cc.user_id=owner LOOP
    metric:='custom:'||(row_data->>'id'); def:=sparkygym_private.custom_definition(row_data);
    resource:='body_definition'; entity_id:=metric; payload:=def; RETURN NEXT;
    FOR measurement IN SELECT cm.id,cm.entry_date,cm.value,cm.entry_timestamp
      FROM public.custom_measurements cm WHERE cm.user_id=owner AND cm.category_id=(row_data->>'id')::uuid
      ORDER BY cm.entry_date,cm.entry_timestamp,cm.id LOOP
      resource:='body_measurement'; entity_id:=measurement.id::text;
      payload:=sparkygym_private.measurement_payload(metric,measurement.entry_date::text,to_jsonb(measurement.value),def,zone,measurement.entry_timestamp); RETURN NEXT;
    END LOOP;
  END LOOP;
  SELECT to_jsonb(o) INTO row_data FROM public.onboarding_data o WHERE o.user_id=owner;
  IF jsonb_typeof(row_data->'target_weight')='number' AND (row_data->>'target_weight')::numeric>0 THEN
    resource:='body_goal'; entity_id:='target_weight';
    payload:=jsonb_build_object('metric_id','target_weight','value',row_data->'target_weight','unit','kg','effective_date',NULL); RETURN NEXT;
  END IF;
END $$;

COMMENT ON COLUMN public.check_in_measurements.left_biceps IS 'Left upper-arm circumference (legacy biceps storage key); not muscle mass.';
COMMENT ON COLUMN public.check_in_measurements.right_biceps IS 'Right upper-arm circumference (legacy biceps storage key); not muscle mass.';
REVOKE ALL ON FUNCTION sparkygym_private.capture_body() FROM PUBLIC;
