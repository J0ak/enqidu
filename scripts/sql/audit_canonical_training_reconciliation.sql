-- Read-only snapshot for scripts/reconciliation-dry-run.mjs.
-- Export the single JSON value with psql -At; never execute the migration in production for a dry-run.
-- Keep raw snapshot outside Git: it contains athlete data.
begin read only;
select jsonb_build_object(
 'profiles',(select jsonb_agg(jsonb_build_object('id',id,'timezone',timezone)) from public.profiles),
 'training_sources',(select jsonb_agg(to_jsonb(s)) from public.training_sources s),
 'training_sessions',(select jsonb_agg(to_jsonb(s)-'original_payload') from public.training_sessions s),
 'planned_training_sessions',(select jsonb_agg(to_jsonb(s)) from public.planned_training_sessions s),
 'session_source_links',(select jsonb_agg(to_jsonb(s)) from public.session_source_links s),
 'session_blocks',(select jsonb_agg(to_jsonb(s)) from public.session_blocks s),
 'session_exercises',(select jsonb_agg(to_jsonb(s)) from public.session_exercises s)
);
rollback;
