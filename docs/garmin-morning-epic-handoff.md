# Garmin daily ingestion + autonomous Morning Coach V1 — handoff

> Updated 2026-10-13: see [runtime/terms evidence](fitness-ai-runtime-audit.md) and [owned sync implementation](garmin-owned-sync.md). Paid personal developer access now exists; no verified free multiuser runtime is available. The new consent migration and concrete disabled binding supersede the prior `sourceForUser=null` state.

Production automation is **not enabled**. The native server capability and read/UX
flow are implemented; the actual Fitness AI server transport is an explicit rollout
blocker. No production resources, deployments, credentials or schedules were changed.

## Delivery checklist

1. **Architecture:** one GarminSource → existing GarminAdapter → fixed Foundation
   RPC → wearable_* → existing Health/Readiness/Closed Loop → Morning → preview /
   explicit existing apply. No second Health pipeline.
2. **Branch:** `feat/garmin-daily-ingestion-morning-coach-v1`, created from latest
   origin/main `ffde3e2b8eb275139fa6b99d62d1f2107379a238`.
3. **HEAD:** use the final PR head / delivery response (this tracked file cannot
   self-reference its own commit hash).
4. **Commits:** product/server/Tools/Coach implementation and verification/docs;
   exact hashes are in the delivery response and PR history.
5. **PR:** one coherent PR against main; no merge or deployment by Codex.
6. **Files:** server batch/orchestration/handler + disabled Edge entrypoint;
   morning/status read models; existing Tools registry/schemas/read domain/runtime;
   deterministic Coach adapter/reply and App review button; regression/unit/E2E
   tests; four architecture/product docs plus this handoff. No FIT/parser changes.
7. **Ingestion:** `_shared/garminDailyIngestion.js`; default today+yesterday, server
   window 1–7 days, at most 4 pages/day ×100 records. Safe versioned report.
8. **Transport:** injected GarminSource; Fitness AI transport remains external to
   domain. Live-shaped sanitized fixture is used for local verification only.
9. **Provenance:** exact garmin / aggregator / fitness_ai_connector enforced;
   official_api spoof rejected by this provisional daily service.
10. **Families:** daily_health, sleep, hrv, stress, body_battery, spo2, heart_rate,
    respiration; absence is not zero; FIT/activity samples excluded.
11. **Idempotency:** existing RPC owns dedup, same-fact refresh, corrected revision,
    ignored stale and independent family snapshots. No client-side replacement.
12. **Retry:** max3, 100/200ms backoff, only allowlisted transient failures. No queue.
13. **Freshness:** fresh/partial/stale/absent; yesterday is explicitly limited context;
    no prior-day readiness impersonates today's evidence; no invented baseline.
14. **Morning contract:** `morning_coach_brief_v1` / policy v1.0.0. Includes persisted
    today/upcoming plan, availability, yesterday execution, readiness, explanation,
    evidence dates, proposal/review request and applied=false.
15. **Policy:** KEEP / REDUCE / RECOVERY_BIAS / NO_CHANGE / REVIEW_REQUIRED only.
    Current adverse signals may suggest bounded duration reduction. No automatic
    increase, move, cancellation or apply. Existing exact links determine Closed Loop.
16. **Coach:** morning greeting/brief requests are deterministic even if the optional
    LLM flag is on. REVISAR CAMBIO opens the existing preview.
17. **Tools:** two no-argument reads; 11 reads, 6 previews, 6 existing writes.
    MCP writes remain disabled. No ingestion or generic provider-write tool.
18. **Scheduling research:** repo's current config, Vercel Cron pricing/security,
    Supabase Cron/Free pricing, and GitHub Actions billing; source links and limits
    are recorded in garmin-daily-ingestion-v1.md.
19. **Chosen scheduler:** none enabled. Connector server transport/consent binding is
    unavailable; project quotas are not inferred. Domain invocation is ready.
20. **Security:** reject public ownership/table/RPC/URL/timezone injection; verify
    JWT and persisted profile; service role only inside Edge/server helper; strict
    source/canonical/provenance validation; safe bounded body/report/telemetry;
    existing Foundation RLS and browser mutation denial exercised.
21. **Timezones:** Madrid midnight, UTC boundary, LA process/browser, distinct source
    offset, spring23h/fall25h. Profile identity is mandatory for the server operation.
22. **Duplicates/corrections:** actual migration/RPC tests use a live-shaped source:
    repeat unchanged, newer same facts unchanged, correction updated, older ignored,
    real zero kept, absent families retained.
23. **Unit suite:** see the final validation results below.
24. **Coach evals:** see below; includes morning deterministic/no-mutation invariant.
25. **Tools tests:** see below; schemas, ownership, previews and shared read cache.
26. **MCP tests:** see below; real SDK descriptor/read/preview gates, no enabled writes.
27. **Build:** see below. Existing >500KB chunk advisory is non-blocking.
28. **E2E:** sanitized observed connector shape → source → real local RPC / wearable
    persistence → Health / Readiness → Morning → App review button → no-mutation
    preview → explicitly accepted existing action; FIT/history snapshots unchanged.
29. **Migrations:** none. Existing migration is reused only in disposable local DB.
30. **Production impact:** none from Codex; no prod SQL, secrets, Edge/Vercel deploy,
    cron, queue, cloud branch or paid OpenAI call.
31. **Rollout:** review/merge; normal read-only UI/Tools rollout; audit real transport /
    consent; one authenticated manual run; duplicate/correction check; independently
    verify Free quotas before approving any scheduler.
32. **Rollback:** revert app/function release and keep scheduler disabled; preserve
    canonical observations and plan/FIT history. No schema reversal needed.
33. **Cost:** €0.00 incremental services enabled by this change. No billing plan or
    infrastructure expansion. Future scheduled execution is not claimed free until
    transport entitlement and actual account quotas are verified.
34. **Debt/limits:** real transport, provider deadlines/revision metadata and consent
    lifecycle; intra-family snapshots are complete under existing RPC semantics;
    source-envelope parsing failures mark page coverage failed; durable failed-attempt
    history is unavailable (imports derive successful watermarks only); native Edge
    dependency loading/deployment needs rollout smoke verification; no notifications.
35. **Next epic:** production-ready zero-cost Fitness AI transport/connection ownership
    and consent lifecycle, then an explicitly reviewed schedule and operating SLO.

## Validation results

Verified with Node 22.23.3 and disposable local Supabase; OpenAI disabled.

| Command | Result |
| --- | --- |
| `npm run setup:cloud` | Passed during initial environment setup |
| `npm test` | 641/641 passed |
| `npm run test:coach-evals` | 26/26 passed |
| `npm run test:tools` | 95/95 passed |
| `npm run test:mcp` | 32/32 passed |
| `npm run test:garmin-ingestion` | 7/7 passed |
| `npm run test:morning-coach` | 7/7 passed |
| `npm run build` | Passed; existing >500KB chunk advisory |
| `npm run test:e2e` | All 30 scenarios passed across initial run + targeted reruns; see caveat below |
| `git diff --check` | Passed |

The focused new E2E passed before the full regression run. The initial full E2E
run overlapped CPU-heavy migration/unit/build checks: 26 passed, three existing
cases timed out at 30 seconds and one existing Coach request returned 503. The
local Edge runtime logged CPU soft limits. Three of four passed with `npm run test:e2e -- --last-failed`; the remaining existing save scenario hit a local 546 CPU limit. After restarting only the disposable Edge container, that final case passed with the same command and default timeout. All 30 scenarios have a passing result; this was not a clean single-pass full run.
No test assertion or repository timeout was weakened.

The initial Supabase startup hit the managed Docker vfs disk limit. Recovery uses the official
PostgreSQL image exported/imported as one layer with its runtime configuration intact,
without changing daemon/storage driver; unnecessary local services are excluded.
Generated local functions use the existing locked-dependency bundler documented in
playwright-e2e.md; generated bundles and local-only credentials are not committed.
