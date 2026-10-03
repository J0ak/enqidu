-- RLS does not protect TRUNCATE. Remove all table-level privileges inherited
-- by browser roles, then restore only the intended authenticated read access.
revoke all privileges on table public.training_availability_overrides
  from public, anon, authenticated;

grant select on table public.training_availability_overrides
  to authenticated;

grant select, insert, update, delete on table public.training_availability_overrides
  to service_role;
