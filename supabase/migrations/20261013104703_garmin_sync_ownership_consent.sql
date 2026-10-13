-- Existing connection table inspected in production 2026-10-13. No credentials here.
-- Historical connection fields were user-writable: none constitutes a verified binding.
begin;
alter table public.user_wearable_connections
  add column consent_status text not null default 'not_configured'
    check (consent_status in ('not_configured','pending_consent','active','revoked','error')),
  add column consent_version text,
  add column consent_updated_at timestamptz,
  add column binding_verified_at timestamptz,
  add column binding_revision bigint not null default 0,
  add column next_sync_at timestamptz not null default now();

alter table public.user_wearable_connections enable row level security;
revoke all on public.user_wearable_connections from public, anon, authenticated;
grant select on public.user_wearable_connections to authenticated;
grant all on public.user_wearable_connections to service_role;
drop policy if exists user_wearable_connections_own on public.user_wearable_connections;
create policy user_wearable_connections_read_own on public.user_wearable_connections
  for select to authenticated using ((select auth.uid()) = user_id);

-- The only additional table is an append-only consent/binding audit, not another connection store.
create table public.garmin_sync_consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('enable','disable','revoke','reconnect','binding_changed')),
  consent_status text not null,
  consent_version text,
  binding_revision bigint not null,
  occurred_at timestamptz not null default clock_timestamp()
);
alter table public.garmin_sync_consent_events enable row level security;
revoke all on public.garmin_sync_consent_events from public, anon, authenticated, service_role;
grant select on public.garmin_sync_consent_events to authenticated, service_role;
create policy garmin_sync_events_read_own on public.garmin_sync_consent_events
  for select to authenticated using ((select auth.uid()) = user_id);
create index garmin_sync_events_owner_idx on public.garmin_sync_consent_events(user_id, occurred_at desc);
create index garmin_sync_due_idx on public.user_wearable_connections(next_sync_at, user_id)
  where provider = 'garmin' and consent_status = 'active' and connection_status = 'connected'
    and binding_verified_at is not null and revoked_at is null;

create schema if not exists enqidu_private;
revoke all on schema enqidu_private from public, anon, authenticated;
-- Changes to server-owned connection identity invalidate previously acquired sources.
create function enqidu_private.guard_garmin_binding() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.provider = 'garmin' and row(new.user_id,new.provider,new.external_user_reference,new.connection_status,new.binding_verified_at,new.revoked_at)
    is distinct from row(old.user_id,old.provider,old.external_user_reference,old.connection_status,old.binding_verified_at,old.revoked_at) then
    if new.user_id <> old.user_id or new.provider <> old.provider then
      raise exception using message='binding_identity_immutable',errcode='42501';
    end if;
    new.binding_revision := old.binding_revision + 1;
    insert into public.garmin_sync_consent_events(user_id,action,consent_status,consent_version,binding_revision)
      values(new.user_id,'binding_changed',new.consent_status,new.consent_version,new.binding_revision);
  end if;
  return new;
end $$;
revoke all on function enqidu_private.guard_garmin_binding() from public, anon, authenticated;
create trigger guard_garmin_binding before update on public.user_wearable_connections
  for each row execute function enqidu_private.guard_garmin_binding();

-- Narrow user mutation: identity is always auth.uid(), provider is fixed, no connection credentials accepted.
create function public.set_garmin_sync_consent(p_action text, p_consent_version text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_row public.user_wearable_connections;
begin
  if v_user is null then raise exception using message='auth_required',errcode='42501'; end if;
  if p_action is null or p_action not in ('enable','disable','revoke','reconnect') then
    raise exception using message='invalid_consent_action',errcode='22023'; end if;
  if p_action = 'enable' and p_consent_version is distinct from 'garmin_daily_v1' then
    raise exception using message='consent_version_required',errcode='22023'; end if;
  insert into public.user_wearable_connections(user_id,provider,connection_status,sync_mode)
    values(v_user,'garmin','pending','provider_managed') on conflict(user_id,provider) do nothing;
  select * into v_row from public.user_wearable_connections where user_id=v_user and provider='garmin' for update;
  -- Revocation requires a fresh reconnect step; enabling alone cannot resurrect its binding.
  if p_action='enable' and v_row.consent_status='revoked' then
    raise exception using message='reconnect_required',errcode='42501'; end if;
  update public.user_wearable_connections set
    consent_status=case p_action when 'enable' then 'active' when 'revoke' then 'revoked' else 'pending_consent' end,
    consent_version=case when p_action='enable' then p_consent_version else consent_version end,
    consent_updated_at=clock_timestamp(), binding_revision=binding_revision+1,
    connection_status=case p_action when 'revoke' then 'revoked' when 'reconnect' then 'pending' else connection_status end,
    binding_verified_at=case when p_action in ('revoke','reconnect') then null else binding_verified_at end,
    external_user_reference=case when p_action in ('revoke','reconnect') then null else external_user_reference end,
    revoked_at=case when p_action='revoke' then clock_timestamp() when p_action='reconnect' then null else revoked_at end,
    next_sync_at=clock_timestamp(), updated_at=clock_timestamp()
    where user_id=v_user and provider='garmin' returning * into v_row;
  insert into public.garmin_sync_consent_events(user_id,action,consent_status,consent_version,binding_revision)
    values(v_user,p_action,v_row.consent_status,v_row.consent_version,v_row.binding_revision);
  return jsonb_build_object('consent_status',v_row.consent_status,'connection_status',v_row.connection_status,
    'sync_enabled',v_row.consent_status='active','runtime_available',false,'scheduler_status','blocked_runtime');
end $$;
revoke all on function public.set_garmin_sync_consent(text,text) from public, anon, authenticated;
grant execute on function public.set_garmin_sync_consent(text,text) to authenticated;

-- Atomic consent check around the EXISTING Foundation writer, not a second ingestion pipeline.
-- Row lock serializes each record commit with revoke/disable/disconnect.
create function public.ingest_owned_garmin_health_record(p_user_id uuid,p_binding_revision bigint,p_record jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_row public.user_wearable_connections;
begin
  select * into v_row from public.user_wearable_connections where user_id=p_user_id and provider='garmin' for update;
  if not found or v_row.consent_status <> 'active' or v_row.consent_version is distinct from 'garmin_daily_v1'
    or v_row.connection_status <> 'connected' or v_row.binding_verified_at is null or v_row.revoked_at is not null
    or v_row.binding_revision is distinct from p_binding_revision then
    raise exception using message='sync_authorization_changed',errcode='P0001'; end if;
  if p_record#>>'{provenance,provider}' is distinct from 'garmin' or p_record#>>'{provenance,provider_mode}' is distinct from 'aggregator'
    or p_record#>>'{provenance,ingestion_channel}' is distinct from 'fitness_ai_connector' then
    raise exception using message='provenance_rejected',errcode='22023'; end if;
  return public.ingest_garmin_health_record(p_user_id,p_record);
end $$;
revoke all on function public.ingest_owned_garmin_health_record(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_owned_garmin_health_record(uuid,bigint,jsonb) to service_role;

-- One bounded claim, indexed by due time. No external user list/cursor. Concurrent runs cannot claim the same row.
create function public.claim_garmin_sync_batch() returns table(user_id uuid)
language sql security invoker set search_path = '' as $$
  with due as (
    select c.id from public.user_wearable_connections c
    where c.provider='garmin' and c.consent_status='active' and c.connection_status='connected'
      and c.binding_verified_at is not null and c.revoked_at is null
      and c.consent_version='garmin_daily_v1' and c.next_sync_at <= now()
    order by c.next_sync_at,c.user_id limit 5 for update skip locked
  )
  update public.user_wearable_connections c set next_sync_at=now()+interval '1 day'
    from due where c.id=due.id returning c.user_id;
$$;
revoke all on function public.claim_garmin_sync_batch() from public,anon,authenticated;
grant execute on function public.claim_garmin_sync_batch() to service_role;
commit;
