import { buildTrainingTrendComparison } from "./trainingTrend.js";
import { buildWeekPlanProgress } from "./weekPlanProgress.js";

const MAX_CARDS = 2;

const normalizeText = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const hasAny = (text, patterns) => patterns.some((pattern) => text.includes(pattern));

const asNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const metric = (key, label, value, unit = "") => {
  const numeric = asNumber(value);
  if (numeric == null || numeric <= 0) return null;
  return { key, label, value: numeric, unit };
};

const compact = (items) => items.filter(Boolean);

const titleCase = (value = "") => String(value)
  .replace(/[_-]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

const EQUIPMENT_LOCATION_PATTERNS = [
  { key: "home", label: "Casa", patterns: ["casa", "home"] },
  { key: "pool", label: "Piscina", patterns: ["piscina", "pool", "natacion"] },
  { key: "trail", label: "Trail", patterns: ["trail", "montana", "sendero"] },
  { key: "outdoor", label: "Aire libre", patterns: ["aire libre", "outdoor", "parque"] },
  {
    key: "functional_training_center",
    label: "Centro funcional",
    patterns: ["centro funcional", "functional", "box", "gimnasio", "gym"],
  },
];

const normalizeLocation = (value = "") => normalizeText(value).replace(/[\s-]+/g, "_");
const isAvailable = (value) => value === true || normalizeText(value) === "true";

export function detectEquipmentLocation(message = "") {
  const text = normalizeText(message);
  return EQUIPMENT_LOCATION_PATTERNS.find((location) =>
    hasAny(text, location.patterns.map((pattern) => normalizeText(pattern)))
  ) || null;
}

export function detectCoachIntents(message = "") {
  const text = normalizeText(message);
  const greeting = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal)[!¡?¿.,]*$/.test(text.trim());
  const refersToFutureWeek = /\b(?:(?:esta|la)\s+)?semana\s+que\s+viene\b|\bproxima\s+semana\b|\bsemana\s+proxima\b/.test(text);
  const plannedSessionsThisWeek = text.includes("esta semana")
    && /\b(sesion|sesiones|entrenamiento|entrenamientos)\b/.test(text)
    && /\b(planificada|planificadas|planificado|planificados|programada|programadas|programado|programados)\b/.test(text);
  const weekPlan = !refersToFutureWeek && (plannedSessionsThisWeek || hasAny(text, [
    "que tengo esta semana",
    "que me queda esta semana",
    "que me queda por entrenar esta semana",
    "que me falta esta semana",
    "que me falta por entrenar",
    "como voy respecto al plan",
    "respecto al plan semanal",
    "plan semanal",
    "plan de la semana",
    "sesiones planificadas esta semana",
    "entrenamientos planificados esta semana",
  ]));
  const trend = hasAny(text, [
    "estoy mejorando",
    "voy mejorando",
    "he mejorado",
    "comparame esta semana",
    "compara esta semana",
    "semana anterior",
    "respecto a la semana anterior",
    "tendencia",
    "evolucion",
    "como va mi carga",
    "carga comparada",
    "progreso respecto",
  ]);
  const planToday = hasAny(text, [
    "que entreno hoy",
    "que hago hoy",
    "que me recomiendas hoy",
    "que recomiendas hoy",
    "recomiendame para hoy",
    "que tengo hoy",
    "que toca hoy",
    "que me toca hoy",
    "plan de hoy",
    "entrenamiento de hoy previsto",
    "entrenamiento previsto",
    "sesion planificada",
    "sesion prevista",
    "entrenamiento planificado",
  ]);

  return {
    greeting,
    weekPlan,
    trend,
    planToday,
    recovery: hasAny(text, [
      "recuperacion",
      "readiness",
      "sueno",
      "dormi",
      "hrv",
      "body battery",
      "datos de salud",
      "estoy recuperado",
      "afecta al entrenamiento",
      "fatiga",
      "como estoy hoy",
      "puedo entrenar hoy",
    ]),
    equipment: hasAny(text, [
      "material",
      "equipamiento",
      "material disponible",
      "equipamiento disponible",
      "que material tengo",
      "que equipamiento tengo",
      "puedo usar para entrenar",
      "con que entreno",
      "entrenar en casa",
      "entreno en casa",
    ]),
    period: !refersToFutureWeek && hasAny(text, [
      "semana",
      "carga",
      "volumen",
      "balance",
      "resumen semanal",
      "resumen de la semana",
      "resumen entrenamiento",
      "como voy",
      "progreso",
    ]),
    session: !planToday && hasAny(text, [
      "ayer",
      "ultimo",
      "ultima",
      "he hecho",
      "hice",
      "que hice",
      "actividad de hoy",
      "sesion de hoy",
      "entreno de hoy",
      "entrenamiento de hoy",
      "mi sesion",
      "mi entreno",
    ]),
    yesterday: text.includes("ayer"),
    equipmentLocation: detectEquipmentLocation(text),
  };
}

export function filterAvailableEquipment(equipment = [], requestedLocation = null) {
  const available = (Array.isArray(equipment) ? equipment : [])
    .filter((item) => item && typeof item === "object" && isAvailable(item.available));

  if (!requestedLocation) return available;
  return available.filter((item) => normalizeLocation(item.location) === requestedLocation.key);
}

function buildTrainingPeriodCard(period = {}) {
  const summary = period?.summary || {};
  const sessionsCount = asNumber(summary.sessions_count);
  if (!sessionsCount) return null;

  return {
    id: "training_period_summary",
    type: "metric_summary",
    title: "Tu periodo de entrenamiento",
    subtitle: period?.period?.from && period?.period?.to
      ? `${period.period.from} · ${period.period.to}`
      : null,
    date_range: period?.period?.from && period?.period?.to
      ? { from: period.period.from, to: period.period.to }
      : null,
    metrics: compact([
      metric("sessions", "Sesiones", summary.sessions_count),
      metric("active_days", "Días activos", summary.active_days),
      metric("duration", "Tiempo", summary.total_duration_seconds, "s"),
    ]),
    breakdown: summary.activity_types && typeof summary.activity_types === "object"
      ? Object.entries(summary.activity_types).map(([label, value]) => ({ label, value }))
      : [],
    actions: [{ type: "open_activities", label: "Ver entrenamiento" }],
    provenance: "enkidu_context",
  };
}

function buildTrainingTrendCard(comparison) {
  if (!comparison?.comparable) return null;
  const current = comparison.current || {};
  const previous = comparison.previous || {};
  const currentTypes = current.activity_types && typeof current.activity_types === "object"
    ? current.activity_types
    : {};

  return {
    id: "training_trend_comparison",
    type: "comparison_summary",
    title: "Tendencia de entrenamiento",
    subtitle: comparison.partial_current_period
      ? "Mismo tramo transcurrido vs periodo anterior"
      : "Periodo actual vs anterior",
    badge: "Comparativa",
    metrics: compact([
      metric("sessions_current", "Sesiones actuales", current.sessions_count),
      metric("active_days_current", "Días activos actuales", current.active_days),
      metric("duration_current", "Tiempo actual", current.total_duration_seconds, "s"),
    ]),
    breakdown: Object.entries(currentTypes).map(([label, value]) => ({ label, value })),
    comparison: {
      current_period: comparison.current_period,
      previous_period: comparison.previous_period,
      deltas: comparison.deltas,
      basis: comparison.basis,
      partial_current_period: comparison.partial_current_period,
      previous,
    },
    actions: [{ type: "open_activities", label: "Ver entrenamiento" }],
    provenance: "enkidu_context",
  };
}

function buildWeeklyPlanProgressCard(progress) {
  if (!progress?.has_plan) return null;

  const breakdown = [
    ...(progress.upcoming || []).slice(0, 4).map((session) => ({
      label: `${session.planned_date || ""} · ${session.title || titleCase(session.session_type || "Sesión")}`.replace(/^ · /, ""),
      value: 1,
    })),
    ...(progress.past_unlinked || []).slice(0, 2).map((session) => ({
      label: `${session.planned_date || ""} · ${session.title || titleCase(session.session_type || "Sesión")} · sin ejecución enlazada`.replace(/^ · /, ""),
      value: 1,
    })),
  ].slice(0, 5);

  return {
    id: "weekly_plan_progress",
    type: "plan_progress_summary",
    title: "Plan semanal",
    subtitle: progress.from && progress.to ? `${progress.from} · ${progress.to}` : null,
    badge: "Seguimiento",
    metrics: compact([
      metric("planned_sessions", "Planificadas", progress.planned_count),
      metric("linked_completed", "Con ejecución enlazada", progress.completed_linked_count),
      metric("upcoming_sessions", "Por delante", progress.upcoming_count),
      metric("executed_week", "Ejecutadas esta semana", progress.executed_week_count),
    ]),
    breakdown,
    actions: [{ type: "open_activities", label: "Ver entrenamiento" }],
    provenance: "enkidu_context",
  };
}

function buildLatestSessionCard(session) {
  if (!session || typeof session !== "object") return null;
  const sessionId = typeof session.session_id === "string" && session.session_id.trim()
    ? session.session_id.trim()
    : (typeof session.id === "string" && session.id.trim() ? session.id.trim() : null);
  const hasSessionData = sessionId || session.title || session.date || session.duration_seconds
    || session.distance_meters || session.blocks_count;
  if (!hasSessionData) return null;
  return {
    id: "latest_training_session",
    type: "session_summary",
    title: session.title || session.garmin_type_label || "Última sesión",
    subtitle: session.date || null,
    badge: session.garmin_type_label || null,
    metrics: compact([
      metric("duration", "Duración", session.duration_seconds, "s"),
      metric("distance", "Distancia", session.distance_meters, "m"),
      metric("elevation", "Desnivel", session.elevation_gain_meters, "m"),
      metric("blocks", "Bloques", session.blocks_count),
    ]),
    quality: session.quality || null,
    actions: sessionId
      ? [{ type: "open_training_session", label: "Abrir sesión", session_id: sessionId }]
      : [],
    provenance: "enkidu_context",
  };
}

function buildRecoveryCard(recovery = {}) {
  const readiness = recovery?.readiness || {};
  const sleep = recovery?.sleep || {};
  const hrv = recovery?.hrv || {};
  const battery = recovery?.body_battery || {};
  const metrics = compact([
    metric("readiness", "Readiness", readiness.score),
    metric("sleep_score", "Sueño", sleep.score),
    metric("sleep_duration", "Duración sueño", sleep.duration_seconds, "s"),
    metric("hrv", "HRV nocturna", hrv.night_avg_ms, "ms"),
    metric("body_battery", "Body Battery", battery.morning),
  ]);

  if (!metrics.length) return null;

  return {
    id: "recovery_readiness",
    type: "recovery_summary",
    title: "Recuperación de hoy",
    subtitle: recovery.date || null,
    badge: "Recovery",
    metrics,
    breakdown: [],
    actions: [],
    provenance: "enkidu_context",
  };
}

function buildPlannedTrainingCard(plannedTraining = {}) {
  const sessions = Array.isArray(plannedTraining?.sessions) ? plannedTraining.sessions : [];
  if (!sessions.length) return null;

  const primary = sessions[0];
  const minDuration = asNumber(primary.planned_duration_min);
  const maxDuration = asNumber(primary.planned_duration_max);
  const duration = maxDuration || minDuration;
  const blocksCount = asNumber(primary.blocks_count);

  const breakdown = sessions.length === 1
    ? (Array.isArray(primary.blocks) ? primary.blocks : [])
      .slice(0, 5)
      .map((block) => ({
        label: block.title || titleCase(block.block_type || "Bloque"),
        value: asNumber(block.planned_duration_seconds)
          ? Math.round(Number(block.planned_duration_seconds) / 60)
          : 1,
      }))
    : sessions.slice(0, 5).map((session) => ({
      label: session.title || titleCase(session.session_type || "Sesión"),
      value: 1,
    }));

  return {
    id: "planned_training_today",
    type: "planned_session_summary",
    date: plannedTraining.date || primary.planned_date || null,
    title: sessions.length === 1
      ? (primary.title || "Entrenamiento de hoy")
      : `Plan de hoy · ${sessions.length} sesiones`,
    subtitle: plannedTraining.date || primary.planned_date || null,
    badge: titleCase(primary.session_type || primary.status || "Plan"),
    metrics: compact([
      metric("planned_duration", "Duración prevista", duration, "min"),
      metric("blocks", "Bloques", blocksCount),
    ]),
    breakdown,
    actions: [],
    provenance: "enkidu_context",
  };
}

function buildTrainingAvailabilityCard(availability = {}) {
  if (availability?.status !== "unavailable") return null;
  return {
    id: "training_availability",
    type: "availability_status",
    title: "No disponible para entrenar",
    subtitle: availability.date || null,
    badge: "Disponibilidad",
    metrics: [],
    breakdown: [],
    actions: [],
    provenance: "enkidu_context",
  };
}

function buildRecommendedTrainingCard(recommendation, date = null) {
  if (!recommendation || recommendation.insufficient) return null;
  return {
    id: "recommended_training_today",
    type: "recommended_session_summary",
    title: recommendation.title,
    subtitle: "Recomendación calculada · no guardada",
    badge: "Recomendación",
    metrics: compact([
      metric("recommended_duration", "Duración aproximada", recommendation.duration_minutes, "min"),
      metric("blocks", "Bloques", recommendation.blocks?.length),
    ]),
    breakdown: (recommendation.blocks || []).slice(0, 5).map((block) => ({
      label: block.title,
      value: block.duration_minutes,
    })),
    session: recommendation,
    actions: date ? [{
      type: "save_recommendation_to_plan",
      label: "Guardar en plan",
      date,
      location: recommendation.environment || null,
    }] : [],
    provenance: "enkidu_deterministic_recommendation",
  };
}

function buildEquipmentCard(equipment = [], requestedLocation = null) {
  const filtered = filterAvailableEquipment(equipment, requestedLocation);
  if (!filtered.length) return null;

  const categories = new Map();
  for (const item of filtered) {
    const rawCategory = item.category || item.type || "Otros";
    const label = titleCase(rawCategory) || "Otros";
    categories.set(label, (categories.get(label) || 0) + 1);
  }

  const breakdown = [...categories.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"))
    .slice(0, 5);

  return {
    id: "equipment_context",
    type: "equipment_summary",
    title: requestedLocation
      ? `Equipamiento · ${requestedLocation.label}`
      : "Tu equipamiento disponible",
    subtitle: requestedLocation?.label || null,
    badge: "Entorno",
    metrics: compact([
      metric("equipment_items", "Elementos", filtered.length),
      metric("equipment_categories", "Categorías", categories.size),
    ]),
    breakdown,
    actions: [],
    provenance: "enkidu_context",
  };
}

export function buildCoachCards({
  message = "",
  context = {},
  recommendation = null,
  trendComparison = null,
  weekPlanProgress = null,
} = {}) {
  const intents = detectCoachIntents(message);
  const period = context?.training_period || {};
  const sessions = Array.isArray(period?.sessions) ? period.sessions : [];
  const requestedDate = context?.request?.date || null;
  const sessionForIntent = intents.yesterday && requestedDate
    ? sessions.find((session) => session?.date === requestedDate) || null
    : sessions[0] || null;
  const cards = [];

  if (intents.planToday) {
    const availabilityCard = buildTrainingAvailabilityCard(context?.training_availability || {});
    const plannedCard = buildPlannedTrainingCard(context?.planned_training || {});
    if (availabilityCard) {
      cards.push(availabilityCard);
      if (plannedCard) cards.push(plannedCard);
    } else {
      cards.push(plannedCard || buildRecommendedTrainingCard(
        recommendation,
        context?.request?.date || context?.planned_training?.date || null,
      ));
    }
  }
  if (intents.weekPlan) {
    cards.push(buildWeeklyPlanProgressCard(
      weekPlanProgress || buildWeekPlanProgress(
        context?.weekly_planning || {},
        context?.current_week || {},
      ),
    ));
  }
  if (intents.trend) {
    cards.push(buildTrainingTrendCard(
      trendComparison || buildTrainingTrendComparison(context?.training_comparison || {}),
    ));
  }
  if (intents.recovery) cards.push(buildRecoveryCard(context?.health_recovery || {}));
  if (intents.equipment) {
    cards.push(buildEquipmentCard(
      context?.athlete_context?.equipment || [],
      intents.equipmentLocation,
    ));
  }
  if (intents.period && !intents.trend && !intents.weekPlan) cards.push(buildTrainingPeriodCard(period));
  if (intents.session) cards.push(buildLatestSessionCard(sessionForIntent));

  return compact(cards).slice(0, MAX_CARDS);
}

export const coachCardContract = Object.freeze({
  version: "coach_card_v2",
  maxCardsPerReply: MAX_CARDS,
  tokenPolicy: "deterministic_from_context_no_extra_llm_call",
});
