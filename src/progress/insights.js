import { modalityLabel, unitLabel } from "./presentation.js";
/** Explanations only: every number is an existing domain fact, never a second metric. */
export function progressInsights({
  strength,
  quality,
  summary,
  executionLinks,
  restDates,
  comparisonFrom,
}) {
  const items = [];
  const add = (
    kind,
    text,
    session_ids = [],
    exercise_ids = [],
    plan_ids = [],
  ) => items.push({ kind, text, session_ids, exercise_ids, plan_ids });
  for (const exercise of strength) {
    for (const r of exercise.records.slice(-12)) {
      if (items.length >= 12) break;
      const unit = unitLabel(exercise.unit) || "unidad no registrada";
      add(
        r.kind === "load" ? "observed_load_record" : "observed_reps_record",
        r.kind === "load"
          ? `${exercise.name}: carga observada ${r.previous} → ${r.value} ${unit}, respecto al ${r.previous_date}. Mejor marca de carga dentro del histórico comparado.`
          : `${exercise.name}: ${r.previous} → ${r.value} reps ${r.load === null ? "con peso corporal explícito" : `a la misma carga (${r.load} ${unit})`}, respecto al ${r.previous_date}. Progresión observada en esa variante.`,
        [r.previous_session_id, r.session_id],
        [r.previous_exercise_id, r.exercise_id],
      );
    }
  }
  if (restDates.length)
    add(
      "confirmed_rest",
      `${restDates.length} días de descanso completado y confirmado: ${restDates.join(", ")}.`,
    );
  if (summary.modalities.length)
    add(
      "modalities",
      `Actividad registrada: ${summary.modalities.map((m) => `${modalityLabel(m.code)} (${m.sessions})`).join(" · ")}. La variedad no demuestra por sí sola progreso.`,
      summary.session_ids,
    );
  const linked = executionLinks.filter((l) =>
    ["linked", "modified"].includes(l.status),
  );
  for (const status of ["linked", "modified"]) {
    const rows = linked.filter((l) => l.status === status);
    if (rows.length)
      add(
        status === "linked" ? "linked_execution" : "modified_linked_plan",
        status === "linked"
          ? `${rows.length} planes tienen ejecución enlazada canónicamente.`
          : `${rows.length} planes modificados tienen ejecución enlazada. «Modificado» refleja el estado persistido; no inferimos cambios técnicos.`,
        rows.map((l) => l.session_id),
        [],
        rows.map((l) => l.id),
      );
  }
  const unlinked = summary.session_ids.filter(
    (id) => !linked.some((l) => l.session_id === id),
  );
  if (unlinked.length)
    add(
      "unlinked_activity",
      `${unlinked.length} actividades realizadas no tienen un enlace único al plan. Siguen contando como entrenamiento.`,
      unlinked,
    );
  if (quality.unidentified_exercises)
    add(
      "unidentified_exercises",
      "Parte del detalle de ejercicios no está identificado de forma fiable. No puede afirmarse un volumen muscular completo.",
    );
  if (quality.volume !== "complete" || quality.sessions_without_exercises)
    add(
      "partial_volume",
      quality.duration === "complete"
        ? "El tiempo total está disponible, pero el volumen muscular es parcial: faltan ejercicios identificados, cargas, unidades o reps numéricas compatibles."
        : "El volumen muscular es parcial: faltan ejercicios identificados, cargas, unidades o reps numéricas compatibles.",
    );
  add(
    "insufficient_trend",
    "No tenemos suficiente evidencia para afirmar una tendencia global. Una mejora observada en un ejercicio no demuestra una tendencia global.",
  );
  if (comparisonFrom)
    add(
      "comparison_scope",
      `Las marcas se contrastan con evidencia compatible desde ${comparisonFrom}, más las observaciones anteriores del periodo. No son récords vitalicios certificados.`,
    );
  return items;
}
