# Closed Loop Core V1

ENQIDU compares the persisted plan, its explicitly linked execution, confirmed user feedback and subsequent canonical health evidence. The assessment and proposal are deterministic, read-only results. The persisted plan remains authoritative. This epic creates no migration, table, column, grant, policy or SQL RPC and applies nothing to production.

## Shared domain and read boundary

`src/closedLoop/index.js` exposes the functions and constants; the adjacent declarations define the reusable App/Tools contract:

- `assessClosedLoop(options)`: pure domain calculation without database access, writes, a model or UI dependencies.
- `feedbackFromSessionMetrics(metrics, { sessionId, userId })`: allowlisted interpretation of canonical confirmed feedback.
- `loadClosedLoopAssessments(db, options)`: authenticated canonical read adapter.

The loader requires `db.auth.getUser()` to match `options.userId`. The Edge Functions supply the user JWT client and the athlete profile calendar. Parent reads explicitly constrain `user_id`; all block, exercise and set reads use IDs derived from those owned parents. Returned rows are checked again before use. A caller cannot select another user's session using `sessionId` or `plannedSessionId`.

The existing Coach Context exposes `closed_loop_assessments`. Coach questions such as “Evalúa mi sesión” or “Compara lo planificado y ejecutado” use the deterministic assessment with `response_mode="deterministic"`, `llm_used=false` and `usage=null`. The app and future ENQIDU Tools/MCP can reuse this same core; this epic adds no MCP server.

## Canonical inputs

| Evidence | Existing canonical source | Interpretation |
| --- | --- | --- |
| Planned identity, date, status and duration range | `planned_training_sessions` | `planned_duration_min/max` are **minutes**; `linked_completed_session_id` is the persisted association. |
| Planned blocks and exercises | `planned_session_blocks` | The documented `planned_exercises` JSON uses `name`, `target_sets`, `target_reps` and `load`. |
| Executed identity, elapsed duration and date | `training_sessions` | No new session is created. Archived or future executions are withheld. |
| FIT provenance | `training_sources.source_type` | An explicit `garmin_fit` source is objective FIT evidence. Absence does not imply FIT. |
| Executed semantic structure | `session_blocks` / `session_exercises` | Confirmed/manual semantics can enrich the same execution without overwriting FIT. |
| Normalized performed sets | `block_items` → `item_exercises` → `performed_sets` | Used when that existing hierarchy is available. No schema is added to make it available. |
| Feedback | `session_metrics` | Only a confirmed user source and confidence qualify. |
| Health and personal baseline | `loadHealthIntelligence` | Reuses `health_recovery_v1` and the current `readiness_v1` algorithm. |

The normalized set hierarchy takes precedence for a block that has canonical item exercises. Legacy `session_exercises` overlays are not added to it, preventing duplicate volume. FIT parsing, raw messages, ingestion identity and historical data remain untouched. `session_plan_comparisons` exists, but its draft JSON has no confirmed inventory semantics; V1 does not interpret it as authoritative feedback or write to it.

## Assessment contract

```json
{
  "schema_version": "closed_loop_assessment_v1",
  "algorithm_version": "enqidu.closed-loop.v1.0.0",
  "calendar_date": "2026-10-05",
  "timezone": "Europe/Madrid",
  "generated_at": "2026-10-05T10:00:00Z",
  "planned_session": { "id": "existing-plan-id" },
  "executed_session": { "id": "existing-execution-id" },
  "identity_match": "exact_persisted_link",
  "completion": "completed",
  "duration_delta": null,
  "volume_delta": null,
  "block_exercise_matching": [],
  "omitted_blocks": [],
  "intensity_delta": null,
  "user_feedback": null,
  "health_before": null,
  "health_after": null,
  "recovery_comparison": [],
  "evidence_used": [],
  "missing_evidence": ["comparable_volume", "confirmed_user_feedback"],
  "assessment": { "status": "available", "facts": [] },
  "adaptation_proposal": {
    "schema_version": "adaptation_proposal_v1",
    "algorithm_version": "enqidu.closed-loop.v1.0.0",
    "action": "keep",
    "confidence": "medium",
    "reasons": ["execution_compatible_with_plan"],
    "affected_future_sessions": [],
    "requires_explicit_action": true,
    "applied": false
  },
  "applied": false
}
```

The example abbreviates projected session objects. `assessment.facts` contains `{ code, reason, ...observed_details }`; its Spanish explanations state the observed deviation and never claim diagnosis or causality. `missing_evidence` lists missing or unverified dimensions. An available assessment means there is usable evidence for some facts; it does not guarantee complete evidence for every prescription.

### Identity and completion

Only `planned_training_sessions.linked_completed_session_id === training_sessions.id` supplies an exact link. The calendar's same-day/type/time guesses do not become authoritative completion evidence. If multiple owned plans reference the same execution, all selected assessments with that link remain unlinked/unknown and report `ambiguous_shared_execution_link`. This check reads all owned references to the selected execution IDs, including references outside the requested date window; a truncated link check fails closed.

Completion has four values:

- `completed`: an exact execution link plus canonical planned status `completed`/`enriched`, confirmed completed feedback, or a fully matched inventory that the user explicitly confirms complete.
- `partial`: an exact execution link plus confirmed partial feedback or a confirmed omitted block.
- `not_executed`: explicit persisted `skipped` status without execution, or confirmed nonexecution feedback.
- `unknown`: insufficient or conflicting identity/completion evidence. An unlinked past plan is never automatically called missed, skipped or failed.

A shorter duration does not prove an omitted exercise, and a longer duration does not prove the entire plan was performed. Duration alone never decides completion. Persisted completion can coexist with a measured duration deviation; that deviation remains separately visible. A linked execution plus confirmed `not_executed` feedback (or explicit skipped plan state) is a completion conflict: the stored FIT identity is retained, completion stays unknown, the conflict is explicit, and the proposal is `no_change` pending review.

### Duration, structure, volume and intensity

`duration_delta` preserves both planned boundaries in seconds. `comparison` is `shorter`, `within_range` or `longer`; `seconds` is the signed distance from the violated boundary, zero within the range. `exact_target_delta_seconds` and `ratio` are populated only for an exact min=max target; a zero target has no ratio. An absent, invalid or reversed range returns `null`.

Block and exercise matching uses exact names after case/accent/whitespace normalization. Duplicate names are ambiguous and remain unverified. Missing executed detail is not proof of omission. A pure-domain caller can supply confirmed `omitted_blocks` or `structure_complete` with the same owned feedback identity; the current loader does not manufacture those confirmations from a successful database query.

Comparable strength volume is `kg_repetitions`, not an invented training-load score:

- Planned JSON requires an exact integer `target_sets`, exact numeric `target_reps` and explicit `load="40 kg"`. A repetition range, per-side ambiguity, unknown load or another unit remains unavailable.
- Legacy execution requires `sets_completed` equal to the length of its numeric `reps_per_set` array and an explicit `load_value`/`load_unit="kg"`.
- Normalized execution requires identifiable, unique completed sets with explicit `reps` and `load_kg`; uncertain or per-side sets remain unavailable.

Per-exercise deltas include source references and the actual counts/loads used. The aggregate has scope `matched_planned_exercises` and appears only when every planned exercise has comparable evidence. It does not claim whole-session work or infer body-weight load. Canonical zeros survive; null and empty/invalid text stay absent.

RPE comparison requires an explicit plan prescription such as `RPE 7-8` and confirmed session-level RPE on 0–10. Set-level RPE and FIT intensity are not silently converted into session RPE. Unknown qualitative intensity stays unassessed.

## Confirmed feedback

The adapter reads the existing generic `session_metrics.metric_code`, `value_numeric`, `value_text`, `metric_scope`, `source_path` and `confidence` fields. It accepts session-scoped feedback from `manual_entry`, `user_feedback`, `chatgpt_manual_pilot`, `chatgpt_session_correction` or `user_confirmed`, with confidence `manual`, `reported` or `user_confirmed`. Estimates, model interpretation flags and unrelated sessions are ignored.

Recognized semantic metric codes are:

| Metric codes | Value |
| --- | --- |
| `rpe`, `rpe_global`, `session_rpe` | Explicit numeric 0–10. |
| `discomfort`, `discomfort_reported`, `pain`, `pain_reported` | Explicit numeric 0/1 or affirmative/negative enumerated text. |
| `session_completion` | Exact text `completed`, `partial` or `not_executed`. |

These are read interpretations of the existing metric registry, not new database fields or a new mutation endpoint. They qualify only when a user has already confirmed them through an existing explicit capture/correction boundary. Conflicting confirmed metric values remain unknown rather than choosing whichever database row arrives last. Unstructured prose and `coach_interpretation.pain_or_risk_flags` are not treated as confirmed discomfort. Missing discomfort evidence never becomes `false`.

## Temporal health semantics

The athlete profile timezone is authoritative. `Europe/Madrid` is used for the real athlete; host/browser UTC is never used to assign the execution day. An existing valid `training_sessions.local_date` is preferred; an absent date can be derived from `started_at` using the profile timezone.

Daily aggregates cannot prove that a same-day observation preceded a workout. The loader therefore uses:

- `health_before`: the previous athlete calendar date as conservative pre-session context.
- `health_after`: the first athlete calendar date after execution **end**, or after its execution date if an end timestamp is absent.

An overnight workout during a DST change can therefore have its post-session date two calendar dates after its start. A not-yet-arrived post date stays absent. Both fields declare `temporal_scope="calendar_day"`; they do not claim an immediately-before or immediately-after measurement. A family only appears if it is current for the requested historical reference date. Old carried-forward families, future dates and legacy health/readiness versions are withheld.

Post-session HRV/resting-HR comparisons reuse the readiness factor's own rolling 28-day personal baseline with at least seven prior unique evidence dates. For example: “La HRV registrada después de esta sesión está por debajo de tu baseline personal; no permite atribuir una causa.” `causal_claim=false` is explicit. V1 does not diagnose illness, infer a contraindication or state that the workout caused a subsequent change.

## Adaptation Proposal V1

The action vocabulary is `keep`, `reduce`, `increase`, `move`, `recovery_bias`, `no_change`. V1 produces:

| Evidence | Proposal |
| --- | --- |
| Confirmed discomfort | `recovery_bias`. |
| Confirmed session RPE above its explicit planned range | `reduce`. |
| Both subsequent HRV and resting-HR adversely differ from their personal baselines | `recovery_bias`, with association-only reasons. |
| Confirmed/persisted completed execution without a stronger signal | `keep`. |
| Insufficient adaptation evidence | `no_change`. |

The core does not automatically escalate an athlete after one session, infer a reason for a shorter session, or choose a new time/location. `increase` and `move` are reserved contract values, not produced by this algorithm. For `reduce`/`recovery_bias`, the earliest owned uncompleted plan on a strictly later calendar day within the loaded future window is identified as a review candidate. Same-day sessions are not labelled future without proven timing. There is no automatic change in duration, load, status, location or schedule.

Applying any proposal still requires a later explicit user action through the existing authenticated, server-validated Coach Actions: move, cancel, adapt duration/environment, or adapt remaining week. This loader and domain module cannot call them, and expose no write methods.

## Coverage, traceability and limitations

Default assessments cover the previous seven calendar days through the reference date, with five results. A caller may request a validated range of at most 31 days and at most 20 results. The next seven days provide future review candidates. The loader returns `scope_coverage` on assessments and lists truncation/read limitations in `missing_evidence`; it never calls a bounded result the complete training history.

Structural and exact-link reference reads are batched and paginated in deterministic 200-row pages, below the local PostgREST 1000-row API cap. At 2000 rows without a terminal page, the source is withheld and `*_coverage_truncated` is explicit; partial set inventories never become complete volume and incomplete link checks never establish unique completion. Health is evaluated for at most the three latest linked executions in the bounded result, with results cached by evidence date; older assessments retain plan/execution/feedback facts and expose `health_assessment_coverage_limited`. This prevents a large history query from multiplying all canonical health-source reads without bound. A future shared multi-date health repository can replace this cap while retaining the same contracts.

Source and metric IDs, planned/observed values, dates, version constants, baseline observations and safe provider provenance allow reconstruction of derived deltas and recovery comparisons. Health retains per-field canonical sources: a Body Battery point and a daily charge/drain summary are not attributed to the same row. Point observation instants and calendar aggregate scope remain explicit. Raw FIT/provider envelopes, conversation payloads, model output, credentials and tokens are never forwarded. Derived assessments/proposals are calculated on read and not persisted. No available existing confirmed snapshot contract was reused for storage; designing persistence and retention is a separate review, not an implied migration in this epic.

Unsupported existing normalized training tables or grants are reported as unavailable, with no attempt to add permissions. V1 intentionally does not interpret unknown JSON, infer missing exercise names/sets, compare ambiguous units, parse free-text pain, estimate exercise load, perform fuzzy plan linking, choose future plan changes, or rewrite original FIT records.

## Verification

`tests/closed-loop-v1.test.mjs` covers canonical completion/partial/unknown/nonexecution, duration boundaries and zeros, confirmed feedback and conflicts, canonical exercise volume/set lineage, ambiguous structures, wrong-user/foreign identity, date-window duplicate links, no mutation, canonical baseline version/date checks, stale/future health, midnight/DST in Madrid, bounded loader coverage and reproducibility. `tests/coach-closed-loop-v1.test.mjs` checks deterministic Coach integration and unapplied proposals. Local Supabase E2E verifies canonical health, an exact linked FIT execution, confirmed semantic feedback, Coach replies, and unchanged persisted plan/FIT state.
