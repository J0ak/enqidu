-- ENQIDU universal training model.
-- Additive migration: does not drop or rename existing Garmin/FIT/Jotason tables.
-- Supabase note (2026-04-28 changelog): new public tables may not be exposed to
-- Data API automatically, so explicit grants are included below with RLS enabled.

create extensión if not exists pgcrypto;

alter table if exists public.training_sessions
  add column if not exists universal_schema_version text,
  add column if not exists canonical_session jsonb not null default '{}'::jsonb,
  add column if not exists summary_metrics jsonb not null default '{}'::jsonb,
  add column if not exists completion_score numeric;

alter table if exists public.session_blocks
  add column if not exists order_index integer,
  add column if not exists block_format text,
  add column if not exists primary_measurement_type text,
  add column if not exists rounds numeric,
  add column if not exists time_cap_s integer,
  add column if not exists summary_metrics jsonb not null default '{}'::jsonb;

update public.session_blocks
set order_index = block_order
where order_index is null
  and block_order is not null;

create table if not exists public.exercise_catalog (
  id uuid primary key default gen_random_uuid(),
  canonical_slug text not null unique,
  display_name_es text not null,
  display_name_en text,
  aliases text[] not null default '{}',
  category text,
  movement_pattern text,
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  equipment_required text[] not null default '{}',
  equipment_optional text[] not null default '{}',
  allowed_measurements text[] not null default '{}',
  default_measurement text,
  difficulty_level text,
  skill_level text,
  risk_tags text[] not null default '{}',
  contraindications text[] not null default '{}',
  progressions text[] not null default '{}',
  regressions text[] not null default '{}',
  substitutions text[] not null default '{}',
  external_mappings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercise_measurement_schema (
  id uuid primary key default gen_random_uuid(),
  exercise_id text not null references public.exercise_catalog(canonical_slug) on update cascade on delete cascade,
  measurement_type text not null,
  required_fields text[] not null default '{}',
  optional_fields text[] not null default '{}',
  default_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exercise_id, measurement_type)
);

create table if not exists public.block_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.session_blocks(id) on delete cascade,
  order_index integer not null,
  item_type text not null,
  item_name text,
  station_label text,
  round_index integer,
  minute_slot integer,
  duration_s integer,
  rest_s integer,
  summary_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block_id, order_index)
);

create table if not exists public.item_exercises (
  id uuid primary key default gen_random_uuid(),
  block_item_id uuid not null references public.block_items(id) on delete cascade,
  exercise_id text not null,
  order_index integer not null,
  display_name text not null,
  measurement_type text not null,
  target_reps numeric,
  target_reps_per_side numeric,
  target_load_kg numeric,
  target_duration_s integer,
  target_distance_m numeric,
  missing_fields text[] not null default '{}',
  summary_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block_item_id, order_index)
);

create table if not exists public.performed_sets (
  id uuid primary key default gen_random_uuid(),
  item_exercise_id uuid not null references public.item_exercises(id) on delete cascade,
  set_index integer not null,
  reps numeric,
  reps_left numeric,
  reps_right numeric,
  load_kg numeric,
  duration_s integer,
  distance_m numeric,
  rpe numeric,
  rir numeric,
  rest_s integer,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_exercise_id, set_index)
);

create table if not exists public.performed_metrics (
  id uuid primary key default gen_random_uuid(),
  item_exercise_id uuid not null references public.item_exercises(id) on delete cascade,
  metric_name text not null,
  metric_value numeric,
  metric_unit text,
  confidence text,
  created_at timestamptz not null default now(),
  unique (item_exercise_id, metric_name)
);

create table if not exists public.source_links (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  source_type text not null,
  source_id text,
  source_payload jsonb not null default '{}'::jsonb,
  confidence text,
  created_at timestamptz not null default now()
);

create table if not exists public.equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  canonical_slug text not null unique,
  display_name_es text not null,
  display_name_en text,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_environments (
  id uuid primary key default gen_random_uuid(),
  canonical_slug text not null unique,
  display_name_es text not null,
  display_name_en text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.environment_equipment (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.training_environments(id) on delete cascade,
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  availability text not null default 'available',
  created_at timestamptz not null default now(),
  unique (environment_id, equipment_id)
);

create table if not exists public.user_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  environment_id uuid references public.training_environments(id) on delete set null,
  availability text not null default 'available',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, equipment_id, environment_id)
);

create index if not exists block_items_block_id_order_idx on public.block_items(block_id, order_index);
create index if not exists item_exercises_block_item_id_order_idx on public.item_exercises(block_item_id, order_index);
create index if not exists performed_sets_item_exercise_id_idx on public.performed_sets(item_exercise_id, set_index);
create index if not exists performed_metrics_item_exercise_id_idx on public.performed_metrics(item_exercise_id);
create index if not exists source_links_session_id_idx on public.source_links(session_id);
create index if not exists exercise_catalog_aliases_gin_idx on public.exercise_catalog using gin (aliases);

alter table public.exercise_catalog enable row level security;
alter table public.exercise_measurement_schema enable row level security;
alter table public.block_items enable row level security;
alter table public.item_exercises enable row level security;
alter table public.performed_sets enable row level security;
alter table public.performed_metrics enable row level security;
alter table public.source_links enable row level security;
alter table public.equipment_catalog enable row level security;
alter table public.training_environments enable row level security;
alter table public.environment_equipment enable row level security;
alter table public.user_equipment enable row level security;

grant select on public.exercise_catalog, public.exercise_measurement_schema, public.equipment_catalog, public.training_environments, public.environment_equipment to anon, authenticated;
grant select, insert, update, delete on public.block_items, public.item_exercises, public.performed_sets, public.performed_metrics, public.source_links, public.user_equipment to authenticated;

do $$
begin
  create policy "exercise catalog readable" on public.exercise_catalog for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "measurement schemas readable" on public.exercise_measurement_schema for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "equipment catalog readable" on public.equipment_catalog for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "training environments readable" on public.training_environments for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "environment equipment readable" on public.environment_equipment for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "own block items" on public.block_items
  for all to authenticated
  using (
    exists (
      select 1
      from public.session_blocks b
      join public.training_sessions s on s.id = b.session_id
      where b.id = block_items.block_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.session_blocks b
      join public.training_sessions s on s.id = b.session_id
      where b.id = block_items.block_id
        and s.user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "own item exercises" on public.item_exercises
  for all to authenticated
  using (
    exists (
      select 1
      from public.block_items bi
      join public.session_blocks b on b.id = bi.block_id
      join public.training_sessions s on s.id = b.session_id
      where bi.id = item_exercises.block_item_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.block_items bi
      join public.session_blocks b on b.id = bi.block_id
      join public.training_sessions s on s.id = b.session_id
      where bi.id = item_exercises.block_item_id
        and s.user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "own performed sets" on public.performed_sets
  for all to authenticated
  using (
    exists (
      select 1
      from public.item_exercises ie
      join public.block_items bi on bi.id = ie.block_item_id
      join public.session_blocks b on b.id = bi.block_id
      join public.training_sessions s on s.id = b.session_id
      where ie.id = performed_sets.item_exercise_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.item_exercises ie
      join public.block_items bi on bi.id = ie.block_item_id
      join public.session_blocks b on b.id = bi.block_id
      join public.training_sessions s on s.id = b.session_id
      where ie.id = performed_sets.item_exercise_id
        and s.user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "own performed metrics" on public.performed_metrics
  for all to authenticated
  using (
    exists (
      select 1
      from public.item_exercises ie
      join public.block_items bi on bi.id = ie.block_item_id
      join public.session_blocks b on b.id = bi.block_id
      join public.training_sessions s on s.id = b.session_id
      where ie.id = performed_metrics.item_exercise_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.item_exercises ie
      join public.block_items bi on bi.id = ie.block_item_id
      join public.session_blocks b on b.id = bi.block_id
      join public.training_sessions s on s.id = b.session_id
      where ie.id = performed_metrics.item_exercise_id
        and s.user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "own source links" on public.source_links
  for all to authenticated
  using (
    exists (
      select 1 from public.training_sessions s
      where s.id = source_links.session_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.training_sessions s
      where s.id = source_links.session_id
        and s.user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "own user equipment" on public.user_equipment
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

insert into public.training_environments (canonical_slug, display_name_es, display_name_en)
values
  ('home', 'Casa', 'Home'),
  ('gym', 'Gimnasio', 'Gym'),
  ('box', 'Box', 'Box'),
  ('pool', 'Piscina', 'Pool'),
  ('outdoor', 'Exterior', 'Outdoor'),
  ('track', 'Pista', 'Track'),
  ('studio', 'Estudio', 'Studio'),
  ('hotel', 'Hotel', 'Hotel'),
  ('facility', 'Instalación', 'Facility'),
  ('mixed', 'Mixto', 'Mixed')
on conflict (canonical_slug) do nothing;

insert into public.equipment_catalog (canonical_slug, display_name_es, display_name_en, category)
values
  ('barbell', 'Barra', 'Barbell', 'strength'),
  ('rack', 'Rack', 'Rack', 'strength'),
  ('dumbbell', 'Mancuerna', 'Dumbbell', 'strength'),
  ('band', 'Banda', 'Band', 'accessory'),
  ('cable', 'Polea', 'Cable', 'strength'),
  ('rower', 'Remo ergometro', 'Rower', 'cardio'),
  ('wall_ball', 'Wall ball', 'Wall ball', 'functional'),
  ('rings', 'Anillas', 'Rings', 'gymnastics'),
  ('pool', 'Piscina', 'Pool', 'swimming'),
  ('bike', 'Bicicleta', 'Bike', 'cycling')
on conflict (canonical_slug) do nothing;

insert into public.exercise_catalog (
  canonical_slug,
  display_name_es,
  display_name_en,
  aliases,
  category,
  movement_pattern,
  primary_muscles,
  secondary_muscles,
  equipment_required,
  equipment_optional,
  allowed_measurements,
  default_measurement,
  difficulty_level,
  skill_level,
  risk_tags,
  contraindications,
  progressions,
  regressions,
  substitutions,
  external_mappings
)
values
  ('pallof_press', 'Press Pallof', 'Pallof Press', array['press palof','pres palof','pallof','anti-rotacion con goma','press antirotacion','press anti-rotacion'], 'core', 'anti_rotation', array['core','obliques'], array['glutes'], array['band'], array['cable'], array['reps_per_side','duration','sets_reps_load'], 'reps_per_side', 'basic', 'low', array['lumbar_safe','core_control'], '{}', array['half_kneeling_pallof_press'], array['short_lever_pallof_press'], array['dead_bug','side_plank'], '{}'::jsonb),
  ('front_squat', 'Sentadilla frontal', 'Front Squat', array['front squat','sentadilla frontal','squat frontal'], 'strength', 'squat', array['quadriceps','glutes'], array['core','upper_back'], array['barbell'], array['rack'], array['sets_reps_load','reps_only'], 'sets_reps_load', 'intermediate', 'medium', array['spine_loaded','mobility_demand'], '{}', array['pause_front_squat'], array['goblet_squat'], array['back_squat','goblet_squat'], '{}'::jsonb),
  ('romanian_deadlift', 'Peso muerto rumano', 'Romanian Deadlift', array['rdl','romanian deadlift','peso muerto rumano','pm rumano'], 'strength', 'hinge', array['hamstrings','glutes'], array['erectors','upper_back'], array['barbell'], array['dumbbells'], array['sets_reps_load'], 'sets_reps_load', 'intermediate', 'medium', array['hinge_pattern','spine_loaded'], '{}', array['deficit_romanian_deadlift'], array['dumbbell_romanian_deadlift'], array['hip_thrust','good_morning'], '{}'::jsonb),
  ('single_arm_row', 'Remo unilateral', 'Single-arm Row', array['remo unilateral','remo a una mano','single arm row','one arm row'], 'strength', 'horizontal_pull', array['lats','mid_back'], array['biceps','rear_delts'], array['dumbbell'], array['bench','cable','band'], array['sets_reps_load','reps_per_side'], 'sets_reps_load', 'basic', 'low', array['unilateral'], '{}', array['three_point_row'], array['band_row'], array['seated_row','ring_row'], '{}'::jsonb),
  ('rowing_ergometer', 'Remo ergometro', 'Row Ergometer', array['remo ergometro','remoergometro','row','rower','rowing machine','remo'], 'cardio', 'cyclical_pull', array['cardiorespiratory'], array['legs','back'], array['rower'], '{}', array['cardio_duration_distance','calories','power'], 'cardio_duration_distance', 'basic', 'low', array['cyclical'], '{}', array['interval_row'], array['easy_row'], array['bike_ergometer','ski_ergometer'], '{}'::jsonb),
  ('diaphragmatic_breathing', 'Respiración diafragmática', 'Diaphragmatic Breathing', array['respiración diafragmática','diafragmática','breathing','respiración 90/90'], 'breathing', 'breathing', array['diaphragm'], array['parasympathetic'], '{}', '{}', array['breathing','duration'], 'breathing', 'basic', 'low', array['recovery'], '{}', array['paced_breathing'], '{}', array['box_breathing'], '{}'::jsonb)
on conflict (canonical_slug) do update set
  aliases = excluded.aliases,
  allowed_measurements = excluded.allowed_measurements,
  updated_at = now();

insert into public.exercise_measurement_schema (exercise_id, measurement_type, required_fields, optional_fields, default_fields)
values
  ('pallof_press', 'reps_per_side', array['reps_per_side'], array['sets','duration_s','rpe','notes'], array['sets','reps_per_side']),
  ('front_squat', 'sets_reps_load', array['sets','reps','load_kg'], array['rpe','rir','rest_s','notes'], array['sets','reps','load_kg']),
  ('romanian_deadlift', 'sets_reps_load', array['sets','reps','load_kg'], array['rpe','rir','rest_s','notes'], array['sets','reps','load_kg']),
  ('single_arm_row', 'sets_reps_load', array['sets','reps','load_kg'], array['reps_per_side','rpe','rir','rest_s','notes'], array['sets','reps','load_kg']),
  ('rowing_ergometer', 'cardio_duration_distance', array['duration_s','distance_m'], array['calories','power_w','pace_s_per_500m','rpe','notes'], array['duration_s','distance_m']),
  ('diaphragmatic_breathing', 'breathing', array['duration_s'], array['breath_rate','notes'], array['duration_s'])
on conflict (exercise_id, measurement_type) do update set
  required_fields = excluded.required_fields,
  optional_fields = excluded.optional_fields,
  default_fields = excluded.default_fields,
  updated_at = now();
