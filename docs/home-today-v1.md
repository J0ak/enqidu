# Home / Today V1 — Epic #99

Base: `origin/main` at `0309b464c4aa5aeaa7e377e9aab8aea3361bab19`.

## Product experience

Home is the default route at `/` and `#/home`, including after an explicit
login from Profile. Existing `#/coach`, `#/health`, `#/activities`, Profile and
detail routes retain their behavior. Restoring a session on an existing deep
link does not force navigation to Home. The navigation rail adds **Hoy**;
**Coach**, **Salud**, **Actividades** and **Perfil** remain accessible. Plan
opens the existing Activities calendar.

The 390 px layout is a single column of rounded dark cards with a lime accent:

1. **HOY**: profile-local date/timezone; large readiness score (or a dash),
   complete/partial/stale/missing Health badge, the canonical decision and short
   explanation, persisted session title, and **Ver / revisar propuesta** only
   when the morning contract provides a review action.
2. **Tu entreno**: persisted sessions, explicit planned rest, duration/intensity
   and detail links. An empty plan is labelled as absent, never replaced by an
   invented or unsaved recommendation.
3. **Coach**: a clear route to the existing review/preview/confirmation UI.
4. **Esta semana**: canonical linked completion count, progress bar, planned,
   upcoming and past-unconfirmed counts. Unknown execution is not called missed.
5. **Recuperación**: the existing seven-day direction and explanation, seven
   readiness bars with missing/partial/stale treatment, and manual Health access.
6. **Ayer**: canonical planned/executed comparison, observed duration and
   activity links. Exact canonical IDs connect details, never titles or dates.
7. **Quick actions**: manual Health update and latest recorded activity.

At wider widths cards use two columns while the hero spans the width. The
navigation stays reachable on mobile. Loading is textual and bounded; errors
have retry actions. A failed weekly request leaves the daily brief available.
A failed daily request can still show independently available weekly progress.

## Existing contracts, no new domain engine

`src/home/loadHome.js` coordinates exactly two existing no-argument tool reads:

- `get_daily_coach_operating_brief`: today, canonical Health/Readiness, persisted
  plan, morning decision, yesterday comparison, recent training and trend.
- `get_week_plan`: the weekly period and **already computed** `progress`.

The weekly progress is absent from the daily contract; this is why the second
existing read is necessary. Home does not calculate readiness, policy, trend,
completion status, calendar days or weekly counts. The progress element renders
the returned numerator/denominator. Duration formatting is presentation only.

Each request has a 15-second UI deadline. A late response cannot mutate the
returned snapshot. A week with a different date or timezone from the brief is
rejected as unavailable rather than mixed across a midnight/profile change.
The hook refreshes on foreground return, explicit retry/refresh and the next
midnight computed by the existing profile-calendar utility. It performs no
background synchronization or periodic polling.

State is scoped to the authenticated user. User changes/unmounts invalidate
pending results; Home has no persistent cache. Existing backoffice table reads
are deferred until another view needs them instead of competing with Home's
coordinated initial load.

Opening an activity reuses `fetchTrainingSessionsForActivities` with exact
session ID and authenticated owner filters, followed by the existing detail
loader. This fetch happens only on an explicit click: the brief intentionally
omits FIT/session structure needed by the existing full detail view. It adds no
endpoint, new table query contract or writer. A changed identity invalidates
pending detail navigation. Planned details use the existing calendar adapter,
including the blocks returned by the canonical plan projection.

## Proposals, security and cost

Home's proposal CTA navigates to Coach. The existing **Revisar propuesta de hoy**
button requests the preview, and the existing explicit confirmation is still
required to apply it. Opening Home or its proposal link never calls a preview
or apply tool. No proposal arguments supplied by a model are persisted here.
The reused daily brief may record its existing server-side decision-history
event; this is existing behavior, not a new Home writer or a plan mutation.

No database migrations, Edge Function changes, grants, RLS changes, backend
secrets or direct client writes are introduced. Tool authentication and tenant
isolation remain on the server; no client user ID or timezone enters tool args.
FIT ingestion and records are unchanged. Fitness AI transport stays UNAVAILABLE,
scheduler DISABLED, automatic Garmin sync inactive, MCP writes DISABLED.

Incremental cost: **0,00 €**. Existing deterministic reads and local tooling only;
no LLM calls, paid APIs, new plans, paid capacity or infrastructure. The new
landing uses existing service quotas; this PR does not authorize paid scaling.
No production deployment or production data changes were performed.

## Validation and limitations

The Home browser scenario uses disposable local Auth/PostgREST/Edge/PostgreSQL
users and real canonical ingestion, plans and execution links. It checks
Madrid while the browser uses Los Angeles, login landing, navigation/details,
weekly values, no automatic preview/apply, explicit Coach preview without apply,
manual Health access, 390 px overflow, logout/login isolation and deep links.
Presentation variants intercept real contract-shaped responses to exercise all
Health states, four decisions, rest/no plan, yesterday comparison states,
loading and partial/error states. Persistence assertions are never mocked.
Loader tests cover bounded waiting, zero preservation, partial failures,
calendar mismatch and late responses without introducing duplicate domain rules.

The screenshot generated by the browser test is
`test-results/home-today-390.png` (disposable local test data; not product seed
content). Production smoke verification is deferred because deployment is out
of scope. Existing >500 kB JavaScript bundle warning remains. No new provider
attestation or medical interpretation is implied by the cards.

## Files

- `src/main.jsx`: landing/navigation, lazy legacy loading and existing detail adapters.
- `src/components/HomeToday.jsx`: product presentation and existing-route actions.
- `src/components/HomeToday.css`: mobile-first cards and responsive layout.
- `src/home/loadHome.js`: two-read composition with bounded failure handling.
- `src/home/useHome.js`: user-scoped lifecycle and profile-local rollover.
- `tests/home-today.test.mjs`: composition/failure regressions.
- `e2e/home-today.spec.js`: full browser story and presentation states.
- `docs/home-today-v1.md`: architecture, UX, validation and limitations.

### Executed results (Node 22, local only)

| Check | Result |
| --- | --- |
| Full `npm test` | 688 passed, 0 failed, 0 skipped |
| Coach contract evals | 27 passed |
| PostgreSQL transactional suite | 33 passed, 0 skipped |
| Full Chromium E2E suite | 34 passed (2.7 minutes), including existing Coach/Health/Activities regressions |
| Production build | Passed, 1,673 modules |
| `git diff --check` | Passed |

An earlier E2E run overlapped the CPU-heavy unit suite and had two transient
local Edge failures (503/aborted response); runtime logs recorded worker CPU
recycling. The complete E2E suite passed when repeated without that concurrent
load. No production settings, limits or runtime code were changed to obtain the
passing result. Build retains the existing chunk-size warning (548.17 kB JS,
167.93 kB gzip).
