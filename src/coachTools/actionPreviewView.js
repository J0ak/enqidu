import { ENQIDU_WEEKDAYS, resolveNextWeekdayDate } from "./planActions.js";
import { formatCoachCardDate } from "../coachContext/coachCardsView.js";

const COMMAND_TO_PREVIEW = Object.freeze({
  move_planned_session: "preview_move_session",
  adapt_session_duration: "preview_adapt_duration",
  adapt_session_environment: "preview_adapt_environment",
  cancel_planned_session: "preview_cancel_session",
  adapt_remaining_week: "preview_adapt_remaining_week",
});

export function isPlanPreviewCommand(command) {
  return Boolean(COMMAND_TO_PREVIEW[command?.tool]);
}

/** Language slots select a narrow tool; they never contain a mutation payload. */
export function buildCoachPreviewRequest(command, plannedContext) {
  const tool = COMMAND_TO_PREVIEW[command?.tool];
  if (!tool) return null;
  if (tool === "preview_adapt_remaining_week") return { tool, arguments: {} };
  if (!plannedContext?.date) return null;
  const args = { source_date: plannedContext.date };
  if (command.tool === "move_planned_session") {
    args.target_date = resolveNextWeekdayDate(plannedContext.date, command.arguments?.target_weekday);
    if (!args.target_date) return null;
  }
  if (command.tool === "adapt_session_duration") args.duration_minutes = command.arguments?.duration_minutes;
  if (command.tool === "adapt_session_environment") args.environment = command.arguments?.environment;
  return { tool, arguments: args };
}

/** Resolve an explicit weekday only from the server's canonical profile-timezone week. */
export function plannedContextForWeekday(week, weekday) {
  if (!ENQIDU_WEEKDAYS.includes(weekday)) return null;
  const sessions = (Array.isArray(week?.sessions) ? week.sessions : []).filter((session) =>
    session.planned_date >= week.calendar_date
    && !["cancelled", "completed", "skipped"].includes(session.status)
    && ENQIDU_WEEKDAYS[new Date(`${session.planned_date}T12:00:00Z`).getUTCDay()] === weekday
  );
  return sessions.length === 1 ? { date: sessions[0].planned_date, title: sessions[0].title || null } : null;
}

const normal = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[¡!¿?.,;:]+/g, " ").replace(/\s+/g, " ").trim();
export function detectPreviewConversationAction(text) {
  const value = normal(text);
  if (/^(?:aplicalo|aplica el cambio|acepto el cambio|apply it|apply the change)$/.test(value)) return "apply";
  if (/^(?:ensename que cambiarias|revisar cambio|revisa el cambio|ver cambio|show me the change|review the change)$/.test(value)) return "review";
  return null;
}

export function buildCoachApplyRequest(pending) {
  if (pending?.error || !pending?.reviewed || !pending?.preview?.requires_confirmation || !pending?.preview?.fingerprint || !pending?.preview?.expires_at) return null;
  if (!/^preview_(move_session|adapt_duration|adapt_environment|cancel_session|adapt_remaining_week|closed_loop_proposal)$/.test(pending.request?.tool || "")) return null;
  return {
    tool: pending.request.tool.replace(/^preview_/, "apply_"),
    arguments: { ...pending.request.arguments, fingerprint: pending.preview.fingerprint, expires_at: pending.preview.expires_at, confirmation: true },
  };
}

export const previewEnvironmentLabels = Object.freeze({ home: "casa", pool: "piscina", trail: "trail", outdoor: "aire libre", functional_training_center: "centro de entrenamiento" });
const statusLabels = Object.freeze({ planned: "Planificada", confirmed: "Confirmada", modified: "Modificada", rescheduled: "Reprogramada", cancelled: "Cancelada", completed: "Completada", skipped: "Omitida", scheduled: "Planificada" });
export function previewSessions(state) {
  if (Array.isArray(state)) return state;
  if (Array.isArray(state?.sessions)) return state.sessions;
  if (state?.planned_session) return [state.planned_session];
  return state && typeof state === "object" ? [state] : [];
}

const prescriptionLabels = Object.freeze({
  name: "Ejercicio", title: "Ejercicio", exercise_name: "Ejercicio", target_sets: "Series", sets: "Series",
  target_reps: "Repeticiones", reps: "Repeticiones", load: "Carga", load_kg: "Carga (kg)",
  duration_seconds: "Duración (s)", rest_seconds: "Descanso (s)", rest: "Descanso", notes: "Notas", rpe: "RPE",
});
export function previewPrescription(value) {
  if (value == null || value === "") return null;
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return value; }
  }
  const describe = (entry) => {
    if (entry == null) return "";
    if (Array.isArray(entry)) return entry.map(describe).filter(Boolean).join("; ");
    if (typeof entry === "object") return Object.entries(entry).map(([key, item]) => {
      const detail = describe(item);
      return detail ? `${prescriptionLabels[key] || key.replace(/[_-]+/g, " ")}: ${detail}` : "";
    }).filter(Boolean).join(" · ");
    return String(entry);
  };
  return describe(parsed) || null;
}

export function previewSessionView(session = {}) {
  const date = session.planned_date || session.date || session.source_date || null;
  const min = session.duration_min ?? session.planned_duration_min ?? session.duration_minutes;
  const max = session.duration_max ?? session.planned_duration_max ?? session.duration_minutes ?? min;
  const duration = Number(min) > 0 ? (Number(max) > Number(min) ? `${min}–${max} min` : `${min} min`) : null;
  const environment = session.environment || session.location_type;
  const blocks = session.blocks || session.planned_session_blocks || [];
  return {
    title: session.title || "Entrenamiento",
    date: formatCoachCardDate(date) || "Fecha no disponible",
    duration,
    environment: previewEnvironmentLabels[environment] || null,
    status: statusLabels[session.status] || null,
    objective: typeof session.objective === "string" ? session.objective : null,
    intensity: typeof (session.intensity ?? session.planned_intensity) === "string" ? (session.intensity ?? session.planned_intensity) : null,
    blocks: blocks.map((block) => ({
      title: block.title || "Bloque",
      duration: Number(block.duration_minutes) > 0 ? `${block.duration_minutes} min` : Number(block.planned_duration_seconds ?? block.duration_seconds) > 0 ? `${Number(((block.planned_duration_seconds ?? block.duration_seconds) / 60).toFixed(2))} min` : null,
      objective: typeof block.objective === "string" ? block.objective : null,
      rounds: Number(block.planned_rounds) > 0 ? Number(block.planned_rounds) : null,
      exercises: previewPrescription(block.exercises_text ?? block.planned_exercises),
      constraints: previewPrescription(block.constraints_text ?? block.constraints),
      notes: typeof block.notes === "string" ? block.notes : null,
    })),
  };
}

export function coachPreviewSummary(preview) {
  const action = String(preview?.action || "").replace(/^preview_/, "");
  if (preview?.requires_confirmation === false) return preview.message || (action.includes("remaining_week")
    ? "No hay sesiones de ENQIDU pendientes de recolocar en lo que queda de la semana."
    : "La sesión ya tiene el estado solicitado. No hay cambios pendientes de aplicar.");
  const before = previewSessionView(previewSessions(preview?.before)[0]);
  const after = previewSessionView(previewSessions(preview?.after)[0]);
  if (action.includes("remaining_week")) return "Te propongo reorganizar las sesiones pendientes del resto de la semana. Revisa las fechas antes de aplicar.";
  if (action.includes("cancel")) return `Te propongo cancelar ${before.title} del ${before.date}. Revisa el cambio antes de aplicar.`;
  if (action.includes("move")) return `Te propongo mover ${before.title} del ${before.date} al ${after.date}. Revisa el cambio antes de aplicar.`;
  if (action.includes("environment")) return `Te propongo adaptar ${before.title} del ${before.date} para ${after.environment || "el entorno solicitado"}. Revisa el cambio antes de aplicar.`;
  if (before.duration && after.duration) return `Te propongo ajustar ${before.title} del ${before.date} de ${before.duration} a ${after.duration}. Revisa el cambio antes de aplicar.`;
  return "Te propongo un cambio en tu plan. Revisa la sesión y el detalle antes de aplicar.";
}

export function coachAppliedSummary(result = {}) {
  const data = result.result || result;
  const session = data.planned_session;
  if (data.cancelled) return `He cancelado ${data.title || "el entrenamiento"} del ${formatCoachCardDate(data.source_date) || data.source_date}.`;
  if (data.moved) return `He movido ${data.title || "el entrenamiento"} al ${formatCoachCardDate(data.target_date) || data.target_date}.`;
  if (data.adapted && session && data.action === "adapt_session_environment") return `He adaptado ${session.title || "el entrenamiento"} para ${previewEnvironmentLabels[session.environment] || "el entorno solicitado"}.`;
  if (data.adapted && session) return `He ajustado ${session.title || "el entrenamiento"} a ${session.duration_minutes} minutos.`;
  if (data.adapted && Array.isArray(data.moves)) return `He adaptado el resto de la semana: ${data.moves.map((move) => `${move.title || "Entrenamiento"} → ${formatCoachCardDate(move.target_date) || move.target_date}`).join("; ")}.`;
  return data.message || "El cambio se ha aplicado y tu plan se ha actualizado.";
}

const explanationLabels = Object.freeze({
  explicit_user_request: "Cambio solicitado por ti.",
  explicit_move_session: "Has solicitado cambiar el día de esta sesión.",
  explicit_adapt_duration: "Has solicitado ajustar la duración de esta sesión.",
  explicit_adapt_environment: "Has solicitado cambiar el lugar de entrenamiento.",
  explicit_cancel_session: "Has solicitado cancelar esta sesión.",
  explicit_remaining_week_adaptation: "Has solicitado reorganizar la semana según tu disponibilidad.",
  same_week_only: "Las sesiones se mantienen dentro de esta semana.",
  executed_training_unchanged: "Los entrenamientos ejecutados conservan su historial.",
  plan_history_preserved: "La sesión cancelada se conserva en el historial del plan.",
  block_structure_preserved: "Se mantiene la estructura de bloques y se ajustan sus tiempos.",
  planned_blocks_replaced: "Los bloques planificados se sustituyen por los de la propuesta.",
  explicit_user_command: "Cambio solicitado por ti.",
  user_requested: "Cambio solicitado por ti.",
  rpe_above_range: "El esfuerzo que confirmaste superó el rango previsto.",
  rpe_higher: "El esfuerzo que confirmaste superó el rango previsto.",
  multiple_subsequent_personal_baseline_signals: "Varias señales posteriores de recuperación se alejan de tu referencia personal; no permiten atribuir una causa.",
  user_reported_discomfort: "Has comunicado molestias.",
  readiness_caution: "Tu recuperación aconseja prudencia.",
  reduce: "Reducir la duración para facilitar la recuperación.",
  recovery_bias: "Priorizar la recuperación en la próxima sesión.",
  preserve_execution_history: "El entrenamiento ejecutado conserva su historial.",
});
export function previewExplanation(value) {
  if (typeof value === "object" && value) return value.safe_message || value.message || value.reason || explanationLabels[value.code] || null;
  if (typeof value !== "string") return null;
  if (explanationLabels[value]) return explanationLabels[value];
  return /^[a-z0-9_.:-]+$/.test(value) ? null : value;
}
