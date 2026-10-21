-- Match catalogResolver.js: NFD accents, case, all whitespace and trim only.
CREATE OR REPLACE FUNCTION training_semantics.exact_name(v text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT trim(regexp_replace(lower(regexp_replace(normalize(coalesce(v,''), NFD), U&'[\0300-\036f]', '', 'g')), U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g'))
$$;
-- No historical updates. Same #102 writer, optional signed evidence only.
CREATE FUNCTION training_semantics.resolve_exercise(label text) RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN count(*)=1 THEN (array_agg(c.id))[1] ELSE NULL END
 FROM public.exercise_catalog c WHERE c.is_active
 AND training_semantics.exact_name(label) !~ '^(unknown|desconocido|sin identificar|ejercicio desconocido)( [0-9]+)?$'
 AND (training_semantics.exact_name(c.code)=training_semantics.exact_name(label)
 OR training_semantics.exact_name(c.name)=training_semantics.exact_name(label)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.metadata->'aliases')='array' THEN c.metadata->'aliases' ELSE '[]'::jsonb END) a
 WHERE jsonb_typeof(a)='string' AND training_semantics.exact_name(a#>>'{}')=training_semantics.exact_name(label)))
$$;
REVOKE ALL ON FUNCTION training_semantics.resolve_exercise(text) FROM public,anon;
GRANT EXECUTE ON FUNCTION training_semantics.resolve_exercise(text) TO service_role;
DROP FUNCTION public.apply_training_semantics_v1(uuid,uuid,text,text,timestamptz,jsonb,text);
CREATE FUNCTION public.apply_training_semantics_v1 (p_user_id uuid, p_session_id uuid, p_revision text, p_fingerprint text, p_expires_at timestamptz, p_operations jsonb, p_channel text, p_materialization jsonb DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $$
DECLARE
    s public.training_sessions%rowtype;
    before_state jsonb;
    after_state jsonb;
    previous public.enkidu_conversation_enrichments%rowtype;
    op jsonb;
    kind text;
    target uuid;
    e public.session_exercises%rowtype;
    keys text[];
    allowed text[];
    value jsonb;
    source_id uuid;
    event_id uuid := gen_random_uuid ();
    new_block_id uuid;
    catalog_id uuid;
    receipt jsonb;
BEGIN
    IF p_user_id IS NULL OR p_session_id IS NULL OR p_revision IS NULL OR p_revision !~ '^[0-9a-f]{64}$' OR p_fingerprint IS NULL OR p_fingerprint !~ '^sha256:[0-9a-f]{64}$' OR p_channel IS NULL OR p_channel NOT IN ('app', 'coach') OR p_operations IS NULL OR jsonb_typeof(p_operations) <> 'array' OR jsonb_array_length(p_operations)
        NOT BETWEEN 1 AND 30 OR octet_length(p_operations::text) > 8192 THEN
        RAISE EXCEPTION 'invalid_arguments';
    END IF;
    IF p_materialization IS NOT NULL AND (
      jsonb_typeof(p_materialization) IS DISTINCT FROM 'object'
      OR octet_length(p_materialization::text) > 32768
      OR p_materialization->'facts'->>'schema_version' IS DISTINCT FROM 'training_materialization_v1'
      OR p_materialization->'facts'->'session_resolution'->>'session_id' IS DISTINCT FROM p_session_id::text
      OR jsonb_typeof(p_materialization->'original_text') IS DISTINCT FROM 'string'
      OR length(p_materialization->>'original_text') NOT BETWEEN 1 AND 2000
      OR jsonb_typeof(p_materialization->'facts'->'observations') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_materialization->'facts'->'observations') NOT BETWEEN 1 AND 10
      OR p_materialization->'facts'->'unresolved_facts' IS DISTINCT FROM '[]'::jsonb
    ) THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
    -- Same ordering as #100. Never perform matching or reconcile another session.
    PERFORM
        pg_advisory_xact_lock(hashtextextended('training-reconciliation:' || p_user_id::text, 0));
    SELECT
        *
    INTO
        s
    FROM
        public.training_sessions
    WHERE
        id = p_session_id
        AND user_id = p_user_id
        AND session_status <> 'archived'
    FOR UPDATE;
    IF NOT found THEN
        RAISE EXCEPTION 'session_not_found';
    END IF;
    SELECT
        *
    INTO
        previous
    FROM
        public.enkidu_conversation_enrichments
    WHERE
        session_id = p_session_id
        AND enrichment_type = 'semantic_correction_v1'
        AND source = p_fingerprint;
    IF found THEN
        IF coalesce(previous.payload -> 'materialization','null'::jsonb) IS DISTINCT FROM coalesce(p_materialization,'null'::jsonb) OR previous.payload -> 'operations' IS DISTINCT FROM p_operations OR previous.payload ->> 'expected_revision' IS DISTINCT FROM p_revision THEN
            RAISE EXCEPTION 'invalid_arguments';
        END IF;
        RETURN previous.payload -> 'receipt' || jsonb_build_object('replayed', TRUE);
    END IF;
    IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp() + interval '5 minutes' THEN
        RAISE EXCEPTION 'preview_stale';
    END IF;
    PERFORM
        id
    FROM
        public.session_blocks
    WHERE
        session_id = p_session_id
    ORDER BY
        id
    FOR UPDATE;
    PERFORM
        id
    FROM
        public.session_exercises
    WHERE
        session_id = p_session_id
    ORDER BY
        id
    FOR UPDATE;
    before_state := training_semantics.state (p_user_id, p_session_id);
    IF before_state ->> 'revision' IS DISTINCT FROM p_revision THEN
        RAISE EXCEPTION 'preview_stale';
    END IF;
    -- A catalog edit between preview and apply must not silently change identity.
    IF p_materialization IS NOT NULL AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_materialization->'facts'->'observations') observation
      WHERE observation->'exercise' ? 'exercise_id' AND NOT EXISTS (
        SELECT 1 FROM public.exercise_catalog c
        WHERE c.id::text=observation->'exercise'->>'exercise_id'
          AND c.code=observation->'exercise'->>'canonical_code' AND c.is_active
          AND (observation->'exercise'->>'resolved_by'='exercise_id' OR training_semantics.resolve_exercise(coalesce(observation->'exercise'->>'rename_to',observation->'exercise'->>'reported_name'))=c.id)
      )
    ) THEN RAISE EXCEPTION 'preview_stale'; END IF;
    FOR op IN
    SELECT
        *
    FROM
        jsonb_array_elements(p_operations)
        LOOP
            IF jsonb_typeof(op) <> 'object' THEN
                RAISE EXCEPTION 'invalid_arguments';
            END IF;
            kind := op ->> 'op';
            target := (op ->> 'target')::uuid;
            value := op -> 'value';
            allowed := CASE WHEN kind IN ('add_exercise', 'rename_exercise') THEN
                ARRAY['op', 'target', 'reported_name']
            WHEN kind = 'set_reps' THEN
                ARRAY['op', 'target', 'reps']
            WHEN kind = 'set_load' THEN
                ARRAY['op', 'target', 'value', 'unit']
            WHEN kind IN ('set_sets', 'set_last_reps', 'set_rounds', 'set_side', 'set_tempo', 'append_note', 'set_technical_note', 'set_omitted') THEN
                ARRAY['op', 'target', 'value']
            ELSE
                NULL
            END;
            SELECT
                array_agg(k ORDER BY k)
            INTO
                keys
            FROM
                jsonb_object_keys(op) k;
            IF allowed IS NULL OR NOT (keys @> allowed AND keys <@ allowed) OR target IS NULL THEN
                RAISE EXCEPTION 'invalid_arguments';
            END IF;
            IF kind IN ('add_exercise', 'rename_exercise') THEN
                IF jsonb_typeof(op -> 'reported_name') <> 'string' OR length(trim(op ->> 'reported_name'))
                    NOT BETWEEN 1 AND 200 THEN
                    RAISE EXCEPTION 'invalid_arguments';
                END IF;
                catalog_id := training_semantics.resolve_exercise(op ->> 'reported_name');
            END IF;
            IF kind = 'add_exercise' THEN
                IF EXISTS (
                    SELECT
                        1
                    FROM
                        public.session_exercises
                    WHERE
                        id = target) THEN
                    RAISE EXCEPTION 'invalid_arguments';
                END IF;
                IF new_block_id IS NULL THEN
                    INSERT INTO public.session_blocks (session_id, block_order, block_type, name, prescription, data_confidence)
                    SELECT
                        p_session_id,
                        coalesce(max(block_order), 0) + 1,
                        'strength',
                        'Registro confirmado',
                        jsonb_build_object('source', 'semantic_correction_v1', 'event_id', event_id),
                        'reported'
                    FROM
                        public.session_blocks
                    WHERE
                        session_id = p_session_id
                    RETURNING
                        id
                    INTO
                        new_block_id;
                END IF;
                INSERT INTO public.session_exercises (id, session_id, block_id, exercise_order, reported_name, exercise_id, execution_type, data_confidence)
                SELECT
                    target,
                    p_session_id,
                    new_block_id,
                    coalesce(max(exercise_order), 0) + 1,
                    trim(op ->> 'reported_name'),
                    catalog_id,
                    'performed',
                    'reported'
                FROM
                    public.session_exercises
                WHERE
                    session_id = p_session_id;
            ELSE
                SELECT
                    *
                INTO
                    e
                FROM
                    public.session_exercises
                WHERE
                    id = target
                    AND session_id = p_session_id;
                IF NOT found THEN
                    RAISE EXCEPTION 'invalid_arguments';
                END IF;
                IF kind IN ('set_sets', 'set_rounds', 'set_last_reps', 'set_load') AND (jsonb_typeof(value) IS DISTINCT FROM 'number' OR (value::text)::numeric < 0 OR (value::text)::numeric > (
            CASE WHEN kind = 'set_load' THEN
                2000
            WHEN kind = 'set_sets' THEN
                100
            ELSE
                1000
            END)
        OR (kind <> 'set_load'
            AND (value::text)::numeric <> trunc((value::text)::numeric))) THEN
    RAISE EXCEPTION 'invalid_arguments';
                END IF;
                IF kind = 'set_reps' THEN
                    IF jsonb_typeof(op -> 'reps') IS DISTINCT FROM 'array' OR jsonb_array_length(op -> 'reps')
                        NOT BETWEEN 1 AND 100 THEN
                        RAISE EXCEPTION 'invalid_arguments';
                    END IF;
                    IF EXISTS (
                        SELECT
                            1
                        FROM
                            jsonb_array_elements(op -> 'reps') r
                        WHERE
                            jsonb_typeof(r) <> 'number'
                            OR r::text !~ '^[0-9]+$'
                            OR (r::text)::numeric > 1000) THEN
                        RAISE EXCEPTION 'invalid_arguments';
                    END IF;
                    UPDATE
                        public.session_exercises
                    SET
                        reps_per_set = op -> 'reps',
                        sets_completed = jsonb_array_length(op -> 'reps')
                    WHERE
                        id = target;
                ELSIF kind = 'set_last_reps' THEN
                    IF jsonb_typeof(e.reps_per_set) IS DISTINCT FROM 'array' OR jsonb_array_length(e.reps_per_set)
                        NOT BETWEEN 1 AND 100 THEN
                        RAISE EXCEPTION 'invalid_arguments';
                    END IF;
                    IF EXISTS (
                        SELECT
                            1
                        FROM
                            jsonb_array_elements(e.reps_per_set) r
                        WHERE
                            jsonb_typeof(r) <> 'number'
                            OR r::text !~ '^[0-9]+$') THEN
                        RAISE EXCEPTION 'invalid_arguments';
                    END IF;
                    UPDATE
                        public.session_exercises
                    SET
                        reps_per_set = jsonb_set(e.reps_per_set, ARRAY[(jsonb_array_length(e.reps_per_set) - 1)::text], value),
                        sets_completed = jsonb_array_length(e.reps_per_set)
                    WHERE
                        id = target;
                ELSIF kind = 'rename_exercise' THEN
                    UPDATE
                        public.session_exercises
                    SET
                        reported_name = trim(op ->> 'reported_name'),
                        exercise_id = catalog_id
                    WHERE
                        id = target;
                ELSIF kind = 'set_sets' THEN
                    IF jsonb_typeof(e.reps_per_set) = 'array' AND jsonb_array_length(e.reps_per_set) > 0 AND jsonb_array_length(e.reps_per_set) <> (value::text)::integer THEN
                        RAISE EXCEPTION 'invalid_arguments';
                    END IF;
                    UPDATE
                        public.session_exercises
                    SET
                        sets_completed = (value::text)::integer
                    WHERE
                        id = target;
                ELSIF kind = 'set_load' THEN
                    IF op ->> 'unit' IS NULL OR op ->> 'unit' NOT IN ('kg', 'kg_each', 'lb', 'bodyweight') THEN
                        RAISE EXCEPTION 'invalid_arguments';
                    END IF;
                    UPDATE
                        public.session_exercises
                    SET
                        load_value = (value::text)::numeric,
                        load_unit = op ->> 'unit'
                    WHERE
                        id = target;
                ELSIF kind = 'set_rounds' THEN
                    UPDATE
                        public.session_exercises
                    SET
                        rounds_completed = (value::text)::integer
                    WHERE
                        id = target;
                ELSIF kind = 'set_side' THEN
                    IF jsonb_typeof(value) <> 'string' OR op ->> 'value' NOT IN ('left', 'right', 'bilateral', 'alternating', 'each_side', 'na') THEN
                        RAISE EXCEPTION 'invalid_arguments';
                    END IF;
                    UPDATE
                        public.session_exercises
                    SET
                        side = op ->> 'value'
                    WHERE
                        id = target;
                ELSIF kind IN ('set_tempo', 'append_note', 'set_technical_note') THEN
                    IF jsonb_typeof(value) IS DISTINCT FROM 'string' OR length(op ->> 'value') > (
                        CASE WHEN kind = 'set_tempo' THEN
                            100
                        ELSE
                            500
                        END) THEN
                    RAISE EXCEPTION 'invalid_arguments';
                    END IF;
                    IF kind = 'set_tempo' THEN
                        UPDATE
                            public.session_exercises
                        SET
                            tempo_or_pause = op ->> 'value'
                        WHERE
                            id = target;
                    ELSIF kind = 'append_note' THEN
                        IF length(op ->> 'value') = 0 OR length(concat_ws(E'\n', nullif (e.notes, ''), op ->> 'value')) > 4000 THEN
                            RAISE EXCEPTION 'invalid_arguments';
                        END IF;
                        UPDATE
                            public.session_exercises
                        SET
                            notes = concat_ws(E'\n', nullif (e.notes, ''), op ->> 'value')
                        WHERE
                            id = target;
                    ELSE
                        UPDATE
                            public.session_exercises
                        SET
                            equipment_snapshot = coalesce(e.equipment_snapshot, '{}') || jsonb_build_object('semantic_technical_note', op ->> 'value')
                        WHERE
                            id = target;
                    END IF;
                ELSIF kind = 'set_omitted' THEN
                    IF jsonb_typeof(value) IS DISTINCT FROM 'boolean' THEN
                        RAISE EXCEPTION 'invalid_arguments';
                    END IF;
                    UPDATE
                        public.session_exercises
                    SET
                        execution_type = CASE WHEN value = 'true'::jsonb THEN
                            'skipped'
                        ELSE
                            'performed'
                        END
                    WHERE
                        id = target;
                END IF;
                UPDATE
                    public.session_exercises
                SET
                    data_confidence = 'reported'
                WHERE
                    id = target;
            END IF;
        END LOOP;
    -- Deliberately no session_date: #100's arrival trigger must not rematch activities.
    INSERT INTO public.training_sources (user_id, source_type, source_name, source_system, source_version, original_json, file_checksum, import_status, provenance)
        VALUES (p_user_id, 'manual_entry', 'Corrección confirmada', 'enqidu_semantics', 'training_semantics_v1', jsonb_build_object('session_id', p_session_id, 'event_id', event_id, 'operations', p_operations, 'materialization', p_materialization), p_fingerprint, 'imported', jsonb_build_object('actor_id', p_user_id, 'channel', p_channel, 'event_id', event_id, 'semantic_role', 'supporting'))
    RETURNING
        id
    INTO
        source_id;
    INSERT INTO public.session_source_links (session_id, source_id, source_role, is_primary)
        VALUES (p_session_id, source_id, 'supporting', FALSE);
    after_state := training_semantics.state (p_user_id, p_session_id);
    receipt := jsonb_build_object('schema_version', 'training_semantics_v1', 'session_id', p_session_id, 'applied', TRUE, 'replayed', FALSE, 'source_id', source_id, 'event_id', event_id, 'revision', after_state ->> 'revision');
    INSERT INTO public.enkidu_conversation_enrichments (id, session_id, local_date, enrichment_type, source, payload, ai_usage, status)
        VALUES (event_id, p_session_id, s.local_date, 'semantic_correction_v1', p_fingerprint, jsonb_build_object('actor_id', p_user_id, 'channel', p_channel, 'operations', p_operations, 'expected_revision', p_revision, 'before', before_state, 'after', after_state, 'receipt', receipt, 'materialization', p_materialization, 'timestamp', clock_timestamp()), '{"llm_used":false,"usage":null}', 'applied');
    RETURN receipt;
END
$$;
REVOKE ALL ON FUNCTION public.apply_training_semantics_v1 (uuid, uuid, text, text, timestamptz, jsonb, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_training_semantics_v1 (uuid, uuid, text, text, timestamptz, jsonb, text, jsonb) TO service_role;

-- Generated from catalogSeed.js; consistency is tested against the database.
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('bench_press','Press banca','{"aliases":["bench_press","Press banca","Bench Press","press banca","bench press","banca"],"catalog_version":103,"metric_requirements":["reps","load"]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('bird_dog','Bird dog','{"aliases":["bird_dog","Bird dog","Bird Dog","bird dog","birddog","perro pajaro","Bird-dog"],"catalog_version":103,"metric_requirements":["reps"]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('dead_bug','Dead bug','{"aliases":["dead_bug","Dead bug","Dead Bug","dead bug","deadbug","bicho muerto"],"catalog_version":103,"metric_requirements":["reps"]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('diaphragmatic_breathing','Respiración diafragmática','{"aliases":["diaphragmatic_breathing","Respiración diafragmática","Diaphragmatic Breathing","respiracion diafragmatica","diafragmatica","breathing","respiracion 90/90"],"catalog_version":103,"metric_requirements":[]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('front_squat','Sentadilla frontal','{"aliases":["front_squat","Sentadilla frontal","Front Squat","front squat","sentadilla frontal","squat frontal"],"catalog_version":103,"metric_requirements":["reps","load"]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('glute_bridge','Puente de gluteo','{"aliases":["glute_bridge","Puente de gluteo","Glute Bridge","puente de gluteo","glute bridge","puente gluteo"],"catalog_version":103,"metric_requirements":["reps"]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('lateral_monster_walk','Monster walk lateral','{"aliases":["lateral_monster_walk","Monster walk lateral","Lateral Monster Walk","monster walk lateral","lateral monster walk","caminar lateral con banda"],"catalog_version":103,"metric_requirements":["reps"]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('pallof_press','Press Pallof','{"aliases":["pallof_press","Press Pallof","Pallof Press","press palof","pres palof","pallof","anti-rotacion con goma","press antirotacion","press anti-rotacion"],"catalog_version":103,"metric_requirements":["reps","load"]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('romanian_deadlift','Peso muerto rumano','{"aliases":["romanian_deadlift","Peso muerto rumano","Romanian Deadlift","rdl","romanian deadlift","peso muerto rumano","pm rumano","RDL con barra","Peso muerto rumano (RDL)"],"catalog_version":103,"metric_requirements":["reps","load"]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('rowing_ergometer','Remo ergometro','{"aliases":["rowing_ergometer","Remo ergometro","Row Ergometer","remo ergometro","remoergometro","row","rower","rowing machine","remo","RowErg"],"catalog_version":103,"metric_requirements":[]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('single_arm_row','Remo unilateral','{"aliases":["single_arm_row","Remo unilateral","Single-arm Row","remo unilateral","remo a una mano","single arm row","one arm row"],"catalog_version":103,"metric_requirements":["reps","load"]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('wall_ball','Wall ball','{"aliases":["wall_ball","Wall ball","Wall Ball","wall ball","wall balls","lanzamiento balon pared","sentadilla con balon"],"catalog_version":103,"metric_requirements":["reps"]}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('pull_up','Dominadas','{"aliases":["dominada","pull-up","pull-ups"],"metric_requirements":["reps"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('strict_pull_up','Dominada estricta','{"aliases":["dominadas estrictas","strict pull-up","strict pull-ups"],"metric_requirements":["reps"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('high_pull_up','Dominada alta','{"aliases":["high pull-up"],"metric_requirements":["reps"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('pike_push_up','Pike push-up','{"aliases":[],"metric_requirements":["reps"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('elevated_feet_pike_push_up','Elevated feet pike push-up','{"aliases":["pike push-up con pies elevados"],"metric_requirements":["reps"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('elevated_pike_push_up_unspecified','Pike push-up elevado','{"aliases":[],"metric_requirements":["reps"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('handstand_push_up','HSPU','{"aliases":["handstand push-up"],"metric_requirements":["reps"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('hip_thrust','Hip thrust','{"aliases":[],"metric_requirements":["reps","load"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('barbell_hip_thrust','Hip thrust con barra','{"aliases":["barbell hip thrust"],"metric_requirements":["reps","load"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('landmine_press','Landmine press','{"aliases":[],"metric_requirements":["reps","load"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('single_arm_landmine_press','Landmine press unilateral','{"aliases":["single-arm landmine press"],"metric_requirements":["reps","load"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('dumbbell_bench_press','Press banca con mancuernas','{"aliases":["dumbbell bench press"],"metric_requirements":["reps","load"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('dumbbell_romanian_deadlift','RDL bilateral con dos mancuernas','{"aliases":["dumbbell romanian deadlift"],"metric_requirements":["reps","load"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('ring_row','Remo en anillas','{"aliases":["ring row"],"metric_requirements":["reps"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('scapular_pull_up','Scapular pull-up','{"aliases":["scap pull-up","scap pull-ups"],"metric_requirements":["reps"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('cat_cow','Cat-cow','{"aliases":["gato-vaca","cat-camel"],"metric_requirements":[],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('side_plank','Plancha lateral','{"aliases":["side plank"],"metric_requirements":[],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('kneeling_side_plank','Plancha lateral desde rodillas','{"aliases":["side plank desde rodillas","side plank rodillas"],"metric_requirements":[],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('goblet_squat','Sentadilla goblet','{"aliases":["goblet squat"],"metric_requirements":["reps","load"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('kettlebell_swing','Kettlebell swing','{"aliases":["swing kettlebell"],"metric_requirements":["reps","load"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('farmer_carry','Farmer carry','{"aliases":[],"metric_requirements":["load"],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
INSERT INTO public.exercise_catalog(code,name,metadata) VALUES('assault_bike','Assault bike','{"aliases":[],"metric_requirements":[],"catalog_version":103}'::jsonb)
ON CONFLICT(code) DO UPDATE SET metadata=exercise_catalog.metadata || EXCLUDED.metadata;
