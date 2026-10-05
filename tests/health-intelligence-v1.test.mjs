import test from "node:test";
import assert from "node:assert/strict";
import { buildHealthEvidence, classifyFreshness, healthCalendarUtcBounds, healthNumber, shiftHealthCalendarDate } from "../src/health/healthEvidence.js";
import { buildPersonalBaseline, calculateReadiness, READINESS_ALGORITHM_VERSION } from "../src/health/readinessV1.js";
import { loadHealthIntelligence } from "../src/health/loadHealthIntelligence.js";
import { resolveUserCalendar } from "../src/time/userCalendar.js";

const provenance = { provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector", data_confidence: "reported" };
const official = { provider: "garmin", provider_mode: "official_api", ingestion_channel: "garmin_health_api", data_confidence: "reported" };
const date = "2026-10-05";
const timezone = "Europe/Madrid";
const generatedAt = "2026-10-05T12:00:00Z";
const row = (values, calendar_date = date) => ({ calendar_date, ...provenance, ...values });
const evidence = (records = {}, extra = {}) => buildHealthEvidence({ calendarDate: date, timezone, records, generatedAt, ...extra });
const history = (count = 8, extra = {}) => Array.from({ length: count }, (_, index) => ({ calendar_date: shiftHealthCalendarDate(date, -(index + 1)), hrv: 40, resting_heart_rate: 60, sleep_duration: 28_800, provenance: { hrv: provenance, resting_heart_rate: provenance, sleep_duration: provenance }, ...extra }));
const healthy = () => evidence({ daily: [row({ body_battery_current: 70, resting_heart_rate_bpm: 58 })], sleep: [row({ sleep_score: 80, total_duration_seconds: 28_800 })], hrv: [row({ last_night_avg_ms: 44 })] });
const canonicalImport = (type, metrics, day = date, extra = {}) => ({ id: `import-${type}`, user_id: "A", observation_date: day, ...provenance, canonical_schema_version: "enqidu.wearable.v1", canonical_data_type: type, canonical_calendar_date: day, canonical_metrics: metrics, canonical_provenance: { ...provenance, ...extra }, ...extra });

function fakeDb(tables = {}, { failing = [] } = {}) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, filters: [], orders: [] }; calls.push(call);
    const query = {
      select(fields, options = {}) { call.fields = fields; call.options = options; return this; },
      eq(field, value) { call.filters.push(["eq", field, value]); return this; },
      gte(field, value) { call.filters.push(["gte", field, value]); return this; },
      lte(field, value) { call.filters.push(["lte", field, value]); return this; },
      lt(field, value) { call.filters.push(["lt", field, value]); return this; },
      order(field, options) { call.orders.push([field, options.ascending]); return this; },
      range(start, end) { call.range = [start, end]; return this; },
      limit(value) { call.limit = value; return this; },
      then(resolve, reject) {
        if (failing.includes(table)) return Promise.resolve({ error: { message: "RAW_SECRET_CANARY" }, data: null }).then(resolve, reject);
        let data = (tables[table] || []).filter((item) => call.filters.every(([op, field, value]) => {
          const actual = field === "normalized_payload->>schema_version" ? item.canonical_schema_version : item[field];
          if (actual === null || actual === undefined) return false;
          return op === "eq" ? actual === value : op === "gte" ? actual >= value : op === "lte" ? actual <= value : actual < value;
        }));
        for (const [field, ascending] of [...call.orders].reverse()) data = [...data].sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (ascending ? 1 : -1));
        const count = data.length;
        if (call.range) data = data.slice(call.range[0], call.range[1] + 1);
        if (call.limit) data = data.slice(0, call.limit);
        return Promise.resolve({ error: null, data: call.options?.head ? null : data, count: call.options?.count ? count : null }).then(resolve, reject);
      },
    };
    return query;
  } };
}

test("health no data and nulls remain absent; valid zeros and canonical names survive", () => {
  assert.equal(evidence().status, "unavailable");
  const result = evidence({ daily: [row({ body_battery_current: 0, average_stress_level: 0, body_battery_charged: 0, spo2_avg_pct: null, body_battery_morning: 99, stress_average: 44, raw_payload: { secret: true } })], sleep: [row({ sleep_score: 0, total_duration_seconds: 0, rem_sleep_seconds: 0 })] });
  assert.equal(result.status, "partial");
  assert.equal(result.body_battery.current, 0);
  assert.equal(result.body_battery.charged, 0);
  assert.equal(result.stress.average, 0);
  assert.equal(result.sleep.sleep_score, 0);
  assert.equal(result.sleep.duration_seconds, 0);
  assert.equal(result.sleep.rem_seconds, 0);
  assert.equal(Object.hasOwn(result.body_battery, "morning"), false);
  assert.equal(Object.hasOwn(result, "spo2"), false);
  assert.doesNotMatch(JSON.stringify(result), /raw_payload|secret/);
});

test("numeric ingestion preserves numeric zero but rejects null coercion, booleans, sentinels and invalid bounds", () => {
  for (const value of [null, undefined, false, true, "", " ", {}, [], -1, NaN, Infinity]) assert.equal(healthNumber(value), null);
  assert.equal(healthNumber("0"), 0);
  const result = evidence({ daily: [row({ resting_heart_rate_bpm: 0, average_stress_level: -1, body_battery_current: 101 })] });
  assert.equal(result.status, "unavailable");
});

test("freshness validates real dates and excludes undated/future observations", () => {
  assert.equal(classifyFreshness(date, date), "current");
  assert.equal(classifyFreshness("2026-10-03", date), "recent");
  assert.equal(classifyFreshness("2026-10-02", date), "stale");
  for (const value of ["2026-02-30", "2026-10-06", null]) assert.equal(classifyFreshness(value, date), "unavailable");
  const result = evidence({ daily: [row({ body_battery_current: 99 }, "2026-10-06"), { ...provenance, body_battery_current: 80 }] });
  assert.equal(result.status, "unavailable");
  assert.throws(() => evidence({}, { calendarDate: "2026-02-30" }));
  assert.throws(() => evidence({}, { timezone: "not/a-zone" }));
});

test("family freshness is independent; fresh sleep cannot legitimize stale HRV or Body Battery", () => {
  const result = evidence({ daily: [row({ body_battery_current: 70 }, "2026-10-01")], hrv: [row({ last_night_avg_ms: 44 }, "2026-10-01")], sleep: [row({ sleep_score: 80 })] });
  assert.equal(result.freshness, "current");
  assert.equal(result.hrv.freshness, "stale");
  assert.equal(calculateReadiness(result, history()).score, null);
  assert.deepEqual(calculateReadiness(result, history()).factors.map((factor) => factor.metric), ["sleep_score"]);
});

test("latest null correction never resurrects a prior snapshot; ambiguous peers are excluded", () => {
  const corrected = evidence({ daily: [row({ body_battery_current: 80 }, "2026-10-04"), row({ body_battery_current: null })] });
  assert.equal(Object.hasOwn(corrected, "body_battery"), false);
  const conflicting = evidence({ hrv: [row({ id: "one", last_night_avg_ms: 40 }), row({ id: "two", last_night_avg_ms: 90 })] });
  assert.equal(Object.hasOwn(conflicting, "hrv"), false);
  assert.ok(conflicting.issues.includes("ambiguous_hrv"));
});

test("sleep canonical HRV, RHR, SpO2 and respiration remain available when daily has only unrelated fields", () => {
  const result = evidence({ daily: [row({ steps: 1000 })], sleep: [row({ total_duration_seconds: 28_800, hrv_last_night_avg_ms: 42, resting_heart_rate_bpm: 57, spo2_avg_pct: 97, respiration_avg_brpm: 13 })] });
  assert.equal(result.hrv.last_night_avg_ms, 42);
  assert.equal(result.heart_rate.resting, 57);
  assert.equal(result.spo2.average, 97);
  assert.equal(result.respiration.average, 13);
  assert.equal(result.heart_rate.scope, "sleep");
});

test("separate canonical foundation summary imports supply independently persisted families safely", () => {
  const imports = [canonicalImport("stress", { average_stress_level: 22, max_stress_level: 60, secret: "secret" }), canonicalImport("body_battery", { body_battery_current: 73 }), canonicalImport("heart_rate", { resting_heart_rate_bpm: 55 }), canonicalImport("spo2", { spo2_avg_pct: 97 }), canonicalImport("respiration", { respiration_avg_brpm: 13 })];
  const result = evidence({ imports }, { userId: "A" });
  assert.equal(result.stress.average, 22);
  assert.equal(result.body_battery.current, 73);
  assert.equal(result.heart_rate.resting, 55);
  assert.equal(result.spo2.average, 97);
  assert.equal(result.respiration.average, 13);
  assert.doesNotMatch(JSON.stringify(result), /canonical_metrics|secret/);
  assert.equal(result.stress.source.table, "wearable_health_imports");
  const invalid = evidence({ imports: [canonicalImport("stress", { average_stress_level: 22 }, date, { canonical_calendar_date: "2026-10-04" })] }, { userId: "A" });
  assert.equal(invalid.status, "unavailable");
});

test("aggregator provenance is exact and never relabeled official; future official fixture stays official", () => {
  assert.deepEqual(evidence({ daily: [row({ body_battery_current: 70 })] }).provenance[0], provenance);
  const result = evidence({ daily: [row({ body_battery_current: 70, ...official })] });
  assert.deepEqual(result.provenance[0], official);
  assert.equal(evidence({ daily: [row({ body_battery_current: 70, ingestion_channel: "garmin_health_api" })] }).status, "unavailable");
});

test("explicit ownership isolates two users even in a mixed canonical record set", () => {
  const result = evidence({ daily: [row({ user_id: "A", body_battery_current: 0 }), row({ user_id: "B", body_battery_current: 99 })] }, { userId: "A" });
  assert.equal(result.body_battery.current, 0);
  assert.equal(evidence({ daily: [row({ user_id: "B", body_battery_current: 99 })] }, { userId: "A" }).status, "unavailable");
});

test("Madrid midnight and DST use profile day, with exact 23/25-hour bounds", () => {
  assert.equal(resolveUserCalendar({ profileTimezone: timezone, clientTimezone: "America/Los_Angeles", now: "2026-10-04T22:15:00Z" }).date, date);
  assert.equal(resolveUserCalendar({ profileTimezone: timezone, now: "2026-03-28T23:30:00Z" }).date, "2026-03-29");
  const spring = healthCalendarUtcBounds("2026-03-29", timezone);
  assert.equal(spring.start_utc, "2026-03-28T23:00:00.000Z");
  assert.equal((Date.parse(spring.end_utc) - Date.parse(spring.start_utc)) / 3_600_000, 23);
  const autumn = healthCalendarUtcBounds("2026-10-25", timezone);
  assert.equal((Date.parse(autumn.end_utc) - Date.parse(autumn.start_utc)) / 3_600_000, 25);
  const result = evidence({ body_battery_samples: [{ ...provenance, recorded_at: "2026-10-04T22:15:00Z", body_battery_value: 0 }] });
  assert.equal(result.body_battery.calendar_date, date);
  assert.equal(result.body_battery.current, 0);
  assert.equal(result.body_battery.temporal_scope, "instant");
});

test("mixed Body Battery sample and charge/drain retain per-metric lineage", () => {
  const result = evidence({ daily: [row({ id: "daily", body_battery_charged: 35, body_battery_drained: 40 })], body_battery_samples: [{ ...official, id: 22, recorded_at: "2026-10-05T09:00:00Z", body_battery_value: 18 }] });
  assert.equal(result.body_battery.current, 18);
  assert.equal(result.body_battery.charged, 35);
  assert.equal(result.body_battery.field_sources.current.record_id, 22);
  assert.equal(result.body_battery.field_sources.charged.record_id, "daily");
  assert.deepEqual(result.body_battery.field_sources.current.provenance, official);
  assert.deepEqual(result.body_battery.field_sources.drained.provenance, provenance);
  assert.equal(result.provenance.length, 2);
});

test("readiness requires two current usable recovery factors; no data/single metric gives null", () => {
  for (const input of [evidence(), evidence({ sleep: [row({ sleep_score: 80 })] }), evidence({ daily: [row({ body_battery_current: 70 })] }), evidence({ hrv: [row({ last_night_avg_ms: 42 })] })]) {
    const result = calculateReadiness(input, history());
    assert.equal(result.score, null);
    assert.equal(result.status, "unavailable");
    assert.equal(result.confidence, "none");
  }
});

test("readiness never needs a universal HRV or RHR threshold: seven personal dates unlock factors", () => {
  assert.equal(buildPersonalBaseline(history(6), "hrv", { calendarDate: date }), null);
  const baseline = buildPersonalBaseline(history(7), "hrv", { calendarDate: date });
  assert.equal(baseline.value, 40);
  assert.equal(baseline.observations, 7);
  const result = calculateReadiness(healthy(), history(), { generatedAt });
  assert.equal(result.status, "available");
  assert.equal(result.confidence, "medium");
  assert.equal(result.score, 70);
  assert.equal(result.factors.find((factor) => factor.metric === "hrv").factor_score, 65);
  assert.equal(result.factors.find((factor) => factor.metric === "resting_heart_rate").factor_score, 60);
  assert.ok(result.factors.every((factor) => factor.reason && factor.reason_code && factor.evidence_date === date && Number.isFinite(factor.contribution)));
});

test("baseline is calendar bounded, unique-date weighted, today/future/invalid/explicit stale excluded", () => {
  const input = [...history(7), ...history(7), { calendar_date: "2026-08-01", hrv: 999 }, { calendar_date: date, hrv: 999 }, { calendar_date: "2026-10-06", hrv: 999 }, { calendar_date: "2026-02-30", hrv: 999 }, { calendar_date: "2026-09-15", hrv: 999, freshness: "stale" }];
  const baseline = buildPersonalBaseline(input, "hrv", { calendarDate: date });
  assert.equal(baseline.value, 40);
  assert.equal(baseline.observations, 7);
  assert.equal(baseline.start_date, "2026-09-07");
  assert.deepEqual(baseline.evidence_dates, history(7).map((item) => item.calendar_date).sort());
  const conflicting = [...history(7), { calendar_date: history(7)[0].calendar_date, hrv: 41 }];
  assert.equal(buildPersonalBaseline(conflicting, "hrv", { calendarDate: date }), null);
});

test("zero baseline is preserved but cannot divide; observed 0 is not absent or a 50 placeholder", () => {
  const zero = evidence({ daily: [row({ body_battery_current: 0 })], sleep: [row({ sleep_score: 0 })], hrv: [row({ last_night_avg_ms: 0 })] });
  const result = calculateReadiness(zero, history(7, { hrv: 0 }));
  assert.equal(buildPersonalBaseline(history(7, { hrv: 0 }), "hrv", { calendarDate: date }).value, 0);
  assert.equal(result.score, 0);
  assert.ok(result.missing_relevant_data.includes("hrv_nonzero_baseline"));
  const midpoint = calculateReadiness(evidence({ daily: [row({ body_battery_current: 50 })], sleep: [row({ sleep_score: 50 })] }));
  assert.equal(midpoint.score, 50);
  assert.equal(midpoint.factors.length, 2);
});

test("missing individual metrics reduce coverage explicitly; no sleep duration universal target", () => {
  const withoutHrv = calculateReadiness(evidence({ daily: [row({ body_battery_current: 70 })], sleep: [row({ sleep_score: 80 })] }), history());
  assert.equal(withoutHrv.status, "partial");
  assert.ok(withoutHrv.missing_relevant_data.includes("current_hrv"));
  const withoutSleep = calculateReadiness(evidence({ hrv: [row({ last_night_avg_ms: 44 })], daily: [row({ resting_heart_rate_bpm: 58 })] }), history());
  assert.equal(withoutSleep.status, "partial");
  assert.ok(withoutSleep.missing_relevant_data.includes("current_sleep_score"));
  const duration = calculateReadiness(evidence({ sleep: [row({ total_duration_seconds: 28_800 })], daily: [row({ body_battery_current: 70 })] }), history());
  assert.ok(duration.factors.some((factor) => factor.metric === "sleep_duration" && factor.baseline.value === 28_800));
  assert.equal(calculateReadiness(evidence({ sleep: [row({ total_duration_seconds: 28_800 })], daily: [row({ body_battery_current: 70 })] }), []).score, null);
});

test("estimated, calculated, OCR or unknown evidence is visible but never used as measured readiness", () => {
  for (const data_confidence of ["estimated", "calculated", "ocr_unverified", "unknown"]) {
    const input = evidence({ sleep: [row({ sleep_score: 80, data_confidence })], daily: [row({ body_battery_current: 70 })] });
    assert.equal(input.sleep.sleep_score, 80);
    assert.equal(calculateReadiness(input).score, null);
    assert.equal(buildPersonalBaseline(history(7, { provenance: { hrv: { ...provenance, data_confidence } } }), "hrv", { calendarDate: date }), null);
  }
});

test("readiness is versioned, reproducible, traceable and never mutates its evidence", () => {
  const input = healthy(); const prior = history();
  const snapshot = JSON.stringify([input, prior]);
  const first = calculateReadiness(input, prior, { generatedAt });
  assert.deepEqual(first, calculateReadiness(input, prior, { generatedAt }));
  assert.equal(first.algorithm_version, READINESS_ALGORITHM_VERSION);
  assert.equal(first.schema_version, "readiness_v1");
  assert.equal(first.generated_at, generatedAt);
  assert.equal(JSON.stringify([input, prior]), snapshot);
  const hrvFactor = first.factors.find((factor) => factor.metric === "hrv");
  assert.deepEqual(hrvFactor.baseline.evidence.map((item) => item.value), Array(8).fill(40));
  assert.ok(first.evidence_dates.includes(date));
});

test("loader independently scopes, paginates safe groups, counts linked valid HRV samples and builds personal history", async () => {
  const daily = [...history(8).map((item) => row({ user_id: "A", id: item.calendar_date, resting_heart_rate_bpm: 60 }, item.calendar_date)), row({ user_id: "A", id: "today-daily", body_battery_current: 70, resting_heart_rate_bpm: 58 })];
  const hrv = [...history(8).map((item) => row({ user_id: "A", id: item.calendar_date, last_night_avg_ms: 40 }, item.calendar_date)), row({ user_id: "A", id: "hrv-today", last_night_avg_ms: 44 })];
  const db = fakeDb({ wearable_health_daily: daily, wearable_sleep_sessions: [row({ user_id: "A", id: "sleep", sleep_score: 80 })], wearable_hrv_nightly_summaries: hrv, wearable_hrv_nightly_samples: [{ user_id: "A", hrv_summary_id: "hrv-today", hrv_ms: 0, recorded_at: "2026-10-04T23:00:00Z" }, { user_id: "A", hrv_summary_id: "hrv-today", hrv_ms: null, recorded_at: "2026-10-04T23:05:00Z" }, { user_id: "A", hrv_summary_id: "other", hrv_ms: 42, recorded_at: "2026-10-04T23:00:00Z" }, { user_id: "A", hrv_summary_id: "hrv-today", hrv_ms: 42, recorded_at: "2026-10-05T13:00:00Z" }], wearable_health_imports: [canonicalImport("stress", { average_stress_level: 22 }, date, { health_record_type: "stress" })] });
  const result = await loadHealthIntelligence(db, { userId: "A", calendarDate: date, timezone, generatedAt });
  assert.equal(result.readiness.score, 70);
  assert.equal(result.hrv.readings_count, 1);
  assert.equal(result.hrv.readings_count_method, "canonical_linked_valid_samples");
  assert.equal(result.hrv.field_sources.readings_count.table, "wearable_hrv_nightly_samples");
  assert.equal(result.hrv.field_sources.readings_count.linked_summary_id, "hrv-today");
  assert.equal(result.hrv.field_sources.readings_count.as_of, generatedAt);
  assert.equal(result.stress.average, 22);
  for (const call of db.calls) {
    assert.ok(call.filters.some(([operation, field, value]) => operation === "eq" && field === "user_id" && value === "A"));
    assert.doesNotMatch(call.fields, /raw|source_dto|evidence|\*/);
  }
  assert.ok(db.calls.some((call) => call.range));
  assert.ok(db.calls.some((call) => call.fields.includes("normalized_payload->metrics")));
});

test("loader preserves successful families and sanitizes independent group failures", async () => {
  const db = fakeDb({ wearable_sleep_sessions: [row({ user_id: "A", sleep_score: 80 })] }, { failing: ["wearable_health_daily", "wearable_hrv_nightly_summaries"] });
  const result = await loadHealthIntelligence(db, { userId: "A", calendarDate: date, timezone, generatedAt });
  assert.equal(result.sleep.sleep_score, 80);
  assert.equal(result.readiness.score, null);
  assert.ok(result.issues.includes("read_unavailable_daily"));
  assert.doesNotMatch(JSON.stringify(result), /RAW_SECRET_CANARY/);
});

test("future plan date is not current health; invalid ownership fails before database access", async () => {
  const db = fakeDb({ wearable_sleep_sessions: [row({ user_id: "A", sleep_score: 80 }, "2026-10-06")] });
  const result = await loadHealthIntelligence(db, { userId: "A", calendarDate: "2026-10-06", timezone, generatedAt });
  assert.equal(result.status, "unavailable");
  assert.equal(result.readiness.score, null);
  assert.deepEqual(result.issues, ["future_calendar_date"]);
  assert.equal(db.calls.length, 0);
  for (const userId of [undefined, null, "", " "]) await assert.rejects(loadHealthIntelligence(db, { userId, calendarDate: date, timezone }), /authenticated userId/);
  const pure = healthy(); pure.calendar_date = "2026-10-06";
  assert.equal(calculateReadiness(pure, history(), { generatedAt }).score, null);
});

test("pure evidence respects as-of instants: no same-day future samples or future reference day", () => {
  const result = evidence({ body_battery_samples: [{ ...provenance, id: 1, recorded_at: "2026-10-05T11:00:00Z", body_battery_value: 20 }, { ...provenance, id: 2, recorded_at: "2026-10-05T13:00:00Z", body_battery_value: 90 }] });
  assert.equal(result.body_battery.current, 20);
  const future = evidence({ sleep: [row({ sleep_score: 80 }, "2026-10-06")] }, { calendarDate: "2026-10-06" });
  assert.equal(future.status, "unavailable");
  assert.deepEqual(future.issues, ["future_calendar_date"]);
  assert.throws(() => evidence({}, { generatedAt: "2026-10-05" }), /ISO instant/);
});

test("HRV without sleep and Body Battery still derives from both personal recovery factors", () => {
  const result = calculateReadiness(evidence({ hrv: [row({ last_night_avg_ms: 44 })], daily: [row({ resting_heart_rate_bpm: 58 })] }), history());
  assert.equal(result.score, 63);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.factors.map((factor) => factor.metric), ["hrv", "resting_heart_rate"]);
  assert.ok(result.missing_relevant_data.includes("current_body_battery"));
});

test("safe source identities and baseline ownership reject malformed nested or foreign evidence", () => {
  const result = evidence({ daily: [row({ id: { raw_payload: "SECRET" }, foundation_record_key: { credentials: "SECRET" }, body_battery_current: 70 })] });
  assert.doesNotMatch(JSON.stringify(result), /SECRET|credentials|raw_payload/);
  assert.equal(buildPersonalBaseline(history(7, { user_id: "B" }), "hrv", { calendarDate: date, userId: "A" }), null);
  const baseline = buildPersonalBaseline(history(7, { user_id: "A" }), "hrv", { calendarDate: date, userId: "A" });
  assert.equal(baseline.value, 40);
});

test("loader paginates a crowded canonical date without overweighting its personal baseline", async () => {
  const summaries = Array.from({ length: 205 }, (_, index) => row({ user_id: "A", id: `legacy-${String(index).padStart(3, "0")}`, last_night_avg_ms: 40 }, "2026-10-04"));
  const db = fakeDb({ wearable_hrv_nightly_summaries: summaries });
  const result = await loadHealthIntelligence(db, { userId: "A", calendarDate: date, timezone, generatedAt });
  assert.equal(result.hrv.last_night_avg_ms, 40);
  assert.equal(result.hrv.freshness, "recent");
  assert.equal(result.readiness.score, null);
  const pages = db.calls.filter((call) => call.table === "wearable_hrv_nightly_summaries" && call.range);
  assert.deepEqual(pages.map((call) => call.range), [[0, 199], [200, 399]]);
});
