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

function detectEquipmentLocation(text) {
  return EQUIPMENT_LOCATION_PATTERNS.find((location) =>
    hasAny(text, location.patterns.map((pattern) => normalizeText(pattern)))
  ) || null;
}

function buildEquipmentCard(equipment = [], requestedLocation = null) {
  const available = (Array.isArray(equipment) ? equipment : [])
    .filter((item) => item && typeof item === "object" && item.available !== false && item.available !== "false");

  const filtered = requestedLocation
    ? available.filter((item) => normalizeLocation(item.location) === requestedLocation.key)
    : available;

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

export function buildCoachCards({ message = "", context = {} } = {}) {
  const text = normalizeText(message);
  const period = context?.training_period || {};
  const sessions = Array.isArray(period?.sessions) ? period.sessions : [];
  const latest = sessions[0] || null;
  const cards = [];

  const recoveryIntent = hasAny(text, [
    "recuperacion",
    "readiness",
    "descanso",
    "sueno",
    "dormi",
    "hrv",
    "body battery",
    "fatiga",
    "como estoy hoy",
    "puedo entrenar hoy",
  ]);
  const equipmentIntent = hasAny(text, [
    "material",
    "equipamiento",
    "que tengo",
    "puedo usar",
    "disponible",
    "con que entreno",
    "entrenar en casa",
    "entreno en casa",
  ]);
  const periodIntent = hasAny(text, [
    "semana",
    "carga",
    "volumen",
    "balance",
    "resumen",
    "como voy",
    "progreso",
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

  if (recoveryIntent) cards.push(buildRecoveryCard(context?.health_recovery || {}));
  if (equipmentIntent) {
    cards.push(buildEquipmentCard(
      context?.athlete_context?.equipment || [],
      detectEquipmentLocation(text),
    ));
  }
  if (periodIntent) cards.push(buildTrainingPeriodCard(period));
  if (sessionIntent) cards.push(buildLatestSessionCard(latest));

  return compact(cards).slice(0, MAX_CARDS);
}

export const coachCardContract = Object.freeze({
  version: "coach_card_v2",
  maxCardsPerReply: MAX_CARDS,
  tokenPolicy: "deterministic_from_context_no_extra_llm_call",
});
