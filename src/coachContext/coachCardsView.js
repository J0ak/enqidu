const finiteNonNegative = (value) => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export function formatCoachCardMetric(metric = {}) {
  const value = finiteNonNegative(metric.value);
  if (value == null) return null;
  if (metric.unit === "s") {
    const minutes = Math.round(value / 60);
    if (minutes < 60) return `${value === 0 ? 0 : Math.max(1, minutes)} min`;
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

const parseCalendarDate = (value) => {
  if (!value || typeof value !== "string") return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDatePart = (date, options) => new Intl.DateTimeFormat("es-ES", {
  ...options,
  timeZone: "UTC",
}).format(date).replace(/\./g, "");

export function formatCoachCardDateRange(from, to) {
  const start = parseCalendarDate(from);
  const end = parseCalendarDate(to);
  if (!start || !end) return null;

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${formatDatePart(end, { month: "short", year: "numeric" })}`;
  }
  if (sameYear) {
    return `${formatDatePart(start, { day: "numeric", month: "short" })}–${formatDatePart(end, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${formatDatePart(start, { day: "numeric", month: "short", year: "numeric" })}–${formatDatePart(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function normalizeStoredCoachMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((message) => message && typeof message.content === "string")
    .map((message) => ({ ...message, ...(Array.isArray(message.cards) ? { cards: message.cards } : {}) }));
}

export function resolveCoachCardAction(action, sessions = []) {
  if (action?.type === "open_activities") return { type: "open_activities" };

  if (action?.type === "save_recommendation_to_plan") {
    const date = typeof action.date === "string" ? action.date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return {
      type: "save_recommendation_to_plan",
      date,
      location: typeof action.location === "string" && action.location.trim()
        ? action.location.trim()
        : null,
    };
  }

  if (action?.type !== "open_training_session" || typeof action.session_id !== "string" || !action.session_id.trim()) return null;
  const session = sessions.find((item) => String(item?.id || "") === action.session_id.trim());
  return session ? { type: "open_training_session", session } : null;
}


export function findLatestRecommendationSaveAction(messages = []) {
  if (!Array.isArray(messages)) return null;

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.role !== "assistant" || !Array.isArray(message.cards)) continue;

    for (let cardIndex = message.cards.length - 1; cardIndex >= 0; cardIndex -= 1) {
      const actions = Array.isArray(message.cards[cardIndex]?.actions)
        ? message.cards[cardIndex].actions
        : [];
      const action = actions.find((item) => item?.type === "save_recommendation_to_plan");
      const resolved = resolveCoachCardAction(action);
      if (resolved?.type === "save_recommendation_to_plan") return resolved;
    }
  }

  return null;
}


const coachCardCalendarDate = (card) => {
  const candidates = [card?.date, card?.subtitle];
  return candidates.find((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()))?.trim() || null;
};

export function findLatestPlannedTrainingContext(messages = []) {
  if (!Array.isArray(messages)) return null;

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.role !== "assistant" || !Array.isArray(message.cards)) continue;

    for (let cardIndex = message.cards.length - 1; cardIndex >= 0; cardIndex -= 1) {
      const card = message.cards[cardIndex];
      if (card?.id !== "planned_training_today" || card?.cancelled === true) continue;
      const date = coachCardCalendarDate(card);
      if (!date) continue;
      return {
        date,
        title: typeof card.title === "string" && card.title.trim() ? card.title.trim() : null,
      };
    }
  }

  return null;
}

export function markLatestPlannedTrainingMoved(messages = [], { sourceDate, targetDate } = {}) {
  if (!Array.isArray(messages) || !/^\d{4}-\d{2}-\d{2}$/.test(String(sourceDate || ""))
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate || ""))) {
    return messages;
  }

  let targetMessageIndex = -1;
  let targetCardIndex = -1;
  for (let messageIndex = messages.length - 1; messageIndex >= 0 && targetMessageIndex < 0; messageIndex -= 1) {
    const cards = Array.isArray(messages[messageIndex]?.cards) ? messages[messageIndex].cards : [];
    for (let cardIndex = cards.length - 1; cardIndex >= 0; cardIndex -= 1) {
      const card = cards[cardIndex];
      if (card?.id === "planned_training_today" && coachCardCalendarDate(card) === sourceDate) {
        targetMessageIndex = messageIndex;
        targetCardIndex = cardIndex;
        break;
      }
    }
  }
  if (targetMessageIndex < 0) return messages;

  return messages.map((message, messageIndex) => {
    if (messageIndex !== targetMessageIndex) return message;
    return {
      ...message,
      cards: message.cards.map((card, cardIndex) => cardIndex === targetCardIndex
        ? {
            ...card,
            date: targetDate,
            subtitle: targetDate,
            badge: "Reprogramada",
          }
        : card),
    };
  });
}


const titleCaseCoachValue = (value = "") => String(value)
  .replace(/[_-]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

export function markLatestPlannedTrainingAdapted(messages = [], { date, plannedSession } = {}) {
  if (!Array.isArray(messages) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))
    || !plannedSession || typeof plannedSession !== "object") {
    return messages;
  }

  let targetMessageIndex = -1;
  let targetCardIndex = -1;
  for (let messageIndex = messages.length - 1; messageIndex >= 0 && targetMessageIndex < 0; messageIndex -= 1) {
    const cards = Array.isArray(messages[messageIndex]?.cards) ? messages[messageIndex].cards : [];
    for (let cardIndex = cards.length - 1; cardIndex >= 0; cardIndex -= 1) {
      const card = cards[cardIndex];
      if (card?.id === "planned_training_today" && coachCardCalendarDate(card) === date) {
        targetMessageIndex = messageIndex;
        targetCardIndex = cardIndex;
        break;
      }
    }
  }
  if (targetMessageIndex < 0) return messages;

  const duration = Number(plannedSession.duration_minutes);
  const blocks = Array.isArray(plannedSession.blocks) ? plannedSession.blocks : [];

  return messages.map((message, messageIndex) => {
    if (messageIndex !== targetMessageIndex) return message;
    return {
      ...message,
      cards: message.cards.map((card, cardIndex) => cardIndex === targetCardIndex
        ? {
            ...card,
            title: plannedSession.title || card.title,
            badge: "Plan adaptado",
            metrics: [
              ...(Number.isFinite(duration) && duration > 0
                ? [{ key: "planned_duration", label: "Duración prevista", value: duration, unit: "min" }]
                : []),
              ...(blocks.length
                ? [{ key: "blocks", label: "Bloques", value: blocks.length, unit: "" }]
                : []),
            ],
            breakdown: blocks.slice(0, 5).map((block) => ({
              label: block.title || "Bloque",
              value: Number(block.duration_minutes) > 0 ? Number(block.duration_minutes) : 1,
            })),
            environment: plannedSession.environment || null,
            session_type: plannedSession.session_type || null,
          }
        : card),
    };
  });
}


export function markLatestPlannedTrainingCancelled(messages = [], { date } = {}) {
  if (!Array.isArray(messages) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    return messages;
  }

  let targetMessageIndex = -1;
  let targetCardIndex = -1;
  for (let messageIndex = messages.length - 1; messageIndex >= 0 && targetMessageIndex < 0; messageIndex -= 1) {
    const cards = Array.isArray(messages[messageIndex]?.cards) ? messages[messageIndex].cards : [];
    for (let cardIndex = cards.length - 1; cardIndex >= 0; cardIndex -= 1) {
      const card = cards[cardIndex];
      if (card?.id === "planned_training_today"
          && card?.cancelled !== true
          && coachCardCalendarDate(card) === date) {
        targetMessageIndex = messageIndex;
        targetCardIndex = cardIndex;
        break;
      }
    }
  }
  if (targetMessageIndex < 0) return messages;

  return messages.map((message, messageIndex) => {
    if (messageIndex !== targetMessageIndex) return message;
    return {
      ...message,
      cards: message.cards.map((card, cardIndex) => cardIndex === targetCardIndex
        ? {
            ...card,
            badge: "Cancelada",
            cancelled: true,
            actions: [],
          }
        : card),
    };
  });
}
