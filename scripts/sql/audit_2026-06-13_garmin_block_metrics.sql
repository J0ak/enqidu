-- Read-only audit for Garmin/FIT block metrics on 2026-06-13.
-- Target project: rdduqsziboqxlgeqouxq
-- Session: 404886e4-1de6-42b6-a712-df22d82b9471

-- 1) Training session identity and Garmin/FIT global metrics.
select
  id,
  external_reference,
  source_type,
  title,
  local_date,
  started_at,
  duration_seconds,
  active_seconds,
  rest_seconds,
  session_kind,
  sport,
  sub_sport,
  session_status,
  heart_rate_avg_bpm,
  heart_rate_max_bpm,
  calories_active,
  calories_total,
  training_effect_aerobic,
  training_effect_anaerobic,
  tags,
  metadata,
  session_structure
from public.training_sessions
where id = '404886e4-1de6-42b6-a712-df22d82b9471';

-- 2) Conversation blocks and any persisted Garmin temporal windows/HR.
select
  id,
  session_id,
  block_order,
  name,
  block_type,
  duration_seconds,
  active_seconds,
  rest_seconds,
  start_elapsed_seconds,
  end_elapsed_seconds,
  heart_rate_avg_bpm,
  heart_rate_max_bpm,
  temporal_metrics_source,
  temporal_metrics_confidence,
  prescription
from public.session_blocks
where session_id = '404886e4-1de6-42b6-a712-df22d82b9471'
order by block_order;

-- 3) Session samples availability and global HR derived from samples.
select
  count(*) as sample_count,
  min(elapsed_seconds) as first_elapsed,
  max(elapsed_seconds) as last_elapsed,
  round(avg(heart_rate_bpm)) as avg_hr,
  max(heart_rate_bpm) as max_hr
from public.session_samples
where session_id = '404886e4-1de6-42b6-a712-df22d82b9471';

-- 4) HR per block when block windows exist.
select
  b.id as block_id,
  b.block_order,
  b.name,
  b.start_elapsed_seconds,
  b.end_elapsed_seconds,
  count(s.*) as sample_count,
  round(avg(s.heart_rate_bpm)) as hr_avg,
  max(s.heart_rate_bpm) as hr_max
from public.session_blocks b
left join public.session_samples s
  on s.session_id = b.session_id
 and b.start_elapsed_seconds is not null
 and b.end_elapsed_seconds is not null
 and s.elapsed_seconds >= b.start_elapsed_seconds
 and s.elapsed_seconds <= b.end_elapsed_seconds
where b.session_id = '404886e4-1de6-42b6-a712-df22d82b9471'
group by
  b.id,
  b.block_order,
  b.name,
  b.start_elapsed_seconds,
  b.end_elapsed_seconds
order by b.block_order;

-- 5) Discover Garmin/FIT related tables.
select table_name
from information_schema.tables
where table_schema = 'public'
  and (
    table_name ilike '%fit%'
    or table_name ilike '%lap%'
    or table_name ilike '%sample%'
    or table_name ilike '%set%'
    or table_name ilike '%interval%'
    or table_name ilike '%source%'
  )
order by table_name;

-- 6) Inspect common Garmin/FIT detail tables if present.
select *
from public.session_laps
where session_id = '404886e4-1de6-42b6-a712-df22d82b9471'
order by lap_index nulls last, start_elapsed_seconds nulls last
limit 50;

select *
from public.fit_message_payloads
where session_id = '404886e4-1de6-42b6-a712-df22d82b9471'
order by message_order nulls last
limit 50;
