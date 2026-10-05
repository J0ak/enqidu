-- Local-only parity for Health Product reads introduced after the original E2E contract.
-- No production schema or permissions are changed by this migration.
alter table public.wearable_health_daily
  add column if not exists provider text,
  add column if not exists provider_mode text,
  add column if not exists ingestion_channel text,
  add column if not exists min_heart_rate_bpm numeric,
  add column if not exists max_heart_rate_bpm numeric,
  add column if not exists bmr_kcal numeric,
  add column if not exists distance_m numeric,
  add column if not exists active_time_seconds integer,
  add column if not exists moderate_intensity_seconds integer,
  add column if not exists vigorous_intensity_seconds integer,
  add column if not exists max_stress_level numeric,
  add column if not exists stress_qualifier text,
  add column if not exists body_battery_charged numeric,
  add column if not exists body_battery_drained numeric,
  add column if not exists spo2_min_pct numeric,
  add column if not exists respiration_min_brpm numeric;
