import {
  formatCoachCardDate as dateLabel,
  formatCoachCardDateRange as rangeLabel,
} from "../coachContext/coachCardsView.js";
import { qualityWording } from "./quality.js";

const join = (blocks) => blocks.filter(Boolean).join(" ");
const modalities = {
  functional_strength: "Fuerza",
  hybrid_training: "Híbrido",
  yoga_pilates: "Yoga / Pilates",
  strength: "Fuerza",
  pilates: "Pilates",
  running: "Carrera",
  trail_running: "Trail",
  swimming: "Natación",
  cycling: "Ciclismo",
  unknown: "Modalidad sin identificar",
};
// Stored names are literal presentation data. Never interpolate notes or internal identifiers.
export const visibleLabel = (value, fallback = "Actividad") =>
  typeof value === "string" &&
  !/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b|\b[a-z]+_[a-z_]+\b/i.test(value)
    ? value.slice(0, 160)
    : fallback;
const metric = (key, label, value, unit = "") => ({ key, label, value, unit });
const card = (type, title, subtitle, metrics = [], actions = []) => ({
  id: type,
  type,
  title,
  subtitle,
  metrics,
  actions,
});
const periodText = (data) => rangeLabel(data.from, data.to);
const loadLabel = (unit) =>
  ({
    kg: "kg",
    lb: "lb",
    kg_each: "kg por mancuerna",
    kg_total: "kg totales",
    "kg total": "kg totales",
    kg_external_discs: "kg de discos",
  })[unit];
function observationText(e) {
  if (e.execution_type === "skipped")
    return "no realizado (omisión registrada)";
  if (e.execution_type === "planned")
    return "planificado, sin ejecución observada";
  return join([
    e.sets !== null ? `${e.sets} series` : null,
    e.reps !== null
      ? `con ${e.reps.join(", ")} repeticiones`
      : "sin repeticiones registradas",
    e.load !== null && loadLabel(e.unit)
      ? `a ${e.load} ${loadLabel(e.unit)}`
      : e.applicable_metrics?.includes("load")
        ? "sin carga con unidad registrada"
        : null,
  ]);
}
export function renderExercise(intent, data) {
  const name = visibleLabel(data.exercise.display_name, "Este ejercicio");
  if (data.observations instanceof Array) {
    const rows = data.observations;
    if (!rows.length)
      return {
        answer: `No encuentro registros de ${name} entre ${periodText(data)}. Puedo revisar otro periodo.`,
        cards: [],
      };
    const last = rows[0];
    const sameDay = rows.filter((e) => e.date === last.date);
    const answer =
      intent.intent === "exercise_last_practice"
        ? `El último día registrado de ${name} en ${periodText(data)} fue el ${dateLabel(last.date)}: ${sameDay.map((e) => observationText(e)).join("; ")}.${new Set(sameDay.map((e) => e.session_id)).size > 1 ? " Hay varias actividades ese día; sus observaciones se mantienen separadas." : ""}${data.has_more ? " Hay más registros; la lista es parcial." : ""}`
        : `${name}, ${periodText(data)}:\n${rows.map((e) => `• ${dateLabel(e.date)}: ${observationText(e)}.`).join("\n")}${data.has_more ? "\nHay más registros; concreta un periodo para verlos." : ""}`;
    return {
      answer,
      cards: [
        card(
          "exercise_history_summary",
          name,
          "Abre la actividad para consultar sus bloques",
          [],
          [
            {
              type: "open_training_session",
              label: "Ver actividad",
              session_id: last.session_id,
            },
          ],
        ),
      ],
    };
  }
  const coverage = data.metric_coverage;
  const headline = `${name}: ${data.sessions} ${data.sessions === 1 ? "sesión" : "sesiones"} y ${data.observations} ${data.observations === 1 ? "observación" : "observaciones"} en ${periodText(data)}.`;
  const evidence = data.last_practice
    ? `La última práctica registrada fue el ${dateLabel(data.last_practice)}.`
    : null;
  const known = coverage.reps_known;
  const coverageText = data.observations
    ? `Tengo repeticiones conocidas en ${known} ${known === 1 ? "observación" : "observaciones"}${known < data.observations ? `; faltan en ${data.observations - known}` : ""}.`
    : null;
  const limitation = qualityWording(data.data_quality, data.missing_metrics);
  let interpretation =
    {
      improving: "Las repeticiones comparables muestran mejora en el periodo.",
      stable: "Las repeticiones comparables se mantienen estables.",
      declining: "Las repeticiones comparables han bajado en el periodo.",
    }[data.trend] ||
    "Todavía no hay evidencia comparable suficiente para afirmar progresión de repeticiones; la frecuencia por sí sola no la demuestra.";
  if (data.variants.length > 1)
    interpretation =
      "Las variantes tienen métricas o condiciones diferentes: las mantengo separadas para no atribuirte una mejora que no puedo demostrar.";
  let answer;
  if (intent.intent === "exercise_best_observation") {
    const best = data.best_observations
      .map((v) => {
        if (v.load !== null && loadLabel(v.unit))
          return `${v.load} ${loadLabel(v.unit)} con ${v.reps} repeticiones (${dateLabel(v.date)})`;
        if (v.unit === "bodyweight")
          return `${v.reps} repeticiones con peso corporal (${dateLabel(v.date)})`;
        return null;
      })
      .filter(Boolean);
    answer = join([
      best.length
        ? `Mejor registro conocido de ${name} en ${periodText(data)}: ${best.join("; ")}.`
        : `No tengo carga y repeticiones compatibles para establecer un mejor registro conocido de ${name} en ${periodText(data)}.`,
      best.length > 1 ? "Son variantes distintas, no un único récord." : null,
      limitation,
      "El alcance es este periodo, no un récord absoluto de todo tu historial.",
    ]);
  } else if (intent.intent === "exercise_missing_data") {
    answer = join([
      `${name}: ${limitation || "Las métricas requeridas están registradas."}`,
      headline,
      known > 0 ? coverageText : null,
      known > 0 ? interpretation : null,
      data.missing_metrics.length || data.data_quality === "partial"
        ? "Puedes completar las repeticiones y, cuando corresponda, la carga con su unidad en el detalle de la actividad."
        : null,
    ]);
  } else
    answer = join([
      headline,
      evidence,
      coverageText,
      interpretation,
      limitation,
    ]);
  const metrics = [];
  for (const v of data.variants.slice(0, 4)) {
    if (v.best_load !== null && loadLabel(v.unit))
      metrics.push(
        metric(
          "known_load",
          "Mayor carga registrada",
          v.best_load,
          loadLabel(v.unit),
        ),
      );
    if (v.best_reps !== null)
      metrics.push(
        metric("known_reps", "Máximas reps en una serie", v.best_reps, "reps"),
      );
  }
  // Metrics complement prose; do not show an empty or misleading mixed-variant card.
  return {
    answer,
    cards:
      metrics.length &&
      data.variants.length === 1 &&
      intent.intent !== "exercise_best_observation"
        ? [
            card(
              "exercise_progress",
              name,
              "Valores conocidos del periodo; no equivalen a un récord absoluto",
              metrics,
            ),
          ]
        : [],
  };
}
export function renderSession(data) {
  const header = `${visibleLabel(data.session.title)} · ${modalities[data.canonical_modality] || "Otra modalidad"}, ${dateLabel(data.session.date)}.`;
  const lines = [
    header,
    data.duration !== null
      ? `Duración: ${Math.round(data.duration / 60)} min.`
      : "No tengo la duración registrada.",
  ];
  for (const block of data.blocks.slice(0, 20)) {
    lines.push(`${visibleLabel(block.name, "Bloque")}:`);
    const exercises = data.exercises.filter((e) => e.block_id === block.id);
    for (const e of exercises.slice(0, 30))
      lines.push(
        `• ${visibleLabel(e.display_name || e.reported_name, "Ejercicio sin identificar")}: ${observationText(e)}.${e.identity_status === "unresolved" ? " Identidad pendiente de aclarar." : ""}`,
      );
    if (!exercises.length)
      lines.push("Sin ejercicios detallados en este bloque.");
    if (exercises.length > 30)
      lines.push("Hay más ejercicios en el detalle de la actividad.");
  }
  for (const e of data.exercises
    .filter((e) => !data.blocks.some((b) => b.id === e.block_id))
    .slice(0, 30))
    lines.push(
      `• ${visibleLabel(e.display_name || e.reported_name, "Ejercicio sin identificar")}: ${observationText(e)}.`,
    );
  if (!data.exercises.length)
    lines.push("No tengo series, repeticiones ni cargas registradas.");
  if (data.blocks.length > 20 || data.exercises.length > 30)
    lines.push("Abre la actividad para consultar el detalle completo.");
  if (data.data_quality !== "complete")
    lines.push("El detalle es parcial; no completo las métricas que faltan.");
  return {
    answer: lines.join("\n"),
    cards: [
      card(
        "session_detail",
        "Detalle de la actividad",
        "Consulta los registros y completa los datos que falten",
        [],
        [
          {
            type: "open_training_session",
            label: "Abrir actividad",
            session_id: data.session.id,
          },
        ],
      ),
    ],
  };
}
export function renderSessions(data) {
  return {
    answer: data.sessions.length
      ? `${data.date ? `El ${dateLabel(data.date)}` : "En el historial reciente"} hay ${data.sessions.length}${data.has_more ? " o más" : ""} actividades separadas:\n${data.sessions.map((s) => `• ${visibleLabel(s.title)} (${dateLabel(s.local_date)})${s.duration_seconds !== null ? `, ${Math.round(s.duration_seconds / 60)} min` : ", duración no registrada"}.`).join("\n")}\n¿Cuál quieres revisar?`
      : "No encuentro actividades registradas en esa fecha. La ausencia de registros no significa descanso ni un entrenamiento perdido.",
    cards: [],
  };
}
export function renderOverview(data, previous = null) {
  const describe = (d) =>
    `${d.activity.sessions} ${d.activity.sessions === 1 ? "actividad" : "actividades"}${d.activity.seconds !== null ? ` y ${Math.round(d.activity.seconds / 60)} min registrados` : ""}`;
  const breakdown =
    !previous && data.modalities.length
      ? `Reparto: ${data.modalities.map((m) => `${modalities[m.code] || "Otra modalidad"}: ${m.sessions}`).join(", ")}.`
      : null;
  return {
    answer: join([
      `En ${periodText(data)} tienes ${describe(data)}.`,
      breakdown,
      previous ? `En ${periodText(previous)}: ${describe(previous)}.` : null,
      "Esto describe tu actividad; más sesiones o minutos no demuestran por sí solos una mejora de rendimiento.",
      qualityWording(data.data_quality.status),
    ]),
    cards: [],
  };
}
