import {
  buildCoachCards,
  detectCoachIntents,
  filterAvailableEquipment,
} from "./coachCards.js";

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

function buildRecoveryAnswer(recovery = {}) {
  const readiness = asPositiveNumber(recovery?.readiness?.score);
  const sleepScore = asPositiveNumber(recovery?.sleep?.score);
  const sleepDuration = formatDuration(recovery?.sleep?.duration_seconds);
  const hrv = asPositiveNumber(recovery?.hrv?.night_avg_ms);
  const bodyBattery = asPositiveNumber(recovery?.body_battery?.morning);

  const facts = [
    readiness ? `readiness ${Math.round(readiness)}` : null,
    sleepScore ? `sueño ${Math.round(sleepScore)}` : null,
    sleepDuration ? `${sleepDuration} de sueño` : null,
    hrv ? `HRV nocturna ${Math.round(hrv)} ms` : null,
    bodyBattery ? `Body Battery ${Math.round(bodyBattery)}` : null,
  ];

  if (!facts.filter(Boolean).length) {
    return "Aún no tengo datos de recuperación suficientes para hoy (sueño, HRV, Body Battery o readiness).";
  }

  return `Datos de recuperación disponibles: ${joinNatural(facts)}.`;
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
  return "En esta primera fase puedo responder directamente con datos ENQIDU sobre tu semana, tu última sesión, recuperación y equipamiento. Para análisis libre o planificación compleja, la capa LLM está desactivada.";
}

export function buildDeterministicCoachReply({ message = "", context = {} } = {}) {
  const intents = detectCoachIntents(message);
  const answers = [];

  if (intents.recovery) {
    answers.push(buildRecoveryAnswer(context?.health_recovery || {}));
  }
  if (intents.equipment) {
    answers.push(buildEquipmentAnswer(
      context?.athlete_context?.equipment || [],
      intents.equipmentLocation,
    ));
  }
  if (intents.period) {
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
    cards: buildCoachCards({ message, context }),
    intents,
    responseMode: "deterministic",
    llmUsed: false,
  };
}
