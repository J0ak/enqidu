-- Safe reconciliation for Garmin/FIT block HR metrics on 2026-06-13.
-- This script only updates blocks that already have reliable FIT elapsed windows
-- and at least one HR sample inside the window. It does not delete rows and it
-- does not distribute session duration across conversation blocks.

with block_hr as (
  select
    b.id as block_id,
    round(avg(s.heart_rate_bpm))::integer as hr_avg,
    max(s.heart_rate_bpm)::integer as hr_max,
    count(s.*) as sample_count,
    greatest(0, round(b.end_elapsed_seconds - b.start_elapsed_seconds))::integer as duration_from_window
  from public.session_blocks b
  join public.session_samples s
    on s.session_id = b.session_id
   and s.elapsed_seconds >= b.start_elapsed_seconds
   and s.elapsed_seconds <= b.end_elapsed_seconds
   and s.heart_rate_bpm is not null
  where b.session_id = '404886e4-1de6-42b6-a712-df22d82b9471'
    and b.start_elapsed_seconds is not null
    and b.end_elapsed_seconds is not null
    and b.end_elapsed_seconds > b.start_elapsed_seconds
  group by b.id, b.start_elapsed_seconds, b.end_elapsed_seconds
)
update public.session_blocks b
set
  duration_seconds = coalesce(b.duration_seconds, block_hr.duration_from_window),
  heart_rate_avg_bpm = block_hr.hr_avg,
  heart_rate_max_bpm = block_hr.hr_max,
  temporal_metrics_source = coalesce(nullif(b.temporal_metrics_source, ''), 'garmin_fit_samples'),
  temporal_metrics_confidence = coalesce(nullif(b.temporal_metrics_confidence, ''), 'derived')
from block_hr
where b.id = block_hr.block_id
  and block_hr.sample_count > 0
returning
  b.id,
  b.block_order,
  b.name,
  b.duration_seconds,
  b.start_elapsed_seconds,
  b.end_elapsed_seconds,
  b.heart_rate_avg_bpm,
  b.heart_rate_max_bpm,
  b.temporal_metrics_source,
  b.temporal_metrics_confidence;
