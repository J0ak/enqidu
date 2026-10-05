export const READINESS_ALGORITHM_VERSION = "enqidu.readiness.v1.0.0";
const finite = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));
const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function buildPersonalBaseline(history = [], field, { minimum = 7, window = 28 } = {}) {
  const observations = history.filter((row) => row?.freshness !== "stale" && finite(row?.[field])).slice(-window).map((row) => Number(row[field]));
  return observations.length >= minimum ? { value: median(observations), observations: observations.length, method: "rolling_median", window_days: window } : null;
}

export function calculateReadiness(evidence = {}, history = [], { generatedAt = null } = {}) {
  const result = { schema_version: "readiness_v1", algorithm_version: READINESS_ALGORITHM_VERSION, status: "unavailable", score: null, confidence: "none", factors: [], evidence_dates: evidence.evidence_dates || [], generated_at: generatedAt, missing_relevant_data: [] };
  if (evidence.status === "unavailable" || evidence.freshness !== "current") {
    result.missing_relevant_data.push(evidence.freshness === "stale" ? "current_health_evidence" : "health_evidence");
    return result;
  }
  const addAbsolute = (key, value, contribution, reason) => result.factors.push({ key, observed: value, baseline: null, contribution, reason });
  if (finite(evidence.sleep?.score)) addAbsolute("sleep_score", Number(evidence.sleep.score), (Number(evidence.sleep.score) - 50) / 5, "observed_sleep_score");
  else result.missing_relevant_data.push("sleep_score");
  if (finite(evidence.body_battery?.morning ?? evidence.body_battery?.current)) {
    const value = Number(evidence.body_battery?.morning ?? evidence.body_battery?.current);
    addAbsolute("body_battery", value, (value - 50) / 5, "observed_body_battery");
  } else result.missing_relevant_data.push("body_battery");
  for (const config of [
    { key: "hrv", value: evidence.hrv?.last_night_avg_ms, field: "hrv", inverse: false },
    { key: "resting_heart_rate", value: evidence.heart_rate?.resting, field: "resting_heart_rate", inverse: true },
  ]) {
    const baseline = buildPersonalBaseline(history, config.field);
    if (!finite(config.value) || !baseline || baseline.value === 0) { result.missing_relevant_data.push(`${config.key}_baseline`); continue; }
    const delta = (Number(config.value) - baseline.value) / Math.abs(baseline.value);
    const contribution = Math.max(-15, Math.min(15, delta * 100 * (config.inverse ? -1 : 1)));
    result.factors.push({ key: config.key, observed: Number(config.value), baseline, contribution: Math.round(contribution * 10) / 10, reason: config.inverse ? "relative_to_personal_baseline_inverse" : "relative_to_personal_baseline" });
  }
  if (!result.factors.length) return result;
  result.score = clamp(50 + result.factors.reduce((sum, factor) => sum + factor.contribution, 0));
  result.status = result.factors.length >= 3 ? "available" : "partial";
  result.confidence = result.factors.length >= 3 ? "high" : result.factors.length === 2 ? "medium" : "low";
  return result;
}
