# Readiness V1

`readiness_v1` is an ENQIDU recovery index derived from canonical Health Evidence. It is independent of the LLM and of the removed invented frontend readiness. Algorithm version: `enqidu.readiness.v1.0.0`. `calculateReadiness` is pure and deterministic for the same evidence, history and explicit generation instant. The [DTO declarations](../src/health/readinessV1.d.ts) and [Health Evidence contract](health-intelligence-v1.md) are shared by App, Coach, Closed Loop and future Tools/MCP.

## Contract and evidence threshold

```ts
{
  schema_version: "readiness_v1",
  algorithm_version: "enqidu.readiness.v1.0.0",
  calendar_date: string | null,
  timezone: string | null,
  status: "available" | "partial" | "unavailable",
  score: number | null,
  confidence: "none" | "low" | "medium",
  minimum_usable_factors: 2,
  factors: [{
    metric, observed_value, baseline, factor_score, weight, contribution,
    evidence_date, provenance, source, reason, reason_code
  }],
  evidence_dates: string[], provenance: HealthProvenance[],
  missing_relevant_data: string[], generated_at: string | null
}
```

A score requires at least **two usable current metrics**, with sleep score and sleep duration counting as alternatives to the same sleep factor. No evidence or only one usable metric produces `status="unavailable"`, `confidence="none"`, `score=null`. The single candidate factor may still be returned for audit, with `contribution=null` because there is no aggregate score. Two usable factors give `partial/low`; three or four give `available/medium`. Wearable factors can correlate, so this coverage indicator is not a statistical confidence probability and V1 never declares high clinical confidence.

A family's own date/freshness governs eligibility; fresh sleep cannot legitimize stale HRV or Body Battery. Explicitly `estimated`, `calculated`, `ocr_unverified` or `unknown` confidence cannot enter either current factors or the baseline. Values with absent legacy confidence preserve that absence; they are not relabeled as reported. Invalid measurements and future dates/as-of samples are excluded. Valid zero remains measured zero; it can produce a real score of zero only when two measured factors support it. A score of 50 is possible from actual measured factors; it is never inserted as a missing-data default.

## Personal baseline

For HRV and resting heart rate, take the median of **at least seven unique prior athlete calendar dates within the preceding 28 calendar days**: `[target_date - 28, target_date - 1]`. The target date and future observations are excluded. Sparse history outside that range never completes the baseline. No universal rule such as HRV above 50 ms or resting HR below 60 bpm is used.

Multiple agreeing observations on one date count once. Conflicting observations on one date are excluded. Explicitly stale/invalid/unavailable observations are excluded. Historical observations inside the window are assessed as observations of their own day, not reclassified as stale merely because they are more than two days before today; otherwise seven observations could never exist. Baselines are not forward-filled. Valid zero HRV is retained in the median, but a zero baseline cannot support a relative calculation and explicitly yields `hrv_nonzero_baseline` missing evidence.

Each baseline returns the median, observation count, method, window/minimum, inclusive date bounds and the exact dated values with safe provenance/source references. RHR may come from the canonical daily or independent heart-rate envelope, or marked sleep scope when the daily evidence is absent. HRV comes from nightly summaries or canonical sleep HRV. If sleep score is absent, canonical sleep duration can use the same personal 28-day/7-observation policy; no population sleep target is invented.

## Exact scoring policy

Let `clip(x)` bound `x` to `[0,100]`, and `b` be the positive personal median. There is at most one factor from each row below.

| Factor | Factor score | Weight |
| --- | --- | --- |
| Observed provider sleep score | canonical `sleep_score` on its existing 0–100 scale | 3 |
| Sleep-duration fallback when sleep score is absent | `clip(50 + 100 × (duration / b - 1))` | 3 |
| Observed provider Body Battery current | canonical `current` on its existing 0–100 scale | 1 |
| HRV relative to personal median | `clip(50 + 150 × (HRV / b - 1))` | 2 |
| Resting HR relative to personal median | `clip(50 - 300 × (resting_HR / b - 1))` | 2 |

A personal factor's 50 midpoint describes a measured ratio of exactly one. It does not substitute for an absent observation or baseline. Factor scores and contributions are rounded to three decimals. The final score is the rounded weighted mean of the available factor scores; the same canonical inputs reconstruct it. Each factor's `contribution` is its score times its normalized weight. Baseline dates join current dates in the result's evidence dates. Spanish explanations and stable reason codes support both user-facing explanation and audit.

Example: sleep score 80, Body Battery 70, HRV 44 against median 40, and resting HR 58 against median 60 produce factor scores 80, 70, 65, 60. `(80×3 + 70×1 + 65×2 + 60×2)/8 = 70`. Four usable factors yield available status and medium coverage confidence.

**These weights, slopes and minimums are explicit engineering policy for a reproducible V1 index. They are not clinically validated calibration, diagnostic thresholds, a causal model, or proof that an athlete should/should not train.** Changes to them require an algorithm version change and corresponding evals. Stress, SpO2 and respiration remain observed context rather than speculative medical readiness deductions; Body Battery charge/drain never substitutes for current.

## Plan authority, traceability and limitations

A persisted training session always wins over any recommendation. Readiness adds an explanation and can inform a deterministic recommendation when there is no plan; it cannot write, move, cancel, reduce or increase a session. Adaptation proposals use the existing explicit Coach Action boundary only after a later user action.

Returned factors include current values/dates, personal median and its exact input snapshot, missing relevant evidence, safe source references, schema/algorithm versions and generation time. This supports reconstruction of the returned calculation even if future canonical corrections change the live source. V1 does not persist readiness snapshots; historical reproduction requires retaining the returned input/result or using retained source revisions. Durable audit retention/calibration requires a later reviewed architecture decision; no new persistence or migration is introduced here.

The index is incomplete when evidence is missing and excludes an ineligible metric rather than fabricating it. Missing sleep, HRV or Body Battery can still allow a partial score from two other usable metrics. One signal never suffices. There is no illness/injury inference, medical contraindication, or claim that a workout caused later biometric change.

Validation covers current/stale/partial/zero/null evidence, insufficient baseline, personal baselines, missing families, user isolation, duplicates/conflicts, temporal window/as-of boundaries, Madrid midnight/DST, deterministic output, versioning and per-factor explanations in `tests/health-intelligence-v1.test.mjs`. Runtime security canaries are in `tests/health-intelligence-security.test.mjs`; local Supabase E2E verifies canonical reads, deterministic Coach and an unchanged persisted plan.
