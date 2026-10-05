import { classifyFreshness, HEALTH_EVIDENCE_SCHEMA_VERSION } from "../health/healthEvidence.js";
import { READINESS_ALGORITHM_VERSION } from "../health/readinessV1.js";

// Coach consumes the canonical domain contracts. Old UI/RPC readiness estimates
// are deliberately not a source of observed health or of training decisions.
export const observedHealthNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0
  ? value
  : null;

export function coachHealthEvidence(context = {}) {
  const health = context?.health_recovery;
  return health?.schema_version === HEALTH_EVIDENCE_SCHEMA_VERSION ? health : {};
}

export function coachHealthFamily(context = {}, name) {
  const health = coachHealthEvidence(context);
  const family = health?.[name];
  if (!family || typeof family !== "object") return null;
  const date = family.calendar_date || family.observed_date || null;
  const targetDate = context?.request?.date || health.calendar_date || null;
  const dateFreshness = classifyFreshness(date, targetDate);
  if (dateFreshness === "unavailable" || family.freshness === "unavailable") return null;
  const freshness = family.freshness === "stale" ? "stale"
    : family.freshness === "recent" && dateFreshness === "current" ? "recent"
      : dateFreshness;
  return { ...family, calendar_date: date, freshness };
}

export function coachReadiness(context = {}) {
  const health = coachHealthEvidence(context);
  const readiness = context?.readiness ?? health.readiness;
  const referenceDate = context?.request?.date || health.calendar_date || null;
  const score = observedHealthNumber(readiness?.score);
  const valid = readiness?.schema_version === "readiness_v1"
    && readiness.algorithm_version === READINESS_ALGORITHM_VERSION
    && ["available", "partial"].includes(readiness.status)
    && score != null && score <= 100
    && referenceDate != null
    && Array.isArray(readiness.evidence_dates)
    && readiness.evidence_dates.includes(referenceDate)
    && Array.isArray(readiness.factors)
    && readiness.factors.length >= 2
    && readiness.factors.every((factor) => factor.evidence_date === referenceDate);
  return { readiness: readiness || null, score: valid ? score : null };
}

function explainFactor(factor) {
  const observed = observedHealthNumber(factor?.observed_value);
  const baseline = observedHealthNumber(factor?.baseline?.value);
  const labels = {
    sleep_score: ["Puntuación de sueño", "/100"],
    body_battery: ["Body Battery", "/100"],
    hrv: ["HRV", " ms"],
    resting_heart_rate: ["Frecuencia cardiaca en reposo", " ppm"],
    sleep_duration: ["Duración de sueño", " s"],
  };
  const label = labels[factor?.metric];
  if (label && observed != null) {
    return `${label[0]} ${observed}${label[1]}${baseline != null ? ` frente a una mediana personal de ${baseline}${label[1]}` : ""}${factor.evidence_date ? ` (${factor.evidence_date})` : ""}`;
  }
  return typeof factor?.reason === "string" && !factor.reason.includes("_")
    ? factor.reason.replace(/[.!?]+$/, "")
    : null;
}

export function coachReadinessFactorReasons(readiness) {
  return (Array.isArray(readiness?.factors) ? readiness.factors : []).map(explainFactor).filter(Boolean);
}

export function explainCoachReadiness(context = {}, { includeFactors = true } = {}) {
  const { readiness, score } = coachReadiness(context);
  if (score == null) return "No hay evidencia suficiente para calcular readiness hoy.";
  const quality = readiness.status === "partial" ? "; evidencia parcial" : "";
  const reasons = includeFactors ? coachReadinessFactorReasons(readiness).slice(0, 2) : [];
  return `Readiness ${Math.round(score)}/100${quality}. Es una señal orientativa de recuperación.${reasons.length ? ` Factores: ${reasons.join("; ")}.` : ""}`;
}
