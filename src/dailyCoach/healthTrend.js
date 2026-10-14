import { shiftHealthCalendarDate } from "../health/healthEvidence.js";
import { coachHealthFamily, coachReadiness } from "../coachContext/coachHealthContext.js";

export function dailyHealthState(health, date) {
  const context = { health_recovery: health, request: { date } };
  const families = ["sleep", "hrv", "stress", "heart_rate", "body_battery", "spo2", "respiration"];
  const current = families.filter((name) => coachHealthFamily(context, name)?.freshness === "current");
  const state = !current.length ? health?.evidence_dates?.length ? "stale" : "missing"
    : health?.evidence_quality === "complete" && !health?.issues?.length ? "complete" : "partial";
  return { state, current_families: current, missing_families: families.filter((name) => !current.includes(name)) };
}

/** Two fixed windows: days -6..-4 vs -2..0; middle day is displayed only.
 * At least two comparable scores per window, same factor signature throughout,
 * no stale/future/carried scores. Difference >=5 points changes direction.
 */
export function buildHealthTrend({ date, days = [] }) {
  const points = Array.from({ length: 7 }, (_, i) => {
    const day = shiftHealthCalendarDate(date, i - 6);
    const matches = days.filter((h) => h?.calendar_date === day && h.schema_version === "health_recovery_v1");
    const health = matches.length === 1 ? matches[0] : null;
    const context = { health_recovery: health, request: { date: day } };
    const state = dailyHealthState(health, day);
    const { score, readiness } = coachReadiness(context);
    const currentValue = (family, field) => {
      const value = coachHealthFamily(context, family);
      return value?.freshness === "current" && Number.isFinite(value[field]) ? value[field] : null;
    };
    return { date: day, health_state: state.state, readiness_score: score,
      readiness_status: readiness?.status || "unavailable", factor_signature: score === null ? null : readiness.factors.map((f) => f.metric).sort().join(","),
      sleep_seconds: currentValue("sleep", "duration_seconds"), hrv_ms: currentValue("hrv", "last_night_avg_ms"),
      missing_families: state.missing_families };
  });
  const before = points.slice(0, 3).filter((p) => p.readiness_score !== null);
  const after = points.slice(4).filter((p) => p.readiness_score !== null);
  const comparable = before.length >= 2 && after.length >= 2 && new Set([...before, ...after].map((p) => p.factor_signature)).size === 1;
  const mean = (values) => values.reduce((sum, p) => sum + p.readiness_score, 0) / values.length;
  const delta = comparable ? Math.round((mean(after) - mean(before)) * 10) / 10 : null;
  return { schema_version: "health_readiness_trend_v1", rule_version: "enqidu.trend.v1.0.0", points,
    direction: delta === null ? "insufficient_data" : delta >= 5 ? "improving" : delta <= -5 ? "declining" : "stable",
    delta_points: delta, comparison_dates: comparable ? [...before, ...after].map((p) => p.date) : [],
    explanation: comparable ? "Comparamos las medias de dos ventanas de tres días con los mismos factores de readiness. Un cambio de 5 puntos indica dirección; no implica una causa médica."
      : "Faltan al menos dos puntuaciones comparables en cada ventana de tres días, o han cambiado los factores disponibles." };
}
