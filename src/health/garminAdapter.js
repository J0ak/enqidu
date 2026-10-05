import {
  GARMIN_HEALTH_DATA_TYPES, GARMIN_SOURCE_CHANNELS, HEALTH_DATA_CONFIDENCE,
  validateCalendarDate, validateHealthTimezone,
} from "./garminSource.js";

export const WEARABLE_SCHEMA_VERSION = "enqidu.wearable.v1";
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_JSON_DEPTH = 32;
const RESOLUTION_STATUSES = [
  "documented_by_derived_export", "observed_to_validate", "official_payload_validated", "official_payload_pending",
];
const STRESS_STATUSES = [
  "measured", "off_wrist", "large_motion", "not_enough_data", "recovering_from_exercise", "unidentified",
];
const STAGES = ["awake", "rem", "light", "deep", "unmeasurable", "unknown"];

// [unit family, integer?, signed?]. Names are existing wearable_* column names.
const daily = {
  resting_heart_rate_bpm: ["heart_rate"], min_heart_rate_bpm: ["heart_rate"], max_heart_rate_bpm: ["heart_rate"],
  average_stress_level: ["score"], max_stress_level: ["score"], steps: ["count", true],
  intensity_minutes: ["minutes", true], active_kcal: ["energy"], bmr_kcal: ["energy"], distance_m: ["distance"],
  active_time_seconds: ["seconds", true], moderate_intensity_seconds: ["seconds", true],
  vigorous_intensity_seconds: ["seconds", true], steps_goal: ["count", true], intensity_goal_seconds: ["seconds", true],
  stress_duration_seconds: ["seconds", true], rest_stress_duration_seconds: ["seconds", true],
  activity_stress_duration_seconds: ["seconds", true], low_stress_duration_seconds: ["seconds", true],
  medium_stress_duration_seconds: ["seconds", true], high_stress_duration_seconds: ["seconds", true],
  body_battery_current: ["score"], body_battery_charged: ["battery_accumulation"], body_battery_drained: ["battery_accumulation"],
  spo2_avg_pct: ["percent"], spo2_min_pct: ["percent"],
  respiration_avg_brpm: ["respiration"], respiration_min_brpm: ["respiration"],
};
const subset = (names) => Object.fromEntries(names.map((name) => [name, daily[name]]));
export const GARMIN_MEASUREMENT_FIELDS = Object.freeze({
  daily_health: daily,
  sleep: {
    total_duration_seconds: ["seconds", true], deep_sleep_seconds: ["seconds", true],
    light_sleep_seconds: ["seconds", true], rem_sleep_seconds: ["seconds", true], awake_seconds: ["seconds", true],
    unmeasurable_seconds: ["seconds", true], sleep_score: ["score"], restless_moments_count: ["count", true],
    avg_sleep_heart_rate_bpm: ["heart_rate"], resting_heart_rate_bpm: ["heart_rate"],
    body_battery_change: ["score", false, true], spo2_avg_pct: ["percent"], spo2_min_pct: ["percent"],
    respiration_avg_brpm: ["respiration"], respiration_min_brpm: ["respiration"],
    hrv_last_night_avg_ms: ["milliseconds"], hrv_last_night_5min_high_ms: ["milliseconds"],
    skin_temperature_change_c: ["celsius", false, true],
  },
  hrv: { last_night_avg_ms: ["milliseconds"], last_night_5min_high_ms: ["milliseconds"] },
  stress: subset(Object.keys(daily).filter((name) => name.includes("stress"))),
  body_battery: subset(["body_battery_current", "body_battery_charged", "body_battery_drained"]),
  respiration: subset(["respiration_avg_brpm", "respiration_min_brpm"]),
  spo2: subset(["spo2_avg_pct", "spo2_min_pct"]),
  body_composition: {
    weight_kg: ["mass"], body_fat_pct: ["percent"], body_water_pct: ["percent"],
    skeletal_muscle_mass_kg: ["mass"], bone_mass_kg: ["mass"], bmi: ["ratio"],
  },
  vendor_insight: {},
  heart_rate: subset(["resting_heart_rate_bpm", "min_heart_rate_bpm", "max_heart_rate_bpm"]),
});
for (const fields of Object.values(GARMIN_MEASUREMENT_FIELDS)) {
  for (const descriptor of Object.values(fields)) Object.freeze(descriptor);
  Object.freeze(fields);
}

const UNITS = {
  heart_rate: { bpm: 1 }, respiration: { brpm: 1, "breaths/min": 1 },
  score: { score: 1 }, battery_accumulation: { score: 1 }, count: { count: 1 }, ratio: { ratio: 1 },
  minutes: { min: 1, s: 1 / 60, h: 60 }, seconds: { s: 1, min: 60, h: 3600 },
  milliseconds: { ms: 1, s: 1000 }, distance: { m: 1, km: 1000 },
  mass: { kg: 1, lb: 0.45359237 }, percent: { "%": 1, fraction: 100 },
  energy: { kcal: 1, kJ: 1 / 4.184 }, celsius: { "°C": 1, C: 1 },
};
const SAMPLE_FIELDS = {
  heart_rate: ["heart_rate_bpm", "heart_rate"], hrv: ["hrv_ms", "milliseconds"],
  stress: ["stress_value", "score"], body_battery: ["body_battery_value", "score"],
  respiration: ["breaths_per_minute", "respiration"], spo2: ["spo2_percent", "percent"],
};

function fail(field, message) { throw new TypeError(`${field}: ${message}`); }
function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(field, "must be an object");
  return value;
}
function string(value, field, nullable = true) {
  if (nullable && (value === undefined || value === null)) return null;
  if (typeof value !== "string" || !value.trim() || value.trim() !== value) fail(field, "must be a nonempty string");
  return value;
}
function enumValue(value, choices, field, fallback) {
  const result = value ?? fallback;
  if (!choices.includes(result)) fail(field, `must be one of ${choices.join(", ")}`);
  return result;
}

/** JSON-only evidence; no coercion, silent NaN loss, credentials transport or mutable aliases. */
export function cloneHealthEvidence(value) {
  const ancestors = new Set();
  let visited = 0;
  function visit(current, depth) {
    if (depth > MAX_JSON_DEPTH || ++visited > 100000) fail("evidence", "exceeds structural limit");
    if (current === null || typeof current === "string" || typeof current === "boolean") return;
    if (typeof current === "number" && Number.isFinite(current)) return;
    if (!current || typeof current !== "object") fail("evidence", "must contain only finite JSON values");
    if (!Array.isArray(current) && ![Object.prototype, null].includes(Object.getPrototypeOf(current))) {
      fail("evidence", "must contain only plain JSON objects");
    }
    if (Object.getOwnPropertySymbols(current).length ||
        (Array.isArray(current) && (Object.keys(current).length !== current.length || Object.keys(current).some((key, index) => key !== String(index))))) {
      fail("evidence", "must contain ordinary dense JSON arrays/objects without symbol properties");
    }
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(current))) {
      if (Array.isArray(current) && key === "length") continue;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail("evidence", "cannot contain hidden fields or accessors");
    }
    if (ancestors.has(current)) fail("evidence", "cannot contain cycles");
    ancestors.add(current);
    for (const item of Object.values(current)) visit(item, depth + 1);
    ancestors.delete(current);
  }
  visit(value, 0);
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > MAX_JSON_BYTES) fail("evidence", "exceeds 2 MiB limit");
  return JSON.parse(json);
}

export function normalizeHealthTimestamp(value, field = "timestamp", nullable = true) {
  if (nullable && (value === undefined || value === null)) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    fail(field, "requires an ISO timestamp with explicit offset (millisecond precision maximum)");
  }
  validateCalendarDate(value.slice(0, 10), field);
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  const offset = value.endsWith("Z") ? null : value.slice(-6);
  if (hour > 23 || minute > 59 || second > 59 || (offset &&
    (Number(offset.slice(1, 3)) > 14 || Number(offset.slice(4, 6)) > 59 ||
      (Number(offset.slice(1, 3)) === 14 && Number(offset.slice(4, 6)) !== 0)))) {
    throw new RangeError(`${field} has an invalid time or UTC offset`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError(`${field} is invalid`);
  const canonical = date.toISOString();
  if (!/^\d{4}-/.test(canonical) || canonical.startsWith("0000-")) throw new RangeError(`${field} exceeds canonical supported years 0001–9999`);
  return canonical;
}

function measurement(input, descriptor, field) {
  if (input === undefined || input === null) return null;
  object(input, field);
  const [family, integer = false, signed = false] = descriptor;
  if (!Object.hasOwn(UNITS[family], input.unit)) fail(`${field}.unit`, `unsupported ${family} unit`);
  if (input.value === null) return null;
  if (typeof input.value !== "number" || !Number.isFinite(input.value)) fail(`${field}.value`, "must be a finite number or null");
  const result = input.value * UNITS[family][input.unit];
  if (!Number.isFinite(result)) throw new RangeError(`${field} exceeds numeric range`);
  if (!signed && result < 0) throw new RangeError(`${field} must be nonnegative`);
  if (["score", "percent"].includes(family) && Math.abs(result) > 100) throw new RangeError(`${field} exceeds 100`);
  if (family === "heart_rate" && result === 0) throw new RangeError(`${field} must be positive when observed`);
  if (family === "heart_rate" && result > 300) throw new RangeError(`${field} exceeds the canonical 300 bpm validation bound`);
  if (integer && (!Number.isInteger(result) || result > 2147483647)) throw new RangeError(`${field} must be a 32-bit nonnegative integer after unit conversion`);
  return result;
}

function normalizeSamples(source, type) {
  const inputs = source.samples ?? [];
  if (!Array.isArray(inputs)) fail("samples", "must be an array");
  if (!SAMPLE_FIELDS[type] && inputs.length) fail("samples", `unsupported for ${type}`);
  const [column, family] = SAMPLE_FIELDS[type] ?? [];
  const seen = new Set();
  return inputs.map((sample, index) => {
    object(sample, `samples[${index}]`);
    const recorded_at = normalizeHealthTimestamp(sample.recorded_at, "sample.recorded_at", false);
    const result = {
      recorded_at,
      nominal_resolution_seconds: measurement(sample.nominal_resolution, ["seconds", true], "sample.nominal_resolution"),
      resolution_status: enumValue(sample.resolution_status, type === "heart_rate" ? [...RESOLUTION_STATUSES, "fit_exact"] : RESOLUTION_STATUSES, "sample.resolution_status", "observed_to_validate"),
      raw_payload: { raw: sample.raw ?? null, source_dto: sample },
    };
    if (["heart_rate", "respiration", "spo2"].includes(type)) {
      const choices = type === "spo2" ? ["sleep", "daily", "on_demand", "unknown"] : ["sleep", "daily", "activity", "unknown"];
      result.context = enumValue(sample.context, choices, "sample.context", "unknown");
    }
    if (type === "stress") {
      result.stress_status = enumValue(sample.stress_status, STRESS_STATUSES, "sample.stress_status", "unidentified");
    }
    // Negative vendor sentinels are unavailable observations only when source declares a status.
    const unavailableStress = type === "stress" && typeof sample.measurement?.value === "number" && sample.measurement.value < 0 && sample.stress_status && sample.stress_status !== "measured";
    result[column] = measurement(unavailableStress ? { ...sample.measurement, value: null } : sample.measurement, [family], `sample.${column}`);
    if (result.nominal_resolution_seconds === 0) throw new RangeError("sample nominal_resolution must be positive when known");
    const naturalKey = JSON.stringify([recorded_at, result.context ?? null]);
    if (seen.has(naturalKey)) fail("samples", "duplicate canonical timestamp/context; source must reconcile its evidence before ingestion");
    seen.add(naturalKey);
    return result;
  });
}

function normalizeStages(source, type) {
  const inputs = source.stages ?? [];
  if (!Array.isArray(inputs)) fail("stages", "must be an array");
  if (type !== "sleep" && inputs.length) fail("stages", "only sleep records accept stage intervals");
  const seen = new Set();
  const result = inputs.map((stage, index) => {
    object(stage, `stages[${index}]`);
    const result = {
      stage_code: enumValue(stage.stage_code, STAGES, "stage.stage_code", "unknown"),
      interval_start_at: normalizeHealthTimestamp(stage.start_at, "stage.start_at", false),
      interval_end_at: normalizeHealthTimestamp(stage.end_at, "stage.end_at", false),
      duration_seconds: measurement(stage.duration, ["seconds", true], "stage.duration"),
      raw_payload: { raw: stage.raw ?? null, source_dto: stage },
    };
    if (result.interval_end_at <= result.interval_start_at) throw new RangeError("stage.end_at must follow stage.start_at");
    if (result.duration_seconds !== null && result.duration_seconds !== (Date.parse(result.interval_end_at) - Date.parse(result.interval_start_at)) / 1000) {
      throw new RangeError("stage.duration disagrees with its interval");
    }
    const naturalKey = JSON.stringify([result.interval_start_at, result.interval_end_at]);
    if (seen.has(naturalKey)) fail("stages", "duplicate canonical interval");
    seen.add(naturalKey);
    return result;
  });
  const chronological = [...result].sort((a, b) => a.interval_start_at.localeCompare(b.interval_start_at));
  for (let index = 1; index < chronological.length; index++) {
    if (chronological[index].interval_start_at < chronological[index - 1].interval_end_at) throw new RangeError("sleep stage intervals cannot overlap");
  }
  return result;
}

function consistency(metrics, min, max) {
  if (metrics[min] !== null && metrics[max] !== null && metrics[min] > metrics[max]) {
    throw new RangeError(`${min} must not exceed ${max}`);
  }
}

/** Pure normalizer; this does not read a provider, persist data or calculate readiness. */
export function normalizeGarminHealthRecord(input) {
  const source = cloneHealthEvidence(input);
  object(source, "record");
  const data_type = enumValue(source.data_type, GARMIN_HEALTH_DATA_TYPES, "data_type");
  if (source.provider !== "garmin") fail("provider", "must be garmin; transport is ingestion_channel");
  const provider_mode = enumValue(source.provider_mode, Object.keys(GARMIN_SOURCE_CHANNELS), "provider_mode");
  if (source.ingestion_channel !== GARMIN_SOURCE_CHANNELS[provider_mode]) fail("ingestion_channel", "does not match provider_mode");
  const measurements = source.measurements ?? {};
  object(measurements, "measurements");
  const metrics = Object.fromEntries(Object.entries(GARMIN_MEASUREMENT_FIELDS[data_type]).map(([name, spec]) => [name, measurement(measurements[name], spec, name)]));
  if (["daily_health", "stress"].includes(data_type)) metrics.stress_qualifier = string(source.stress_qualifier, "stress_qualifier");
  if (data_type === "hrv") metrics.status = string(source.status, "status");
  if (data_type === "sleep") {
    metrics.sleep_start_at = normalizeHealthTimestamp(source.sleep_start_at, "sleep_start_at");
    metrics.sleep_end_at = normalizeHealthTimestamp(source.sleep_end_at, "sleep_end_at");
    metrics.respiration_variation_status = string(source.respiration_variation_status, "respiration_variation_status");
    if (metrics.sleep_start_at && metrics.sleep_end_at && metrics.sleep_end_at <= metrics.sleep_start_at) throw new RangeError("sleep_end_at must follow sleep_start_at");
  }
  if (data_type === "body_composition") metrics.measured_at = normalizeHealthTimestamp(source.measured_at, "measured_at", false);
  if (data_type === "vendor_insight") {
    const insight = object(source.insight, "insight");
    const value_numeric = insight.value_numeric ?? null;
    if (value_numeric !== null && (typeof value_numeric !== "number" || !Number.isFinite(value_numeric))) fail("insight.value_numeric", "must be finite or null");
    Object.assign(metrics, {
      insight_code: string(insight.code, "insight.code", false), insight_domain: string(insight.domain, "insight.domain", false),
      value_numeric, value_text: string(insight.value_text, "insight.value_text"), value_json: insight.value_json ?? null,
      unit: string(insight.unit, "insight.unit"), vendor_calculated: true,
      api_availability: enumValue(insight.api_availability, ["confirmed_official_metric_family", "portal_payload_validation_required", "not_publicly_confirmed", "optional_conditions_apply"], "insight.api_availability", "not_publicly_confirmed"),
    });
    if ([metrics.value_numeric, metrics.value_text, metrics.value_json].every((value) => value === null)) {
      fail("insight", "requires at least one reported value; absent insights must not be invented");
    }
  }
  for (const [min, max] of [["min_heart_rate_bpm", "max_heart_rate_bpm"], ["spo2_min_pct", "spo2_avg_pct"], ["respiration_min_brpm", "respiration_avg_brpm"], ["average_stress_level", "max_stress_level"]]) {
    if (Object.hasOwn(metrics, min) && Object.hasOwn(metrics, max)) consistency(metrics, min, max);
  }
  const stages = normalizeStages(source, data_type);
  const source_identifier = string(source.source_identifier, "source_identifier");
  if (source_identifier && source_identifier.length > 2000) fail("source_identifier", "must not exceed 2000 characters");
  for (const stage of stages) {
    if ((metrics.sleep_start_at && stage.interval_start_at < metrics.sleep_start_at) ||
        (metrics.sleep_end_at && stage.interval_end_at > metrics.sleep_end_at)) {
      throw new RangeError("sleep stage intervals must lie within the reported sleep session when boundaries exist");
    }
  }
  return cloneHealthEvidence({
    schema_version: WEARABLE_SCHEMA_VERSION, data_type,
    calendar_date: validateCalendarDate(source.calendar_date), timezone: validateHealthTimezone(source.timezone),
    observed_at: normalizeHealthTimestamp(source.observed_at),
    provenance: {
      provider: "garmin", provider_mode, ingestion_channel: source.ingestion_channel,
      source_identifier,
      retrieved_at: normalizeHealthTimestamp(source.retrieved_at, "retrieved_at", false),
      source_updated_at: normalizeHealthTimestamp(source.source_updated_at, "source_updated_at"),
      data_confidence: enumValue(source.data_confidence, HEALTH_DATA_CONFIDENCE, "data_confidence", "unknown"),
    },
    metrics, samples: normalizeSamples(source, data_type), stages,
    evidence: { raw: source.raw ?? null, source_dto: source },
  });
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

/** Narrow persistence boundary: canonical fields must agree with validated source evidence. */
export function validateCanonicalHealthRecord(input) {
  const record = cloneHealthEvidence(input);
  const normalized = normalizeGarminHealthRecord(record?.evidence?.source_dto);
  if (stableJson(record) !== stableJson(normalized)) fail("canonical record", "must exactly match normalized source evidence");
  return normalized;
}

/** User-scoped logical key; provenance transport never creates a parallel biometric domain. */
export function getGarminHealthNaturalKey(userId, input) {
  const record = validateCanonicalHealthRecord(input);
  string(userId, "user_id", false);
  const parts = [WEARABLE_SCHEMA_VERSION, userId, record.provenance.provider, record.data_type];
  if (record.data_type === "body_composition") {
    parts.push(record.metrics.measured_at);
  } else if (record.data_type === "vendor_insight") {
    parts.push(record.metrics.insight_code, record.observed_at ? ["observed_at", record.observed_at] : ["calendar_date", record.calendar_date]);
  } else {
    parts.push(record.calendar_date);
  }
  return JSON.stringify(parts);
}

export class GarminAdapter {
  normalize(record) { return normalizeGarminHealthRecord(record); }
  normalizePage(page) {
    object(page, "source page");
    if (!Array.isArray(page.records)) fail("records", "must be an array");
    if (page.next_cursor !== null && (typeof page.next_cursor !== "string" || !page.next_cursor.trim())) fail("next_cursor", "must be a nonempty string or null");
    const source_metadata = page.source_metadata === undefined ? null : cloneHealthEvidence(page.source_metadata);
    return { records: page.records.map(normalizeGarminHealthRecord), next_cursor: page.next_cursor, source_metadata };
  }
}
