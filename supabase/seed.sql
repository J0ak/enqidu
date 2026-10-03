-- Local-only, disposable E2E identity. Credentials are public test constants.
-- UUID belongs exclusively to the local stack and is intentionally unrelated to production.
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','e2e00000-0000-4000-8000-000000000057','authenticated','authenticated','playwright@enqidu.local',crypt('LocalE2E-Only-57!',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now())
on conflict (id) do update set encrypted_password=excluded.encrypted_password, email_confirmed_at=now(), updated_at=now();
insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
values ('e2e00000-0000-4000-8000-000000000057','e2e00000-0000-4000-8000-000000000057','playwright@enqidu.local','{"sub":"e2e00000-0000-4000-8000-000000000057","email":"playwright@enqidu.local"}','email',now(),now(),now()) on conflict do nothing;
insert into public.profiles(id,display_name,experience_level,primary_goal,disciplines,usual_environment,timezone)
values ('e2e00000-0000-4000-8000-000000000057','Atleta Playwright','intermediate','Fuerza sostenible',array['strength'],array['home'],'Europe/Madrid') on conflict(id) do update set timezone='Europe/Madrid';
insert into public.user_goals(user_id,name,description,goal_type,priority,status)
values ('e2e00000-0000-4000-8000-000000000057','Fuerza sostenible','Mantener fuerza y recuperación','strength',1,'active');
insert into public.user_training_locations(user_id,display_name,location_type,access_mode,prescription_scope,is_active)
values ('e2e00000-0000-4000-8000-000000000057','Casa','home','anytime','autonomous',true);
with equipment as (insert into public.equipment_catalog(name,equipment_category,equipment_type,unit) values ('Mancuernas E2E','strength','dumbbell','kg') returning id)
insert into public.user_equipment(user_id,equipment_id,quantity,location_label,available) select 'e2e00000-0000-4000-8000-000000000057',id,2,'home',true from equipment;
-- Previous period is deliberately lower volume than the current period.
insert into public.training_sessions(user_id,local_date,title,sport,activity_type,duration_seconds,session_status)
values
('e2e00000-0000-4000-8000-000000000057',(current_date-interval '8 days')::date,'Fuerza base anterior','strength','strength',1200,'completed'),
('e2e00000-0000-4000-8000-000000000057',(current_date-interval '1 day')::date,'Fuerza base actual','strength','strength',3600,'completed');
