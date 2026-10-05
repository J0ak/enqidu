import test from "node:test";
import assert from "node:assert/strict";
import { buildHealthEvidence, classifyFreshness } from "../src/health/healthEvidence.js";
import { buildPersonalBaseline, calculateReadiness, READINESS_ALGORITHM_VERSION } from "../src/health/readinessV1.js";
import { readFile } from "node:fs/promises";

const provenance = { provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector" };

test("health evidence preserves zero, chooses latest record, and never includes raw payload", () => {
  const evidence = buildHealthEvidence({ calendarDate: "2026-10-05", timezone: "Europe/Madrid", records: { daily: [
    { calendar_date: "2026-10-04", body_battery_current: 80, ...provenance },
    { calendar_date: "2026-10-05", body_battery_current: 0, average_stress_level: 0, raw_payload: { secret: true }, ...provenance },
  ] } });
  assert.equal(evidence.body_battery.current, 0);
  assert.equal(evidence.stress.average, 0);
  assert.equal(evidence.freshness, "current");
  assert.equal(JSON.stringify(evidence).includes("raw_payload"), false);
  assert.deepEqual(evidence.provenance[0], provenance);
});

test("health evidence distinguishes unavailable, recent and stale without inventing fields", () => {
  const empty = buildHealthEvidence({ calendarDate: "2026-10-05", timezone: "Europe/Madrid" });
  assert.equal(empty.status, "unavailable");
  assert.equal(Object.hasOwn(empty, "sleep"), false);
  assert.equal(classifyFreshness("2026-10-03", "2026-10-05"), "recent");
  assert.equal(classifyFreshness("2026-10-02", "2026-10-05"), "stale");
});

test("official Garmin provenance remains distinct from aggregator provenance", () => {
  const evidence = buildHealthEvidence({ calendarDate: "2026-10-05", timezone: "Europe/Madrid", records: { daily: [{ calendar_date: "2026-10-05", provider: "garmin", provider_mode: "official_api", ingestion_channel: "garmin_health_api", resting_heart_rate_bpm: 55 }] } });
  assert.deepEqual(evidence.provenance[0], { provider: "garmin", provider_mode: "official_api", ingestion_channel: "garmin_health_api" });
});

test("authenticated health loader scopes every canonical query to user and excludes raw payloads", async () => {
  const source = await readFile(new URL("../src/health/loadHealthIntelligence.js", import.meta.url), "utf8");
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.doesNotMatch(source, /service.role|SERVICE_ROLE|raw_payload/i);
  for (const table of ["wearable_health_daily", "wearable_sleep_sessions", "wearable_hrv_nightly_summaries"]) assert.match(source, new RegExp(table));
});

test("calendar dates remain deterministic across Europe/Madrid DST boundaries", () => {
  assert.equal(classifyFreshness("2026-03-29", "2026-03-29"), "current");
  assert.equal(classifyFreshness("2026-10-25", "2026-10-26"), "recent");
});

test("readiness requires current evidence and returns null rather than a neutral fiction", () => {
  assert.equal(calculateReadiness({ status: "unavailable" }).score, null);
  assert.equal(calculateReadiness({ status: "available", freshness: "stale" }).score, null);
});

test("readiness uses personal rolling medians and explains every contribution", () => {
  const history = Array.from({ length: 8 }, (_, index) => ({ hrv: 40 + index % 2, resting_heart_rate: 60 + index % 2 }));
  assert.equal(buildPersonalBaseline(history, "hrv").observations, 8);
  const input = { status: "available", freshness: "current", evidence_dates: ["2026-10-05"], sleep: { score: 80 }, body_battery: { morning: 70 }, hrv: { last_night_avg_ms: 44 }, heart_rate: { resting: 58 } };
  const first = calculateReadiness(input, history, { generatedAt: "2026-10-05T00:00:00Z" });
  const second = calculateReadiness(input, history, { generatedAt: "2026-10-05T00:00:00Z" });
  assert.deepEqual(first, second);
  assert.equal(first.status, "available");
  assert.equal(first.algorithm_version, READINESS_ALGORITHM_VERSION);
  assert.ok(first.factors.every((factor) => factor.reason && Number.isFinite(factor.contribution)));
});

test("readiness accepts an observed zero and reports missing personal baselines", () => {
  const result = calculateReadiness({ status: "available", freshness: "current", sleep: { score: 0 } }, []);
  assert.equal(result.score, 40);
  assert.equal(result.status, "partial");
  assert.ok(result.missing_relevant_data.includes("hrv_baseline"));
});
