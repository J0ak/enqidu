-- Canonical read-only Coach context RPCs required by the local stack.
create or replace function public.ai_context_assert_user(p_user_id uuid) returns void
language plpgsql stable set search_path = public, auth as $$
begin
  if p_user_id is null or (coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' and auth.uid() is distinct from p_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create or replace function public.get_ai_training_period_summary(p_user_id uuid, p_from_date date, p_to_date date, p_limit integer default 30)
returns jsonb language plpgsql stable set search_path = public, auth as $$
declare result jsonb;
begin
  perform public.ai_context_assert_user(p_user_id);
  with items as (
    select id, local_date, title, duration_seconds,
      case when lower(coalesce(sport, activity_type, '')) like '%run%' then 'Carrera' else 'Fuerza' end as label
    from public.training_sessions where user_id = p_user_id and local_date between p_from_date and p_to_date
      and coalesce(session_status, '') <> 'archived' order by local_date desc limit least(greatest(p_limit, 1), 30)
  ), types as (select label, count(*) n from items group by label)
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from_date, 'to', p_to_date),
    'summary', jsonb_build_object('sessions_count', count(*), 'active_days', count(distinct local_date),
      'total_duration_seconds', coalesce(sum(duration_seconds), 0),
      'activity_types', coalesce((select jsonb_object_agg(label,n) from types), '{}'::jsonb)),
    'sessions', coalesce(jsonb_agg(jsonb_build_object('session_id',id,'date',local_date,'title',title,
      'duration_seconds',duration_seconds,'garmin_type_label',label)) filter (where id is not null), '[]'::jsonb)
  ) into result from items;
  return result;
end $$;

create or replace function public.get_ai_coach_context(p_user_id uuid, p_date date default current_date, p_mode text default 'today_coach', p_from_date date default null, p_to_date date default null, p_session_id uuid default null)
returns jsonb language plpgsql stable set search_path = public, auth as $$
declare from_date date := coalesce(p_from_date, date_trunc('week', p_date)::date); to_date date := coalesce(p_to_date, date_trunc('week', p_date)::date + 6); athlete jsonb;
begin
  perform public.ai_context_assert_user(p_user_id);
  select jsonb_build_object(
    'athlete', jsonb_build_object('display_name', p.display_name, 'experience_level', p.experience_level, 'primary_goal', p.primary_goal),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) - 'id' - 'user_id') from public.user_goals g where g.user_id=p_user_id and coalesce(g.status,'active')='active'),'[]'::jsonb),
    'constraints', coalesce((select jsonb_agg(to_jsonb(l) - 'id' - 'user_id') from public.user_training_locations l where l.user_id=p_user_id and l.is_active),'[]'::jsonb),
    'equipment', coalesce((select jsonb_agg(jsonb_build_object('name',e.name,'category',e.equipment_category,'location',ue.location_label,'available',ue.available)) from public.user_equipment ue join public.equipment_catalog e on e.id=ue.equipment_id where ue.user_id=p_user_id and ue.available),'[]'::jsonb)
  ) into athlete from public.profiles p where p.id=p_user_id;
  return jsonb_build_object('context_version','ai_context_v1','request',jsonb_build_object('date',p_date,'from_date',from_date,'to_date',to_date),
    'athlete_context',coalesce(athlete,'{}'::jsonb),'training_period',public.get_ai_training_period_summary(p_user_id,from_date,to_date,30),
    'current_week',jsonb_build_object('week',jsonb_build_object('start',from_date,'end',to_date)),
    'health_recovery','{}'::jsonb,'selected_session',null,'data_quality',jsonb_build_object('missing','[]'::jsonb));
end $$;
grant execute on function public.get_ai_training_period_summary(uuid,date,date,integer) to authenticated, service_role;
grant execute on function public.get_ai_coach_context(uuid,date,text,date,date,uuid) to authenticated, service_role;
