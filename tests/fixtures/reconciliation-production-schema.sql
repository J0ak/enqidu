-- Column types/defaults inspected read-only in production on 2026-10-16.
create table public.enkidu_conversation_enrichments (
 id uuid default gen_random_uuid() not null,
 session_id uuid not null,
 local_date date,
 enrichment_type text default 'conversation_training_log'::text not null,
 source text default 'chatgpt_pilot'::text not null,
 payload jsonb default '{}'::jsonb not null,
 ai_usage jsonb default '{}'::jsonb not null,
 status text default 'active'::text not null,
 created_at timestamp with time zone default now() not null,
 updated_at timestamp with time zone default now() not null
);
create table public.planned_training_sessions (
 id uuid default gen_random_uuid() not null,
 user_id uuid not null,
 planned_date date not null,
 planned_time time without time zone,
 title text not null,
 session_type text not null,
 status text default 'planned'::text not null,
 location_type text,
 planned_intensity text,
 planned_duration_min integer,
 planned_duration_max integer,
 objective text,
 coach_notes text,
 constraints jsonb default '[]'::jsonb not null,
 readiness_snapshot jsonb,
 source text default 'chatgpt_pilot'::text not null,
 linked_completed_session_id uuid,
 created_at timestamp with time zone default now() not null,
 updated_at timestamp with time zone default now() not null
);
create table public.profiles (
 id uuid not null,
 display_name text default 'Deportista'::text not null,
 onboarding_completed boolean default false not null,
 primary_goal text,
 disciplines text[] default '{}'::text[] not null,
 experience_level text,
 weekly_days integer,
 typical_minutes integer,
 usual_environment text[] default '{}'::text[] not null,
 usual_equipment text[] default '{}'::text[] not null,
 considerations text,
 preferences text,
 uses_wearables boolean default false not null,
 created_at timestamp with time zone default now() not null,
 updated_at timestamp with time zone default now() not null,
 timezone text
);
create table public.session_blocks (
 id uuid default gen_random_uuid() not null,
 session_id uuid not null,
 block_order integer not null,
 block_type text not null,
 name text,
 duration_seconds integer,
 rounds_completed numeric,
 prescription jsonb default '{}'::jsonb not null,
 execution_notes text,
 data_confidence text default 'manual'::text not null,
 created_at timestamp with time zone default now() not null,
 updated_at timestamp with time zone default now() not null,
 start_elapsed_seconds numeric,
 end_elapsed_seconds numeric,
 active_seconds numeric,
 rest_seconds numeric,
 heart_rate_avg_bpm smallint,
 heart_rate_max_bpm smallint,
 temporal_metrics_source text,
 temporal_metrics_confidence text
);
create table public.session_exercises (
 id uuid default gen_random_uuid() not null,
 session_id uuid not null,
 block_id uuid,
 exercise_id uuid,
 exercise_order integer,
 reported_name text not null,
 execution_type text default 'performed'::text not null,
 sets_completed numeric,
 rounds_completed numeric,
 reps_per_set jsonb,
 duration_seconds integer,
 load_value numeric,
 load_unit text,
 equipment_snapshot jsonb default '{}'::jsonb not null,
 tempo_or_pause text,
 side text,
 notes text,
 data_confidence text default 'manual'::text not null,
 created_at timestamp with time zone default now() not null
);
create table public.session_source_links (
 session_id uuid not null,
 source_id uuid not null,
 source_role text not null,
 is_primary boolean default false not null,
 created_at timestamp with time zone default now() not null
);
create table public.training_sessions (
 id uuid default gen_random_uuid() not null,
 user_id uuid not null,
 modality_id uuid,
 source_id uuid,
 engine_version_id uuid,
 recommended_session_id uuid,
 parent_session_id uuid,
 external_reference text,
 title text,
 session_kind text not null,
 data_quality_status text default 'unverified'::text not null,
 session_status text default 'recorded'::text not null,
 started_at timestamp with time zone,
 ended_at timestamp with time zone,
 local_date date,
 timezone text,
 duration_seconds integer,
 distance_meters numeric,
 elevation_gain_meters numeric,
 session_structure jsonb default '{}'::jsonb not null,
 original_payload jsonb,
 interpretation_notes text,
 tags text[] default '{}'::text[] not null,
 created_at timestamp with time zone default now() not null,
 updated_at timestamp with time zone default now() not null,
 location_id uuid,
 programming_mode text,
 load_decision_owner text
);
create table public.training_sources (
 id uuid default gen_random_uuid() not null,
 user_id uuid not null,
 source_type text not null,
 source_name text not null,
 source_system text,
 source_version text,
 original_filename text,
 original_content_type text,
 original_json jsonb,
 file_checksum text,
 storage_path text,
 imported_at timestamp with time zone default now() not null,
 import_status text default 'received'::text not null,
 validation_errors jsonb default '[]'::jsonb not null,
 provenance jsonb default '{}'::jsonb not null,
 created_at timestamp with time zone default now() not null
);
create table public.wearable_activity_imports (
 id uuid default gen_random_uuid() not null,
 user_id uuid not null,
 connection_id uuid,
 provider text not null,
 external_activity_id text not null,
 notification_mode text default 'provider_event'::text not null,
 received_at timestamp with time zone default now() not null,
 activity_start_at timestamp with time zone,
 source_file_available boolean default false not null,
 source_id uuid,
 session_id uuid,
 parser_version text,
 processing_status text default 'received'::text not null,
 retry_count integer default 0 not null,
 last_error jsonb default '{}'::jsonb not null,
 provider_payload jsonb default '{}'::jsonb not null,
 processing_summary jsonb default '{}'::jsonb not null,
 user_notified_at timestamp with time zone,
 created_at timestamp with time zone default now() not null,
 updated_at timestamp with time zone default now() not null,
 provider_mode text default 'manual_upload'::text not null,
 ingestion_channel text default 'fit_manual_upload'::text not null,
 raw_payload_id uuid
);
alter table public.session_blocks add CHECK ((block_order > 0));
alter table public.session_blocks add CHECK ((block_type = ANY (ARRAY['warmup'::text, 'mobility'::text, 'strength'::text, 'skill'::text, 'conditioning'::text, 'metcon'::text, 'cardio'::text, 'cooldown'::text, 'recovery'::text, 'mixed'::text, 'other'::text])));
alter table public.session_blocks add CHECK ((data_confidence = ANY (ARRAY['reported'::text, 'calculated'::text, 'estimated'::text, 'manual'::text, 'unknown'::text])));
alter table public.session_blocks add CHECK (((duration_seconds IS NULL) OR (duration_seconds >= 0)));
alter table public.session_blocks add CHECK (((rounds_completed IS NULL) OR (rounds_completed >= (0)::numeric)));
alter table public.session_exercises add CHECK ((data_confidence = ANY (ARRAY['reported'::text, 'calculated'::text, 'estimated'::text, 'manual'::text, 'unknown'::text])));
alter table public.session_exercises add CHECK (((duration_seconds IS NULL) OR (duration_seconds >= 0)));
alter table public.session_exercises add CHECK ((execution_type = ANY (ARRAY['performed'::text, 'planned'::text, 'modified'::text, 'substituted'::text, 'skipped'::text])));
alter table public.session_exercises add CHECK (((load_value IS NULL) OR (load_value >= (0)::numeric)));
alter table public.session_exercises add CHECK (((rounds_completed IS NULL) OR (rounds_completed >= (0)::numeric)));
alter table public.session_exercises add CHECK (((sets_completed IS NULL) OR (sets_completed >= (0)::numeric)));
alter table public.session_exercises add CHECK (((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'bilateral'::text, 'alternating'::text, 'each_side'::text, 'na'::text]))));
alter table public.session_source_links add CHECK ((source_role = ANY (ARRAY['manual_description'::text, 'garmin_screenshot'::text, 'garmin_fit'::text, 'garmin_api'::text, 'jotason_canonical'::text, 'legacy_original'::text, 'supporting'::text])));
