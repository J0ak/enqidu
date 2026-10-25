# #105 — ENQIDU Conversational Coach V2

Base audited: `49c719c4fe5c0585ad431997a811b592b9dd344b` (`origin/main`, fetched before implementation).

## Audit and boundaries

`coach-reply/index.ts` previously loaded the broad Coach context and Health for
all non-correction queries, then used `detectCoachIntents` and the deterministic
renderer. `coachCards`, `trainingTrend`, the Tools adapter/runtime/registry,
`localLanguage` contracts/router/fallback/evals and `coachTools` action routing
were reviewed. Existing morning/daily, weekly dashboard, closed loop, equipment,
recommendation, preview and confirmation paths remain available.

Read-only production metadata inspection on 2026-10-24 verified the existing
canonical columns used by #104 and `profiles.timezone`. `conversations` has
`id/user_id/title/timestamps`; `messages` has `conversation_id/user_id/role/content/
metadata/timestamp`. Aggregate-only inspection found one conversation and zero
messages. The first-party chat does not read/write either table; it uses
`useCoachMessages` and `enqidu.messages.v2:<authenticated account>` in localStorage.
No message content or sporting values were inspected in production.

We reuse that actual active storage instead of introducing a second persistence
mechanism or a migration. Each assistant response may carry an explicit,
versioned `conversation_focus`. The client searches at most eight recent message
entries for the latest reference; it transmits only the reference object, not
stored message prose or cards. A null focus is a context reset. Existing account
isolation, reload persistence and late-response protection remain in place.
This is same-browser continuity; cross-device chat sync is deliberately not added.

## Architecture

```text
message (max 4000 characters)
  → existing semantic correction / explicit action routes
  → localLanguage/conversationParser: deterministic language slots + calendar dates
  → coachConversation/interpreter: closed intent + validated reference context
  → coachConversation/planner: dependency stages, at most four read calls
  → coachConversation/execute: shared ENQIDU registry/runtime
  → semanticRead + Progress/catalog/canonical session domain
  → authenticated Supabase reads
  → coachConversation/renderer + quality: answer blocks and existing card UI
```

No new SQL/RPC in Coach, no independent Progress/Exercise service, no generic
query tool, no model calls, no database migration and no new MCP tool. Existing
optional OpenAI code is unchanged and unreachable for handled V2 replies.

## Closed intent and focus contracts

`coach_conversation_v2` has exactly: `version`, `intent`, `subject`,
`temporal_scope`, `comparison`, `requested_metrics`, `reference_resolution`,
`clarification`, `tool_plan`. Nested objects also reject extra fields. Tool IDs,
metrics, intents and clarification reasons use enums. Intents cover overview,
exercise progress/history/last practice/best observation/missing data, session
detail/recent training, comparison, today/week plan, Health/readiness, semantic
correction and unknown.

Focus contains only version, canonical exercise code, session ID, session date,
period, intent and comparison basis. It contains no sports facts, metrics,
credentials, user ID or tool permission. Treat it as untrusted, just like an
explicit user query. Re-resolve exercise codes against the current catalog;
re-check session ownership/execution via the shared runtime on every request.
An ambiguous new exercise clears the previous identity. Failed new queries do
not silently retain a different exercise as their focus. No server singleton,
LLM memory, hidden transcript or browser timezone participates in resolution.

## Language and calendar

The V2 parser is exported by `localLanguage/router.js`; the existing V0 router,
optional lab parser and its action contract remain intact. Parsing never reads
sports data. It recognizes natural Spanish, accent/case variation, abbreviations
already in the catalog, bounded colloquial forms and follow-ups. Two closed
lexical expansions are explicit: `dominadas altas → dominada alta` and
`pike elevado → pike push-up elevado`. These produce query text only: the Tools
resolver must still establish an exact active code/name/alias. There is no
substring/fuzzy canonical identity or assignment from a language slot.

Calendar input comes from the runtime's authenticated `profiles.timezone` and
request instant. Calendar arithmetic uses ISO days, including DST boundaries.
Supported scopes: today/yesterday, current/previous Monday-based week, month to
date, last 4/12 **completed** weeks, since a named month, year to date, explicit
ISO/Spanish dates and the most recent named weekday (including today). A named
month without year means its most recent past occurrence. Future dates, invalid
dates and ranges exceeding 366 inclusive days require clarification.

Exercise progress defaults to the last 84 days including today; last practice
and best observation default to 366 inclusive days. The answer states the
window; no all-time claim is made. Follow-ups retain the period, replace the
exercise or move to the immediately preceding equal-length period. “La anterior”
after last practice searches before its last known day; after a selected session
it selects the previous entry in a bounded recent-session list. No inference of
within-day temporal order is made when timestamps are unavailable.

## Planner and shared tool extensions

| Question | Calls |
|---|---|
| Exercise progress, frequency, missing data, best | exact resolver → exercise progress |
| Last practice / observation history | exact resolver → exercise history |
| Overall period | training overview |
| Equal-window comparison | two training overviews in one `executeMany` batch |
| One day's activity | recent training; detail V2 only for one unambiguous session |
| Session follow-up | re-read list for exact title selection, or owned detail by ID |
| Today plan | plan only when persisted; otherwise athlete + Health in one batch for the existing recommendation |
| Health | existing plan/athlete/Health tools and established Coach renderer |
| Recovery / readiness | Health tool, including canonical readiness and the original metric-specific renderer |
| Week plan | existing week plan tool |

Unknown/invalid scope: zero tools. Ambiguous exercise: one resolver call, no
progress call. Search candidates never authorize an identity, including a lone
candidate for “algo RDL”. A full exact catalog-name answer can resolve a pending
clarification. Session selection uses an exact normalized displayed title;
it does not infer activity identity from fuzzy text. Multiple activities are
listed separately and never summed into one session.

Backwards-compatible additions to existing #104 tools:

- Progress/overview accept optional paired `from/to`, validated in Progress.
  Existing `period` behavior is unchanged; explicit ranges return `period=range`.
  Range reads omit the weekly dashboard's 52-week record baseline and unrelated
  history; they share canonical aggregation, identity and persisted plan links.
- Exercise progress adds metric coverage and best compatible observed sets.
  `bestCompatibleObservation` lives in Progress and compares only within an
  existing variant. A higher load without reps cannot erase a lower compatible
  observation. No 1RM formula or absolute-record inference.
- History adds opt-in `order` and a truthful `has_more` flag for bounded summaries.
  Legacy callers without `order` retain overflow errors. New descending reads
  stop once a full scanned chunk establishes enough observations. Limits: 366
  days, 1,000 session references, 5,000 exercise rows, at most 50 returned
  observations (Coach requests 5 or 20); overflow is explicit, not a false zero.
- Existing runtime output byte bounds and Progress page/row limits still apply.

## Rendering and invariants

Composition uses headline, canonical evidence, interpretation, limitation and
an optional useful next step. Domain `trend` alone authorizes an improvement
statement; additional sessions/volume do not. Coverage distinguishes zero from
missing, and keeps incompatible variants separate. Best answers say “Mejor
registro conocido”, cite the observation date and selected period, and explain
partial coverage. Session detail shows canonical modality, duration, blocks,
sets/reps/load where known; skipped/planned rows never become execution.
Unknown identity remains unknown. Notes are not consumed as instructions.

Cards reuse `CoachInlineCard` with exercise metrics and activity links; no UI
redesign. Internal identifiers remain in action/reference payloads only, never
answer text. Existing Health/readiness and persisted-plan precedence remain;
there is no diagnosis, autonomous replanning or new apply action.

Handled V2 responses keep `answer/cards/response_mode/llm_used/usage/
request_date/calendar_timezone/date_source`. They always use `deterministic`,
`false`, `null`, and `profile_timezone`. Additive fields are conversation version,
validated reference focus, status and intent ID. `needs_clarification` and
`unavailable` are deterministic HTTP-200 product states with explicit copy.

Correction priority also fixes two old routing gaps: numeric-period questions
are not metric corrections, while “Ayer hice RDL 3x8 a/con 45 kg” reaches #103
materialization and its existing session-selection/preview/confirm flow.
No writer, evidence authority or apply contract is replaced.

## Security, cost and limitations

Only JWT identity supplied by `auth.getUser()` scopes reads. Client `user_id`,
notes, titles, messages and focus cannot alter query construction, tools or
permissions. No dynamic SQL, client service role, remote write, OAuth/MCP
refactor, FIT/Garmin transport change or backfill.

Telemetry is restricted to conversation version, intent, tool IDs/count,
clarification flag, deterministic mode, duration and status. No text, metrics,
identity, JWT or sensitive error payloads. Telemetry failures are nonfatal.

Incremental cost: **€0.00**. Existing local compute/tests only. OpenAI remains
disabled; no model, embeddings, external NLP, hosting or DB service added.

Residual limits: bounded deterministic grammar, exact catalog coverage,
same-browser storage, exact displayed-title session selection and explicit
resource ceilings. A last-practice window is not lifetime history. Cross-device
persistence, generic memory and Adaptive Planning V2 belong to separate work.
