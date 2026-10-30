-- Exact bytes, owner-scoped identity and durable revision state survive restarts.
CREATE SCHEMA IF NOT EXISTS sparkygym_private;
REVOKE ALL ON SCHEMA sparkygym_private FROM PUBLIC;

CREATE TABLE public.sparkygym_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  self_origin text NOT NULL, peer_origin text NOT NULL, peer_user_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','activating','active','paused','revoked')),
  scopes jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(scopes)='array'),
  allow_private boolean NOT NULL DEFAULT false, allow_http boolean NOT NULL DEFAULT false,
  credentials_encrypted text NOT NULL,
  invitation_public jsonb NOT NULL DEFAULT '{}' CHECK (NOT invitation_public ?| ARRAY['secret','invitation_secret','root_key','outgoing_key','incoming_key']), claim jsonb,
  expires_at timestamptz, activated_at timestamptz, replaces_connection_id uuid, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,id),
  FOREIGN KEY (user_id,replaces_connection_id) REFERENCES public.sparkygym_connections(user_id,id)
);
CREATE TABLE public.sparkygym_streams (
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  peer_ref text NOT NULL, direction text NOT NULL CHECK (direction IN ('in','out')),
  resource text NOT NULL, entity_id text NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,connection_id,direction,resource,entity_id),
  FOREIGN KEY (user_id,connection_id) REFERENCES public.sparkygym_connections(user_id,id) ON DELETE CASCADE
);
CREATE TABLE public.sparkygym_outbox (
  source_cursor bigserial NOT NULL UNIQUE CHECK (source_cursor BETWEEN 1 AND 9007199254740991),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, connection_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('event','control','media')),
  path text NOT NULL CHECK (path IN ('/api/integrations/v1/pair/claim','/api/integrations/v1/pair/accept','/api/integrations/v1/events','/api/integrations/v1/capabilities','/api/integrations/v1/snapshot','/api/integrations/v1/media','/api/integrations/v1/revoke')),
  method text NOT NULL DEFAULT 'POST' CHECK (method IN ('GET','POST')),
  body text NOT NULL, body_bytes bytea, body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (body_bytes IS NULL OR (kind='media' AND body='')),
  request_id uuid NOT NULL, resource text, entity_id text, revision bigint,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0), next_due_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid, leased_until timestamptz,
  CHECK ((lease_token IS NULL) = (leased_until IS NULL)),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','terminal')),
  receipt jsonb, last_error text,
  created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,connection_id,request_id),
  FOREIGN KEY (user_id, connection_id) REFERENCES public.sparkygym_connections(user_id,id) ON DELETE CASCADE
);
CREATE INDEX sparkygym_outbox_due ON public.sparkygym_outbox(next_due_at) WHERE status='pending';
CREATE TABLE public.sparkygym_inbox (
  user_id uuid NOT NULL, connection_id uuid NOT NULL, request_id uuid NOT NULL,
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'), receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,connection_id,request_id),
  FOREIGN KEY (user_id, connection_id) REFERENCES public.sparkygym_connections(user_id,id) ON DELETE CASCADE
);
-- Deliberately no connection FK: a re-pair keeps this source's projection identity.
CREATE TABLE public.sparkygym_entities (
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  peer_ref text NOT NULL, resource text NOT NULL, entity_id text NOT NULL,
  local_id text, raw_payload jsonb, tombstone boolean NOT NULL DEFAULT false,
  last_source_cursor bigint NOT NULL DEFAULT 0 CHECK (last_source_cursor BETWEEN 0 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,peer_ref,resource,entity_id)
);
-- Retained independently of projections, inbox compaction and connection rotation.
CREATE TABLE public.sparkygym_source_heads (
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  peer_ref text NOT NULL,
  last_source_cursor bigint NOT NULL CHECK (last_source_cursor BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,peer_ref)
);
CREATE TABLE public.sparkygym_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  resource text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sparkygym_notifications_replay ON public.sparkygym_notifications(user_id,id);
CREATE TABLE public.sparkygym_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'), bytes bigint NOT NULL CHECK (bytes>0), mime text NOT NULL,
  private_path text, metadata jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed','detached')), last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,sha256)
);
CREATE TABLE public.sparkygym_snapshots (
  user_id uuid NOT NULL, connection_id uuid NOT NULL, snapshot_id uuid NOT NULL,
  peer_ref text NOT NULL,
  start_cursor bigint NOT NULL CHECK (start_cursor BETWEEN 1 AND 9007199254740991),
  watermark bigint NOT NULL CHECK (watermark BETWEEN 1 AND 9007199254740991 AND watermark>=start_cursor),
  expected_count integer NOT NULL CHECK (expected_count>=0),
  membership_sha256 text NOT NULL CHECK (membership_sha256 ~ '^[a-f0-9]{64}$'),
  prune_resources jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(prune_resources)='array'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','complete','failed')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,connection_id,snapshot_id),
  FOREIGN KEY (user_id,connection_id) REFERENCES public.sparkygym_connections(user_id,id) ON DELETE CASCADE
);
CREATE TABLE public.sparkygym_snapshot_members (
  user_id uuid NOT NULL, connection_id uuid NOT NULL, snapshot_id uuid NOT NULL,
  resource text NOT NULL, entity_id text NOT NULL,
  PRIMARY KEY (user_id,connection_id,snapshot_id,resource,entity_id),
  FOREIGN KEY (user_id,connection_id,snapshot_id) REFERENCES public.sparkygym_snapshots(user_id,connection_id,snapshot_id) ON DELETE CASCADE
);
CREATE INDEX sparkygym_snapshots_open ON public.sparkygym_snapshots(user_id,connection_id,start_cursor,watermark) WHERE status='open';
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['connections','streams','outbox','inbox','entities','source_heads','notifications','media','snapshots','snapshot_members'] LOOP
    EXECUTE format('ALTER TABLE public.sparkygym_%I ENABLE ROW LEVEL SECURITY',t);
  END LOOP;
END $$;

CREATE FUNCTION sparkygym_private.immutable_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN NEW.created_xid:=pg_current_xact_id();
  ELSIF NEW.created_xid IS DISTINCT FROM OLD.created_xid THEN RAISE EXCEPTION 'SparkyGym creation transaction is immutable'; END IF;
  IF TG_OP='UPDATE' AND OLD.created_xid<>pg_current_xact_id() AND (NEW.source_cursor,NEW.user_id,NEW.connection_id,NEW.kind,NEW.path,NEW.method,NEW.body,NEW.body_bytes,NEW.body_sha256,NEW.request_id,NEW.resource,NEW.entity_id,NEW.revision)
    IS DISTINCT FROM (OLD.source_cursor,OLD.user_id,OLD.connection_id,OLD.kind,OLD.path,OLD.method,OLD.body,OLD.body_bytes,OLD.body_sha256,OLD.request_id,OLD.resource,OLD.entity_id,OLD.revision) THEN
    RAISE EXCEPTION 'SparkyGym request bytes and identity are immutable';
  END IF;
  IF NEW.body_sha256 <> encode(sha256(coalesce(NEW.body_bytes,convert_to(NEW.body,'UTF8'))),'hex') THEN
    RAISE EXCEPTION 'SparkyGym request hash mismatch';
  END IF;
  IF NEW.kind='event' AND (
    (NEW.body::jsonb->>'source_cursor')::bigint IS DISTINCT FROM NEW.source_cursor OR
    (NEW.body::jsonb->>'event_id')::uuid IS DISTINCT FROM NEW.request_id OR
    (NEW.body::jsonb->>'connection_id')::uuid IS DISTINCT FROM NEW.connection_id
  ) THEN RAISE EXCEPTION 'SparkyGym event identity mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sparkygym_immutable_outbox BEFORE INSERT OR UPDATE ON public.sparkygym_outbox
  FOR EACH ROW EXECUTE FUNCTION sparkygym_private.immutable_outbox();

CREATE FUNCTION sparkygym_private.wake() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='sparkygym_outbox' THEN PERFORM pg_notify('sparkygym_outbox',NEW.user_id::text);
  ELSE PERFORM pg_notify('sparkygym_notifications',NEW.user_id::text); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sparkygym_outbox_wake AFTER INSERT OR UPDATE ON public.sparkygym_outbox FOR EACH ROW EXECUTE FUNCTION sparkygym_private.wake();
CREATE TRIGGER sparkygym_notifications_wake AFTER INSERT ON public.sparkygym_notifications FOR EACH ROW EXECUTE FUNCTION sparkygym_private.wake();

-- Allocate the published cursor only after the owner lock; identity defaults
-- alone can invert commit order and make a reconnect skip a late commit.
CREATE FUNCTION sparkygym_private.notification_cursor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sparkygym-notifications:'||NEW.user_id::text,0));
  IF NEW.payload ?| ARRAY['secret','credentials_encrypted','invitation_secret','root_key','outgoing_key','incoming_key','private_path','body'] THEN
    RAISE EXCEPTION 'SparkyGym notifications contain public metadata only';
  END IF;
  NEW.id:=nextval('public.sparkygym_notifications_id_seq');
  RETURN NEW;
END $$;
CREATE TRIGGER sparkygym_notification_cursor BEFORE INSERT ON public.sparkygym_notifications
  FOR EACH ROW EXECUTE FUNCTION sparkygym_private.notification_cursor();

-- Not in public: startup grants EXECUTE on all public functions to the app role.
CREATE FUNCTION sparkygym_private.emit(p_owner uuid,p_resource text,p_entity text,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.sparkygym_connections%ROWTYPE; rev bigint; packet text; request uuid; cursor_value bigint;
  prior public.sparkygym_outbox%ROWTYPE; coalesced boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sparkygym-owner:'||p_owner::text,0));
  FOR c IN SELECT * FROM public.sparkygym_connections WHERE user_id=p_owner AND status IN ('active','paused') AND scopes ? p_resource ORDER BY id LOOP
    IF p_resource='schedule_summary' THEN
      coalesced:=false;
      -- Deferred source triggers see final TX state. Finalize same-TX packets
      -- (including an earlier snapshot), never rewrite committed signed bytes.
      FOR prior IN SELECT o.* FROM public.sparkygym_outbox o
        WHERE o.user_id=p_owner AND o.connection_id=c.id AND o.resource=p_resource
          AND o.entity_id=p_entity AND o.kind='event' AND o.created_xid=pg_current_xact_id()
      LOOP
        coalesced:=true;
        IF prior.body::jsonb->'payload' IS NOT DISTINCT FROM coalesce(p_payload,'null'::jsonb) THEN CONTINUE; END IF;
        packet:=(prior.body::jsonb || jsonb_build_object('payload',p_payload,
          'operation',CASE WHEN p_payload IS NULL THEN 'delete' ELSE 'upsert' END))::text;
        UPDATE public.sparkygym_outbox SET body=packet,
          body_sha256=encode(sha256(convert_to(packet,'UTF8')),'hex') WHERE id=prior.id;
      END LOOP;
      IF coalesced THEN CONTINUE; END IF;
    END IF;
    INSERT INTO public.sparkygym_streams(user_id,connection_id,peer_ref,direction,resource,entity_id,revision)
      VALUES(p_owner,c.id,c.peer_origin||E'\n'||c.peer_user_id,'out',p_resource,p_entity,1)
      ON CONFLICT(user_id,connection_id,direction,resource,entity_id) DO UPDATE SET revision=sparkygym_streams.revision+1,updated_at=now()
      RETURNING revision INTO rev;
    request := gen_random_uuid();
    cursor_value := nextval('public.sparkygym_outbox_source_cursor_seq');
    packet := jsonb_build_object('version',1,'event_id',request,'connection_id',c.id,'producer','sparkyfitness',
      'resource',p_resource,'entity_id',p_entity,'revision',rev,'source_cursor',cursor_value,'operation',CASE WHEN p_payload IS NULL THEN 'delete' ELSE 'upsert' END,
      'occurred_at',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'payload',p_payload)::text;
    INSERT INTO public.sparkygym_outbox(source_cursor,user_id,connection_id,kind,path,body,body_sha256,request_id,resource,entity_id,revision)
      VALUES(cursor_value,p_owner,c.id,'event','/api/integrations/v1/events',packet,encode(sha256(convert_to(packet,'UTF8')),'hex'),request,p_resource,p_entity,rev);
  END LOOP;
END $$;

-- Finite canonical built-ins; storage is kg/cm (UnitInput converts at the UI boundary).
CREATE FUNCTION sparkygym_private.builtin_definition(metric text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('metric_id',metric,'label',replace(metric,'_',' '),'value_type',
    CASE WHEN metric IN ('weight','muscle_mass_kg','bone_mass_kg') THEN 'mass'
      WHEN metric IN ('body_fat_percentage','body_water_percentage') THEN 'percent'
      WHEN metric IN ('steps','bmr') THEN 'number' ELSE 'length' END,
    'unit',CASE WHEN metric IN ('weight','muscle_mass_kg','bone_mass_kg') THEN 'kg'
      WHEN metric IN ('body_fat_percentage','body_water_percentage') THEN 'percent'
      WHEN metric IN ('steps','bmr') THEN 'none' ELSE 'cm' END,'builtin',true,'enabled',true);
$$;
-- A custom unit is not an instruction to convert: numeric known canonical units
-- are retained; other units and non-finite values are explicitly represented as text.
CREATE FUNCTION sparkygym_private.custom_definition(category jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('metric_id','custom:'||(category->>'id'),'label',coalesce(nullif(category->>'display_name',''),category->>'name'),
    'value_type',CASE WHEN category->>'data_type'='numeric' THEN
    CASE lower(category->>'measurement_type') WHEN 'kg' THEN 'mass' WHEN 'lbs' THEN 'mass' WHEN 'st_lbs' THEN 'mass' WHEN 'cm' THEN 'length' WHEN 'inches' THEN 'length' WHEN 'ft_in' THEN 'length' WHEN '%' THEN 'percent' WHEN 'percent' THEN 'percent' WHEN 'none' THEN 'number' ELSE 'text' END ELSE 'text' END,
    'unit',CASE WHEN category->>'data_type'='numeric' THEN
    CASE lower(category->>'measurement_type') WHEN 'kg' THEN 'kg' WHEN 'lbs' THEN 'kg' WHEN 'st_lbs' THEN 'kg' WHEN 'cm' THEN 'cm' WHEN 'inches' THEN 'cm' WHEN 'ft_in' THEN 'cm' WHEN '%' THEN 'percent' WHEN 'percent' THEN 'percent' WHEN 'none' THEN 'none' ELSE 'text' END ELSE 'text' END,
    'builtin',false,'enabled',true);
$$;

CREATE FUNCTION sparkygym_private.measurement_payload(metric text,day text,value jsonb,definition jsonb,zone text,measured timestamptz)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE normalized jsonb:=value; def jsonb:=definition; finite boolean:=false;
BEGIN
  IF def->>'value_type'<>'text' AND (value#>>'{}') ~ '^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$' THEN
    BEGIN normalized:=to_jsonb((value#>>'{}')::double precision); finite:=jsonb_typeof(normalized)='number';
    EXCEPTION WHEN numeric_value_out_of_range THEN finite:=false; END;
  END IF;
  IF NOT finite THEN def:=def||'{"value_type":"text","unit":"text"}'::jsonb; normalized:=to_jsonb(value#>>'{}'); END IF;
  RETURN jsonb_build_object('metric_id',metric,'date',day,'value',normalized,'unit',def->>'unit','measured_at',
    CASE WHEN measured IS NULL THEN NULL ELSE to_char(measured AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'timezone',zone,'definition',def-ARRAY['metric_id','unit','enabled']);
END $$;

CREATE FUNCTION sparkygym_private.capture_body() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
    FOREACH metric IN ARRAY ARRAY['weight','height','neck','waist','hips','shoulders','chest','abdomen','left_biceps','right_biceps','left_thigh','right_thigh','left_calf','right_calf','body_fat_percentage','muscle_mass_kg','bone_mass_kg','body_water_percentage','steps','bmr'] LOOP
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
CREATE TRIGGER sparkygym_capture_checkin AFTER INSERT OR UPDATE OR DELETE ON public.check_in_measurements FOR EACH ROW EXECUTE FUNCTION sparkygym_private.capture_body();
CREATE TRIGGER sparkygym_capture_categories AFTER INSERT OR UPDATE OR DELETE ON public.custom_categories FOR EACH ROW EXECUTE FUNCTION sparkygym_private.capture_body();
CREATE TRIGGER sparkygym_capture_custom AFTER INSERT OR UPDATE OR DELETE ON public.custom_measurements FOR EACH ROW EXECUTE FUNCTION sparkygym_private.capture_body();
CREATE TRIGGER sparkygym_capture_goal AFTER INSERT OR UPDATE OR DELETE ON public.onboarding_data FOR EACH ROW EXECUTE FUNCTION sparkygym_private.capture_body();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sparkygym_private FROM PUBLIC;

-- Single-key encrypted metadata lookup; no owner argument and no plaintext key.
CREATE FUNCTION public.sparkygym_lookup_peer_key(key_id text) RETURNS SETOF public.sparkygym_connections
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT c.* FROM public.sparkygym_connections c
  WHERE (key_id=c.id::text||'_og' AND c.status IN ('claimed','activating','active','paused','revoked'))
    OR (key_id=c.id::text AND c.status IN ('pending','claimed') AND c.expires_at>now());
$$;

-- Safe source read model: no owner parameter; always the authenticated actor.
-- The caller takes the same owner advisory boundary as capture before calling.
CREATE FUNCTION public.sparkygym_body_snapshot() RETURNS TABLE(resource text,entity_id text,payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner uuid:=nullif(current_setting('app.authenticated_user_id',true),'')::uuid;
  zone text; metric text; def jsonb; row_data jsonb; measurement record;
BEGIN
  IF owner IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sparkygym-owner:'||owner::text,0));
  SELECT coalesce(p.timezone,'UTC') INTO zone FROM public.user_preferences p WHERE p.user_id=owner;
  zone:=coalesce(zone,'UTC');
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN zone:='UTC'; END IF;
  FOREACH metric IN ARRAY ARRAY['weight','height','neck','waist','hips','shoulders','chest','abdomen','left_biceps','right_biceps','left_thigh','right_thigh','left_calf','right_calf','body_fat_percentage','muscle_mass_kg','bone_mass_kg','body_water_percentage','steps','bmr'] LOOP
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
