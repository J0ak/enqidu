# OAuth data-plane boundary — #104 security follow-up

## Decision and security contract

The prior shared OAuth/data bearer was a general `authenticated` credential. A closed MCP registry could not stop its holder from calling REST, RPC or first-party Edge writers. This follow-up explicitly supersedes the original “no service-role remotely” design, as authorized in the security review.

Identity and data now use separate request-scoped clients:

```text
OAuth bearer ── public-key authDb ── online auth.getUser() ── verified athlete
                                      │
                         exact issuer/client/session/audience checks
                                      │
/api/mcp ── same 27 READ/PREVIEW tools and canonical domain
                                      │ verified userId only
                   read-only capability facade over server dataDb
                                      │
                     existing server secret / service-role key
                                      │
                        scoped canonical queries + fixed RPCs

OAuth bearer ── Data API ── pre-request guard ── DENIED
OAuth bearer ── public tables ── restrictive RLS ── DENIED
OAuth bearer ── first-party Edge boundary ── online Auth ── DENIED
```

The secret is an existing backend credential, never the caller's bearer, an argument or a browser environment variable. Supabase secret/service-role keys bypass RLS. A dedicated PostgreSQL login cannot transparently serve the existing supabase-js/PostgREST domain; minting a custom JWT role would introduce signing authority and a separate credential lifecycle. The authorized fallback avoids that machinery and new infrastructure. **The underlying credential is privileged, not database-level read-only.** The facade limits the domain to explicit read tables, query/filter methods and two closed read RPCs. It additionally applies the verified athlete filter to every directly owned table (profile id or user_id); child reads still require the canonical owned-parent traversal. No `auth.admin`, insert/update/delete/upsert, arbitrary RPC or raw client property reaches the runtime. Future dedicated database privileges remain possible, but are not claimed by this implementation.

The runtime accepts `authDb = db` by default. App/Coach/local retain their existing identity/data client. Remote passes OAuth `authDb` plus server `db`, reauthenticates in the shared runtime, and reads canonical profile timezone using the verified id. No second sporting domain exists. The semantic service-only adapter calls the existing `training_semantics.state`, after the facade verifies an owned session parent. `get_ai_coach_context` requires the bound `p_user_id`; its canonical SQL checks all ownership. The existing role helper now reads verified `auth.jwt()` claims (with legacy GUC fallback), fixing compatibility with modern PostgREST.

## Pending migration; no production apply

`20261022133734_oauth_mcp_boundary_v1.sql` is transactional and catalog-driven. It covers every public relation with any authenticated table OR column grant, including non-DML grants; no inferred ownership policy is introduced. Existing first-party permissive policies and grants remain unchanged.

- Every exposed base/partitioned table must already have RLS; otherwise migration fails explicitly.
- It adds `AS RESTRICTIVE FOR ALL TO authenticated`, both USING and WITH CHECK requiring `(auth.jwt()->>'client_id') IS NULL`. Empty client_id is denied too. The signed top-level claim is authoritative; user_metadata is irrelevant.
- Exposed views must have `security_invoker=true`, otherwise migration fails. Foreign/materialized relations require explicit review and fail closed.
- `authenticator` receives `pgrst.db_pre_request=public.enqidu_data_api_guard`. The pre-request function denies all OAuth Data API operations, including SECURITY DEFINER RPCs and views. An existing different hook blocks migration until explicitly composed. PostgREST config/schema reload notifications are included.
- `set_garmin_sync_consent` invokes the same guard inside its SECURITY DEFINER body, before any write; all other existing behavior is retained.
- `read_training_semantics_for_mcp_v1(uuid,uuid)` is SECURITY INVOKER, STABLE, service-role-only. It exposes no new calculation or write.

OAuth access to Auth lifecycle remains intact. Exact MCP audience checks remain mandatory. This is **code ready**: the deployed system retains its previous behavior until operators apply the reviewed migration and deploy the Edge boundary. No global read-only claim applies to production before that coordinated rollout.

## SELECT-only production inventory, 2026-10-22

101 public relations have at least one authenticated grant: **90 base tables, all RLS enabled; 11 views, all security_invoker**. Of the base tables, 43 have INSERT/UPDATE/DELETE grants. Some listed objects have only TRUNCATE/REFERENCES/TRIGGER grants and are not readable through REST today; they are deliberately included in coverage. The migration enumerates the actual catalog at application time rather than relying on this snapshot. No rows or personal data were collected. A separate SELECT-only `pg_policies` check found no Storage policies; this PR does not create a Storage access surface. The pre-request guard applies to PostgREST only, so the restrictive table policies remain necessary for other RLS consumers.

| Relation | Kind | Existing authenticated grants |
|---|---|---|
| `ai_cost_simulation_breakdown` | invoker view | TRUNCATE, REFERENCES, TRIGGER |
| `ai_cost_simulations` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `ai_feature_policy` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `ai_price_catalog` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `ai_production_flows` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `ai_simulation_monthly_summary` | invoker view | TRUNCATE, REFERENCES, TRIGGER |
| `ai_usage_cost_breakdown` | invoker view | TRUNCATE, REFERENCES, TRIGGER |
| `ai_usage_events` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `ai_usage_monthly_summary` | invoker view | TRUNCATE, REFERENCES, TRIGGER |
| `bootstrap_training_sessions` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `bootstrap_training_sources` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `bootstrap_user_constraints` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `bootstrap_user_equipment` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `bootstrap_user_goals` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `bootstrap_user_preferences` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `bootstrap_user_profile` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `bootstrap_users` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `check_ins` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `coach_athlete_constraints` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `coach_athlete_profiles` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `coach_athlete_training_goals` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `coach_context_snapshots` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `coach_context_sources` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `coach_equipment_items` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `coach_equipment_locations` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `coach_seed_runs` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `coach_session_blocks` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `coach_session_exercises` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `coach_session_fixtures` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `conversations` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `daily_coach_events` | table / RLS | SELECT |
| `engine_versions` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `enkidu_ai_usage_estimates` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `enkidu_conversation_enrichments` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `equipment_catalog` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `exercise_catalog` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `exercise_equipment_requirements` | table / RLS | TRUNCATE, REFERENCES, TRIGGER |
| `fit_message_payloads` | table / RLS | SELECT, INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `garmin_sync_consent_events` | table / RLS | SELECT |
| `messages` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `planned_session_blocks` | table / RLS | SELECT |
| `planned_training_sessions` | table / RLS | SELECT |
| `profiles` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `readiness_snapshots` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `recommended_sessions` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `safety_events` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `session_block_garmin_series_map` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `session_blocks` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `session_exercises` | table / RLS | SELECT, INSERT, TRUNCATE, REFERENCES, TRIGGER |
| `session_garmin_sets` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `session_laps` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `session_metrics` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `session_samples` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `session_source_links` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `sport_modalities` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `swimming_lengths` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `training_availability_overrides` | table / RLS | SELECT |
| `training_sessions` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `training_sources` | table / RLS | SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER |
| `user_equipment` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `user_goals` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `user_heart_rate_zone_profiles` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `user_memory` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `user_pinned_capabilities` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `user_roles` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `user_training_locations` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `user_wearable_connections` | table / RLS | SELECT |
| `v_daily_coaching_context` | invoker view | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `v_daily_health_context` | invoker view | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `v_garmin_health_master_context` | invoker view | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `v_garmin_sleep_master_context` | invoker view | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `v_hybriq_daily_source_context` | invoker view | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `v_training_session_data_context` | invoker view | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `v_wearable_metric_coverage` | invoker view | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `wearable_activity_imports` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `wearable_beat_to_beat_intervals` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `wearable_blood_pressure_measurements` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `wearable_body_battery_events` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `wearable_body_battery_samples` | table / RLS | SELECT |
| `wearable_body_composition_measurements` | table / RLS | SELECT |
| `wearable_epoch_summaries` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `wearable_health_daily` | table / RLS | SELECT |
| `wearable_health_imports` | table / RLS | SELECT |
| `wearable_health_observations` | table / RLS | SELECT |
| `wearable_heart_rate_samples` | table / RLS | SELECT |
| `wearable_hrv_nightly_samples` | table / RLS | SELECT |
| `wearable_hrv_nightly_summaries` | table / RLS | SELECT |
| `wearable_metric_catalog` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `wearable_metric_evidence_links` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `wearable_metric_source_evidence` | table / RLS | SELECT, TRUNCATE, REFERENCES, TRIGGER |
| `wearable_nap_sessions` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `wearable_provider_raw_payloads` | table / RLS | SELECT, INSERT, UPDATE, DELETE |
| `wearable_respiration_samples` | table / RLS | SELECT |
| `wearable_sleep_score_qualifiers` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `wearable_sleep_sessions` | table / RLS | SELECT |
| `wearable_sleep_stage_intervals` | table / RLS | SELECT |
| `wearable_spo2_samples` | table / RLS | SELECT |
| `wearable_stress_samples` | table / RLS | SELECT |
| `wearable_vendor_insights` | table / RLS | SELECT |
| `wearable_workout_exports` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `weekly_plans` | table / RLS | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |

## Authenticated-executable public RPC inventory

19 functions were found in the SELECT-only audit. The Data API pre-request guard blocks OAuth calls to **all** of them, including stable read helpers. The only callable non-trigger mutator is `set_garmin_sync_consent`; its internal signed-claim guard additionally protects direct SQL invocation. The volatile trigger has no ordinary RPC invocation contract and cannot bypass the denied table write.

| Function | Existing contract | Additional protection |
|---|---|---|
| `ai_context_assert_user(uuid)` | invoker, stable | global Data API guard |
| `ai_context_is_service_role()` | invoker, stable | global Data API guard |
| `ai_context_metric_numeric(uuid,text[])` | invoker, stable | global Data API guard |
| `ai_context_request_role()` | invoker, stable | global Data API guard |
| `ai_context_text(text,integer)` | invoker, immutable | global Data API guard |
| `coach_context_set_updated_at()` | invoker, volatile | global Data API guard |
| `enkidu_map_block_type(text)` | invoker, immutable | global Data API guard |
| `get_ai_activity_type_filters()` | invoker, stable | global Data API guard |
| `get_ai_athlete_profile_context(uuid)` | invoker, stable | global Data API guard |
| `get_ai_coach_context(uuid,date,text,date,date,uuid)` | invoker, stable | global Data API guard |
| `get_ai_context_diagnostics(uuid,date)` | invoker, stable | global Data API guard |
| `get_ai_current_week_context(uuid,date)` | invoker, stable | global Data API guard |
| `get_ai_health_recovery_context(uuid,date)` | invoker, stable | global Data API guard |
| `get_ai_security_status()` | invoker, stable | global Data API guard |
| `get_ai_session_detail_context(uuid,uuid,boolean,boolean,boolean)` | invoker, stable | global Data API guard |
| `get_ai_training_period_summary(uuid,date,date,integer)` | invoker, stable | global Data API guard |
| `normalize_garmin_activity_type(text,text,text,text,text,text)` | invoker, immutable | global Data API guard |
| `read_training_semantics_v1(uuid)` | invoker, stable | global Data API guard |
| `set_garmin_sync_consent(text,text)` | SECURITY DEFINER, volatile | internal first-party guard + global Data API guard |

## Edge Functions and future coverage

All ten entrypoints use the shared `firstPartyEndpoint` wrapper: `coach-context`, `coach-context-memory`, `coach-plan-action`, `coach-reply`, `enqidu-tools`, `garmin-daily-sync`, `manual-health-import`, `session-context`, `session-correction-preview`, `session-correction-apply`. After online verification of the exact bearer, any non-null client_id returns sanitized `403 oauth_transport_forbidden`, before body handling, service-client construction, preparation or mutation. READ/preview first-party routes are denied too. OPTIONS has no data operation. Garmin's existing independent scheduler secret flow is retained only when no Authorization bearer is present; supplying both cannot bypass the OAuth guard.

`tests/oauth-first-party-boundary.test.mjs` enumerates every Edge entrypoint and rejects future unwrapped handlers. `scripts/audit-oauth-boundary.mjs` enumerates all authenticated-accessible public relations and functions. CI fails on missing/weak/nonrestrictive policies, disabled RLS, unsafe views, missing Data API hook, exposed service adapter or unguarded mutating/SECURITY DEFINER RPCs. The local bootstrap applies subsequent production migrations in chronological order, so new schema changes participate in this audit (a missing baseline dependency fails CI until supplied). Negative PostgreSQL tests introduce each regression inside rolled-back transactions and prove detection. Trigger functions are excluded from callable RPC mutation classification. This audit does not prove arbitrary future function bodies safe; reviewers must preserve the guard before any mutation and the canonical tenant filters.

## Acceptance and limits

The disposable local schema has 46 exposed relations; nine tables in its slim baseline lacked production RLS. The local-only bootstrap restores their SELECT-audited production ownership rules, while the production migration still refuses missing RLS. It also restores the audited context-auth helpers before applying the migration. No production policy was guessed or enabled automatically.

Real local PostgreSQL tests exercise restrictive RLS independently of the HTTP guard, first-party CRUD, foreign ownership, OAuth denial and the guarded consent RPC. Real PostgREST tests deny OAuth SELECT on every exposed local relation and deny representative CRUD, raw FIT/Health surfaces and RPCs. Real Edge HTTP tests reject all ten functions, all seven applies, a Coach action with a valid receipt, and manual-health preview/apply. Normal frontend CRUD and previews continue working.

The real SDK golden uses online Supabase Auth, REST-backed server data access and `high_pull_up` for athlete A while B has the same exercise with different values. Semantic detail/history/progress, Health, plans, context and Closed Loop remain scoped. Separate all-27-tool parity tests use a privileged fixture with **no automatic RLS**, populated with foreign parents/children across every family, and compare against clean A-only sporting results. Secrets, foreign identities and raw provider markers are absent from responses and allowlisted telemetry.

Residual trust: server code and the backend secret can bypass RLS; explicit ownership and the closed facade are mandatory. Future domain or SQL changes need adversarial tenant tests. Hosted OAuth issuance, approved-client audience hook, signing/refresh/revocation and deployed pre-request enforcement remain manual rollout gates. Revocation semantics are not inferred from synthetic local issuance. This change adds no rate-limiting service or guaranteed unlimited free capacity. Incremental spend: **€0.00**.

## Official references

[Supabase API grants/RLS](https://supabase.com/docs/guides/api/securing-your-api), [documented pre-request configuration and its PostgREST-only scope](https://supabase.com/docs/guides/database/debugging-performance#production-use-with-pre-request-protection), [API key privilege model](https://supabase.com/docs/guides/api/api-keys), [OAuth token security](https://supabase.com/docs/guides/auth/oauth-server/token-security), and the installed MCP server **2.3.1** implementation/types for `oauthMetadataResponse` and `createMcpHandler` were checked.
