export const HEALTH_EVIDENCE_SCHEMA_VERSION = "health_recovery_v1";

const DAY_MS = 86_400_000;
const own = (object, key) => object != null && Object.prototype.hasOwnProperty.call(object, key);
const present = (value) => value !== null && value !== undefined;
const number = (value) => present(value) && Number.isFinite(Number(value)) ? Number(value) : null;

function dateOrdinal(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS : null;
}

export function classifyFreshness(observedDate, calendarDate) {
  const observed = dateOrdinal(observedDate);
  const current = dateOrdinal(calendarDate);
  if (observed == null || current == null || observed > current) return "unavailable";
  const age = current - observed;
  if (age === 0) return "current";
  if (age <= 2) return "recent";
  return "stale";
}

const pick = (row, aliases) => {
  for (const key of aliases) if (own(row, key) && present(row[key])) return row[key];
  return null;
};

function latest(rows, calendarDate) {
  return [...(Array.isArray(rows) ? rows : [])]
    .filter((row) => row && (!row.calendar_date || row.calendar_date <= calendarDate))
    .sort((a, b) => String(b.calendar_date || b.observed_date || "").localeCompare(String(a.calendar_date || a.observed_date || "")))[0] || null;
}

function metric(row, mapping) {
  if (!row) return null;
  const result = {};
  for (const [target, aliases] of Object.entries(mapping)) {
    const value = pick(row, aliases);
    if (present(value)) result[target] = target.endsWith("_utc") || target === "qualifier" ? value : number(value);
  }
  return Object.keys(result).length ? result : null;
}

export function buildHealthEvidence({ calendarDate, timezone, records = {}, generatedAt = null } = {}) {
  if (!calendarDate || !timezone) throw new TypeError("calendarDate and timezone are required");
  const daily = latest(records.daily, calendarDate);
  const sleepRow = latest(records.sleep, calendarDate);
  const hrvRow = latest(records.hrv, calendarDate);
  const sourceRows = [daily, sleepRow, hrvRow, ...(records.samples || [])].filter(Boolean);
  const observedDates = sourceRows.map((row) => row.calendar_date || row.observed_date).filter(Boolean);
  const newestDate = observedDates.sort().at(-1) || null;
  const provenance = sourceRows.map((row) => {
    const item = {
      provider: row.provider,
      provider_mode: row.provider_mode,
      ingestion_channel: row.ingestion_channel,
    };
    if (row.foundation_record_key) item.foundation_record_key = row.foundation_record_key;
    return item;
  }).filter((item, index, all) => item.provider && all.findIndex((other) => JSON.stringify(other) === JSON.stringify(item)) === index);

  const evidence = {
    schema_version: HEALTH_EVIDENCE_SCHEMA_VERSION,
    calendar_date: calendarDate,
    timezone,
    status: sourceRows.length ? "available" : "unavailable",
    freshness: classifyFreshness(newestDate, calendarDate),
    generated_at: generatedAt,
    evidence_dates: [...new Set(observedDates)].sort(),
    provenance,
    missing: [],
  };
  const mappings = {
    sleep: [sleepRow, { duration_seconds: ["duration_seconds", "total_duration_seconds", "sleep_duration_seconds"], score: ["score", "sleep_score"], deep_seconds: ["deep_seconds", "deep_sleep_seconds"], light_seconds: ["light_seconds", "light_sleep_seconds"], rem_seconds: ["rem_seconds", "rem_sleep_seconds"], awake_seconds: ["awake_seconds"], sleep_start_utc: ["sleep_start_utc", "sleep_start_at", "started_at"], sleep_end_utc: ["sleep_end_utc", "sleep_end_at", "ended_at"] }],
    hrv: [hrvRow || daily, { last_night_avg_ms: ["last_night_avg_ms", "night_avg_ms", "hrv_last_night_avg_ms"], last_night_5min_high_ms: ["last_night_5min_high_ms", "hrv_last_night_5min_high_ms"], readings_count: ["readings_count", "hrv_readings_count"] }],
    body_battery: [daily, { current: ["body_battery_current"], morning: ["body_battery_morning"], charged: ["body_battery_charged"], drained: ["body_battery_drained"] }],
    stress: [daily, { average: ["stress_average", "average_stress_level"], max: ["stress_max", "max_stress_level"], qualifier: ["stress_qualifier"] }],
    heart_rate: [daily, { resting: ["resting_heart_rate", "resting_heart_rate_bpm"], min: ["min_heart_rate", "min_heart_rate_bpm"], max: ["max_heart_rate", "max_heart_rate_bpm"] }],
    spo2: [daily, { average: ["spo2_average", "average_spo2", "spo2_avg_pct"], min: ["spo2_min", "lowest_spo2", "spo2_min_pct"] }],
    respiration: [daily, { average: ["respiration_average", "average_respiration", "respiration_avg_brpm"], min: ["respiration_min", "lowest_respiration", "respiration_min_brpm"] }],
  };
  for (const [name, [row, map]] of Object.entries(mappings)) {
    const value = metric(row, map);
    if (value) evidence[name] = { ...value, observed_date: row.calendar_date || row.observed_date, freshness: classifyFreshness(row.calendar_date || row.observed_date, calendarDate) };
    else evidence.missing.push(name);
  }
  evidence.evidence_quality = evidence.status === "unavailable" ? "unavailable" : evidence.missing.length ? "partial" : "complete";
  return evidence;
}
