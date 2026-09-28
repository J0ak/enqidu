const finitePositive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function formatCoachCardMetric(metric = {}) {
  const value = finitePositive(metric.value);
  if (value == null) return null;
  if (metric.unit === "s") {
    const minutes = Math.round(value / 60);
    if (minutes < 60) return `${Math.max(1, minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
  }
  if (metric.unit === "m" && metric.key === "distance") {
    return value >= 1000 ? `${Number((value / 1000).toFixed(value >= 10000 ? 0 : 1))} km` : `${Math.round(value)} m`;
  }
  return `${Number(value.toFixed(1))}${metric.unit ? ` ${metric.unit}` : ""}`;
}

export function formatCoachCardDate(value) {
  if (!value || typeof value !== "string") return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function normalizeStoredCoachMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((message) => message && typeof message.content === "string")
    .map((message) => ({ ...message, ...(Array.isArray(message.cards) ? { cards: message.cards } : {}) }));
}

export function resolveCoachCardAction(action, sessions = []) {
  if (action?.type === "open_activities") return { type: "open_activities" };
  if (action?.type !== "open_training_session" || typeof action.session_id !== "string" || !action.session_id.trim()) return null;
  const session = sessions.find((item) => String(item?.id || "") === action.session_id.trim());
  return session ? { type: "open_training_session", session } : null;
}
