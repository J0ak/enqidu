-- #102. Explicit semantic correction of one canonical activity. No production backfill.
BEGIN;
CREATE SCHEMA IF NOT EXISTS training_semantics;
REVOKE ALL ON SCHEMA training_semantics FROM public, anon;
GRANT usage ON SCHEMA training_semantics TO authenticated, service_role;
-- Existing ingestion retains INSERT. Corrections of existing exercise rows are backend-only.
REVOKE UPDATE, DELETE ON public.session_exercises FROM authenticated, anon;
-- No new client write privileges. Row locking needs UPDATE on one parent column;
-- this function never updates a training_session or a block already present.
GRANT UPDATE (id) ON public.training_sessions, public.session_blocks TO service_role;
GRANT UPDATE (reported_name, exercise_id, execution_type, sets_completed, reps_per_set, load_value, load_unit, rounds_completed, side, tempo_or_pause, notes, equipment_snapshot, data_confidence) ON public.session_exercises TO service_role;
GRANT INSERT ON public.training_sources TO service_role;
GRANT SELECT, INSERT ON public.enkidu_conversation_enrichments TO service_role;
GRANT SELECT ON public.exercise_catalog TO authenticated, service_role;
CREATE FUNCTION training_semantics.exact_name (v text)
    RETURNS text
    LANGUAGE sql
    IMMUTABLE
    SECURITY INVOKER
    SET search_path = ''
    AS $$
    SELECT
        regexp_replace(lower(translate(trim(v), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '\s+', ' ', 'g')
$$;
REVOKE ALL ON FUNCTION training_semantics.exact_name (text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION training_semantics.exact_name (text) TO service_role;
CREATE FUNCTION training_semantics.state (p_user uuid, p_session uuid)
    RETURNS jsonb
    LANGUAGE plpgsql
    STABLE
    SECURITY INVOKER
    SET search_path = ''
    AS $$
DECLARE
    s public.training_sessions%rowtype;
    exercises jsonb;
    revision text;
BEGIN
    IF p_user IS NULL OR (CURRENT_USER NOT IN ('service_role', 'postgres') AND auth.uid () IS DISTINCT FROM p_user) THEN
        RETURN NULL;
    END IF;
    SELECT
        *
    INTO
        s
    FROM
        public.training_sessions
    WHERE
        id = p_session
        AND user_id = p_user
        AND session_status <> 'archived';
    IF NOT found THEN
        RETURN NULL;
    END IF;
    IF (
        SELECT
            count(*)
        FROM
            public.session_exercises
        WHERE
            session_id = p_session) > 200 OR (
    SELECT
        count(*)
    FROM
        public.session_blocks
    WHERE
        session_id = p_session) > 100 THEN
        RAISE EXCEPTION 'canonical_state_limit';
    END IF;
    SELECT
        coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'block_id', e.block_id, 'exercise_id', e.exercise_id, 'reported_name', e.reported_name, 'execution_type', e.execution_type, 'data_confidence', e.data_confidence, 'sets_completed', e.sets_completed, 'reps_per_set', CASE WHEN jsonb_typeof(e.reps_per_set) = 'array' THEN
                        CASE WHEN jsonb_array_length(e.reps_per_set) <= 100
                            AND NOT EXISTS (
                                SELECT
                                    1
                                FROM jsonb_array_elements(e.reps_per_set) r
                            WHERE
                                jsonb_typeof(r) <> 'number') THEN
                            e.reps_per_set
                        ELSE
                            NULL
                        END
                    ELSE
                        NULL
                    END, 'load_value', e.load_value, 'load_unit', e.load_unit, 'rounds_completed', e.rounds_completed, 'side', e.side, 'tempo_or_pause', e.tempo_or_pause, 'notes', e.notes, 'technical_note', e.equipment_snapshot ->> 'semantic_technical_note')
            ORDER BY e.exercise_order nulls LAST, e.id), '[]')
    INTO
        exercises
    FROM
        public.session_exercises e
    WHERE
        e.session_id = p_session;
    -- Hash full state, including MVCC revision, without exposing raw evidence.
    SELECT
        encode(sha256 (convert_to(jsonb_build_object('session', to_jsonb (s), 'exercises', (
                            SELECT
                                coalesce(jsonb_agg(jsonb_build_object('row', to_jsonb (e), 'revision', e.xmin::text)
                                ORDER BY e.id), '[]')
                            FROM public.session_exercises e
                            WHERE
                                session_id = p_session), 'blocks', (
                                SELECT
                                    coalesce(jsonb_agg(to_jsonb (b)
                                        ORDER BY b.id), '[]')
                                FROM public.session_blocks b
                                WHERE
                                    session_id = p_session), 'links', (
                                    SELECT
                                        coalesce(jsonb_agg(to_jsonb (l)
                                            ORDER BY l.source_id, l.source_role), '[]')
                                    FROM public.session_source_links l
                                WHERE
                                    session_id = p_session))::text, 'UTF8')), 'hex')
    INTO
        revision;
    RETURN jsonb_build_object('schema_version', 'training_semantics_v1', 'session_id', s.id, 'title', coalesce(s.title, 'Actividad'), 'local_date', s.local_date, 'revision', revision, 'exercises', exercises);
END
$$;
REVOKE ALL ON FUNCTION training_semantics.state (uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION training_semantics.state (uuid, uuid) TO authenticated, service_role;
CREATE FUNCTION public.read_training_semantics_v1 (p_session_id uuid)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = ''
    AS $$
    SELECT
        training_semantics.state (auth.uid (), p_session_id)
$$;
REVOKE ALL ON FUNCTION public.read_training_semantics_v1 (uuid) FROM public, anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_training_semantics_v1 (uuid) TO authenticated;
CREATE FUNCTION public.apply_training_semantics_v1 (p_user_id uuid, p_session_id uuid, p_revision text, p_fingerprint text, p_expires_at timestamptz, p_operations jsonb, p_channel text)
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
        IF previous.payload -> 'operations' IS DISTINCT FROM p_operations OR previous.payload ->> 'expected_revision' IS DISTINCT FROM p_revision THEN
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
                SELECT
                    CASE WHEN count(*) = 1 THEN
                        (array_agg(c.id))[1]
                    ELSE
                        NULL
                    END
                INTO
                    catalog_id
                FROM
                    public.exercise_catalog c
                WHERE
                    c.is_active
                    AND (training_semantics.exact_name (c.code) = training_semantics.exact_name (op ->> 'reported_name')
                        OR training_semantics.exact_name (c.name) = training_semantics.exact_name (op ->> 'reported_name')
                        OR EXISTS (
                            SELECT
                                1
                            FROM
                                jsonb_array_elements_text(coalesce(c.metadata -> 'aliases', '[]')) a
                            WHERE
                                training_semantics.exact_name (a) = training_semantics.exact_name (op ->> 'reported_name')));
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
        VALUES (p_user_id, 'manual_entry', 'Corrección confirmada', 'enqidu_semantics', 'training_semantics_v1', jsonb_build_object('session_id', p_session_id, 'event_id', event_id, 'operations', p_operations), p_fingerprint, 'imported', jsonb_build_object('actor_id', p_user_id, 'channel', p_channel, 'event_id', event_id, 'semantic_role', 'supporting'))
    RETURNING
        id
    INTO
        source_id;
    INSERT INTO public.session_source_links (session_id, source_id, source_role, is_primary)
        VALUES (p_session_id, source_id, 'supporting', FALSE);
    after_state := training_semantics.state (p_user_id, p_session_id);
    receipt := jsonb_build_object('schema_version', 'training_semantics_v1', 'session_id', p_session_id, 'applied', TRUE, 'replayed', FALSE, 'source_id', source_id, 'event_id', event_id, 'revision', after_state ->> 'revision');
    INSERT INTO public.enkidu_conversation_enrichments (id, session_id, local_date, enrichment_type, source, payload, ai_usage, status)
        VALUES (event_id, p_session_id, s.local_date, 'semantic_correction_v1', p_fingerprint, jsonb_build_object('actor_id', p_user_id, 'channel', p_channel, 'operations', p_operations, 'expected_revision', p_revision, 'before', before_state, 'after', after_state, 'receipt', receipt), '{"llm_used":false,"usage":null}', 'applied');
    RETURN receipt;
END
$$;
REVOKE ALL ON FUNCTION public.apply_training_semantics_v1 (uuid, uuid, text, text, timestamptz, jsonb, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_training_semantics_v1 (uuid, uuid, text, text, timestamptz, jsonb, text) TO service_role;
-- Append-only correction evidence even through the pre-existing authenticated CRUD grants.
CREATE FUNCTION training_semantics.guard_evidence ()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $$
BEGIN
    -- Account erasure may cascade evidence only after its owner has ceased to exist.
    IF tg_op = 'DELETE' AND CURRENT_USER IN ('postgres', 'supabase_auth_admin') AND ((tg_table_name = 'training_sources' AND NOT EXISTS (
        SELECT
            1
        FROM
            auth.users
        WHERE
            id = (to_jsonb (old) ->> 'user_id')::uuid))
    OR (tg_table_name = 'enkidu_conversation_enrichments'
    AND NOT EXISTS (
    SELECT
        1
    FROM
        public.training_sessions
    WHERE
        id = (to_jsonb (old) ->> 'session_id')::uuid))) THEN
        RETURN old;
    END IF;
    IF (tg_table_name = 'enkidu_conversation_enrichments' AND (to_jsonb (old) ->> 'enrichment_type' = 'semantic_correction_v1' OR to_jsonb (new) ->> 'enrichment_type' = 'semantic_correction_v1')) OR (tg_table_name = 'training_sources' AND (to_jsonb (old) ->> 'source_system' = 'enqidu_semantics' OR to_jsonb (new) ->> 'source_system' = 'enqidu_semantics')) THEN
        IF tg_op <> 'INSERT' OR CURRENT_USER NOT IN ('service_role', 'postgres') THEN
            RAISE EXCEPTION 'Immutable semantic evidence';
        END IF;
    END IF;
    RETURN CASE WHEN tg_op = 'DELETE' THEN
        old
    ELSE
        new
    END;
END
$$;
REVOKE ALL ON FUNCTION training_semantics.guard_evidence () FROM public, anon, authenticated;
CREATE TRIGGER immutable_semantic_enrichments
    BEFORE INSERT OR UPDATE OR DELETE ON public.enkidu_conversation_enrichments FOR EACH ROW
    EXECUTE FUNCTION training_semantics.guard_evidence ();
CREATE TRIGGER immutable_semantic_sources
    BEFORE INSERT OR UPDATE OR DELETE ON public.training_sources FOR EACH ROW
    EXECUTE FUNCTION training_semantics.guard_evidence ();
CREATE FUNCTION training_semantics.guard_link ()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $$
DECLARE
    evidence public.training_sources%rowtype;
BEGIN
    SELECT
        *
    INTO
        evidence
    FROM
        public.training_sources
    WHERE
        id IN (NEW.source_id, OLD.source_id)
        AND source_system = 'enqidu_semantics'
    ORDER BY
        id
    LIMIT 1;
    IF found THEN
        IF tg_op <> 'INSERT' OR CURRENT_USER NOT IN ('service_role', 'postgres') OR NEW.is_primary OR NEW.source_role <> 'supporting' OR NEW.session_id::text IS DISTINCT FROM evidence.original_json ->> 'session_id' THEN
            RAISE EXCEPTION 'Immutable semantic link';
        END IF;
    END IF;
    RETURN CASE WHEN tg_op = 'DELETE' THEN
        old
    ELSE
        new
    END;
END
$$;
REVOKE ALL ON FUNCTION training_semantics.guard_link () FROM public, anon, authenticated;
CREATE TRIGGER immutable_semantic_link
    BEFORE INSERT OR UPDATE OR DELETE ON public.session_source_links FOR EACH ROW
    EXECUTE FUNCTION training_semantics.guard_link ();
REVOKE EXECUTE ON FUNCTION public.capture_training_semantics_v1 (uuid, jsonb) FROM public, anon, authenticated, service_role;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('pallof_press', 'Press Pallof', '{"aliases":["pallof_press","Press Pallof","Pallof Press","press palof","pres palof","pallof","anti-rotacion con goma","press antirotacion","press anti-rotacion"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('front_squat', 'Sentadilla frontal', '{"aliases":["front_squat","Sentadilla frontal","Front Squat","front squat","sentadilla frontal","squat frontal"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('romanian_deadlift', 'Peso muerto rumano', '{"aliases":["romanian_deadlift","Peso muerto rumano","Romanian Deadlift","rdl","romanian deadlift","peso muerto rumano","pm rumano"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('bench_press', 'Press banca', '{"aliases":["bench_press","Press banca","Bench Press","press banca","bench press","banca"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('single_arm_row', 'Remo unilateral', '{"aliases":["single_arm_row","Remo unilateral","Single-arm Row","remo unilateral","remo a una mano","single arm row","one arm row"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('wall_ball', 'Wall ball', '{"aliases":["wall_ball","Wall ball","Wall Ball","wall ball","wall balls","lanzamiento balon pared","sentadilla con balon"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('rowing_ergometer', 'Remo ergometro', '{"aliases":["rowing_ergometer","Remo ergometro","Row Ergometer","remo ergometro","remoergometro","row","rower","rowing machine","remo"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('glute_bridge', 'Puente de gluteo', '{"aliases":["glute_bridge","Puente de gluteo","Glute Bridge","puente de gluteo","glute bridge","puente gluteo"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('dead_bug', 'Dead bug', '{"aliases":["dead_bug","Dead bug","Dead Bug","dead bug","deadbug","bicho muerto"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('bird_dog', 'Bird dog', '{"aliases":["bird_dog","Bird dog","Bird Dog","bird dog","birddog","perro pajaro"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('diaphragmatic_breathing', 'Respiración diafragmática', '{"aliases":["diaphragmatic_breathing","Respiración diafragmática","Diaphragmatic Breathing","respiracion diafragmatica","diafragmatica","breathing","respiracion 90/90"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
INSERT INTO public.exercise_catalog (code, name, metadata)
    VALUES ('lateral_monster_walk', 'Monster walk lateral', '{"aliases":["lateral_monster_walk","Monster walk lateral","Lateral Monster Walk","monster walk lateral","lateral monster walk","caminar lateral con banda"]}'::jsonb)
ON CONFLICT (code)
    DO NOTHING;
COMMIT;
