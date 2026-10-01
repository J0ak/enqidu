const normalizeText = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const LOCATION_ALIASES = Object.freeze({
  home: "home",
  casa: "home",
  pool: "pool",
  piscina: "pool",
  outdoor: "outdoor",
  "aire libre": "outdoor",
  aire_libre: "outdoor",
  trail: "trail",
  "entorno trail": "trail",
  functional_training_center: "functional_training_center",
  "centro de entrenamiento funcional": "functional_training_center",
  "centro funcional": "functional_training_center",
  gym: "functional_training_center",
  gimnasio: "functional_training_center",
});

const VALID_PLANNED_SESSION_TYPES = new Set([
  "hybrid",
  "strength",
  "functional",
  "yoga",
  "mobility",
  "recovery",
  "running",
  "trail",
  "swim",
  "rest",
]);

export function normalizeCoachPlanLocation(value) {
  if (typeof value !== "string") return null;
  const normalized = normalizeText(value).replace(/[\s-]+/g, "_");
  return LOCATION_ALIASES[normalized]
    || LOCATION_ALIASES[normalized.replace(/_/g, " ")]
    || null;
}

export function toCanonicalPlannedSessionType(recommendation = {}) {
  const type = normalizeText(recommendation.session_type).replace(/[\s-]+/g, "_");
  if (VALID_PLANNED_SESSION_TYPES.has(type)) return type;
  if (type === "aerobic") {
    return normalizeCoachPlanLocation(recommendation.environment) === "trail"
      ? "trail"
      : "running";
  }
  return null;
}

export function toPlannedRecommendationPayload(recommendation = {}) {
  const sessionType = toCanonicalPlannedSessionType(recommendation);
  if (!sessionType) return null;

  return {
    ...recommendation,
    session_type: sessionType,
    environment: normalizeCoachPlanLocation(recommendation.environment),
  };
}
