import { normalizeName, isUnknownExerciseName } from "./domain.js";

/** Read-time identity only. Catalog activation affects capture, not past evidence.
 * Explicit UUIDs resolve by ID; legacy names require exactly one catalog row.
 * Duplicate aliases on the same row do not make that exercise ambiguous.
 */
export function buildExerciseCatalogIndex(catalog) {
  const byId = new Map();
  const byName = new Map();
  for (const row of catalog) {
    const code =
      typeof row.code === "string" && row.code.trim() ? row.code : null;
    byId.set(row.id, code);
    const aliases = Array.isArray(row.metadata?.aliases)
      ? row.metadata.aliases
      : [];
    for (const label of [row.code, row.name, ...aliases]) {
      if (typeof label !== "string") continue;
      const key = normalizeName(label);
      if (!key || isUnknownExerciseName(key)) continue;
      if (!byName.has(key)) byName.set(key, new Map());
      byName.get(key).set(row.id, code);
    }
  }
  return (exercise) => {
    let code = null;
    if (exercise.exercise_id) {
      // An unresolved ID must never select another catalog row by its label.
      code = byId.get(exercise.exercise_id) || null;
    } else {
      const matches = byName.get(normalizeName(exercise.reported_name));
      if (matches?.size === 1) code = matches.values().next().value;
    }
    return { ...exercise, canonical_exercise_code: code };
  };
}
