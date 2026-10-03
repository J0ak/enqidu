-- Coach Actions V1: persist an explicit date-level training unavailability.
-- Authenticated clients can read their own overrides, but only the narrow
-- service-role RPC can write them.

create table if not exists public.training_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_date date not null,
  availability_status text not null default 'unavailable'
    check (availability_status in ('unavailable')),
  source text not null default 'coach_explicit',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, calendar_date)
);

alter table public.training_availability_overrides enable row level security;

revoke insert, update, delete on table public.training_availability_overrides
  from public, anon, authenticated;
grant select on table public.training_availability_overrides to authenticated;
grant select, insert, update, delete on table public.training_availability_overrides to service_role;

drop policy if exists training_availability_overrides_owner_select
  on public.training_availability_overrides;
create policy training_availability_overrides_owner_select
  on public.training_availability_overrides
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.set_coach_training_unavailability(
  p_user_id uuid,
  p_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_date is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || '|availability|' || p_date::text, 0)
  );

  insert into public.training_availability_overrides (
    user_id,
    calendar_date,
    availability_status,
    source,
    updated_at
  )
  values (
    p_user_id,
    p_date,
    'unavailable',
    'coach_explicit',
    now()
  )
  on conflict (user_id, calendar_date)
  do update set
    availability_status = excluded.availability_status,
    source = excluded.source,
    updated_at = now()
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'availability_id', v_id,
    'date', p_date,
    'availability_status', 'unavailable'
  );
end;
$$;

revoke execute on function public.set_coach_training_unavailability(uuid, date)
  from public, anon, authenticated;
grant execute on function public.set_coach_training_unavailability(uuid, date)
  to service_role;
