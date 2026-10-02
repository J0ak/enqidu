-- Canonical user calendar timezone.
-- Keep database timestamps in UTC; this field only defines the athlete's civil calendar
-- for relative concepts such as today/yesterday/current week.

alter table public.profiles
  add column if not exists timezone text;

comment on column public.profiles.timezone is
  'IANA timezone used for the athlete civil calendar (for example Europe/Madrid).';

update public.profiles
set timezone = 'Europe/Madrid'
where timezone is null;

alter table public.profiles
  drop constraint if exists profiles_timezone_nonempty;

alter table public.profiles
  add constraint profiles_timezone_nonempty
  check (timezone is null or btrim(timezone) <> '');
