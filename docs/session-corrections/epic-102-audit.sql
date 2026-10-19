-- Production audit: SELECT only. No mutations, functions with side effects or PII.
SELECT
  count(*) AS exercises,
  count(*) FILTER (WHERE lower(trim(reported_name)) ~ '^unknown( [0-9]+)?$') AS unknown,
  count(*) FILTER (WHERE CASE WHEN jsonb_typeof(reps_per_set)='array' THEN jsonb_array_length(reps_per_set)>0 ELSE false END) AS nonempty_rep_arrays,
  count(*) FILTER (WHERE CASE WHEN jsonb_typeof(reps_per_set)='array' THEN jsonb_array_length(reps_per_set)>0 AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(reps_per_set) r WHERE jsonb_typeof(r)<>'number' OR r::text !~ '^[0-9]+$'
  ) ELSE false END) AS compatible_rep_arrays,
  count(*) FILTER (WHERE load_value IS NOT NULL) AS with_load,
  count(*) FILTER (WHERE exercise_id IS NOT NULL) AS with_exercise_id
FROM public.session_exercises;

SELECT source_type,count(*) FROM public.training_sources GROUP BY source_type ORDER BY source_type;

SELECT count(*) AS fit_and_manual FROM (
  SELECT l.session_id FROM public.session_source_links l
  JOIN public.training_sources s ON s.id=l.source_id GROUP BY l.session_id
  HAVING bool_or(s.source_type='garmin_fit') AND bool_or(s.source_type='manual_entry')
) sessions;

SELECT enrichment_type,count(*) AS events,count(DISTINCT session_id) AS sessions
FROM public.enkidu_conversation_enrichments
WHERE enrichment_type IN ('session_correction','semantic_correction_v1') GROUP BY enrichment_type;

SELECT s.local_date,s.title,s.session_status,
  (SELECT count(*) FROM public.session_blocks b WHERE b.session_id=s.id) AS blocks,
  (SELECT count(*) FROM public.session_exercises e WHERE e.session_id=s.id) AS exercises,
  (SELECT count(*) FROM public.session_source_links l WHERE l.session_id=s.id) AS source_links
FROM public.training_sessions s
WHERE s.local_date IN ('2026-07-21','2026-10-07','2026-10-14','2026-10-15') AND s.session_status<>'archived'
ORDER BY s.local_date,s.title;

SELECT c.relname,c.relrowsecurity,c.relacl::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('training_sessions','session_blocks','session_exercises','session_metrics','training_sources','session_source_links','enkidu_conversation_enrichments');

SELECT p.proname,p.prosecdef,p.proacl::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('capture_training_semantics_v1','persist_conversation_enrichment','chatgpt_pilot_apply_capture','reconcile_training_day_v1','apply_enqidu_action_v1','apply_training_semantics_v1','read_training_semantics_v1');

SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN ('training_sessions','session_blocks','session_exercises','session_metrics','training_sources','session_source_links','enkidu_conversation_enrichments')
ORDER BY tablename,policyname;
