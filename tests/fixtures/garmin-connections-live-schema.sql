-- Production connection schema inspected read-only 2026-10-13 (no user rows).
create table public.user_wearable_connections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null,
 connection_status text not null default 'pending' check(connection_status in ('pending','connected','revoked','error','disabled')),
 sync_mode text not null default 'provider_managed' check(sync_mode in ('provider_push','provider_ping_pull','provider_managed','manual_calibration')),
 external_user_reference text,
 granted_scopes text[] not null default '{}',
 connected_at timestamptz, revoked_at timestamptz, last_sync_at timestamptz,
 metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,provider)
);
alter table public.user_wearable_connections enable row level security;
create policy user_wearable_connections_own on public.user_wearable_connections for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant all on public.user_wearable_connections to authenticated,service_role;
grant truncate,references,trigger on public.user_wearable_connections to anon;
