import {
  buildCoachCards,
  detectCoachIntents,
  filterAvailableEquipment,
} from "./coachCards.js";
import {
  buildTrainingRecommendation,
  explainTrainingRecommendation,
} from "./trainingRecommendation.js";
import {
  buildTrainingTrendComparison,
  explainTrainingTrend,
} from "./trainingTrend.js";
import { buildWeekPlanProgress, explainWeekPlanProgress } from "./weekPlanProgress.js";
import { coachHealthFamily, coachReadiness, explainCoachReadiness, observedHealthNumber } from "./coachHealthContext.js";
import { CLOSED_LOOP_ALGORITHM_VERSION, CLOSED_LOOP_SCHEMA_VERSION } from "../closedLoop/closedLoopAssessment.js";

const asPositiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const formatDuration = (seconds) => {
  const value = asPositiveNumber(seconds);
  if (!value) return null;
  const totalMinutes = Math.round(value / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
};

const formatDistance = (meters) => {
  const value = asPositiveNumber(meters);
  if (!value) return null;
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2).replace(/\.0$/, "")} km`;
};

const joinNatural = (items = []) => {
  const values = items.filter(Boolean);
  if (values.length <= 1) return values[0] || "";
  if (values.length === 2) return `${values[0]} y ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} y ${values.at(-1)}`;
};

function buildPeriodAnswer(period = {}) {
  const summary = period?.summary || {};
  const sessions = asPositiveNumber(summary.sessions_count);
  if (!sessions) return "No tengo sesiones registradas en el periodo consultado.";

  const activeDays = asPositiveNumber(summary.active_days);
  const duration = formatDuration(summary.total_duration_seconds);
  const activityTypes = summary.activity_types && typeof summary.activity_types === "object"
    ? Object.entries(summary.activity_types)
      .filter(([, value]) => Number(value) > 0)
      .map(([label, value]) => `${label}: ${value}`)
    : [];

  const facts = [
    `${sessions} ${sessions === 1 ? "sesión" : "sesiones"}`,
    activeDays ? `${activeDays} ${activeDays === 1 ? "día activo" : "días activos"}` : null,
    duration ? `${duration} de entrenamiento` : null,
  ];

  const breakdown = activityTypes.length
    ? ` Reparto: ${activityTypes.join(", ")}.`
    : "";

  return `En el periodo consultado tienes ${joinNatural(facts)}.${breakdown}`;
}

function buildSessionAnswer(period = {}, { targetDate = null, exactDate = false } = {}) {
  const sessions = Array.isArray(period?.sessions) ? period.sessions : [];
  const session = exactDate && targetDate
    ? sessions.find((item) => item?.date === targetDate)
    : sessions[0];
  if (!session) {
    return exactDate
      ? "No tengo una sesión registrada para ayer en ENQIDU."
      : "No tengo una sesión reciente disponible en ENQIDU.";
  }

  const duration = formatDuration(session.duration_seconds);
  const distance = formatDistance(session.distance_meters);
  const elevation = asPositiveNumber(session.elevation_gain_meters);
  const blocks = asPositiveNumber(session.blocks_count);
  const details = [
    duration ? `duración ${duration}` : null,
    distance ? `distancia ${distance}` : null,
    elevation ? `desnivel ${Math.round(elevation)} m` : null,
    blocks ? `${blocks} ${blocks === 1 ? "bloque" : "bloques"}` : null,
  ];

  const date = session.date ? ` del ${session.date}` : "";
  const suffix = details.length ? ` (${joinNatural(details)})` : "";
  const prefix = exactDate ? "Ayer registraste" : "Tu última sesión disponible es";
  return `${prefix} ${session.title || session.garmin_type_label || "una sesión registrada"}${date}${suffix}.`;
}

function buildRecoveryAnswer(context = {}, intents = {}) {
  const numericFact = (label, value, unit = "") => {
    const observed = observedHealthNumber(value);
    return observed == null ? null : `${label} ${Number(observed.toFixed(1))}${unit ? ` ${unit}` : ""}`;
  };
  const durationFact = (label, value) => {
    const observed = observedHealthNumber(value);
    return observed == null ? null : `${label} ${observed === 0 ? "0 min" : formatDuration(observed)}`;
  };
  const families = {
    sleep: (value) => [
      numericFact("sueño", value.sleep_score),
      durationFact("duración de sueño", value.duration_seconds),
      ...(intents.healthMetric === "sleep" ? [
        durationFact("sueño profundo", value.deep_seconds),
        durationFact("sueño ligero", value.light_seconds),
        durationFact("sueño REM", value.rem_seconds),
        durationFact("tiempo despierto", value.awake_seconds),
      ] : []),
    ],
    hrv: (value) => [
      numericFact("HRV nocturna", value.last_night_avg_ms, "ms"),
      ...(intents.healthMetric === "hrv" ? [
        numericFact("máxima media de 5 min", value.last_night_5min_high_ms, "ms"),
        numericFact("lecturas", value.readings_count),
      ] : []),
    ],
    body_battery: (value) => [
      numericFact("Body Battery", value.current),
      numericFact("cargado", value.charged),
      numericFact("consumido", value.drained),
    ],
    stress: (value) => [
      numericFact("estrés medio", value.average),
      numericFact("estrés máximo", value.max),
    ],
    heart_rate: (value) => [
      numericFact("frecuencia cardiaca en reposo", value.resting, "ppm"),
      numericFact("frecuencia cardiaca mínima", value.min, "ppm"),
      numericFact("frecuencia cardiaca máxima", value.max, "ppm"),
    ],
    spo2: (value) => [
      numericFact("SpO2 media", value.average, "%"),
      numericFact("SpO2 mínima", value.min, "%"),
    ],
    respiration: (value) => [
      numericFact("respiración media", value.average, "resp/min"),
      numericFact("respiración mínima", value.min, "resp/min"),
    ],
  };
  const statements = [];
  for (const [name, describe] of Object.entries(families)) {
    if (intents.healthMetric && name !== intents.healthMetric) continue;
    const family = coachHealthFamily(context, name);
    if (!family) continue;
    const facts = describe(family).filter(Boolean);
    if (!facts.length) continue;
    const historical = family.freshness !== "current";
    statements.push(`${joinNatural(facts)} (${historical ? "dato histórico del" : "registrado el"} ${family.calendar_date})${historical ? "; no lo trato como actual" : ""}.`);
  }
  const missingLabels = { sleep: "sueño", hrv: "HRV", body_battery: "Body Battery" };
  const facts = statements.length
    ? `Datos de recuperación disponibles: ${statements.join(" ")}`
    : intents.healthMetric
      ? `No tengo ${missingLabels[intents.healthMetric]} registrado para la fecha consultada.`
      : "Aún no tengo datos de recuperación suficientes para hoy (sueño, HRV o Body Battery).";
  return `${facts} ${explainCoachReadiness(context, { includeFactors: !intents.healthMetric })}`;
}

function buildPlannedTrainingAnswer(plannedTraining = {}) {
  const sessions = Array.isArray(plannedTraining?.sessions) ? plannedTraining.sessions : [];
  if (!sessions.length) {
    return "No tienes una sesión planificada para hoy en ENQIDU.";
  }

  if (sessions.length > 1) {
    const names = sessions
      .map((session) => session.title || session.session_type)
      .filter(Boolean);
    return `Hoy tienes ${sessions.length} sesiones planificadas: ${joinNatural(names)}.`;
  }

  const session = sessions[0];
  const durationMin = asPositiveNumber(session.planned_duration_min);
  const durationMax = asPositiveNumber(session.planned_duration_max);
  const duration = durationMin && durationMax && durationMin !== durationMax
    ? `${durationMin}–${durationMax} min`
    : durationMax
      ? `${durationMax} min`
      : durationMin
        ? `${durationMin} min`
        : null;
  const blocks = Array.isArray(session.blocks) ? session.blocks : [];
  const blockNames = blocks.map((block) => block.title).filter(Boolean).slice(0, 5);
  const details = [
    session.session_type ? `tipo ${session.session_type}` : null,
    session.planned_intensity ? `intensidad ${session.planned_intensity}` : null,
    duration ? `duración prevista ${duration}` : null,
    session.location_type ? `entorno ${session.location_type}` : null,
  ];

  let answer = `Hoy tienes planificado ${session.title || "un entrenamiento"}`;
  if (details.filter(Boolean).length) answer += ` (${joinNatural(details)})`;
  answer += ".";

  if (session.objective) answer += ` Objetivo: ${session.objective}.`;
  if (blockNames.length) answer += ` Bloques: ${blockNames.join(", ")}.`;
  return answer;
}

function buildClosedLoopAnswer(context = {}) {
  const assessments = Array.isArray(context?.closed_loop_assessments) ? context.closed_loop_assessments : [];
  const priority = (item) => item.identity_match === "exact_persisted_link" && item.executed_session ? 0
    : item.completion === "not_executed" ? 1 : 2;
  const assessment = assessments.filter((item) => item?.schema_version === CLOSED_LOOP_SCHEMA_VERSION
    && item.algorithm_version === CLOSED_LOOP_ALGORITHM_VERSION && item.applied === false)
    .sort((a, b) => priority(a) - priority(b)
      || String(b.executed_session?.calendar_date || b.planned_session?.calendar_date || "").localeCompare(String(a.executed_session?.calendar_date || a.planned_session?.calendar_date || ""))
      || String(a.executed_session?.id || a.planned_session?.id || "").localeCompare(String(b.executed_session?.id || b.planned_session?.id || "")))[0];
  if (!assessment) return "Aún no tengo una evaluación de plan y ejecución disponible para la sesión consultada.";
  const completion = {
    completed: "La sesión consta como completada.",
    partial: "La evidencia confirma una ejecución parcial.",
    not_executed: "Consta de forma explícita como no ejecutada.",
    unknown: "No hay evidencia suficiente para confirmar la completitud.",
  }[assessment.completion] || "No hay evidencia suficiente para confirmar la completitud.";
  const facts = Array.isArray(assessment.assessment?.facts)
    ? assessment.assessment.facts.filter((fact) => typeof fact?.reason === "string" && fact.code !== "execution_linked").slice(0, 6).map((fact) => fact.reason)
    : [];
  const execution = assessment.executed_session?.evidence_kind === "objective_fit"
    ? " Hay una ejecución FIT enlazada como evidencia objetiva."
    : "";
  const title = assessment.planned_session?.title || "la sesión consultada";
  const date = assessment.planned_session?.calendar_date;
  const proposal = assessment.adaptation_proposal;
  const actions = {
    keep: "mantener la planificación",
    reduce: "revisar una reducción de carga",
    increase: "revisar un aumento de carga",
    move: "valorar un cambio de día",
    recovery_bias: "priorizar recuperación",
    no_change: "mantener la planificación con la evidencia actual",
  };
  const adaptation = proposal?.applied === false && proposal.requires_explicit_action === true && actions[proposal.action]
    ? ` Propuesta: ${actions[proposal.action]}; requiere una acción explícita. No se ha aplicado ningún cambio al plan.`
    : "";
  return `Comparación de ${title}${date ? ` (${date})` : ""}: ${completion}${execution}${facts.length ? ` ${facts.join(" ")}` : ""}${adaptation}`;
}

function buildUnavailablePlanAnswer(availability = {}, plannedTraining = {}) {
  const sessions = Array.isArray(plannedTraining?.sessions) ? plannedTraining.sessions : [];
  const date = availability?.date || plannedTraining?.date || null;
  if (!sessions.length) {
    return `Tienes ${date ? `el ${date} ` : ""}marcado como no disponible para entrenar. No genero una sesión para ese día.`;
  }

  const names = sessions
    .map((session) => session?.title || session?.session_type)
    .filter(Boolean);
  const planned = names.length ? joinNatural(names) : "una sesión";
  return `Tienes ${date ? `el ${date} ` : ""}marcado como no disponible para entrenar, pero sigue planificado ${planned}. No he movido ni cancelado esa sesión sin una orden explícita.`;
}

function buildEquipmentAnswer(equipment = [], requestedLocation = null) {
  const filtered = filterAvailableEquipment(equipment, requestedLocation);
  const label = requestedLocation?.label ? ` en ${requestedLocation.label.toLowerCase()}` : "";

  if (!filtered.length) {
    return `No tengo equipamiento disponible registrado${label}.`;
  }

  const names = filtered
    .map((item) => item.name || item.label || item.item_name)
    .filter(Boolean);
  const uniqueNames = [...new Set(names)];
  const visibleNames = uniqueNames.slice(0, 10);
  const remaining = Math.max(0, uniqueNames.length - visibleNames.length);
  const list = visibleNames.length ? joinNatural(visibleNames) : null;
  const more = remaining ? ` y ${remaining} elementos más` : "";

  return list
    ? `Tienes ${filtered.length} elementos disponibles${label}: ${list}${more}.`
    : `Tienes ${filtered.length} elementos disponibles${label}.`;
}

function buildUnsupportedAnswer() {
  return "En esta primera fase puedo responder directamente con datos ENQIDU sobre tu plan de hoy, tu semana, tendencias de carga/volumen, tu última sesión, recuperación y equipamiento. Para análisis libre o planificación compleja, la capa LLM está desactivada.";
}

function buildGreetingAnswer() {
  return "¡Hola! Puedo decirte qué tienes planificado hoy, cómo vas esta semana, comparar tu carga con el periodo anterior, qué hiciste ayer, cómo estás de recuperación o qué material tienes disponible.";
}

export function buildDeterministicCoachReply({ message = "", context = {} } = {}) {
  const intents = detectCoachIntents(message);
  const answers = [];
  const plannedSessions = Array.isArray(context?.planned_training?.sessions)
    ? context.planned_training.sessions
    : [];
  const unavailable = context?.training_availability?.status === "unavailable";
  const trainingIntent = intents.planToday || intents.healthTraining;
  const recommendation = trainingIntent && !plannedSessions.length
    ? buildTrainingRecommendation(context, { requestedLocation: intents.equipmentLocation })
    : null;
  const trendComparison = intents.trend
    ? buildTrainingTrendComparison(context?.training_comparison || {})
    : null;
  const weekPlanProgress = intents.weekPlan
    ? buildWeekPlanProgress(context?.weekly_planning || {}, context?.current_week || {})
    : null;

  if (intents.greeting) {
    answers.push(buildGreetingAnswer());
  }
  if (trainingIntent) {
    answers.push(unavailable
      ? buildUnavailablePlanAnswer(
          context?.training_availability || {},
          context?.planned_training || {},
        )
      : plannedSessions.length
        ? buildPlannedTrainingAnswer(context?.planned_training || {})
        : explainTrainingRecommendation(recommendation));
    if (plannedSessions.length && intents.healthTraining) {
      answers[answers.length - 1] += " El plan persistido sigue siendo la referencia; no he cambiado la sesión.";
    }
    if (!intents.recovery && coachReadiness(context).score != null) {
      answers[answers.length - 1] += ` ${explainCoachReadiness(context)}`;
    }
  }
  if (intents.weekPlan) {
    answers.push(explainWeekPlanProgress(weekPlanProgress));
  }
  if (intents.recovery) {
    answers.push(buildRecoveryAnswer(context, intents));
  }
  if (intents.closedLoop) {
    answers.push(buildClosedLoopAnswer(context));
  }
  if (intents.equipment) {
    answers.push(buildEquipmentAnswer(
      context?.athlete_context?.equipment || [],
      intents.equipmentLocation,
    ));
  }
  if (intents.trend) {
    answers.push(explainTrainingTrend(trendComparison));
  }
  if (intents.period && !intents.trend && !intents.weekPlan) {
    answers.push(buildPeriodAnswer(context?.training_period || {}));
  }
  if (intents.session) {
    answers.push(buildSessionAnswer(
      context?.training_period || {},
      {
        targetDate: context?.request?.date || null,
        exactDate: intents.yesterday,
      },
    ));
  }

  const answer = (answers.length ? answers : [buildUnsupportedAnswer()])
    .slice(0, 2)
    .join("\n\n");

  return {
    answer,
    cards: buildCoachCards({
      message,
      context,
      recommendation,
      trendComparison,
      weekPlanProgress,
    }),
    intents,
    responseMode: "deterministic",
    llmUsed: false,
    response_mode: "deterministic",
    llm_used: false,
    usage: null,
  };
}
