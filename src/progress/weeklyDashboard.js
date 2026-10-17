import { modality, numeric, summarizeSessions } from "./domain.js";
import { shiftHealthCalendarDate as shift } from "../health/healthEvidence.js";

/** A projection of Progress, never a second metric implementation. No date matching. */
export function buildWeeklyDashboard({ progress: p, sessions, plans }) {
  const ids = new Set(p.summary.session_ids);
  const rows = [
    ...new Map(
      sessions
        .filter((s) => ids.has(s.id))
        .map((s) => [s.id, { ...s, modality: modality(s) }]),
    ).values(),
  ];
  if (rows.length > 250) throw new Error("weekly_dashboard_scope_too_large");
  const rests = plans.filter(
    (s) =>
      s.session_type === "rest" &&
      s.status === "completed" &&
      s.planned_date >= p.from &&
      s.planned_date <= p.calendar_date &&
      !rows.some((r) => r.local_date === s.planned_date),
  );
  const evidence = p.planning.evidence;
  const planning = {
    planned: p.planning.total,
    linked: p.planning.linked + p.planning.modified,
    modified: p.planning.modified,
    skipped: p.planning.skipped,
    past_unconfirmed: evidence.filter(
      (e) =>
        e.status === "unknown" &&
        plans.find((s) => s.id === e.id)?.planned_date < p.calendar_date,
    ).length,
    upcoming: evidence.filter(
      (e) =>
        e.status === "unknown" &&
        plans.find((s) => s.id === e.id)?.planned_date > p.calendar_date,
    ).length,
    today_unconfirmed: evidence.filter(
      (e) =>
        e.status === "unknown" &&
        plans.find((s) => s.id === e.id)?.planned_date === p.calendar_date,
    ).length,
  };
  const activeDays = new Set(rows.map((s) => s.local_date)).size;
  return {
    schema_version: "weekly_dashboard_v1",
    response_mode: "deterministic",
    llm_used: false,
    title: "Tu semana de entrenamiento",
    from: p.from,
    to: p.to,
    as_of: p.calendar_date,
    timezone: p.timezone,
    partial_week: p.calendar_date <= p.to,
    activity: {
      ...p.summary,
      active_days: activeDays,
      confirmed_rest_days: new Set(rests.map((s) => s.planned_date)).size,
    },
    planning,
    days: Array.from({ length: 7 }, (_, i) => {
      const date = shift(p.from, i),
        day = rows.filter((s) => s.local_date === date);
      return {
        date,
        future: date > p.calendar_date,
        confirmed_rest: rests.some((s) => s.planned_date === date),
        ...summarizeSessions(day),
        activities: day.map((s) => ({
          id: s.id,
          title: (s.title || "Actividad registrada").slice(0, 2048),
          modality: s.modality,
          seconds: numeric(s.duration_seconds) ? s.duration_seconds : null,
        })),
      };
    }),
    time_distribution: p.summary.modalities.map((m) => ({
      code: m.code,
      ...summarizeSessions(rows.filter((s) => s.modality === m.code)),
    })),
    highlights: p.strength
      .filter((e) => e.record_count > 0)
      .map((e) => ({ name: e.name, records: e.record_count }))
      .slice(0, 3),
    observed_records: p.strength.reduce((n, e) => n + e.record_count, 0),
    assessment: rows.length
      ? `Has registrado ${p.summary.sessions} actividades en ${activeDays} días. ${planning.linked} planes tienen una ejecución enlazada. La semana está en curso; no inferimos una mejora por acumular más actividad.`
      : "Todavía no hay actividades registradas esta semana. Los planes pendientes no son actividades realizadas.",
    quality: {
      status: p.status,
      duration_known: p.summary.duration_known,
      sessions: p.summary.sessions,
      unknown_modality: rows.filter((s) => s.modality === "unknown").length,
      explanation:
        "Sólo actividades canónicas ejecutadas hasta hoy. Los minutos suman duraciones conocidas. Sin registro no significa descanso; sin enlace no significa que no hayas entrenado. Las mejoras observadas se limitan a esta semana.",
    },
  };
}
