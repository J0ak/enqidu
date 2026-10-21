import { isUnknownName } from "../catalogResolver.js";
export function exerciseDataQuality(e) {
  if (isUnknownName(e.reported_name) || !e.reported_name)
    return "needs_identity";
  if (e.identity_state === "ambiguous" || e.identity_state === "unresolved")
    return "unresolved";
  const requires = e.metric_requirements || [];
  const reps =
    Array.isArray(e.reps_per_set) &&
    e.reps_per_set.length > 0 &&
    e.reps_per_set.every((n) => Number.isInteger(n) && n >= 0);
  if (
    e.execution_type !== "skipped" &&
    ((requires.includes("reps") && !reps) ||
      (requires.includes("load") && (e.load_value == null || !e.load_unit)))
  )
    return "needs_metrics";
  if (
    !e.exercise_id ||
    (!requires.length && !reps && e.execution_type !== "skipped")
  )
    return "partial";
  return "complete";
}
export const qualityLabels = {
  complete: "Datos completos",
  partial: "Datos parciales",
  needs_identity: "Nombre por identificar",
  needs_metrics: "Métricas por completar",
  unresolved: "Identidad por confirmar",
};
export function normalizationQueue(exercises) {
  const priority = {
    needs_identity: 0,
    unresolved: 1,
    needs_metrics: 2,
    partial: 3,
    complete: 4,
  };
  return exercises
    .map((e) => ({ ...e, quality: exerciseDataQuality(e) }))
    .filter((e) => e.quality !== "complete")
    .sort((a, b) => priority[a.quality] - priority[b.quality]);
}
