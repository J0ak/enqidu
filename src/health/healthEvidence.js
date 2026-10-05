import { calendarDateInTimeZone, isValidCalendarDate, isValidTimeZone } from "../time/userCalendar.js";

export const HEALTH_EVIDENCE_SCHEMA_VERSION = "health_recovery_v1";
const DAY_MS = 86_400_000;
export const HEALTH_FAMILIES = Object.freeze(["sleep", "hrv", "body_battery", "stress", "heart_rate", "spo2", "respiration"]);

/** SQL numeric values may be strings; booleans, whitespace and objects are never measurements. */
export function healthNumber(value, { positive = false, maximum = Infinity, integer = false } = {}) {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && (!positive || parsed > 0) && parsed <= maximum && (!integer || Number.isInteger(parsed)) ? parsed : null;
}

export function shiftHealthCalendarDate(value, days) {
  if (!isValidCalendarDate(value) || !Number.isInteger(days)) throw new TypeError("A valid calendar date and integer day offset are required");
  return new Date(Date.parse(`${value}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function classifyFreshness(observedDate, calendarDate) {
  if (!isValidCalendarDate(observedDate) || !isValidCalendarDate(calendarDate) || observedDate > calendarDate) return "unavailable";
  const age = (Date.parse(`${calendarDate}T12:00:00Z`) - Date.parse(`${observedDate}T12:00:00Z`)) / DAY_MS;
  return age === 0 ? "current" : age <= 2 ? "recent" : "stale";
}

/** Exact athlete-day UTC bounds, including 23/25-hour DST days; never process/browser timezone. */
export function healthCalendarUtcBounds(calendarDate, timezone) {
  if (!isValidCalendarDate(calendarDate) || !isValidTimeZone(timezone)) throw new TypeError("Valid athlete calendar date and profile timezone are required");
  const start = (day) => {
    const center = Date.parse(`${day}T12:00:00Z`);
    let low = center - 2 * DAY_MS, high = center + 2 * DAY_MS;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (calendarDateInTimeZone(middle, timezone) < day) low = middle;
      else high = middle;
    }
    return new Date(high).toISOString();
  };
  return { start_utc: start(calendarDate), end_utc: start(shiftHealthCalendarDate(calendarDate, 1)) };
}

const mappings = {
  sleep: { duration_seconds: "total_duration_seconds", sleep_score: "sleep_score", deep_seconds: "deep_sleep_seconds", light_seconds: "light_sleep_seconds", rem_seconds: "rem_sleep_seconds", awake_seconds: "awake_seconds", sleep_start_utc: "sleep_start_at", sleep_end_utc: "sleep_end_at" },
  hrv: { last_night_avg_ms: "last_night_avg_ms", last_night_5min_high_ms: "last_night_5min_high_ms" },
  body_battery: { current: "body_battery_current", charged: "body_battery_charged", drained: "body_battery_drained" },
  stress: { average: "average_stress_level", max: "max_stress_level", qualifier: "stress_qualifier" },
  heart_rate: { resting: "resting_heart_rate_bpm", min: "min_heart_rate_bpm", max: "max_heart_rate_bpm" },
  spo2: { average: "spo2_avg_pct", min: "spo2_min_pct" },
  respiration: { average: "respiration_avg_brpm", min: "respiration_min_brpm" },
};

export function healthTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return null;
  if (!value.endsWith("Z") && (Number(value.slice(-5, -3)) > 14 || Number(value.slice(-2)) > 59 || (Number(value.slice(-5, -3)) === 14 && Number(value.slice(-2)) !== 0))) return null;
  const parsed = new Date(value);
  return isValidCalendarDate(value.slice(0, 10)) && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function safeHealthSource(row, table = row?.table) {
  const source = {};
  if (typeof table === "string" && /^wearable_[a-z_]{1,80}$/.test(table)) source.table = table;
  const id = row?.record_id ?? row?.id;
  if ((typeof id === "number" && Number.isSafeInteger(id) && id >= 0) || (typeof id === "string" && /^[-A-Za-z0-9_.:]{1,100}$/.test(id))) source.record_id = id;
  if (typeof row?.foundation_record_key === "string" && row.foundation_record_key.length <= 2048) source.foundation_record_key = row.foundation_record_key;
  return source;
}

function project(row, family) {
  const result = {};
  for (const [target, field] of Object.entries(mappings[family])) {
    let value;
    if (target.endsWith("_utc")) value = healthTimestamp(row?.[field]);
    else if (target === "qualifier") value = typeof row?.[field] === "string" && /^[\p{L}\p{N}_ .-]{1,100}$/u.test(row[field]) ? row[field] : null;
    else value = healthNumber(row?.[field], { positive: family === "heart_rate", maximum: family === "heart_rate" ? 300 : family === "stress" || family === "spo2" || target === "current" || target === "sleep_score" ? 100 : Infinity, integer: target.endsWith("_seconds") });
    if (value !== null) result[target] = value;
  }
  return result;
}

export function safeHealthProvenance(row) {
  const result = {};
  for (const field of ["provider", "provider_mode", "ingestion_channel", "data_confidence"]) {
    if (typeof row?.[field] === "string" && /^[a-z0-9_]{1,80}$/.test(row[field])) result[field] = row[field];
  }
  // A mislabeled aggregator is never upgraded to official Garmin evidence.
  if (result.provider_mode === "aggregator" && result.ingestion_channel !== "fitness_ai_connector") return null;
  if (result.ingestion_channel === "fitness_ai_connector" && result.provider_mode !== "aggregator") return null;
  if (result.ingestion_channel === "garmin_health_api" && result.provider_mode !== "official_api") return null;
  return result;
}

function ownRows(rows, userId) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === "object" && !Array.isArray(row) && (userId ? row.user_id === userId : !Object.hasOwn(row, "user_id")));
}

/** Project selected JSON subfields only. Full envelopes/evidence/source_dto are never returned. */
function importRows(rows, userId) {
  return ownRows(rows, userId).flatMap((row) => {
    if (row.canonical_schema_version !== "enqidu.wearable.v1" || row.canonical_calendar_date !== row.observation_date || !mappings[row.canonical_data_type]) return [];
    const provenance = row.canonical_provenance;
    if (!provenance || provenance.provider !== row.provider || provenance.provider_mode !== row.provider_mode || provenance.ingestion_channel !== row.ingestion_channel) return [];
    return [{ ...row.canonical_metrics, ...row, calendar_date: row.observation_date, source_table: "wearable_health_imports", data_type: row.canonical_data_type }];
  });
}

function choose(candidates, family, calendarDate, issues) {
  const eligible = candidates.filter((row) => isValidCalendarDate(row.calendar_date) && row.calendar_date <= calendarDate);
  const streams = new Map();
  for (const row of eligible) {
    const key = JSON.stringify([row.source_table, row.data_type || null, row.provider || null, row.scope || null]);
    const previous = streams.get(key);
    if (!previous || row.calendar_date > previous[0].calendar_date) streams.set(key, [row]);
    else if (row.calendar_date === previous[0].calendar_date) previous.push(row);
  }
  // Independent persisted summaries remain eligible; absence in daily does not erase sleep.
  // Within a source stream its latest empty correction never revives an older value.
  const dated = [...streams.values()].flatMap((peers) => {
    if (peers.some((row) => JSON.stringify(project(row, family)) !== JSON.stringify(project(peers[0], family)))) {
      issues.push(`ambiguous_${family}`);
      return [];
    }
    return Object.keys(project(peers[0], family)).length ? peers : [];
  });
  if (!dated.length) return null;
  // Latest snapshot wins even if all its metrics are null: never resurrect an older correction.
  dated.sort((a, b) => b.calendar_date.localeCompare(a.calendar_date) || (b.priority || 0) - (a.priority || 0) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")) || String(a.id || "").localeCompare(String(b.id || "")));
  const first = dated[0];
  const peers = dated.filter((row) => row.calendar_date === first.calendar_date && row.priority === first.priority);
  if (peers.some((row) => JSON.stringify(project(row, family)) !== JSON.stringify(project(first, family)) || row.provider !== first.provider)) {
    issues.push(`ambiguous_${family}`);
    return null;
  }
  return first;
}

export function buildHealthEvidence({ calendarDate, timezone, userId = null, records = {}, generatedAt = null, readIssues = [] } = {}) {
  if (!isValidCalendarDate(calendarDate) || !isValidTimeZone(timezone)) throw new TypeError("Valid calendarDate and athlete profile timezone are required");
  if (userId !== null && (typeof userId !== "string" || !userId.trim())) throw new TypeError("userId must be a nonempty authenticated identity");
  if (generatedAt !== null && healthTimestamp(generatedAt) === null) throw new TypeError("generatedAt must be an explicit ISO instant or null");
  const issues = [...new Set((Array.isArray(readIssues) ? readIssues : []).filter((issue) => typeof issue === "string" && /^[a-z_]{1,100}$/.test(issue)))];
  if (generatedAt && calendarDate > calendarDateInTimeZone(generatedAt, timezone)) {
    records = {};
    issues.push("future_calendar_date");
  }
  const daily = ownRows(records.daily, userId).map((row) => ({ ...row, priority: 1, source_table: "wearable_health_daily" }));
  const sleep = ownRows(records.sleep, userId).map((row) => ({ ...row, priority: 1, source_table: "wearable_sleep_sessions" }));
  const hrv = ownRows(records.hrv, userId).map((row) => ({ ...row, priority: 3, source_table: "wearable_hrv_nightly_summaries" }));
  const imports = importRows(records.imports, userId).map((row) => ({ ...row, priority: 2 }));
  const families = {};
  for (const family of HEALTH_FAMILIES) {
    const candidates = family === "sleep" ? sleep : family === "hrv" ? [
      ...hrv,
      ...sleep.map((row) => ({ ...row, priority: 1, last_night_avg_ms: row.hrv_last_night_avg_ms, last_night_5min_high_ms: row.hrv_last_night_5min_high_ms })),
    ] : [...daily, ...imports.filter((row) => row.data_type === family), ...(["spo2", "respiration", "heart_rate"].includes(family) ? sleep.map((row) => ({ ...row, priority: 0, scope: "sleep" })) : [])];
    const row = choose(candidates, family, calendarDate, issues);
    if (!row) continue;
    const projected = project(row, family);
    const provenance = safeHealthProvenance(row);
    if (!Object.keys(projected).length || !provenance) continue;
    const source = safeHealthSource(row, row.source_table);
    families[family] = { ...projected, calendar_date: row.calendar_date, observed_date: row.calendar_date, freshness: classifyFreshness(row.calendar_date, calendarDate), temporal_scope: "calendar_day", provenance, source, field_sources: Object.fromEntries(Object.keys(projected).map((metric) => [metric, { ...source, calendar_date: row.calendar_date, provenance }])), ...(row.scope ? { scope: row.scope } : {}) };
    if (family === "hrv" && row.source_table === "wearable_hrv_nightly_summaries" && healthNumber(row.readings_count, { integer: true }) !== null) {
      families.hrv.readings_count = Number(row.readings_count);
      families.hrv.readings_count_method = "canonical_linked_valid_samples";
      families.hrv.field_sources.readings_count = { table: "wearable_hrv_nightly_samples", ...(source.record_id != null ? { linked_summary_id: source.record_id } : {}), calendar_date: row.calendar_date, provenance: {}, as_of: generatedAt };
    }
  }
  // A latest canonical point is "current" only for its athlete calendar date; no morning inference.
  const batterySamples = ownRows(records.body_battery_samples, userId).filter((row) => healthTimestamp(row.recorded_at) && (!generatedAt || Date.parse(row.recorded_at) <= Date.parse(generatedAt)) && healthNumber(row.body_battery_value, { maximum: 100 }) !== null)
    .map((row) => ({ ...row, date: calendarDateInTimeZone(row.recorded_at, timezone) })).filter((row) => row.date <= calendarDate)
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at) || String(a.id || "").localeCompare(String(b.id || "")));
  const point = batterySamples[0];
  if (point && safeHealthProvenance(point) && (!families.body_battery || point.date >= families.body_battery.calendar_date)) {
    const sameDate = families.body_battery?.calendar_date === point.date ? families.body_battery : {};
    const provenance = safeHealthProvenance(point);
    const source = safeHealthSource(point, "wearable_body_battery_samples");
    families.body_battery = { ...sameDate, current: Number(point.body_battery_value), current_observed_at: healthTimestamp(point.recorded_at), calendar_date: point.date, observed_date: point.date, freshness: classifyFreshness(point.date, calendarDate), temporal_scope: "instant", provenance, source, field_sources: { ...(sameDate.field_sources || {}), current: { ...source, calendar_date: point.date, provenance, observed_at: healthTimestamp(point.recorded_at) } } };
  }
  const values = Object.values(families);
  const evidenceDates = [...new Set(values.map((value) => value.calendar_date))].sort();
  const provenance = [...new Map(values.flatMap((value) => Object.values(value.field_sources).filter((source) => Object.keys(source.provenance).length).map((source) => [JSON.stringify(source.provenance), source.provenance]))).values()];
  const missing = HEALTH_FAMILIES.filter((family) => !families[family]);
  const freshness = classifyFreshness(evidenceDates.at(-1), calendarDate);
  const complete = !missing.length && values.every((value) => value.freshness === "current") && !issues.length;
  return { schema_version: HEALTH_EVIDENCE_SCHEMA_VERSION, calendar_date: calendarDate, timezone, temporal_scope: "calendar_day", status: !values.length ? "unavailable" : complete ? "available" : "partial", freshness, generated_at: generatedAt, evidence_dates: evidenceDates, provenance, missing, evidence_quality: !values.length ? "unavailable" : complete ? "complete" : "partial", issues: [...new Set(issues)], ...families };
}
