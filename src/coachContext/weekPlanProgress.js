const list = (value) => Array.isArray(value) ? value : [];
const normalize = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const CANCELED_STATUSES = new Set(["cancelled", "canceled", "cancelado", "cancelada"]);
const COMPLETED_STATUSES = new Set(["completed", "done", "executed", "completado", "completada", "realizado", "realizada"]);

const isCanceled = (session = {}) => CANCELED_STATUSES.has(normalize(session.status));
const hasCompletionEvidence = (session = {}) =>
  Boolean(session.linked_completed_session_id) || COMPLETED_STATUSES.has(normalize(session.status));

const sortByDate = (sessions) => [...sessions].sort((a, b) => {
  const dateCompare = String(a?.planned_date || "").localeCompare(String(b?.planned_date || ""));
  if (dateCompare !== 0) return dateCompare;
  return String(a?.planned_time || "").localeCompare(String(b?.planned_time || ""));
});

export function buildWeekPlanProgress(weeklyPlanning = {}, currentWeek = {}) {
  const sessions = sortByDate(list(weeklyPlanning?.sessions).filter((session) => session && !isCanceled(session)));
  const referenceDate = weeklyPlanning?.reference_date || null;
  const completed = [];
  const upcoming = [];
  const pastUnlinked = [];

  for (const session of sessions) {
    if (hasCompletionEvidence(session)) {
      completed.push(session);
      continue;
    }

    const date = session?.planned_date || null;
    if (referenceDate && date && date < referenceDate) {
      pastUnlinked.push(session);
      continue;
    }
    upcoming.push(session);
  }

  const executedSessions = Number(currentWeek?.week?.sessions_count);
  return {
    kind: "weekly_plan_progress",
    from: weeklyPlanning?.from || null,
    to: weeklyPlanning?.to || null,
    reference_date: referenceDate,
    weekly_focus: weeklyPlanning?.weekly_focus || null,
    planned_count: sessions.length,
    completed_linked_count: completed.length,
    upcoming_count: upcoming.length,
    past_unlinked_count: pastUnlinked.length,
    executed_week_count: Number.isFinite(executedSessions) && executedSessions >= 0 ? executedSessions : null,
    completed,
    upcoming,
    past_unlinked: pastUnlinked,
    has_plan: sessions.length > 0 || Boolean(weeklyPlanning?.weekly_focus),
  };
}

const displayName = (session = {}) => session.title || session.session_type || "Sesión planificada";
const dateSuffix = (session = {}) => session.planned_date ? ` (${session.planned_date})` : "";

export function explainWeekPlanProgress(progress) {
  if (!progress?.has_plan) {
    const executed = progress?.executed_week_count;
    return Number.isFinite(executed)
      ? `No tienes un plan semanal registrado en ENQIDU para este periodo. Sí constan ${executed} ${executed === 1 ? "sesión ejecutada" : "sesiones ejecutadas"} esta semana.`
      : "No tienes un plan semanal registrado en ENQIDU para este periodo.";
  }

  const parts = [];
  if (progress.weekly_focus) parts.push(`Foco semanal: ${progress.weekly_focus}.`);
  if (progress.planned_count) {
    parts.push(`Hay ${progress.planned_count} ${progress.planned_count === 1 ? "sesión planificada" : "sesiones planificadas"} en el periodo.`);
  }
  if (progress.completed_linked_count) parts.push(`${progress.completed_linked_count} tienen ejecución enlazada.`);

  if (progress.upcoming_count) {
    const names = progress.upcoming.slice(0, 4).map((session) => `${displayName(session)}${dateSuffix(session)}`);
    parts.push(`Quedan por delante: ${names.join(", ")}.`);
  } else {
    parts.push("No quedan sesiones futuras sin ejecutar dentro del plan registrado.");
  }

  if (progress.past_unlinked_count) {
    parts.push(
      `${progress.past_unlinked_count} ${progress.past_unlinked_count === 1 ? "sesión pasada figura" : "sesiones pasadas figuran"} sin ejecución enlazada; no las marco como incumplidas porque ENQIDU no tiene evidencia suficiente para afirmarlo.`,
    );
  }

  if (Number.isFinite(progress.executed_week_count)) {
    parts.push(`En el registro real de esta semana constan ${progress.executed_week_count} ${progress.executed_week_count === 1 ? "sesión ejecutada" : "sesiones ejecutadas"}.`);
  }

  return parts.join(" ");
}
