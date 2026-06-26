-- DRAFT ONLY - DO NOT APPLY AUTOMATICALLY
-- This file is documentation only.
-- Do not place this SQL under supabase/migrations without explicit approval.

-- Candidate shape only. Names, constraints, RLS and policies must be reviewed
-- in a future PR before any database change.

create table draft_athlete_profiles (
  id uuid primary key,
  user_id uuid null,
  fixture_user text null,
  display_name text not null,
  role text null,
  editable_live_state boolean not null default true,
  historical_fixture boolean not null default false,
  source_path text null,
  natural_key text not null unique
);

create table draft_coach_context_sources (
  id uuid primary key,
  fixture_user text null,
  source_kind text not null,
  source_path text not null,
  editable_live_state boolean not null default false,
  natural_key text not null unique
);

create table draft_coach_session_fixtures (
  id uuid primary key,
  fixture_user text not null,
  date date null,
  title text null,
  sport text null,
  session_type text null,
  normalized_path text not null,
  raw_source_path text null,
  historical_fixture boolean not null default true,
  natural_key text not null unique
);

