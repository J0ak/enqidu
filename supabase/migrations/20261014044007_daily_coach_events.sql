-- Minimal append-only decision/action evidence. Not a plan or action authority.
-- No new RPC, SECURITY DEFINER, scheduler, provider or service is introduced.
create table public.daily_coach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_date date not null,
  timezone text not null,
  occurred_at timestamptz not null,
  event_key text not null check (event_key ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in ('decision','previewed','applied')),
  decision text check (decision in ('KEEP','REDUCE','RECOVERY_BIAS','REVIEW_REQUIRED')),
  reasons jsonb not null default '[]' check (jsonb_typeof(reasons) = 'array' and octet_length(reasons::text) <= 8192),
  proposal jsonb check (proposal is null or (jsonb_typeof(proposal) = 'object' and octet_length(proposal::text) <= 2048)),
  evidence jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 8192),
  proposal_key text check (proposal_key ~ '^[0-9a-f]{64}$'),
  fingerprint text check (fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  expires_at timestamptz,
  unique (user_id,event_key),
  check ((event_type = 'decision' and decision is not null) or
         (event_type in ('previewed','applied') and fingerprint is not null and expires_at is not null and proposal_key is not null))
);
create index daily_coach_events_owner_date_idx on public.daily_coach_events(user_id, calendar_date desc, occurred_at desc, id);
alter table public.daily_coach_events enable row level security;
revoke all on public.daily_coach_events from public, anon, authenticated, service_role;
grant select on public.daily_coach_events to authenticated;
grant select, insert on public.daily_coach_events to service_role;
create policy daily_coach_events_read_own on public.daily_coach_events
  for select to authenticated using ((select auth.uid()) = user_id);
comment on table public.daily_coach_events is 'Server-generated deterministic audit events; append-only grants; no plan authority. Missing events imply unknown lifecycle, never rejection.';
