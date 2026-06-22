-- ENQIDU Semana Viva: planned sessions, planned blocks, and plan-vs-actual snapshots.
-- Additive only: Garmin/FIT ingestion and existing completed sessions remain untouched.

create table if not exists public.planned_training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  planned_date date not null,
  planned_time time null,
  title text not null,
  session_type text not null,
  location_type text null,
  status text not null default 'planned',
  priority text null,
  planned_intensity text null,
  planned_duration_min integer null,
  planned_duration_max integer null,
  objective text null,
  coach_notes text null,
  constraints jsonb not null default '[]'::jsonb,
  adaptation_reason text null,
  readiness_snapshot jsonb null,
  recurrence_rule text null,
  source text not null default 'coach_plan',
  linked_completed_session_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_training_sessions_status_check check (
    status in ('planned', 'confirmed', 'modified', 'completed', 'enriched', 'skipped', 'rescheduled')
  ),
  constraint planned_training_sessions_duration_check check (
    planned_duration_min is null
    or planned_duration_max is null
    or planned_duration_min <= planned_duration_max
  )
);

create table if not exists public.planned_session_blocks (
  id uuid primary key default gen_random_uuid(),
  planned_session_id uuid not null references public.planned_training_sessions(id) on delete cascade,
  block_order integer not null,
  block_type text null,
  title text not null,
  objective text null,
  planned_duration_seconds integer null,
  planned_rounds integer null,
  planned_exercises jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  notes text null,
  created_at timestamptz not null default now(),
  unique (planned_session_id, block_order)
);

create table if not exists public.session_plan_comparisons (
  id uuid primary key default gen_random_uuid(),
  planned_session_id uuid not null references public.planned_training_sessions(id) on delete cascade,
  completed_session_id uuid not null,
  comparison_status text not null default 'draft',
  duration_result text null,
  intensity_result text null,
  strength_result text null,
  lumbar_result text null,
  impact_result text null,
  summary text null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists planned_training_sessions_user_date_title_idx
on public.planned_training_sessions(user_id, planned_date, title);

create index if not exists planned_training_sessions_user_date_idx
on public.planned_training_sessions(user_id, planned_date);

create index if not exists planned_training_sessions_date_time_idx
on public.planned_training_sessions(planned_date, planned_time);

create index if not exists planned_training_sessions_linked_completed_idx
on public.planned_training_sessions(linked_completed_session_id);

create index if not exists planned_session_blocks_session_order_idx
on public.planned_session_blocks(planned_session_id, block_order);

create index if not exists session_plan_comparisons_plan_idx
on public.session_plan_comparisons(planned_session_id);

create index if not exists session_plan_comparisons_completed_idx
on public.session_plan_comparisons(completed_session_id);

create or replace function public.set_live_week_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists planned_training_sessions_updated_at on public.planned_training_sessions;
create trigger planned_training_sessions_updated_at
before update on public.planned_training_sessions
for each row execute function public.set_live_week_updated_at();

drop trigger if exists session_plan_comparisons_updated_at on public.session_plan_comparisons;
create trigger session_plan_comparisons_updated_at
before update on public.session_plan_comparisons
for each row execute function public.set_live_week_updated_at();

alter table public.planned_training_sessions enable row level security;
alter table public.planned_session_blocks enable row level security;
alter table public.session_plan_comparisons enable row level security;

grant select, insert, update, delete on public.planned_training_sessions to authenticated;
grant select, insert, update, delete on public.planned_session_blocks to authenticated;
grant select, insert, update, delete on public.session_plan_comparisons to authenticated;

drop policy if exists "Users can read their own planned sessions" on public.planned_training_sessions;
create policy "Users can read their own planned sessions"
on public.planned_training_sessions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert their own planned sessions" on public.planned_training_sessions;
create policy "Users can insert their own planned sessions"
on public.planned_training_sessions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update their own planned sessions" on public.planned_training_sessions;
create policy "Users can update their own planned sessions"
on public.planned_training_sessions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their own planned sessions" on public.planned_training_sessions;
create policy "Users can delete their own planned sessions"
on public.planned_training_sessions
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read their own planned blocks" on public.planned_session_blocks;
create policy "Users can read their own planned blocks"
on public.planned_session_blocks
for select
to authenticated
using (
  exists (
    select 1
    from public.planned_training_sessions pts
    where pts.id = planned_session_blocks.planned_session_id
      and pts.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their own planned blocks" on public.planned_session_blocks;
create policy "Users can insert their own planned blocks"
on public.planned_session_blocks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.planned_training_sessions pts
    where pts.id = planned_session_blocks.planned_session_id
      and pts.user_id = auth.uid()
  )
);

drop policy if exists "Users can update their own planned blocks" on public.planned_session_blocks;
create policy "Users can update their own planned blocks"
on public.planned_session_blocks
for update
to authenticated
using (
  exists (
    select 1
    from public.planned_training_sessions pts
    where pts.id = planned_session_blocks.planned_session_id
      and pts.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.planned_training_sessions pts
    where pts.id = planned_session_blocks.planned_session_id
      and pts.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their own planned blocks" on public.planned_session_blocks;
create policy "Users can delete their own planned blocks"
on public.planned_session_blocks
for delete
to authenticated
using (
  exists (
    select 1
    from public.planned_training_sessions pts
    where pts.id = planned_session_blocks.planned_session_id
      and pts.user_id = auth.uid()
  )
);

drop policy if exists "Users can read their own plan comparisons" on public.session_plan_comparisons;
create policy "Users can read their own plan comparisons"
on public.session_plan_comparisons
for select
to authenticated
using (
  exists (
    select 1
    from public.planned_training_sessions pts
    where pts.id = session_plan_comparisons.planned_session_id
      and pts.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their own plan comparisons" on public.session_plan_comparisons;
create policy "Users can insert their own plan comparisons"
on public.session_plan_comparisons
for insert
to authenticated
with check (
  exists (
    select 1
    from public.planned_training_sessions pts
    where pts.id = session_plan_comparisons.planned_session_id
      and pts.user_id = auth.uid()
  )
);

drop policy if exists "Users can update their own plan comparisons" on public.session_plan_comparisons;
create policy "Users can update their own plan comparisons"
on public.session_plan_comparisons
for update
to authenticated
using (
  exists (
    select 1
    from public.planned_training_sessions pts
    where pts.id = session_plan_comparisons.planned_session_id
      and pts.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.planned_training_sessions pts
    where pts.id = session_plan_comparisons.planned_session_id
      and pts.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their own plan comparisons" on public.session_plan_comparisons;
create policy "Users can delete their own plan comparisons"
on public.session_plan_comparisons
for delete
to authenticated
using (
  exists (
    select 1
    from public.planned_training_sessions pts
    where pts.id = session_plan_comparisons.planned_session_id
      and pts.user_id = auth.uid()
  )
);

with pilot as (
  select pilot_user_id as user_id
  from public.chatgpt_pilot_config
  where enabled is true
  limit 1
), seed_sessions as (
  select *
  from (
    values
      ('2026-06-22'::date, '07:00'::time, 'Hibrido fuera de casa', 'hybrid', 'enriched', null, 'RPE 7', 45, 60, 'Volver a intensidad controlada sin maximos, con fuerza funcional, cardio y core.', 'Sesion vinculada a Garmin HIIT y enriquecida con Coach.', '["evitar bisagra pesada", "evitar maximos", "controlar saltos", "proteger lumbar"]'::jsonb, null, '26a5b01a-7bb3-4500-bac6-948185922ae2'::uuid),
      ('2026-06-23'::date, null::time, 'Recuperacion activa', 'recovery', 'planned', 'recomendado', 'Muy suave', 30, 40, 'Descargar tras HIIT del lunes.', null, '["no fuerza pesada", "no impacto"]'::jsonb, 'Descargar tras HIIT del lunes', null::uuid),
      ('2026-06-24'::date, '07:00'::time, 'Hibrido fuera de casa', 'hybrid', 'planned', null, 'RPE 7-8', 45, 60, 'Sesion hibrida RPE 7-8 sin repetir estres lumbar del lunes.', 'Revisar sueno, lumbar y carga al levantarse.', '["evitar peso muerto pesado", "evitar maximos", "controlar saltos", "lumbar neutro"]'::jsonb, null, null::uuid),
      ('2026-06-25'::date, '18:00'::time, 'Yoga', 'yoga', 'confirmed', null, null, null, null, 'Movilidad, descarga lumbar, cadera y respiracion.', null, '["mantener intensidad baja"]'::jsonb, null, null::uuid),
      ('2026-06-26'::date, null::time, 'Fuerza tecnica en casa', 'strength', 'modified', 'adaptable', 'RPE 6-7', 40, 55, 'Meter fuerza sin romper recuperacion.', 'Solo si lumbar 0-1/10 y sueno aceptable.', '["no peso muerto pesado", "no maximos"]'::jsonb, 'Adaptable segun lumbar y sueno', null::uuid),
      ('2026-06-27'::date, null::time, 'Funcional', 'functional', 'planned', 'probable', 'RPE 6-8', null, null, 'Sesion funcional si hay disponibilidad.', 'Si miercoles fue duro: RPE 6-7. Si lumbar >2/10: movilidad/core/cardio sin impacto.', '["adaptar impacto", "proteger lumbar"]'::jsonb, null, null::uuid),
      ('2026-06-28'::date, null::time, 'Descanso', 'recovery', 'planned', 'recomendado', null, null, null, 'Absorber carga de la semana.', null, '["no intensidad"]'::jsonb, null, null::uuid)
  ) as s(planned_date, planned_time, title, session_type, status, priority, planned_intensity, planned_duration_min, planned_duration_max, objective, coach_notes, constraints, adaptation_reason, linked_completed_session_id)
), upserted as (
  insert into public.planned_training_sessions (
    user_id,
    planned_date,
    planned_time,
    title,
    session_type,
    status,
    priority,
    planned_intensity,
    planned_duration_min,
    planned_duration_max,
    objective,
    coach_notes,
    constraints,
    adaptation_reason,
    linked_completed_session_id,
    source
  )
  select
    p.user_id,
    s.planned_date,
    s.planned_time,
    s.title,
    s.session_type,
    s.status,
    s.priority,
    s.planned_intensity,
    s.planned_duration_min,
    s.planned_duration_max,
    s.objective,
    s.coach_notes,
    s.constraints,
    s.adaptation_reason,
    s.linked_completed_session_id,
    'coach_plan'
  from seed_sessions s
  cross join pilot p
  on conflict (user_id, planned_date, title) do update
  set planned_time = excluded.planned_time,
      session_type = excluded.session_type,
      status = excluded.status,
      priority = excluded.priority,
      planned_intensity = excluded.planned_intensity,
      planned_duration_min = excluded.planned_duration_min,
      planned_duration_max = excluded.planned_duration_max,
      objective = excluded.objective,
      coach_notes = excluded.coach_notes,
      constraints = excluded.constraints,
      adaptation_reason = excluded.adaptation_reason,
      linked_completed_session_id = excluded.linked_completed_session_id,
      updated_at = now()
  returning id, planned_date, title
), block_seed as (
  select u.id as planned_session_id, b.block_order, b.title, b.objective
  from upserted u
  join lateral (
    values
      (1, case
        when u.planned_date = '2026-06-22' then 'Movilidad + activacion'
        when u.planned_date = '2026-06-23' then 'Movilidad cadera/lumbar'
        when u.planned_date = '2026-06-24' then 'Movilidad + activacion'
        when u.planned_date = '2026-06-25' then 'Movilidad + respiracion'
        when u.planned_date = '2026-06-26' then 'Calentamiento lumbar seguro'
        when u.planned_date = '2026-06-27' then 'Funcional adaptable'
        else 'Descanso'
      end, case
        when u.planned_date = '2026-06-23' then 'Restaurar rango sin fatiga'
        when u.planned_date = '2026-06-27' then 'Densidad segun carga del miercoles y sueno'
        else 'Preparar la sesion'
      end),
      (2, case
        when u.planned_date = '2026-06-22' then 'Fuerza tecnica'
        when u.planned_date = '2026-06-23' then 'Paseo o Z2 muy suave'
        when u.planned_date = '2026-06-24' then 'Empuje/traccion'
        when u.planned_date = '2026-06-26' then 'Front squat tecnico'
        else null
      end, case
        when u.planned_date = '2026-06-23' then '30-40 min nasal y facil'
        when u.planned_date = '2026-06-26' then '4-5x5 RPE 6-7'
        else 'Fuerza limpia y controlada'
      end),
      (3, case
        when u.planned_date = '2026-06-22' then 'Circuito hibrido'
        when u.planned_date = '2026-06-24' then 'Pierna unilateral controlada'
        when u.planned_date = '2026-06-26' then 'Landmine press'
        else null
      end, 'Trabajo principal'),
      (4, case
        when u.planned_date = '2026-06-22' then 'Core anti-lumbar'
        when u.planned_date = '2026-06-24' then 'Cardio remo/assault'
        when u.planned_date = '2026-06-26' then 'Ring row/dominadas'
        else null
      end, 'Control bajo fatiga'),
      (5, case
        when u.planned_date = '2026-06-22' then 'Vuelta a la calma'
        when u.planned_date = '2026-06-24' then 'Core antirotacion'
        when u.planned_date = '2026-06-26' then 'Split squat o step-up'
        else null
      end, 'Cerrar sin deuda de recuperacion'),
      (6, case
        when u.planned_date = '2026-06-26' then 'Pallof + side plank'
        else null
      end, 'Core antirotacion')
  ) as b(block_order, title, objective) on b.title is not null
)
insert into public.planned_session_blocks (
  planned_session_id,
  block_order,
  title,
  objective
)
select planned_session_id, block_order, title, objective
from block_seed
on conflict (planned_session_id, block_order) do update
set title = excluded.title,
    objective = excluded.objective;
