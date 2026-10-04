import assert from "node:assert/strict";
import test from "node:test";
import {
  GarminSource, GARMIN_HEALTH_DATA_TYPES, validateGarminSourceRequest,
} from "../src/health/garminSource.js";
import {
  GarminAdapter, cloneHealthEvidence, getGarminHealthNaturalKey,
  normalizeGarminHealthRecord as normalize, normalizeHealthTimestamp, validateCanonicalHealthRecord,
} from "../src/health/garminAdapter.js";

const measurement = (value, unit) => ({ value, unit });
function source(data_type = "daily_health", extra = {}) {
  return {
    provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector",
    data_type, calendar_date: "2026-10-04", timezone: "Europe/Madrid",
    retrieved_at: "2026-10-04T15:00:00+02:00", ...extra,
  };
}
const userA = "11111111-1111-1111-1111-111111111111";
const userB = "22222222-2222-2222-2222-222222222222";

test("health happy path converts observed daily units and explicit provenance without estimating missing metrics", () => {
  const dto = source("daily_health", {
    source_identifier: "provisional:day:2026-10-04", observed_at: "2026-10-04T14:00:00.125+02:00",
    source_updated_at: "2026-10-04T14:30:00+02:00", data_confidence: "reported",
    measurements: {
      steps: measurement(0, "count"), distance_m: measurement(2.4, "km"),
      resting_heart_rate_bpm: measurement(48, "bpm"), min_heart_rate_bpm: measurement(42, "bpm"),
      max_heart_rate_bpm: measurement(130, "bpm"), active_kcal: measurement(2092, "kJ"),
      intensity_minutes: measurement(120, "s"), spo2_avg_pct: measurement(0.97, "fraction"),
    }, raw: { unmodeledGarminField: { value: "retain", granularity: "unknown" } },
    futureMeasurement: { value: 123, unit: "vendor-only" },
  });
  const record = normalize(dto);
  assert.equal(record.schema_version, "enqidu.wearable.v1");
  assert.equal(record.metrics.steps, 0);
  assert.equal(record.metrics.distance_m, 2400);
  assert.equal(record.metrics.active_kcal, 500);
  assert.equal(record.metrics.intensity_minutes, 2);
  assert.equal(record.metrics.spo2_avg_pct, 97);
  assert.equal(record.metrics.bmr_kcal, null);
  assert.equal(record.observed_at, "2026-10-04T12:00:00.125Z");
  assert.deepEqual(record.provenance, {
    provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector",
    source_identifier: "provisional:day:2026-10-04", retrieved_at: "2026-10-04T13:00:00.000Z",
    source_updated_at: "2026-10-04T12:30:00.000Z", data_confidence: "reported",
  });
  assert.deepEqual(record.evidence.source_dto, dto);
  assert.deepEqual(record.evidence.raw, dto.raw);
  dto.raw.unmodeledGarminField.value = "changed after normalization";
  assert.equal(record.evidence.raw.unmodeledGarminField.value, "retain");
  assert.equal(record.evidence.source_dto.raw.unmodeledGarminField.value, "retain");
  assert.equal(Object.hasOwn(record.metrics, "readiness"), false);
});

for (const type of GARMIN_HEALTH_DATA_TYPES.filter((type) => !["body_composition", "vendor_insight"].includes(type))) {
  test(`missing ${type} data remains null/unknown with no default biometric or timezone`, () => {
    const record = normalize(source(type, { timezone: null }));
    assert.equal(record.timezone, null);
    assert.equal(record.observed_at, null);
    assert.equal(record.provenance.source_identifier, null);
    assert.equal(record.provenance.source_updated_at, null);
    assert.equal(record.provenance.data_confidence, "unknown");
    assert.ok(Object.values(record.metrics).every((value) => value === null));
    assert.deepEqual(record.samples, []);
    assert.deepEqual(record.stages, []);
    assert.equal(record.evidence.raw, null);
  });
}

test("explicit null and observed zero remain distinct without calculating goals or calories", () => {
  const record = normalize(source("daily_health", { measurements: {
    steps: measurement(0, "count"), distance_m: measurement(null, "m"),
    average_stress_level: measurement(0, "score"), bmr_kcal: null,
  } }));
  assert.equal(record.metrics.steps, 0);
  assert.equal(record.metrics.average_stress_level, 0);
  assert.equal(record.metrics.distance_m, null);
  assert.equal(record.metrics.bmr_kcal, null);
  assert.equal(record.metrics.active_kcal, null);
});

test("sleep normalizes seconds, UTC intervals, scores and preserves absent stage duration", () => {
  const record = normalize(source("sleep", {
    sleep_start_at: "2026-10-03T23:00:00+02:00", sleep_end_at: "2026-10-04T07:00:00+02:00",
    measurements: { total_duration_seconds: measurement(8, "h"), deep_sleep_seconds: measurement(90, "min"),
      hrv_last_night_avg_ms: measurement(0.065, "s"), skin_temperature_change_c: measurement(-0.4, "C"),
      body_battery_change: measurement(-5, "score"), sleep_score: measurement(0, "score") },
    stages: [{ stage_code: "deep", start_at: "2026-10-04T00:00:00+02:00", end_at: "2026-10-04T00:30:00+02:00", duration: measurement(30, "min"), unknownStageDetail: "keep" },
      { start_at: "2026-10-04T00:30:00+02:00", end_at: "2026-10-04T01:00:00+02:00" }],
  }));
  assert.equal(record.metrics.total_duration_seconds, 28800);
  assert.equal(record.metrics.deep_sleep_seconds, 5400);
  assert.equal(record.metrics.hrv_last_night_avg_ms, 65);
  assert.equal(record.metrics.sleep_score, 0);
  assert.equal(record.metrics.skin_temperature_change_c, -0.4);
  assert.equal(record.stages[0].interval_start_at, "2026-10-03T22:00:00.000Z");
  assert.equal(record.stages[0].raw_payload.source_dto.unknownStageDetail, "keep");
  assert.equal(record.stages[1].stage_code, "unknown");
  assert.equal(record.stages[1].duration_seconds, null);
  assert.equal(record.metrics.light_sleep_seconds, null);
});

test("HRV status is vendor evidence, missing nightly mean is not derived from sample", () => {
  const record = normalize(source("hrv", { status: "balanced", samples: [
    { recorded_at: "2026-10-04T01:00:00+02:00", measurement: measurement(0.06, "s"), vendorFlag: true },
  ] }));
  assert.equal(record.metrics.last_night_avg_ms, null);
  assert.equal(record.metrics.status, "balanced");
  assert.equal(record.samples[0].hrv_ms, 60);
  assert.equal(record.samples[0].nominal_resolution_seconds, null);
  assert.equal(record.samples[0].resolution_status, "observed_to_validate");
  assert.equal(record.samples[0].raw_payload.source_dto.vendorFlag, true);
});

for (const [type, unit, input, column, expected] of [
  ["heart_rate", "bpm", 49, "heart_rate_bpm", 49], ["body_battery", "score", 0, "body_battery_value", 0],
  ["respiration", "breaths/min", 13.5, "breaths_per_minute", 13.5], ["spo2", "fraction", 0.98, "spo2_percent", 98],
  ["stress", "score", 0, "stress_value", 0],
]) {
  test(`${type} samples use canonical metric units without inventing cadence or summary`, () => {
    const record = normalize(source(type, { samples: [
      { recorded_at: "2026-10-04T01:00:00Z", measurement: measurement(input, unit), raw: { vendor: "evidence" } },
    ] }));
    assert.equal(record.samples[0][column], expected);
    assert.equal(record.samples[0].nominal_resolution_seconds, null);
    assert.equal(record.samples[0].resolution_status, "observed_to_validate");
    assert.deepEqual(record.samples[0].raw_payload.raw, { vendor: "evidence" });
    if (["heart_rate", "respiration", "spo2"].includes(type)) assert.equal(record.samples[0].context, "unknown");
  });
}

test("null samples preserve absence in canonical envelope and evidence without fabricating values", () => {
  for (const type of ["heart_rate", "hrv", "stress", "body_battery", "respiration", "spo2"]) {
    const record = normalize(source(type, { samples: [{ recorded_at: "2026-10-04T01:00:00Z" }] }));
    const metric = Object.keys(record.samples[0]).find((name) => /^(heart_rate_bpm|hrv_ms|stress_value|body_battery_value|breaths_per_minute|spo2_percent)$/.test(name));
    assert.equal(record.samples[0][metric], null);
    assert.deepEqual(record.evidence.source_dto.samples[0], { recorded_at: "2026-10-04T01:00:00Z" });
  }
});

test("unavailable stress sentinel remains raw evidence and is never a negative biometric", () => {
  const record = normalize(source("stress", { samples: [{ recorded_at: "2026-10-04T01:00:00Z", measurement: measurement(-1, "score"), stress_status: "off_wrist" }] }));
  assert.equal(record.samples[0].stress_value, null);
  assert.equal(record.samples[0].stress_status, "off_wrist");
  assert.equal(record.samples[0].raw_payload.source_dto.measurement.value, -1);
  for (const value of [-1, "-1"]) assert.throws(() => normalize(source("stress", { samples: [{ recorded_at: "2026-10-04T01:00:00Z", measurement: measurement(value, "score"), stress_status: "measured" }] })));
  assert.throws(() => normalize(source("stress", { samples: [{ recorded_at: "2026-10-04T01:00:00Z", measurement: measurement("-1", "score"), stress_status: "off_wrist" }] })), /finite number/);
});

test("Body Battery accumulated charge/drain can exceed capacity without rejecting observed totals", () => {
  const record = normalize(source("body_battery", { measurements: {
    body_battery_current: measurement(95, "score"), body_battery_charged: measurement(130, "score"), body_battery_drained: measurement(125, "score"),
  } }));
  assert.equal(record.metrics.body_battery_charged, 130);
  assert.equal(record.metrics.body_battery_drained, 125);
});

test("body composition preserves actual timestamp and converts mass/percentage without calculating BMI", () => {
  const record = normalize(source("body_composition", { measured_at: "2026-10-04T09:00:00+02:00", measurements: {
    weight_kg: measurement(100, "lb"), body_fat_pct: measurement(0.2, "fraction"),
  } }));
  assert.equal(record.metrics.measured_at, "2026-10-04T07:00:00.000Z");
  assert.equal(record.metrics.weight_kg, 45.359237);
  assert.equal(record.metrics.body_fat_pct, 20);
  assert.equal(record.metrics.bmi, null);
  assert.throws(() => normalize(source("body_composition")), /measured_at/);
});

test("VO2max and Fitness Age are isolated vendor insights without official availability claims", () => {
  for (const [code, value, unit] of [["vo2max", 48, "ml/kg/min"], ["fitness_age", 31, "years"]]) {
    const record = normalize(source("vendor_insight", { insight: { code, domain: "fitness", value_numeric: value, unit, unknownVendorDefinition: { definition: "preserve" } } }));
    assert.equal(record.metrics.insight_code, code);
    assert.equal(record.metrics.value_numeric, value);
    assert.equal(record.metrics.vendor_calculated, true);
    assert.equal(record.metrics.api_availability, "not_publicly_confirmed");
    assert.equal(Object.hasOwn(record.metrics, "readiness_score"), false);
    assert.equal(record.evidence.source_dto.insight.unknownVendorDefinition.definition, "preserve");
  }
  assert.throws(() => normalize(source("vendor_insight", { insight: { code: "fitness_age", domain: "fitness" } })), /requires at least one reported value/);
});

test("Fitness AI and future official source share adapter/domain, while provenance remains truthful", () => {
  const dto = source("daily_health", { measurements: { steps: measurement(500, "count") }, raw: { native: "same observation" } });
  const provisional = normalize(dto);
  const official = normalize({ ...dto, provider_mode: "official_api", ingestion_channel: "garmin_health_api", source_identifier: "official:changed-id" });
  assert.deepEqual(official.metrics, provisional.metrics);
  assert.equal(getGarminHealthNaturalKey(userA, provisional), getGarminHealthNaturalKey(userA, official));
  assert.equal(official.provenance.provider, provisional.provenance.provider);
  assert.notEqual(official.provenance.ingestion_channel, provisional.provenance.ingestion_channel);
});

test("canonical identities distinguish days, users and types, but survive retries, late corrections and source ID changes", () => {
  const first = normalize(source("daily_health", { source_identifier: "first-id", measurements: { steps: measurement(10, "count") } }));
  const correction = normalize(source("daily_health", { source_identifier: "replacement-id", retrieved_at: "2026-10-05T15:00:00Z", measurements: { steps: measurement(20, "count") } }));
  const key = getGarminHealthNaturalKey(userA, first);
  assert.equal(key, getGarminHealthNaturalKey(userA, structuredClone(first)));
  assert.equal(key, getGarminHealthNaturalKey(userA, correction));
  assert.notEqual(key, getGarminHealthNaturalKey(userB, first));
  assert.notEqual(key, getGarminHealthNaturalKey(userA, normalize(source("daily_health", { calendar_date: "2026-10-05" }))));
  assert.notEqual(key, getGarminHealthNaturalKey(userA, normalize(source("hrv"))));
});

test("regression: provider identifiers appearing or changing never duplicate same body measurement or vendor observation", () => {
  for (const dto of [source("body_composition", { measured_at: "2026-10-04T01:00:00Z" }),
    source("vendor_insight", { observed_at: "2026-10-04T01:00:00Z", insight: { code: "vo2max", domain: "fitness", value_numeric: 45 } })]) {
    const original = getGarminHealthNaturalKey(userA, normalize(dto));
    for (const id of [null, "connector-id", "different-official-id"]) {
      assert.equal(original, getGarminHealthNaturalKey(userA, normalize({ ...dto, source_identifier: id })));
    }
    assert.equal(original, getGarminHealthNaturalKey(userA, normalize({ ...dto, calendar_date: "2026-10-03", timezone: "America/New_York" })));
  }
  const body = source("body_composition", { measured_at: "2026-10-04T01:00:00Z" });
  assert.notEqual(getGarminHealthNaturalKey(userA, normalize(body)), getGarminHealthNaturalKey(userA, normalize({ ...body, measured_at: "2026-10-04T02:00:00Z" })));
  const dailyInsight = source("vendor_insight", { insight: { code: "vo2max", domain: "fitness", value_numeric: 45 } });
  assert.notEqual(getGarminHealthNaturalKey(userA, normalize(dailyInsight)), getGarminHealthNaturalKey(userA, normalize({ ...dailyInsight, calendar_date: "2026-10-03" })));
});

test("contract validates exact canonical record and rejects metric/provenance/ownership injection", () => {
  const valid = normalize(source());
  assert.deepEqual(validateCanonicalHealthRecord(valid), valid);
  for (const mutate of [(r) => { r.metrics.steps = 123; }, (r) => { r.provenance.ingestion_channel = "garmin_health_api"; },
    (r) => { r.user_id = userB; }, (r) => { r.metrics.training_session_id = "inject"; }, (r) => { r.provenance.extra = "inject"; }]) {
    const invalid = structuredClone(valid); mutate(invalid);
    assert.throws(() => validateCanonicalHealthRecord(invalid), /exactly match/);
  }
  const reordered = Object.fromEntries(Object.entries(valid).reverse());
  assert.deepEqual(validateCanonicalHealthRecord(reordered), valid);
});

test("timestamps normalize offsets, fractions and day boundaries independent of process/browser timezone", () => {
  assert.equal(normalizeHealthTimestamp("2026-10-04T00:30:00.1+02:00"), "2026-10-03T22:30:00.100Z");
  assert.equal(normalizeHealthTimestamp("2026-10-04T23:30:00-04:00"), "2026-10-05T03:30:00.000Z");
  assert.equal(normalizeHealthTimestamp("2024-02-29T00:00:00Z"), "2024-02-29T00:00:00.000Z");
  for (const invalid of ["2026-02-30T00:00:00Z", "2026-10-04T24:00:00Z", "2026-10-04T23:60:00Z", "2026-10-04T00:00:00", "2026-10-04", "2026-10-04T00:00:00+14:30", "2026-10-04T00:00:00.0001Z", "0000-01-01T00:00:00Z"]) {
    assert.throws(() => normalizeHealthTimestamp(invalid));
  }
  assert.throws(() => normalize(source("daily_health", { calendar_date: "2026-02-30" })), /valid calendar date/);
  assert.throws(() => normalize(source("daily_health", { timezone: "+02:00" })), /IANA/);
  assert.throws(() => normalize(source("daily_health", { timezone: "Europe/Fictional" })), /IANA/);
});

test("invalid measurements reject coercion, units, fraction overflow and inconsistent known bounds", () => {
  for (const [name, value] of [["steps", measurement("10", "count")], ["steps", measurement(1.5, "count")],
    ["steps", measurement(-1, "count")], ["distance_m", measurement(5, "miles")], ["spo2_avg_pct", measurement(1.1, "fraction")],
    ["resting_heart_rate_bpm", measurement(0, "bpm")], ["resting_heart_rate_bpm", measurement(301, "bpm")],
    ["intensity_minutes", measurement(90, "s")], ["steps", measurement(2147483648, "count")], ["steps", { unit: "count" }]]) {
    assert.throws(() => normalize(source("daily_health", { measurements: { [name]: value } })));
  }
  assert.throws(() => normalize(source("heart_rate", { measurements: { min_heart_rate_bpm: measurement(90, "bpm"), max_heart_rate_bpm: measurement(80, "bpm") } })), /must not exceed/);
});

test("provenance rejects falsely claimed official transport and unsupported identifiers/confidence", () => {
  for (const extra of [{ provider: "fitness_ai" }, { ingestion_channel: "garmin_health_api" },
    { provider_mode: "official_api" }, { provider_mode: "manual_entry" }, { source_identifier: 42 },
    { source_identifier: "" }, { source_identifier: "x".repeat(2001) }, { data_confidence: "estimated_by_llm" }, { retrieved_at: null }]) {
    assert.throws(() => normalize(source("daily_health", extra)));
  }
});

test("regression: equivalent-offset duplicate samples are rejected before canonical ingestion", () => {
  for (const type of ["heart_rate", "hrv", "stress", "body_battery", "respiration", "spo2"]) {
    assert.throws(() => normalize(source(type, { samples: [{ recorded_at: "2026-10-04T01:00:00Z" }, { recorded_at: "2026-10-04T03:00:00+02:00" }] })), /duplicate canonical timestamp/);
  }
  const record = normalize(source("heart_rate", { samples: [{ recorded_at: "2026-10-04T01:00:00Z", context: "sleep" }, { recorded_at: "2026-10-04T01:00:00Z", context: "daily" }] }));
  assert.equal(record.samples.length, 2);
  assert.throws(() => normalize(source("heart_rate", { samples: [{ recorded_at: "2026-10-04T01:00:00Z", nominal_resolution: measurement(0, "s") }] })), /must be positive/);
});

test("sleep stages reject duplicate/overlapping intervals, invalid order and contradictory duration/boundaries", () => {
  const stage = { stage_code: "deep", start_at: "2026-10-04T01:00:00Z", end_at: "2026-10-04T02:00:00Z" };
  for (const stages of [[stage, stage], [stage, { ...stage, end_at: "2026-10-04T03:00:00Z" }],
    [{ ...stage, end_at: "2026-10-04T00:00:00Z" }], [{ ...stage, duration: measurement(1, "s") }]]) {
    assert.throws(() => normalize(source("sleep", { stages })));
  }
  assert.throws(() => normalize(source("sleep", { sleep_start_at: "2026-10-04T01:30:00Z", stages: [stage] })), /within/);
  assert.throws(() => normalize(source("daily_health", { stages: [stage] })), /only sleep/);
});

test("raw/evidence rejects non-JSON, nonfinite, cycles, deep or oversized payloads without silent loss", () => {
  const cyclic = {}; cyclic.self = cyclic;
  let deep = {}; for (let i = 0; i < 35; i++) deep = { child: deep };
  const sparse = []; sparse.length = 2;
  const taggedArray = [1]; taggedArray.secret = "would silently disappear";
  const symbolField = { [Symbol("unknown")]: 1 };
  for (const invalid of [NaN, Infinity, undefined, 1n, new Date(), cyclic, deep, sparse, taggedArray, symbolField]) assert.throws(() => cloneHealthEvidence(invalid));
  assert.throws(() => normalize(source("daily_health", { raw: { missing: undefined } })), /finite JSON/);
  assert.throws(() => normalize(source("daily_health", { raw: "x".repeat(2 * 1024 * 1024) })), /2 MiB/);
  // Both raw and full source DTO are retained; the complete canonical envelope is bounded too.
  assert.throws(() => normalize(source("daily_health", { raw: "x".repeat(1100 * 1024) })), /2 MiB/);
});

test("source request and adapter page are stable contracts with no implemented connector or side effects", async () => {
  const request = { from_date: "2026-10-01", to_date: "2026-10-04", timezone: "Europe/Madrid" };
  assert.deepEqual(validateGarminSourceRequest(request), { ...request, cursor: null });
  for (const extra of [{ timezone: null }, { timezone: "" }, { from_date: "2026-10-05" }, { to_date: "2026-02-30" }, { cursor: 42 }]) {
    assert.throws(() => validateGarminSourceRequest({ ...request, ...extra }));
  }
  await assert.rejects(new GarminSource().getHealthRecords(request), /must be implemented/);
  const adapter = new GarminAdapter();
  const page = adapter.normalizePage({ records: [source()], next_cursor: "opaque-next" });
  assert.equal(page.next_cursor, "opaque-next");
  assert.deepEqual(page.records[0], adapter.normalize(source()));
  assert.throws(() => adapter.normalizePage({ records: [source()] }), /next_cursor/);
});

test("timezone names are canonicalized before SQL persistence while their source spelling remains evidence", () => {
  const dto = source("daily_health", { timezone: "europe/madrid" });
  const record = normalize(dto);
  assert.equal(record.timezone, "Europe/Madrid");
  assert.equal(record.evidence.source_dto.timezone, "europe/madrid");
  assert.equal(validateGarminSourceRequest({ from_date: "2026-10-04", to_date: "2026-10-04", timezone: "europe/madrid" }).timezone, "Europe/Madrid");
  assert.equal(normalize(source("daily_health", { timezone: "Etc/UTC" })).timezone, "UTC");
  assert.throws(() => normalize(source("daily_health", { timezone: "+02:00" })), /IANA/);
});
