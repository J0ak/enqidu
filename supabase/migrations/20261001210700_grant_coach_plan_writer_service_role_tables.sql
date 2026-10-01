-- Coach Actions V1 hotfix.
-- The writer is SECURITY INVOKER and runs as service_role, so service_role needs
-- only the table privileges required by this narrow path. Browser roles remain read-only.

grant select, insert on table public.planned_training_sessions to service_role;
grant insert on table public.planned_session_blocks to service_role;
