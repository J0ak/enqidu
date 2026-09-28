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
  if (numeric == null) return null;
  return { key, label, value: numeric, unit };
};

const compact = (items) => items.filter(Boolean);

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

function buildLatestSessionCard(session) {
  if (!session) return null;
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
    actions: [{ type: "open_latest_session", label: "Abrir sesión" }],
    provenance: "enkidu_context",
  };
}

export function buildCoachCards({ message = "", context = {} } = {}) {
  const text = normalizeText(message);
  const period = context?.training_period || {};
  const sessions = Array.isArray(period?.sessions) ? period.sessions : [];
  const latest = sessions[0] || null;
  const cards = [];

  const periodIntent = hasAny(text, [
    "semana",
    "carga",
    "volumen",
    "balance",
    "resumen",
    "como voy",
    "progreso",
    "hyrox",
    "deka",
    "trail",
  ]);
  const sessionIntent = hasAny(text, [
    "ayer",
    "ultimo",
    "ultima",
    "he hecho",
    "hice",
    "actividad",
    "sesion",
    "entreno",
    "entrenamiento de hoy",
  ]);

  if (periodIntent) cards.push(buildTrainingPeriodCard(period));
  if (sessionIntent) cards.push(buildLatestSessionCard(latest));

  if (!cards.filter(Boolean).length && latest) {
    cards.push(buildLatestSessionCard(latest));
  }

  return compact(cards).slice(0, MAX_CARDS);
}

export const coachCardContract = Object.freeze({
  version: "coach_card_v1",
  maxCardsPerReply: MAX_CARDS,
  tokenPolicy: "deterministic_from_context_no_extra_llm_call",
});
