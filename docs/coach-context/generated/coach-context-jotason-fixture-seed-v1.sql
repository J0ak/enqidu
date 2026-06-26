-- ENQIDU Coach Context Jotason fixture seed v1.
-- Idempotent fixture seed generated from normalized JSON already stored in this repo.
-- Source: docs/coach-context/normalized/jotason/supabase-seed-plan.generated.json
-- Seed key: coach_context_jotason_fixture_v1
-- Scope: fixture_user = 'jotason', user_id = null.
-- Does not touch Garmin/FIT tables, existing user rows, Edge Functions, or runtime code.

begin;
set local statement_timeout = '60s';

-- Planned rows: {"athlete_profiles":1,"athlete_training_goals":1,"athlete_constraints":1,"athlete_equipment_locations":1,"athlete_equipment_items":32,"coach_context_sources":40,"coach_context_snapshots":1,"coach_session_fixtures":16,"coach_session_blocks":12,"coach_session_exercises":37,"coach_seed_runs":1}

insert into public.coach_athlete_profiles (
  user_id, fixture_user, display_name, profile_type, product, source_key, source_traceability, data_quality
) values (
  null, 'jotason', 'Jotason', 'fixture', 'ENQIDU', 'jotason:athlete_profile',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/athlete-context.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "warnings": [
    "fixture_user_not_live_auth_user"
  ],
  "role": "pilot_fixture"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  display_name = excluded.display_name,
  profile_type = excluded.profile_type,
  product = excluded.product,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_athlete_training_goals (
  athlete_profile_id, user_id, fixture_user, goal_type, priority, description, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'training', 'functional_lean_mass_full_body', 'hybrid_strength_skills_trail_system', 'jotason:training_goals:hybrid_strength_skills_trail_system',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/training-reference.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "priorities": {
    "primary": "functional_lean_mass_full_body",
    "secondary": "skills_mastery",
    "tertiary": "endurance_events_trail_triathlon"
  },
  "rules": [
    "priority_mass_over_cardio",
    "skills_every_week",
    "only_one_high_intensity_running_day",
    "friday_no_leg_fatigue",
    "saturday_primary_strength_day",
    "sunday_specific_endurance_not_competition"
  ]
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  goal_type = excluded.goal_type,
  priority = excluded.priority,
  description = excluded.description,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_athlete_constraints (
  athlete_profile_id, user_id, fixture_user, constraint_type, severity, description, active, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'equipment_location', null, 'Constraints for home', true, 'jotason:constraints:home',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "location_id": "home",
  "constraints": {
    "cardioAtHome": false,
    "noRackWhenRain": false
  }
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  constraint_type = excluded.constraint_type,
  severity = excluded.severity,
  description = excluded.description,
  active = excluded.active,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_locations (
  athlete_profile_id, user_id, fixture_user, location_id, location_type, label, constraints, source_key, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'home', 'home', 'Home', '{}'::jsonb, 'jotason:equipment_location:home',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  location_id = excluded.location_id,
  location_type = excluded.location_type,
  label = excluded.label,
  constraints = excluded.constraints,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'rack', 'strength', 'Rack', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:rack',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:rack",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "rack",
  "category": "strength",
  "name": "Rack",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'barbell', 'strength', 'Barbell', null, null, '"Ohio Bar"'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:barbell',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:barbell",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "barbell",
  "category": "strength",
  "name": "Barbell",
  "quantity": null,
  "unit": null,
  "value": "Ohio Bar",
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'platesKg-20kg', 'strength', 'Plates Kg 20kg', 2, 'kg', '2'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:platesKg-20kg',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:platesKg-20kg",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "platesKg-20kg",
  "category": "strength",
  "name": "Plates Kg 20kg",
  "quantity": 2,
  "unit": "kg",
  "value": 2,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'platesKg-10kg', 'strength', 'Plates Kg 10kg', 2, 'kg', '2'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:platesKg-10kg',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:platesKg-10kg",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "platesKg-10kg",
  "category": "strength",
  "name": "Plates Kg 10kg",
  "quantity": 2,
  "unit": "kg",
  "value": 2,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'platesKg-5kg', 'strength', 'Plates Kg 5kg', 2, 'kg', '2'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:platesKg-5kg',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:platesKg-5kg",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "platesKg-5kg",
  "category": "strength",
  "name": "Plates Kg 5kg",
  "quantity": 2,
  "unit": "kg",
  "value": 2,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'platesKg-25kg', 'strength', 'Plates Kg 2_5kg', 2, 'kg', '2'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:platesKg-25kg',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:platesKg-25kg",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "platesKg-25kg",
  "category": "strength",
  "name": "Plates Kg 2_5kg",
  "quantity": 2,
  "unit": "kg",
  "value": 2,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'platesKg-15kg', 'strength', 'Plates Kg 1_5kg', 2, 'kg', '2'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:platesKg-15kg',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:platesKg-15kg",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "platesKg-15kg",
  "category": "strength",
  "name": "Plates Kg 1_5kg",
  "quantity": 2,
  "unit": "kg",
  "value": 2,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'dumbbellsPairsKg-17_5', 'strength', 'Dumbbells Pairs Kg', 1, 'kg', '17.5'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:dumbbellsPairsKg-17_5',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:dumbbellsPairsKg-17_5",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "dumbbellsPairsKg-17_5",
  "category": "strength",
  "name": "Dumbbells Pairs Kg",
  "quantity": 1,
  "unit": "kg",
  "value": 17.5,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'dumbbellsPairsKg-10', 'strength', 'Dumbbells Pairs Kg', 1, 'kg', '10'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:dumbbellsPairsKg-10',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:dumbbellsPairsKg-10",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "dumbbellsPairsKg-10",
  "category": "strength",
  "name": "Dumbbells Pairs Kg",
  "quantity": 1,
  "unit": "kg",
  "value": 10,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'dumbbellsPairsKg-5', 'strength', 'Dumbbells Pairs Kg', 1, 'kg', '5'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:dumbbellsPairsKg-5',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:dumbbellsPairsKg-5",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "dumbbellsPairsKg-5",
  "category": "strength",
  "name": "Dumbbells Pairs Kg",
  "quantity": 1,
  "unit": "kg",
  "value": 5,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'dumbbellsPairsKg-2_5', 'strength', 'Dumbbells Pairs Kg', 1, 'kg', '2.5'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:dumbbellsPairsKg-2_5',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:dumbbellsPairsKg-2_5",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "dumbbellsPairsKg-2_5",
  "category": "strength",
  "name": "Dumbbells Pairs Kg",
  "quantity": 1,
  "unit": "kg",
  "value": 2.5,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'dumbbellsPairsKg-2', 'strength', 'Dumbbells Pairs Kg', 1, 'kg', '2'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:dumbbellsPairsKg-2',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:dumbbellsPairsKg-2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "dumbbellsPairsKg-2",
  "category": "strength",
  "name": "Dumbbells Pairs Kg",
  "quantity": 1,
  "unit": "kg",
  "value": 2,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'kettlebellsKg-24', 'strength', 'Kettlebells Kg', 1, 'kg', '24'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:kettlebellsKg-24',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:kettlebellsKg-24",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "kettlebellsKg-24",
  "category": "strength",
  "name": "Kettlebells Kg",
  "quantity": 1,
  "unit": "kg",
  "value": 24,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'kettlebellsKg-18', 'strength', 'Kettlebells Kg', 1, 'kg', '18'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:kettlebellsKg-18',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:kettlebellsKg-18",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "kettlebellsKg-18",
  "category": "strength",
  "name": "Kettlebells Kg",
  "quantity": 1,
  "unit": "kg",
  "value": 18,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'kettlebellsKg-16', 'strength', 'Kettlebells Kg', 1, 'kg', '16'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:kettlebellsKg-16',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:kettlebellsKg-16",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "kettlebellsKg-16",
  "category": "strength",
  "name": "Kettlebells Kg",
  "quantity": 1,
  "unit": "kg",
  "value": 16,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'landmine', 'strength', 'Landmine', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:landmine',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:landmine",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "landmine",
  "category": "strength",
  "name": "Landmine",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'weightedVestKg-5kg', 'strength', 'Weighted Vest Kg 5kg', null, 'kg', 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:weightedVestKg-5kg',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:weightedVestKg-5kg",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "weightedVestKg-5kg",
  "category": "strength",
  "name": "Weighted Vest Kg 5kg",
  "quantity": null,
  "unit": "kg",
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'weightedVestKg-10kg', 'strength', 'Weighted Vest Kg 10kg', null, 'kg', 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:weightedVestKg-10kg',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:weightedVestKg-10kg",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "weightedVestKg-10kg",
  "category": "strength",
  "name": "Weighted Vest Kg 10kg",
  "quantity": null,
  "unit": "kg",
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'rings', 'functional', 'Rings', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:rings',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:rings",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "rings",
  "category": "functional",
  "name": "Rings",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'singlePulley', 'functional', 'Single Pulley', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:singlePulley',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:singlePulley",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "singlePulley",
  "category": "functional",
  "name": "Single Pulley",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'doublePulley', 'functional', 'Double Pulley', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:doublePulley',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:doublePulley",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "doublePulley",
  "category": "functional",
  "name": "Double Pulley",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'stepBox', 'functional', 'Step Box', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:stepBox',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:stepBox",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "stepBox",
  "category": "functional",
  "name": "Step Box",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'bands', 'functional', 'Bands', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:bands',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:bands",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "bands",
  "category": "functional",
  "name": "Bands",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'sliders', 'functional', 'Sliders', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:sliders',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:sliders",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "sliders",
  "category": "functional",
  "name": "Sliders",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'balanceBoard', 'functional', 'Balance Board', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:balanceBoard',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:balanceBoard",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "balanceBoard",
  "category": "functional",
  "name": "Balance Board",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'wallBallLb', 'conditioning', 'Wall Ball Lb', 18, 'lb', '18'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:wallBallLb',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:wallBallLb",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "wallBallLb",
  "category": "conditioning",
  "name": "Wall Ball Lb",
  "quantity": 18,
  "unit": "lb",
  "value": 18,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'slamBallLb', 'conditioning', 'Slam Ball Lb', 30, 'lb', '30'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:slamBallLb',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:slamBallLb",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "slamBallLb",
  "category": "conditioning",
  "name": "Slam Ball Lb",
  "quantity": 30,
  "unit": "lb",
  "value": 30,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jumpRope', 'conditioning', 'Jump Rope', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:jumpRope',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:jumpRope",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "jumpRope",
  "category": "conditioning",
  "name": "Jump Rope",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'abmat', 'recovery', 'Abmat', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:abmat',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:abmat",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "abmat",
  "category": "recovery",
  "name": "Abmat",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'abWheel', 'recovery', 'Ab Wheel', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:abWheel',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:abWheel",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "abWheel",
  "category": "recovery",
  "name": "Ab Wheel",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'foamRoller', 'recovery', 'Foam Roller', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:foamRoller',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:foamRoller",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "foamRoller",
  "category": "recovery",
  "name": "Foam Roller",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_equipment_items (
  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload
) values (
  (select id from public.coach_equipment_locations where fixture_user = 'jotason' and source_key = 'jotason:equipment_location:home' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'theragun', 'recovery', 'Theragun', null, null, 'true'::jsonb, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'jotason:equipment_item:home:theragun',
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb,
  '{
  "natural_key": "jotason:equipment_item:home:theragun",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "location_id": "home",
  "item_id": "theragun",
  "category": "recovery",
  "name": "Theragun",
  "quantity": null,
  "unit": null,
  "value": true,
  "editable_live_state": false,
  "source_path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json"
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  equipment_location_id = excluded.equipment_location_id,
  athlete_profile_id = excluded.athlete_profile_id,
  item_id = excluded.item_id,
  category = excluded.category,
  name = excluded.name,
  quantity = excluded.quantity,
  unit = excluded.unit,
  value = excluded.value,
  raw_path = excluded.raw_path,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  payload = excluded.payload,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/11-05-2026_Jotason.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/11-05-2026_Jotason.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/11-05-2026_Jotason.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/2026-04-26_jotason_trail.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/2026-04-26_jotason_trail.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/2026-04-26_jotason_trail.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/2026-04-27_jotason.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/2026-04-27_jotason.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/2026-04-27_jotason.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/2026-04-29_jotason_full_day_v2.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/2026-04-29_jotason_full_day_v2.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/2026-04-29_jotason_full_day_v2.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/2026-05-04_JOTASON_FULL.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/2026-05-04_JOTASON_FULL.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/2026-05-04_JOTASON_FULL.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-13_COMPLETO.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-13_COMPLETO.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-13_COMPLETO.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/fixtures/jotason/sessions/jotason_trail_running_2026_05_10.json', 'raw_json', 'docs/coach-context/fixtures/jotason/sessions/jotason_trail_running_2026_05_10.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/fixtures/jotason/sessions/jotason_trail_running_2026_05_10.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/references/jotason/inventory_home_v4.json', 'raw_json', 'docs/coach-context/references/jotason/inventory_home_v4.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/references/jotason/inventory_home_v4.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/references/jotason/JOTASON_MASTER_TEMPLATE_v8_COMPLETO.json', 'raw_json', 'docs/coach-context/references/jotason/JOTASON_MASTER_TEMPLATE_v8_COMPLETO.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/references/jotason/JOTASON_MASTER_TEMPLATE_v8_COMPLETO.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/references/jotason/JOTASON_MASTER_ULTIMO_MES_2026-04-18_ULTRA_DETALLADO.json', 'raw_json', 'docs/coach-context/references/jotason/JOTASON_MASTER_ULTIMO_MES_2026-04-18_ULTRA_DETALLADO.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/references/jotason/JOTASON_MASTER_ULTIMO_MES_2026-04-18_ULTRA_DETALLADO.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:raw_json:docs/coach-context/references/jotason/jotason_promaestro_v5.json', 'raw_json', 'docs/coach-context/references/jotason/jotason_promaestro_v5.json', null, 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/references/jotason/jotason_promaestro_v5.json",
  "kind": "raw_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/athlete-context.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/athlete-context.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/athlete-context.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/coach-context.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/coach-context.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/coach-context.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/equipment-inventory.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/equipment-inventory.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/11-05-2026_Jotason.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/11-05-2026_Jotason.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/11-05-2026_Jotason.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/2026-04-26_jotason_trail.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/2026-04-26_jotason_trail.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/2026-04-26_jotason_trail.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/2026-04-27_jotason.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/2026-04-27_jotason.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/2026-04-27_jotason.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/2026-04-29_jotason_full_day_v2.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/2026-04-29_jotason_full_day_v2.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/2026-04-29_jotason_full_day_v2.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/2026-05-04_JOTASON_FULL.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/2026-05-04_JOTASON_FULL.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/2026-05-04_JOTASON_FULL.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-13_COMPLETO.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-13_COMPLETO.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-13_COMPLETO.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/sessions/jotason_trail_running_2026_05_10.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/sessions/jotason_trail_running_2026_05_10.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/sessions/jotason_trail_running_2026_05_10.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_sources (
  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality
) values (
  null, 'jotason', 'jotason:normalized_json:docs/coach-context/normalized/jotason/training-reference.normalized.json', 'normalized_json', null, 'docs/coach-context/normalized/jotason/training-reference.normalized.json', 'coach_context_fixture_source', null,
  '{
  "path": "docs/coach-context/normalized/jotason/training-reference.normalized.json",
  "kind": "normalized_json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  source_type = excluded.source_type,
  raw_file = excluded.raw_file,
  normalized_file = excluded.normalized_file,
  role = excluded.role,
  checksum = excluded.checksum,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_context_snapshots (
  athlete_profile_id, user_id, fixture_user, snapshot_type, schema_version, source_key, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'normalized_context', 'coach_context_fixture_seed_v1', 'jotason:coach_context_snapshot:normalized_v0',
  '{
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
  },
  "source_path": "docs/coach-context/normalized/jotason/coach-context.normalized.json",
  "references_count": null,
  "session_fixtures_count": 16
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/coach-context.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  snapshot_type = excluded.snapshot_type,
  schema_version = excluded.schema_version,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-11:11-05-2026_Jotason.json', '2026-05-11'::date, null, null, 'double_session_hybrid_swim', 'double_session_hybrid_swim', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/11-05-2026_Jotason.json', 'docs/coach-context/normalized/jotason/sessions/11-05-2026_Jotason.normalized.json',
  '{
  "natural_key": "jotason:session:2026-05-11:11-05-2026_Jotason.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-05-11",
  "title": null,
  "sport": null,
  "session_type": "double_session_hybrid_swim",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/11-05-2026_Jotason.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/11-05-2026_Jotason.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/11-05-2026_Jotason.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/11-05-2026_Jotason.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-26:2026-04-26_jotason_trail.json', '2026-04-26'::date, 'Bustarviejo Trail running', 'trail_running', null, null, null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/2026-04-26_jotason_trail.json', 'docs/coach-context/normalized/jotason/sessions/2026-04-26_jotason_trail.normalized.json',
  '{
  "natural_key": "jotason:session:2026-04-26:2026-04-26_jotason_trail.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-04-26",
  "title": "Bustarviejo Trail running",
  "sport": "trail_running",
  "session_type": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/2026-04-26_jotason_trail.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/2026-04-26_jotason_trail.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/2026-04-26_jotason_trail.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/2026-04-26_jotason_trail.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-27:2026-04-27_jotason.json', '2026-04-27'::date, null, null, 'doble_sesion_hibrido_running', 'doble_sesion_hibrido_running', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/2026-04-27_jotason.json', 'docs/coach-context/normalized/jotason/sessions/2026-04-27_jotason.normalized.json',
  '{
  "natural_key": "jotason:session:2026-04-27:2026-04-27_jotason.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-04-27",
  "title": null,
  "sport": null,
  "session_type": "doble_sesion_hibrido_running",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/2026-04-27_jotason.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/2026-04-27_jotason.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/2026-04-27_jotason.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/2026-04-27_jotason.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-29:2026-04-29_jotason_full_day_v2.json', '2026-04-29'::date, null, null, null, null, null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/2026-04-29_jotason_full_day_v2.json', 'docs/coach-context/normalized/jotason/sessions/2026-04-29_jotason_full_day_v2.normalized.json',
  '{
  "natural_key": "jotason:session:2026-04-29:2026-04-29_jotason_full_day_v2.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-04-29",
  "title": null,
  "sport": null,
  "session_type": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/2026-04-29_jotason_full_day_v2.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/2026-04-29_jotason_full_day_v2.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/2026-04-29_jotason_full_day_v2.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/2026-04-29_jotason_full_day_v2.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-04:2026-05-04_JOTASON_FULL.json', '2026-05-04'::date, null, null, 'doble_sesion_hibrido_swim_recovery', 'doble_sesion_hibrido_swim_recovery', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/2026-05-04_JOTASON_FULL.json', 'docs/coach-context/normalized/jotason/sessions/2026-05-04_JOTASON_FULL.normalized.json',
  '{
  "natural_key": "jotason:session:2026-05-04:2026-05-04_JOTASON_FULL.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-05-04",
  "title": null,
  "sport": null,
  "session_type": "doble_sesion_hibrido_swim_recovery",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/2026-05-04_JOTASON_FULL.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/2026-05-04_JOTASON_FULL.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/2026-05-04_JOTASON_FULL.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/2026-05-04_JOTASON_FULL.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json', '2026-04-20'::date, 'trabajo híbrido combinado de HIIT matinal + natación aeróbica regenerativa por la tarde', 'hiit', 'doble_sesion_hibrida', 'doble_sesion_hibrida', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json', 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json',
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-04-20",
  "title": "trabajo híbrido combinado de HIIT matinal + natación aeróbica regenerativa por la tarde",
  "sport": "hiit",
  "session_type": "doble_sesion_hibrida",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-21:JOTASON_2026-04-21_FULL_DAY.json', '2026-04-21'::date, 'running_intervalado_control_aerobico_pre_taper', 'running', null, null, null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.json', 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.normalized.json',
  '{
  "natural_key": "jotason:session:2026-04-21:JOTASON_2026-04-21_FULL_DAY.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-04-21",
  "title": "running_intervalado_control_aerobico_pre_taper",
  "sport": "running",
  "session_type": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-21_FULL_DAY.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json', '2026-04-22'::date, 'doble_sesion_hibrido_y_natacion_recuperacion_aerobica_baja', 'hybrid_hiit', null, null, null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json', 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json',
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-04-22",
  "title": "doble_sesion_hibrido_y_natacion_recuperacion_aerobica_baja",
  "sport": "hybrid_hiit",
  "session_type": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-05:JOTASON_2026-05-05_strength_lower_body.json', '2026-05-05'::date, null, null, 'strength_lower_body', 'strength_lower_body', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.json', 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.normalized.json',
  '{
  "natural_key": "jotason:session:2026-05-05:JOTASON_2026-05-05_strength_lower_body.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-05-05",
  "title": null,
  "sport": null,
  "session_type": "strength_lower_body",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-05_strength_lower_body.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-06:JOTASON_2026-05-06_HIBRIDO_SWIM.json', '2026-05-06'::date, null, null, 'doble_sesion_hibrido_swim', 'doble_sesion_hibrido_swim', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.json', 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.normalized.json',
  '{
  "natural_key": "jotason:session:2026-05-06:JOTASON_2026-05-06_HIBRIDO_SWIM.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-05-06",
  "title": null,
  "sport": null,
  "session_type": "doble_sesion_hibrido_swim",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-06_HIBRIDO_SWIM.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-07:JOTASON_2026-05-07_YOGA_RECOVERY.json', '2026-05-07'::date, 'Yoga Recovery Session', null, 'recovery_yoga_session', 'recovery_yoga_session', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.json', 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.normalized.json',
  '{
  "natural_key": "jotason:session:2026-05-07:JOTASON_2026-05-07_YOGA_RECOVERY.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-05-07",
  "title": "Yoga Recovery Session",
  "sport": null,
  "session_type": "recovery_yoga_session",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-07_YOGA_RECOVERY.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json', '2026-05-08'::date, 'Z2 urban recovery run', null, 'doble_sesion_hibrido_upper_run', 'doble_sesion_hibrido_upper_run', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.json', 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json',
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-05-08",
  "title": "Z2 urban recovery run",
  "sport": null,
  "session_type": "doble_sesion_hibrido_upper_run",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-09:JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json', '2026-05-09'::date, 'Hybrid lower strength + trail stability', null, 'strength_lower_hybrid', 'strength_lower_hybrid', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json', 'docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.normalized.json',
  '{
  "natural_key": "jotason:session:2026-05-09:JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-05-09",
  "title": "Hybrid lower strength + trail stability",
  "sport": null,
  "session_type": "strength_lower_hybrid",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-12:Jotason_2026-05-12_upper_hybrid_skill_strength.json', '2026-05-12'::date, null, null, 'upper_hybrid_skill_strength', 'upper_hybrid_skill_strength', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.json', 'docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.normalized.json',
  '{
  "natural_key": "jotason:session:2026-05-12:Jotason_2026-05-12_upper_hybrid_skill_strength.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-05-12",
  "title": null,
  "sport": null,
  "session_type": "upper_hybrid_skill_strength",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-12_upper_hybrid_skill_strength.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-13:Jotason_2026-05-13_COMPLETO.json', '2026-05-13'::date, null, null, 'doble_sesion_hibrido_hiit_swim_recovery', 'doble_sesion_hibrido_hiit_swim_recovery', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-13_COMPLETO.json', 'docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-13_COMPLETO.normalized.json',
  '{
  "natural_key": "jotason:session:2026-05-13:Jotason_2026-05-13_COMPLETO.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-05-13",
  "title": null,
  "sport": null,
  "session_type": "doble_sesion_hibrido_hiit_swim_recovery",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-13_COMPLETO.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-13_COMPLETO.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/Jotason_2026-05-13_COMPLETO.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/Jotason_2026-05-13_COMPLETO.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_fixtures (
  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality
) values (
  (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-10:jotason_trail_running_2026_05_10.json', '2026-05-10'::date, null, null, 'trail_running_aerobic_base', 'trail_running_aerobic_base', null, null, null, null, 'docs/coach-context/fixtures/jotason/sessions/jotason_trail_running_2026_05_10.json', 'docs/coach-context/normalized/jotason/sessions/jotason_trail_running_2026_05_10.normalized.json',
  '{
  "natural_key": "jotason:session:2026-05-10:jotason_trail_running_2026_05_10.json",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "date": "2026-05-10",
  "title": null,
  "sport": null,
  "session_type": "trail_running_aerobic_base",
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/jotason_trail_running_2026_05_10.normalized.json",
  "raw_source_path": "docs/coach-context/fixtures/jotason/sessions/jotason_trail_running_2026_05_10.json",
  "editable_live_state": false,
  "historical_fixture": true
}'::jsonb,
  '{
  "raw_file": "docs/coach-context/fixtures/jotason/sessions/jotason_trail_running_2026_05_10.json",
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/jotason_trail_running_2026_05_10.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{
  "historical_fixture": true
}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  athlete_profile_id = excluded.athlete_profile_id,
  session_date = excluded.session_date,
  title = excluded.title,
  sport = excluded.sport,
  session_type = excluded.session_type,
  intent_type = excluded.intent_type,
  location_type = excluded.location_type,
  duration_seconds = excluded.duration_seconds,
  distance_meters = excluded.distance_meters,
  calories_total = excluded.calories_total,
  raw_source_file = excluded.raw_source_file,
  normalized_source_file = excluded.normalized_source_file,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:A', 1, 'warmup_mobility', 'Movilidad, estiramiento y movilidad activa',
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:A",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_order": 1,
  "block_id": "A",
  "block_type": "warmup_mobility",
  "title": "Movilidad, estiramiento y movilidad activa",
  "rounds": 1,
  "estimated_duration_min": 8,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B', 2, 'kettlebell_complex', 'Complejo kettlebell unilateral',
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_order": 2,
  "block_id": "B",
  "block_type": "kettlebell_complex",
  "title": "Complejo kettlebell unilateral",
  "rounds": 3,
  "estimated_duration_min": 10,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C', 3, 'metabolic_circuit', 'Circuito principal metabólico',
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_order": 3,
  "block_id": "C",
  "block_type": "metabolic_circuit",
  "title": "Circuito principal metabólico",
  "rounds": 3,
  "estimated_duration_min": 15,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:A', 1, null, null,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:A",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_order": 1,
  "block_id": "A",
  "block_type": null,
  "title": null,
  "rounds": null,
  "estimated_duration_min": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:B', 2, null, null,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:B",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_order": 2,
  "block_id": "B",
  "block_type": null,
  "title": null,
  "rounds": 3,
  "estimated_duration_min": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C', 3, null, null,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_order": 3,
  "block_id": "C",
  "block_type": null,
  "title": null,
  "rounds": 3,
  "estimated_duration_min": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D', 4, null, null,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_order": 4,
  "block_id": "D",
  "block_type": null,
  "title": null,
  "rounds": 3,
  "estimated_duration_min": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E', 5, null, null,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_order": 5,
  "block_id": "E",
  "block_type": null,
  "title": null,
  "rounds": 3,
  "estimated_duration_min": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F', 6, null, null,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_order": 6,
  "block_id": "F",
  "block_type": null,
  "title": null,
  "rounds": 2,
  "estimated_duration_min": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1', 1, null, null,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_order": 1,
  "block_id": null,
  "block_type": null,
  "title": null,
  "rounds": null,
  "estimated_duration_min": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2', 2, null, null,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_order": 2,
  "block_id": null,
  "block_type": null,
  "title": null,
  "rounds": null,
  "estimated_duration_min": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_blocks (
  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3', 3, null, null,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_order": 3,
  "block_id": null,
  "block_type": null,
  "title": null,
  "rounds": null,
  "estimated_duration_min": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  athlete_profile_id = excluded.athlete_profile_id,
  block_index = excluded.block_index,
  block_type = excluded.block_type,
  title = excluded.title,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:A' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:A:exercise:1', 1, 'Movilidad general', null, '1'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:A:exercise:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:A",
  "exercise_order": 1,
  "exercise_name": "Movilidad general",
  "equipment": null,
  "sets": 1,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B:exercise:1', 1, 'Kettlebell high pull / remo vertical subiendo codo unilateral', null, '3'::jsonb,
  '{
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 16,
  "equipment": "kettlebell"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B:exercise:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B",
  "exercise_order": 1,
  "exercise_name": "Kettlebell high pull / remo vertical subiendo codo unilateral",
  "equipment": "kettlebell",
  "sets": 3,
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 16,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B:exercise:2', 2, 'Kettlebell one-arm swing', null, '3'::jsonb,
  '{
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 16,
  "equipment": "kettlebell"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B:exercise:2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B",
  "exercise_order": 2,
  "exercise_name": "Kettlebell one-arm swing",
  "equipment": "kettlebell",
  "sets": 3,
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 16,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B:exercise:3', 3, 'Kettlebell push press unilateral', null, '3'::jsonb,
  '{
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 16,
  "equipment": "kettlebell"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B:exercise:3",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B",
  "exercise_order": 3,
  "exercise_name": "Kettlebell push press unilateral",
  "equipment": "kettlebell",
  "sets": 3,
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 16,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B:exercise:4', 4, 'Escaladores cruzados', null, '3'::jsonb,
  '{
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": "bodyweight"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B:exercise:4",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:B",
  "exercise_order": 4,
  "exercise_name": "Escaladores cruzados",
  "equipment": "bodyweight",
  "sets": 3,
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:1', 1, 'Remo con kettlebell subiendo codo', null, '3'::jsonb,
  '{
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": 20,
  "equipment": "kettlebell"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C",
  "exercise_order": 1,
  "exercise_name": "Remo con kettlebell subiendo codo",
  "equipment": "kettlebell",
  "sets": 3,
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": 20,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:2', 2, 'Step-up / pistol asistido en banco con kettlebell', null, '3'::jsonb,
  '{
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": 12,
  "equipment": "kettlebell + bench"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C",
  "exercise_order": 2,
  "exercise_name": "Step-up / pistol asistido en banco con kettlebell",
  "equipment": "kettlebell + bench",
  "sets": 3,
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": 12,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:3', 3, 'Face pull unilateral en posición de caballero', null, '3'::jsonb,
  '{
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": 15,
  "equipment": "cable"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:3",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C",
  "exercise_order": 3,
  "exercise_name": "Face pull unilateral en posición de caballero",
  "equipment": "cable",
  "sets": 3,
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": 15,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:4', 4, 'Assault bike', null, '3'::jsonb,
  '{
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": null,
  "equipment": "assault_bike"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:4",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C",
  "exercise_order": 4,
  "exercise_name": "Assault bike",
  "equipment": "assault_bike",
  "sets": 3,
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:5', 5, 'Wall ball parcial', null, '3'::jsonb,
  '{
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": 9,
  "equipment": "wall_ball"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:5",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C",
  "exercise_order": 5,
  "exercise_name": "Wall ball parcial",
  "equipment": "wall_ball",
  "sets": 3,
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": 9,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:6', 6, 'Remo ergómetro', null, '3'::jsonb,
  '{
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": null,
  "equipment": "rowing_machine"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:6",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C",
  "exercise_order": 6,
  "exercise_name": "Remo ergómetro",
  "equipment": "rowing_machine",
  "sets": 3,
  "reps": null,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:7', 7, 'Walking lunge con kettlebell', null, '3'::jsonb,
  '{
  "reps": 16,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": 16,
  "equipment": "kettlebell"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C:exercise:7",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json",
  "block_natural_key": "jotason:session:2026-04-20:JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json:block:C",
  "exercise_order": 7,
  "exercise_name": "Walking lunge con kettlebell",
  "equipment": "kettlebell",
  "sets": 3,
  "reps": 16,
  "duration_sec": 40,
  "rest_sec": 10,
  "load_kg": 16,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:B' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:B:exercise:1', 1, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:B:exercise:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:B",
  "exercise_order": 1,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:B' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:B:exercise:2', 2, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:B:exercise:2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:B",
  "exercise_order": 2,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C:exercise:1', 1, null, null, '{}'::jsonb,
  '{
  "reps": 8,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C:exercise:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C",
  "exercise_order": 1,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": 8,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C:exercise:2', 2, null, null, '{}'::jsonb,
  '{
  "reps": 8,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C:exercise:2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C",
  "exercise_order": 2,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": 8,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C:exercise:3', 3, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C:exercise:3",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C",
  "exercise_order": 3,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C:exercise:4', 4, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C:exercise:4",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:C",
  "exercise_order": 4,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D:exercise:1', 1, null, null, '{}'::jsonb,
  '{
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 7,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D:exercise:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D",
  "exercise_order": 1,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 7,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D:exercise:2', 2, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 10,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D:exercise:2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D",
  "exercise_order": 2,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 10,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D:exercise:3', 3, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D:exercise:3",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:D",
  "exercise_order": 3,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E:exercise:1', 1, null, null, '{}'::jsonb,
  '{
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 17.5,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E:exercise:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E",
  "exercise_order": 1,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 17.5,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E:exercise:2', 2, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E:exercise:2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E",
  "exercise_order": 2,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E:exercise:3', 3, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E:exercise:3",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:E",
  "exercise_order": 3,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F:exercise:1', 1, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 20,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F:exercise:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F",
  "exercise_order": 1,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 20,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F:exercise:2', 2, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 5,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F:exercise:2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F",
  "exercise_order": 2,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": 5,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F:exercise:3', 3, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F:exercise:3",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json",
  "block_natural_key": "jotason:session:2026-04-22:JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json:block:F",
  "exercise_order": 3,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1:exercise:1', 1, null, null, '5'::jsonb,
  '{
  "reps": "4-5",
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1:exercise:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1",
  "exercise_order": 1,
  "exercise_name": null,
  "equipment": null,
  "sets": 5,
  "reps": "4-5",
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1:exercise:2', 2, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1:exercise:2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1",
  "exercise_order": 2,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1:exercise:3', 3, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1:exercise:3",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1",
  "exercise_order": 3,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1:exercise:4', 4, null, null, '4'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1:exercise:4",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:1",
  "exercise_order": 4,
  "exercise_name": null,
  "equipment": null,
  "sets": 4,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2:exercise:1', 1, null, null, '4'::jsonb,
  '{
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2:exercise:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2",
  "exercise_order": 1,
  "exercise_name": null,
  "equipment": null,
  "sets": 4,
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2:exercise:2', 2, null, null, '[
  {
    "reps": 8,
    "weight_kg": 35
  },
  {
    "reps": 8,
    "weight_kg": 40
  },
  {
    "reps": 8,
    "weight_kg": 40
  },
  {
    "reps": 8,
    "weight_kg": 40
  }
]'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2:exercise:2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2",
  "exercise_order": 2,
  "exercise_name": null,
  "equipment": null,
  "sets": [
    {
      "reps": 8,
      "weight_kg": 35
    },
    {
      "reps": 8,
      "weight_kg": 40
    },
    {
      "reps": 8,
      "weight_kg": 40
    },
    {
      "reps": 8,
      "weight_kg": 40
    }
  ],
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2:exercise:3', 3, null, null, '3'::jsonb,
  '{
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2:exercise:3",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:2",
  "exercise_order": 3,
  "exercise_name": null,
  "equipment": null,
  "sets": 3,
  "reps": 6,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3:exercise:1', 1, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3:exercise:1",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3",
  "exercise_order": 1,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3:exercise:2', 2, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": null
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3:exercise:2",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3",
  "exercise_order": 2,
  "exercise_name": null,
  "equipment": null,
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_session_exercises (
  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality
) values (
  (select id from public.coach_session_fixtures where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json' limit 1), (select id from public.coach_session_blocks where fixture_user = 'jotason' and source_key = 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3' limit 1), (select id from public.coach_athlete_profiles where fixture_user = 'jotason' and source_key = 'jotason:athlete_profile' limit 1), null, 'jotason', 'jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3:exercise:3', 3, null, null, '{}'::jsonb,
  '{
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "equipment": "light blue band"
}'::jsonb,
  '{
  "natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3:exercise:3",
  "operation": "insert_if_absent",
  "fixture_user": "jotason",
  "session_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json",
  "block_natural_key": "jotason:session:2026-05-08:JOTASON_2026-05-08_FULL_DAY_HYBRID.json:block:3",
  "exercise_order": 3,
  "exercise_name": null,
  "equipment": "light blue band",
  "sets": null,
  "reps": null,
  "duration_sec": null,
  "rest_sec": null,
  "load_kg": null,
  "normalized_path": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json"
}'::jsonb,
  '{
  "normalized_file": "docs/coach-context/normalized/jotason/sessions/JOTASON_2026-05-08_FULL_DAY_HYBRID.normalized.json",
  "seed_key": "coach_context_jotason_fixture_v1"
}'::jsonb,
  '{}'::jsonb
)
on conflict (fixture_user, source_key) where fixture_user is not null do update set
  session_fixture_id = excluded.session_fixture_id,
  block_id = excluded.block_id,
  athlete_profile_id = excluded.athlete_profile_id,
  exercise_index = excluded.exercise_index,
  name = excluded.name,
  category = excluded.category,
  sets = excluded.sets,
  metrics = excluded.metrics,
  payload = excluded.payload,
  source_traceability = excluded.source_traceability,
  data_quality = excluded.data_quality,
  updated_at = excluded.updated_at
;

insert into public.coach_seed_runs (
  seed_key, mode, fixture_user, status, input_plan, result_summary, warnings
) values (
  'coach_context_jotason_fixture_v1', 'applied', 'jotason', 'success',
  '{
  "source": "docs/coach-context/normalized/jotason/supabase-seed-plan.generated.json",
  "seed_sql": "docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.sql",
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
  "fixture_user": "jotason",
  "writes_to_database": true,
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
on conflict (seed_key) do update set
  mode = excluded.mode,
  fixture_user = excluded.fixture_user,
  status = excluded.status,
  input_plan = excluded.input_plan,
  result_summary = excluded.result_summary,
  warnings = excluded.warnings,
  updated_at = now();

commit;
