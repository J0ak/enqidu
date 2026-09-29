-- SEC-01: privileged RPCs not used by the authenticated ENQIDU runtime.
-- Keep service-role/owner access for legacy/admin workflows and internal SECURITY DEFINER calls.

revoke execute on function public.apply_manual_block_temporal_windows(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_apply_capture(jsonb) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_apply_planned_session(jsonb) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_apply_week_plan(jsonb) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_find_session(date, text) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_get_safe_context(date, uuid, text) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_get_session_detail(uuid) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_preview_capture(jsonb) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_preview_planned_session(jsonb) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_preview_week_plan(jsonb) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_record_cost_estimate(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_status() from public, anon, authenticated;
revoke execute on function public.compute_manual_block_metrics_from_samples(uuid) from public, anon, authenticated;

grant execute on function public.apply_manual_block_temporal_windows(uuid, jsonb) to service_role;
grant execute on function public.chatgpt_pilot_apply_capture(jsonb) to service_role;
grant execute on function public.chatgpt_pilot_apply_planned_session(jsonb) to service_role;
grant execute on function public.chatgpt_pilot_apply_week_plan(jsonb) to service_role;
grant execute on function public.chatgpt_pilot_find_session(date, text) to service_role;
grant execute on function public.chatgpt_pilot_get_safe_context(date, uuid, text) to service_role;
grant execute on function public.chatgpt_pilot_get_session_detail(uuid) to service_role;
grant execute on function public.chatgpt_pilot_preview_capture(jsonb) to service_role;
grant execute on function public.chatgpt_pilot_preview_planned_session(jsonb) to service_role;
grant execute on function public.chatgpt_pilot_preview_week_plan(jsonb) to service_role;
grant execute on function public.chatgpt_pilot_record_cost_estimate(uuid, uuid, jsonb) to service_role;
grant execute on function public.chatgpt_pilot_status() to service_role;
grant execute on function public.compute_manual_block_metrics_from_samples(uuid) to service_role;
