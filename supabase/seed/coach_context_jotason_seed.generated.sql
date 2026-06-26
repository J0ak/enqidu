-- GENERATED DRAFT ONLY - DO NOT APPLY AUTOMATICALLY
-- Source: docs/coach-context/normalized/jotason/supabase-seed-plan.generated.json
-- This file is not executed automatically.
-- Review RLS, target environment and rollback before applying.
-- It intentionally keeps fixture rows under fixture_user = 'jotason'.

begin;

-- This generated SQL is a review artifact. It is wrapped in rollback so
-- accidental execution does not persist rows without a deliberate edit.

-- Planned tables: 11
-- Planned session fixtures: 16

insert into public.coach_athlete_profiles (
  fixture_user, display_name, profile_type, product, source_key, source_traceability, data_quality
)
values (
  'jotason',
  'Jotason',
  'fixture',
  'ENQIDU',
  'jotason:athlete_profile',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/athlete-context.normalized.json",
  "fixture_user": "jotason"
}'::jsonb,
  '{
  "warnings": [
    "fixture_user_not_live_auth_user"
  ]
}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/11-05-2026_Jotason.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/11-05-2026_Jotason.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/11-05-2026_Jotason.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/2026-04-26_jotason_trail.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/2026-04-26_jotason_trail.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/2026-04-26_jotason_trail.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/2026-04-27_jotason.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/2026-04-27_jotason.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/2026-04-27_jotason.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/2026-04-29_jotason_full_day_v2.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/2026-04-29_jotason_full_day_v2.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/2026-04-29_jotason_full_day_v2.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/2026-05-04_JOTASON_FULL.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/2026-05-04_JOTASON_FULL.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/2026-05-04_JOTASON_FULL.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-13_COMPLETO.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-13_COMPLETO.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-13_COMPLETO.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/jotason_trail_running_2026_05_10.json',
  'raw_json',
  'docs/coach-context/fixtures/jotason/sessions/jotason_trail_running_2026_05_10.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/jotason_trail_running_2026_05_10.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/references/jotason/inventory_home_v4.json',
  'raw_json',
  'docs/coach-context/references/jotason/inventory_home_v4.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/references/jotason/inventory_home_v4.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/references/jotason/JOTASON_MASTER_TEMPLATE_v8_COMPLETO.json',
  'raw_json',
  'docs/coach-context/references/jotason/JOTASON_MASTER_TEMPLATE_v8_COMPLETO.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/references/jotason/JOTASON_MASTER_TEMPLATE_v8_COMPLETO.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/references/jotason/JOTASON_MASTER_ULTIMO_MES_2026-04-18_ULTRA_DETALLADO.json',
  'raw_json',
  'docs/coach-context/references/jotason/JOTASON_MASTER_ULTIMO_MES_2026-04-18_ULTRA_DETALLADO.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/references/jotason/JOTASON_MASTER_ULTIMO_MES_2026-04-18_ULTRA_DETALLADO.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:raw_json:docs/coach-context/references/jotason/jotason_promaestro_v5.json',
  'raw_json',
  'docs/coach-context/references/jotason/jotason_promaestro_v5.json',
  null,
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/references/jotason/jotason_promaestro_v5.json",
  "kind": "raw_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/athlete-context.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/athlete-context.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/athlete-context.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/coach-context.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/coach-context.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/coach-context.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/equipment-inventory.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/11-05-2026_Jotason.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/11-05-2026_Jotason.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/11-05-2026_Jotason.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/2026-04-26_jotason_trail.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/2026-04-26_jotason_trail.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/2026-04-26_jotason_trail.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/2026-04-27_jotason.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/2026-04-27_jotason.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/2026-04-27_jotason.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/2026-04-29_jotason_full_day_v2.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/2026-04-29_jotason_full_day_v2.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/2026-04-29_jotason_full_day_v2.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/2026-05-04_JOTASON_FULL.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/2026-05-04_JOTASON_FULL.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/2026-05-04_JOTASON_FULL.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-13_COMPLETO.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-13_COMPLETO.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-13_COMPLETO.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/jotason_trail_running_2026_05_10.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/sessions/jotason_trail_running_2026_05_10.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/jotason_trail_running_2026_05_10.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_context_sources (
  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality
)
values (
  'jotason',
  'jotason:normalized_json:docs/coach-context/normalized/jotason/training-reference.normalized.json',
  'normalized_json',
  null,
  'docs/coach-context/normalized/jotason/training-reference.normalized.json',
  'coach_context_fixture_source',
  '{
  "path": "docs/coach-context/normalized/jotason/training-reference.normalized.json",
  "kind": "normalized_json"
}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into public.coach_seed_runs (
  seed_key, mode, fixture_user, status, input_plan, result_summary, warnings
)
values (
  'jotason:seed_run:dry_run:v0',
  'dry_run',
  'jotason',
  'draft',
  '{
  "source": "docs/coach-context/normalized/jotason/supabase-seed-plan.generated.json",
  "counts": {
    "athlete_profiles": 1,
    "athlete_training_goals": 1,
    "athlete_constraints": 1,
    "athlete_equipment_locations": 1,
    "athlete_equipment_items": 32,
    "coach_context_sources": 40,
    "coach_context_snapshots": 1,
    "coach_session_fixtures": 16,
    "coach_session_blocks": 12,
    "coach_session_exercises": 37,
    "coach_seed_runs": 1
  }
}'::jsonb,
  '{
  "writes_to_database": false,
  "generated_from": "docs/coach-context/normalized/jotason"
}'::jsonb,
  '[
  "dry_run_only_no_database_write",
  "fixture_user_context_not_live_user_profile",
  "fixture_user_not_live_auth_user",
  "historical_reference_not_current_availability",
  "no_blocks_detected",
  "no_explicit_session_collection"
]'::jsonb
)
on conflict (seed_key) do nothing;

rollback;
