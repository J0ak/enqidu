-- get_ai_coach_context is SECURITY INVOKER, so authenticated callers need
-- table privileges before the existing owner-scoped RLS policies can apply.
grant select on table public.user_goals to authenticated;
grant select on table public.user_equipment to authenticated;
grant select on table public.equipment_catalog to authenticated;
