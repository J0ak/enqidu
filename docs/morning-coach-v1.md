# Autonomous Morning Coach V1

`runAutonomousMorning` is one server operation: authenticate/profile → Garmin today
and yesterday → new canonical read domain → Health/Readiness → yesterday execution
and Closed Loop (including cross-day persisted execution links) → today's persisted plan, next six days and availability → brief.
It returns `autonomous_morning_v1` with ingestion, brief, morning_error_code and `applied:false`. If post-ingestion reads fail, the committed ingestion report remains available, brief is null and the safe error/warning is `morning_read_unavailable`; HTTP returns that report with 503. No fabricated empty brief replaces a failed read.
The domain can run now with a test transport. Autonomous production delivery remains
blocked on the real server-callable connector; the scheduler is deliberately disabled.

`get_morning_coach_brief` is a **read**, does not ingest, and cannot apply a plan.
`morning_coach_brief_v1` includes date/timezone, policy_version, health_status,
readiness, yesterday_execution (including truncation flag), today_plan, upcoming_plan,
recommendation, adaptation_proposal, reasons, readiness_reasons, evidence_freshness,
action_required, review_action, explanation, and `applied:false`.

## Deterministic policy v1.0.0

Persisted plan always wins. Completed/linked/cancelled sessions are not candidates.
No active plan means NO_CHANGE; the morning policy does not create a replacement.
Unavailable today means REVIEW_REQUIRED without a preview action.

Current adverse signals: sleep <6 hours, provider sleep score <50, stress average
≥60 or usable existing Readiness <40. These are conservative product heuristics,
not medical claims and not a new readiness algorithm. Real zero counts as observed.

- Fresh sleep+HRV+stress, valid Readiness and no adverse signals: KEEP.
- Incomplete/stale/absent evidence without an actionable current signal: REVIEW_REQUIRED.
- One existing exact-link reduction/recovery proposal: REDUCE/RECOVERY_BIAS and
  existing `preview_closed_loop_proposal`, only for one persisted planned target.
  Discomfort, unavailable/ambiguous targets, multiple proposals or truncated yesterday execution require contextual review.
- Otherwise one active persisted session and a current adverse signal: REDUCE with
  existing `preview_adapt_duration`, reducing the lower duration bound by 20%,
  rounded down to 5 min, minimum 10. Example: 60 →45 min. Multiple sessions or
  unsupported duration bounds remain REVIEW_REQUIRED.
- Never increase, move, cancel or apply autonomously.

Health-only reduction is a preview request, not a fabricated Closed Loop proposal.
`adaptation_proposal` contains only a genuine existing adaptation_proposal_v1 or null.
Preview reloads canonical state; apply requires explicit confirmation plus the
existing fingerprint/expiry and server validation. This is the same App/Tools flow.

## Freshness

`fresh`: current canonical sleep, HRV and stress and no Health read issues.
`partial`: some current families, missing required families or read issues.
`stale`: only prior-day evidence; dates remain explicit, limited_prior_context=true.
`absent`: no evidence. Yesterday never substitutes for today's recovery score.
Optional missing SpO2/respiration/battery remain listed even in a fresh brief.
Freshness is date-based and distinct from signal sufficiency: no HRV baseline is
invented. Existing Readiness requires its own minimum factors and baseline policy.
No "recovered" claim is emitted merely because a score or current date exists.

## Coach UX / channels

"Buenos días", "resumen de hoy", "morning brief" select the deterministic read in
coach-reply, including when the optional LLM flag is enabled. The text names the
persisted plan and explains evidence limits. An actionable proposal shows
**REVISAR CAMBIO**, which opens the existing preview. Acceptance remains a separate
explicit action. No unsolicited notification, push service or scheduled message.
MCP sees both new reads; its write capability remains disabled by default.

## Validation and rollout

Tests include good/low sleep, partial, stale, absent, unavailable/no plan,
owner isolation, no mutation on read/preview, provider enforcement, retry,
duplicates, correction, stale response, real zero and Madrid DST/day boundaries.
The local E2E uses the sanitized live-shaped fixture and actual Auth/PostgREST/RPC,
Health, Readiness, Morning, existing preview and optional explicit apply; historical
execution/FIT snapshots must be unchanged.

See [ingestion, scheduling investigation and rollout](garmin-daily-ingestion-v1.md).
No migrations or production deployment. Rollback is application revert, keeping
canonical Health observations. Next epic: audit/implement the actual zero-cost
consented connector transport and only then enable a reviewed scheduler.
