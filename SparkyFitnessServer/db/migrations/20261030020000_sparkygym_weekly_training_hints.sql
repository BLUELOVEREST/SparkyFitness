-- Native SF weekly intent is metadata, not an OG routine or a nutrition change.
CREATE FUNCTION sparkygym_private.schedule_payload(p_owner uuid,p_template integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE t public.workout_plan_templates%ROWTYPE; zone text; week_start integer; days jsonb;
BEGIN
  SELECT * INTO t FROM public.workout_plan_templates
    WHERE id=p_template AND user_id=p_owner AND is_active=true
      AND plan_mode='training_focus' AND schedule_type='weekly' AND start_date IS NOT NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.workout_plan_focus_sessions fs
    WHERE fs.template_id=t.id AND fs.training_focus<>'rest'
    GROUP BY fs.day_of_week HAVING count(*) FILTER (WHERE fs.is_primary)<>1) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Training days must have exactly one primary training session';
  END IF;
  SELECT coalesce(p.timezone,'UTC'),coalesce(p.first_day_of_week,0)
    INTO zone,week_start FROM public.user_preferences p WHERE p.user_id=p_owner;
  zone:=coalesce(zone,'UTC'); week_start:=coalesce(week_start,0);
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN zone:='UTC'; END IF;
  SELECT coalesce(jsonb_agg(day ORDER BY weekday),'[]'::jsonb) INTO days FROM (
    SELECT fs.day_of_week AS weekday,jsonb_build_object('weekday',fs.day_of_week,'slots',
      jsonb_agg(jsonb_build_object('time_slot',fs.time_slot,'activity',fs.training_focus,'is_main',fs.is_primary)
        ORDER BY CASE fs.time_slot WHEN 'morning' THEN 0 WHEN 'noon' THEN 1 WHEN 'afternoon' THEN 2 ELSE 3 END)) AS day
    FROM public.workout_plan_focus_sessions fs WHERE fs.template_id=t.id AND fs.training_focus<>'rest'
    GROUP BY fs.day_of_week
  ) grouped;
  RETURN jsonb_build_object('name',t.plan_name,'timezone',zone,'week_start',week_start,
    'effective_from',t.start_date::text,'effective_until',t.end_date::text,'days',days);
END $$;

CREATE FUNCTION sparkygym_private.publish_schedule(p_owner uuid,p_template integer)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE packet jsonb; operation text;
BEGIN
  packet:=sparkygym_private.schedule_payload(p_owner,p_template);
  IF packet IS NULL AND NOT EXISTS (SELECT 1 FROM public.sparkygym_streams s
    WHERE s.user_id=p_owner AND s.direction='out' AND s.resource='schedule_summary' AND s.entity_id=p_template::text) THEN RETURN; END IF;
  operation:=CASE WHEN packet IS NULL THEN 'delete' ELSE 'upsert' END;
  -- All deferred invocations see final native state. Skip the emitter only when
  -- EVERY eligible connection already has that exact final packet in this TX.
  -- A stale same-TX snapshot must instead reach emit for safe finalization.
  IF NOT EXISTS (SELECT 1 FROM public.sparkygym_connections c
    WHERE c.user_id=p_owner AND c.status IN ('active','paused') AND c.scopes ? 'schedule_summary'
      AND NOT EXISTS (SELECT 1 FROM public.sparkygym_outbox o
        WHERE o.user_id=p_owner AND c.id=o.connection_id AND o.kind='event'
          AND o.resource='schedule_summary' AND o.entity_id=p_template::text
          AND o.created_xid=pg_current_xact_id()
          AND o.body::jsonb->>'operation'=operation
          AND o.body::jsonb->'payload' IS NOT DISTINCT FROM coalesce(packet,'null'::jsonb))) THEN RETURN; END IF;
  PERFORM sparkygym_private.emit(p_owner,'schedule_summary',p_template::text,packet);
END $$;

CREATE FUNCTION sparkygym_private.capture_schedule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_row jsonb; after_row jsonb; row_data jsonb; owner uuid; template integer; item record;
BEGIN
  IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW); END IF;
  -- OLD and NEW parents both matter if an owner reparents a native focus row.
  FOR row_data IN SELECT DISTINCT value FROM unnest(ARRAY[before_row,after_row]) value WHERE value IS NOT NULL LOOP
    IF TG_TABLE_NAME='user_preferences' THEN
      IF TG_OP='UPDATE' AND before_row->'timezone' IS NOT DISTINCT FROM after_row->'timezone'
        AND before_row->'first_day_of_week' IS NOT DISTINCT FROM after_row->'first_day_of_week' THEN CONTINUE; END IF;
      owner:=(row_data->>'user_id')::uuid;
    ELSIF TG_TABLE_NAME='workout_plan_templates' THEN owner:=(row_data->>'user_id')::uuid;
    ELSE
      SELECT t.user_id INTO owner FROM public.workout_plan_templates t WHERE t.id=(row_data->>'template_id')::integer;
    END IF;
    -- Account cascades publish nothing and acquire no owner lock after user locks.
    IF owner IS NULL OR NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id=owner) THEN CONTINUE; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('sparkygym-owner:'||owner::text,0));
    IF TG_TABLE_NAME='user_preferences' THEN
      FOR item IN SELECT t.id FROM public.workout_plan_templates t
        WHERE t.user_id=owner AND t.is_active=true AND t.plan_mode='training_focus' AND t.schedule_type='weekly' LOOP
        PERFORM sparkygym_private.publish_schedule(owner,item.id);
      END LOOP;
    ELSE
      template:=CASE WHEN TG_TABLE_NAME='workout_plan_templates' THEN (row_data->>'id')::integer ELSE (row_data->>'template_id')::integer END;
      PERFORM sparkygym_private.publish_schedule(owner,template);
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER sparkygym_capture_schedule_template AFTER INSERT OR UPDATE OR DELETE ON public.workout_plan_templates
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sparkygym_private.capture_schedule();
CREATE CONSTRAINT TRIGGER sparkygym_capture_schedule_focus AFTER INSERT OR UPDATE OR DELETE ON public.workout_plan_focus_sessions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sparkygym_private.capture_schedule();
CREATE CONSTRAINT TRIGGER sparkygym_capture_schedule_preferences AFTER INSERT OR UPDATE OR DELETE ON public.user_preferences
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sparkygym_private.capture_schedule();

-- No caller-supplied owner argument. Request app contexts can read only the
-- signed-in actor's source metadata; privileged parameterized helpers stay private.
CREATE FUNCTION public.sparkygym_schedule_snapshot() RETURNS TABLE(resource text,entity_id text,payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner uuid:=nullif(current_setting('app.authenticated_user_id',true),'')::uuid; item record;
BEGIN
  IF owner IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sparkygym-owner:'||owner::text,0));
  FOR item IN SELECT t.id FROM public.workout_plan_templates t
    WHERE t.user_id=owner AND t.is_active=true AND t.plan_mode='training_focus'
      AND t.schedule_type='weekly' AND t.start_date IS NOT NULL ORDER BY t.id LOOP
    resource:='schedule_summary'; entity_id:=item.id::text;
    payload:=sparkygym_private.schedule_payload(owner,item.id); RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sparkygym_private FROM PUBLIC;
