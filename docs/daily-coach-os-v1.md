# Daily Coach Operating System V1 — Epic #97

Base: real `origin/main` bdfda637eeffe68ffd3d07898fb277cd3a016d9a (PR #96 merged).
Incremental infrastructure/subscription/API cost: **€0**. No new service, model,
scheduler, subscription, resource provisioning or production deployment.
Existing Supabase storage/compute only; no paid quota upgrade is enabled.

## Architecture and closed contract

`get_daily_coach_operating_brief({})` adds one versioned read to ENQIDU Tools
(`daily_coach_operating_brief_v1`, tool 1.0.0). Identity and calendar come from
JWT authentication and `profiles.timezone`, never arguments. App, deterministic
Morning conversation and local MCP share it. Old reads remain supported.
Registry now has 12 reads, six previews and six existing applies.

The composition reuses Morning Coach policy v1.0.0, canonical Health/Readiness,
Closed Loop and existing preview contracts. It includes current evidence, actual
metrics and missing families, readiness and drivers, yesterday comparison, saved
plan/objective/intensity, decision, deterministic explanation, review action,
seven-day trend, recent executions, Closed Loop assessments and recorded history.
`response_mode=deterministic`, `llm_used=false`, `usage=null`, `applied=false`.
There is no second readiness algorithm, Coach or plan.

Morning's existing NO_CHANGE (no active training plan) projects as KEEP in the
four-decision operating contract: it preserves the absence of a plan. Planned
rest never becomes a duration-reduction target. REDUCE/RECOVERY_BIAS preserve the
existing policy and return only its preview request. KEEP has no proposal.
Explicit review/confirmation and the existing atomic expected-state/lock writer
remain the only plan mutation path. Neither trends nor audit history grant action
authority. Closed Loop facts do not imply medical causality.

## Evidence and trend

Complete means canonical Health `evidence_quality=complete` without read issues.
Partial means some current families but incomplete canonical evidence. Stale means
only older evidence; missing means no evidence. Optional missing families are
named, even if Morning's narrower sleep/HRV/stress sufficiency is met. Failed reads
retain their canonical issues and are explained separately from absent readings.
UI also has loading and error/retry states. Zeros are rendered as observations;
nulls remain gaps. Stored stale metrics are never presented as today's readings.

Trend rule `enqidu.trend.v1.0.0`: seven profile-calendar dates, no interpolation.
Compare mean readiness on days -6..-4 with days -2..0; day -3 is display-only.
Each window requires >=2 usable canonical scores and all participating scores
must have the same sorted factor signature. Delta >=5 = improving, <=-5 = declining,
otherwise stable. Missing sufficient comparable observations = insufficient_data.
Uses the existing canonical readiness version/date/factor checks. Historical
values are reconstructed from current canonical records, not claims about what
was known that morning. Corrected evidence may change this trend; recorded
past decisions are not recomputed.

Reads are bounded: seven canonical health dates cached within one request,
20 recent executions, 50 plans per window, five post-workout assessments,
100 audit events from seven days, 14 decision entries and 128 KiB tool envelope.
Truncation is explicit; no claim of complete history. Seven health loads are a
known performance limit; no scheduler/polling loop is added. UI refreshes manually,
on foreground return and at profile-calendar midnight (including DST).

## Planned versus executed precedence

The single `planned_vs_executed_v1` domain is attached to Closed Loop assessments
and used by Daily Coach/UI. It compares only owned, usable execution evidence.

1. Unique exact `linked_completed_session_id` wins, even on a different day and
   regardless of title, manual/FIT source or duration.
2. Duplicate links or truncated identity coverage remain unknown.
3. Date plus a **shared canonical session identity** could be a fallback, but
   inspection of the real production schema found no such shared key between
   `planned_training_sessions` and `training_sessions`. `recommended_session_id`
   references a different table. Thus V1 withholds that fallback; date, title or
   sport alone never establish a link or completion.
4. No plan / explicit rest: no_session_planned, preserving actual unmatched
   activities separately. Rest is not reported as a missed workout.
5. A plan without completion evidence: unknown. Only explicit skipped status or
   canonical not_executed evidence supports missed. Confirmed partial remains
   partial. Completed assessments with observed duration/type/intensity/volume
   deviation are completed_modified; compatible measured duration and confirmed
   completion are completed_as_planned **for observed dimensions only**. Missing
   structural/intensity/volume evidence remains exposed, not invented.

Type comparison uses `training_sessions.modality_id → sport_modalities.code`,
not titles. Explicit mapping: functional_strength → strength/functional;
hybrid_training → hybrid; running → running; trail_running → trail; swimming →
swim; mobility → mobility; recovery → recovery; yoga_pilates → yoga. Unknown codes
remain unknown. No canonical row, FIT content, source or linkage is rewritten.

The production schema audit also found the old recent-session read selecting
nonexistent sport/activity_type/moving-duration/calorie/HR/load columns. The read
now selects actual canonical session columns and uses recorded/completed status;
metrics remain in their existing metric contracts.

## History, migration and security

Migration `20261014044007_daily_coach_events.sql` adds one small append-only audit
table, indexed by owner/date/time; no function or SECURITY DEFINER. Explicitly
revokes default grants from public, anon, authenticated and service_role. Only
owner-scoped SELECT is granted to authenticated (RLS auth.uid); backend gets
SELECT/INSERT only. UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES are not granted.
Account deletion cascades to its audit rows.

Existing messages have editable user-owned metadata and no decision snapshots,
so they cannot establish a reliable historical Coach decision. Server-generated
snapshots contain only date/timezone, enum decision, structured reason codes,
small observed evidence, plan identity/hash and allowlisted existing preview
request. SHA-256 deduplicates identical same-day decisions. No conversational
content, raw provider payload, credential or LLM thought is saved.

The pure read/preview domains do not write. First-party runtime receives an
optional server-only audit recorder; after validating a successful result it
appends decision/preview/application evidence. This audit-only side effect is
separate from plan writes and cannot be invoked with arbitrary model JSON.
MCP remains read/preview only and never invokes the recorder.

History is derived from persisted decision events and matching proposal keys,
preview plan identities and preview/apply fingerprints. `applied` needs an
acknowledged apply event matching a recorded preview; no inferred application
from the current plan. Expiry indicates only that a recorded preview deadline
passed with no matching application recorded. No rejected event is invented:
UI dismissal remains local. Days without a read have no fabricated decision.

Audit append occurs after the action commit, **not in the action transaction**.
A failed append warns `daily_coach_history_not_recorded`; it never converts an
acknowledged plan write into failure/retry. Missing audit evidence remains
unknown. A migration not yet installed exposes unavailable history. This is a
minimal explainability log, not an exhaustive/compliance-grade mutation ledger.
Review retention/quotas before any future expansion; no billable upgrade enabled.

Apply the migration before deploying the matching Edge functions/UI after PR
review. No production migration/deployment was performed for this PR. Rollback:
revert application changes; retain audit rows or review removal separately.

## Operational invariants

- Fitness AI server transport: **UNAVAILABLE**.
- Scheduler: **DISABLED**. Garmin daily sync remains non-operational.
- MCP writes: **DISABLED** in the deployed/default configuration; no gate enabled.
- Garmin provenance remains provider=garmin, provider_mode=aggregator,
  ingestion_channel=fitness_ai_connector; no claim of official Garmin API.
- No scraping/private endpoints/token reuse, OpenAI calls, paid infrastructure,
  remote MCP auth, automatic apply, general mutation grants or production writes.

## Verification

See PR validation results for final counts. New tests cover deterministic trends,
real zeros, gaps/stale/partial/missing, exact/cross-day/ambiguous linkage, manual/FIT
comparison, modified duration/type, partial/missed/rest/no-plan, Madrid midnight
and DST, all four decisions, no auto-apply, audit lifecycle and actual SQL RLS.
Authenticated local browser/API E2E covers brief → preview → explicit atomic apply,
immutable execution/FIT, tenant history and mobile loading/available/partial/stale/
missing/error states. Existing full suite, Coach evals, transactional races, E2E
and production build remain required.

Final validation for this PR:

- Full suite: 668/668 (previous confirmed run retained; not repeated at delivery).
- Coach evals: 27/27.
- Transactional tests against local PostgreSQL: 30/30.
- Daily Coach focused tests: 15/15.
- Complete local Playwright E2E: 32/32, Chromium, one worker (2.2 minutes).
- Production build: passed; existing bundle-size warning remains.
- Final `git diff --check`: passed.

E2E used disposable local Supabase/Auth/Edge services and disabled cloud LLM
calls. No production deployment or merge. Incremental infrastructure/API cost:
**€0.00**; no resource, subscription or paid integration was provisioned.
