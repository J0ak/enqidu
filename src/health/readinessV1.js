import { healthNumber, safeHealthProvenance, safeHealthSource, shiftHealthCalendarDate } from "./healthEvidence.js";
import { calendarDateInTimeZone, isValidCalendarDate } from "../time/userCalendar.js";

export const READINESS_ALGORITHM_VERSION = "enqidu.readiness.v1.0.0";
export const READINESS_SCHEMA_VERSION = "readiness_v1";
export const READINESS_BASELINE_WINDOW_DAYS = 28;
export const READINESS_BASELINE_MINIMUM_OBSERVATIONS = 7;
const round = (value) => Math.round(value * 1000) / 1000;
const clamp = (value) => Math.max(0, Math.min(100, value));
const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** One observation per prior calendar date, not the last N rows or today's population thresholds. */
export function buildPersonalBaseline(history = [], field, { calendarDate, userId = null, minimum = READINESS_BASELINE_MINIMUM_OBSERVATIONS, window = READINESS_BASELINE_WINDOW_DAYS } = {}) {
  if (!isValidCalendarDate(calendarDate) || !Number.isInteger(window) || window < 1 || !Number.isInteger(minimum) || minimum < 1) return null;
  const start = shiftHealthCalendarDate(calendarDate, -window);
  const byDate = new Map();
  for (const row of Array.isArray(history) ? history : []) {
    if (!row || (userId ? row.user_id !== userId : Object.hasOwn(row, "user_id")) || !isValidCalendarDate(row.calendar_date) || row.calendar_date < start || row.calendar_date >= calendarDate || ["stale", "unavailable", "invalid"].includes(row.freshness)) continue;
    const provenance = safeHealthProvenance(row.provenance?.[field]);
    if (provenance === null || ["estimated", "calculated", "ocr_unverified", "unknown"].includes(provenance.data_confidence)) continue;
    const value = healthNumber(row[field], { positive: field === "resting_heart_rate", maximum: field === "resting_heart_rate" ? 300 : Infinity });
    if (value === null) continue;
    const previous = byDate.get(row.calendar_date);
    if (previous && previous.value !== value) byDate.set(row.calendar_date, { conflict: true });
    else if (!previous?.conflict) byDate.set(row.calendar_date, { value, ...(Object.keys(provenance).length ? { provenance } : {}), ...(row.sources?.[field] ? { source: safeHealthSource(row.sources[field]) } : {}) });
  }
  const observations = [...byDate].filter(([, item]) => !item.conflict).sort(([a], [b]) => a.localeCompare(b)).map(([calendar_date, item]) => ({ calendar_date, ...item }));
  if (observations.length < minimum) return null;
  return { value: median(observations.map((item) => item.value)), observations: observations.length, method: "rolling_median", window_days: window, minimum_observations: minimum, start_date: start, end_date: shiftHealthCalendarDate(calendarDate, -1), evidence_dates: observations.map((item) => item.calendar_date), evidence: observations };
}

export function calculateReadiness(evidence = {}, history = [], { generatedAt = null, userId = null } = {}) {
  const result = { schema_version: READINESS_SCHEMA_VERSION, algorithm_version: READINESS_ALGORITHM_VERSION, calendar_date: evidence.calendar_date || null, timezone: evidence.timezone || null, status: "unavailable", score: null, confidence: "none", factors: [], evidence_dates: [], provenance: [], generated_at: generatedAt, missing_relevant_data: [], minimum_usable_factors: 2 };
  if (!isValidCalendarDate(evidence.calendar_date) || (generatedAt && evidence.calendar_date > calendarDateInTimeZone(generatedAt, evidence.timezone))) {
    result.missing_relevant_data.push("current_health_evidence");
    return result;
  }
  const current = (family) => evidence[family]?.freshness === "current" && (evidence[family].calendar_date || evidence[family].observed_date) === evidence.calendar_date && safeHealthProvenance(evidence[family].provenance) !== null && !["estimated", "calculated", "ocr_unverified", "unknown"].includes(evidence[family].provenance?.data_confidence);
  const add = (metric, value, factorScore, weight, family, baseline, reasonCode) => {
    const field = { hrv: "last_night_avg_ms", resting_heart_rate: "resting", sleep_duration: "duration_seconds", body_battery: "current", sleep_score: "sleep_score" }[metric];
    const lineage = evidence[family].field_sources?.[field];
    const provenance = safeHealthProvenance(lineage?.provenance || evidence[family].provenance);
    const label = { hrv: "HRV", resting_heart_rate: "Frecuencia cardíaca en reposo", sleep_duration: "Duración del sueño", sleep_score: "Puntuación del sueño", body_battery: "Body Battery" }[metric];
    const reason = baseline ? `${label}: ${value}, frente a tu mediana personal ${baseline.value} de ${baseline.observations} días en los 28 días anteriores.` : `${label}: ${value}/100 registrado por el proveedor para ${evidence.calendar_date}.`;
    result.factors.push({ metric, observed_value: value, baseline, factor_score: round(clamp(factorScore)), weight, contribution: null, evidence_date: evidence[family].calendar_date || evidence[family].observed_date, provenance, source: lineage ? safeHealthSource(lineage) : null, reason, reason_code: reasonCode });
  };
  const sleepScore = current("sleep") ? healthNumber(evidence.sleep.sleep_score, { maximum: 100 }) : null;
  if (sleepScore !== null) add("sleep_score", sleepScore, sleepScore, 3, "sleep", null, "observed_provider_sleep_score_on_0_100_scale");
  else {
    result.missing_relevant_data.push("current_sleep_score");
    const duration = current("sleep") ? healthNumber(evidence.sleep.duration_seconds) : null;
    const baseline = buildPersonalBaseline(history, "sleep_duration", { calendarDate: evidence.calendar_date, userId });
    if (duration !== null && baseline?.value > 0) add("sleep_duration", duration, 50 + (duration / baseline.value - 1) * 100, 3, "sleep", baseline, "sleep_duration_relative_to_personal_28_day_median");
    else result.missing_relevant_data.push("sleep_duration_personal_baseline");
  }
  const battery = current("body_battery") ? healthNumber(evidence.body_battery.current, { maximum: 100 }) : null;
  if (battery !== null) add("body_battery", battery, battery, 1, "body_battery", null, "observed_provider_body_battery_on_0_100_scale");
  else result.missing_relevant_data.push("current_body_battery");
  for (const config of [
    { metric: "hrv", family: "hrv", value: evidence.hrv?.last_night_avg_ms, multiplier: 150 },
    { metric: "resting_heart_rate", family: "heart_rate", value: evidence.heart_rate?.resting, multiplier: -300 },
  ]) {
    const value = current(config.family) ? healthNumber(config.value, { positive: config.metric === "resting_heart_rate", maximum: config.metric === "resting_heart_rate" ? 300 : Infinity }) : null;
    const baseline = buildPersonalBaseline(history, config.metric, { calendarDate: evidence.calendar_date, userId });
    if (value === null) result.missing_relevant_data.push(`current_${config.metric}`);
    if (!baseline) result.missing_relevant_data.push(`${config.metric}_baseline`);
    else if (baseline.value === 0) result.missing_relevant_data.push(`${config.metric}_nonzero_baseline`);
    if (value !== null && baseline?.value > 0) add(config.metric, value, 50 + (value / baseline.value - 1) * config.multiplier, 2, config.family, baseline, `${config.metric}_relative_to_personal_28_day_median`);
  }
  result.evidence_dates = [...new Set(result.factors.flatMap((factor) => [factor.evidence_date, ...(factor.baseline?.evidence_dates || [])]))].sort();
  result.provenance = [...new Map(result.factors.filter((factor) => factor.provenance).map((factor) => [JSON.stringify(factor.provenance), factor.provenance])).values()];
  if (result.factors.length < result.minimum_usable_factors) {
    result.missing_relevant_data.push("at_least_two_current_recovery_factors");
    return result;
  }
  const totalWeight = result.factors.reduce((sum, factor) => sum + factor.weight, 0);
  for (const factor of result.factors) factor.contribution = round(factor.factor_score * factor.weight / totalWeight);
  result.score = Math.round(clamp(result.factors.reduce((sum, factor) => sum + factor.factor_score * factor.weight, 0) / totalWeight));
  result.status = result.factors.length >= 3 ? "available" : "partial";
  // Correlated wearable indicators do not establish clinical confidence.
  result.confidence = result.factors.length >= 3 ? "medium" : "low";
  return result;
}
