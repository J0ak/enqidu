// One exact-only algorithm for persisted catalog rows and the versioned seed adapter.
export const normalizeExactName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
export const isUnknownName = (value) =>
  /^(unknown|desconocido|sin identificar|ejercicio desconocido)(?: \d+)?$/.test(
    normalizeExactName(value),
  );
export function createCatalogResolver(catalog) {
  const ids = new Map(),
    names = new Map();
  for (const row of catalog) {
    ids.set(row.id, row);
    for (const label of [
      row.code,
      row.name,
      ...(Array.isArray(row.metadata?.aliases) ? row.metadata.aliases : []),
    ]) {
      if (typeof label !== "string") continue;
      const key = normalizeExactName(label);
      if (!key || isUnknownName(key)) continue;
      if (!names.has(key)) names.set(key, new Map());
      names.get(key).set(row.id, row);
    }
  }
  return ({ exercise_id, reported_name } = {}) => {
    const candidates = exercise_id
      ? ids.has(exercise_id)
        ? [ids.get(exercise_id)]
        : []
      : [...(names.get(normalizeExactName(reported_name))?.values() || [])];
    return {
      state:
        candidates.length === 1
          ? "resolved"
          : candidates.length > 1
            ? "ambiguous"
            : !exercise_id && !normalizeExactName(reported_name)
              ? "missing"
              : "unresolved",
      candidates,
      exercise: candidates.length === 1 ? candidates[0] : undefined,
    };
  };
}
export async function loadExerciseCatalog(db) {
  const { data, error } = await db
    .from("exercise_catalog")
    .select("id,code,name,metadata,is_active")
    .order("id")
    .limit(2001);
  if (error || !Array.isArray(data)) throw Error("canonical_read_unavailable");
  if (data.length > 2000) throw Error("canonical_state_limit");
  return data;
}
export function withCatalogIdentity(catalog) {
  const resolve = createCatalogResolver(catalog);
  return (e) => {
    const r = resolve(e);
    return {
      ...e,
      canonical_exercise_code: r.exercise?.code || null,
      canonical_name: r.exercise?.name || null,
      identity_state: r.state,
      metric_requirements: r.exercise?.metadata?.metric_requirements || null,
    };
  };
}
