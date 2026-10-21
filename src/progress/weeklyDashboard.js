import {
  modality,
  numeric,
  summarizeSessions,
  exerciseIdentity,
  exerciseObservation,
  observedReps,
} from "./domain.js";
import { shiftHealthCalendarDate as shift } from "../health/healthEvidence.js";

/** A projection of Progress, never a second metric implementation. No date matching. */
export function buildWeeklyDashboard({
  progress: p,
  sessions,
  plans,
  exercises = [],
  blocks = [],
}) {
  const ids = new Set(p.summary.session_ids);
  const rows = [
    ...new Map(
      sessions
        .filter((s) => ids.has(s.id))
        .map((s) => [s.id, { ...s, modality: modality(s) }]),
    ).values(),
  ];
  if (rows.length > 250) throw new Error("weekly_dashboard_scope_too_large");
  const restDates = p.confirmed_rest_dates;
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
      confirmed_rest_days: restDates.length,
    },
    planning,
    comparison_from: p.comparison_from,
    detail_scope: "first_12_identified_exercises_and_8_blocks_per_activity",
    days: Array.from({ length: 7 }, (_, i) => {
      const date = shift(p.from, i),
        day = rows.filter((s) => s.local_date === date);
      const confirmedRest = restDates.includes(date),
        summary = summarizeSessions(day);
      const timeState =
        date > p.calendar_date
          ? "future"
          : day.length
            ? summary.seconds === null
              ? "missing_duration"
              : summary.duration_known < summary.sessions
                ? "partial"
                : "observed"
            : confirmedRest
              ? "confirmed_rest"
              : "unconfirmed";
      return {
        date,
        time_state: timeState,
        chart_seconds:
          date > p.calendar_date ? null : confirmedRest ? 0 : summary.seconds,
        intended_plans: plans
          .filter(
            (plan) =>
              plan.planned_date === date &&
              !["cancelled", "canceled", "rescheduled", "recommended"].includes(
                plan.status,
              ),
          )
          .map((plan) => ({
            id: plan.id,
            title: plan.title || "Plan registrado",
            session_type: plan.session_type,
            status:
              plan.session_type === "rest"
                ? restDates.includes(date)
                  ? "confirmed_rest"
                  : "planned_rest"
                : evidence.find((e) => e.id === plan.id)?.status || "unknown",
          }))
          .slice(0, 50),
        future: date > p.calendar_date,
        confirmed_rest: confirmedRest,
        ...summary,
        activities: day.map((s) => {
          const links = p.execution_links.filter(
            (l) =>
              l.session_id === s.id &&
              ["linked", "modified"].includes(l.status),
          );
          const linked =
            links.length === 1
              ? plans.find((plan) => plan.id === links[0].id)
              : null;
          const observed = exercises.filter(
            (e) =>
              e.session_id === s.id &&
              !["skipped", "planned"].includes(e.execution_type),
          );
          const identified = observed
            .filter(exerciseIdentity)
            .sort(
              (a, b) =>
                (a.exercise_order ?? Number.MAX_SAFE_INTEGER) -
                  (b.exercise_order ?? Number.MAX_SAFE_INTEGER) ||
                a.id.localeCompare(b.id),
            );
          return {
            id: s.id,
            title: (s.title || "Actividad registrada").slice(0, 2048),
            modality: s.modality,
            seconds: numeric(s.duration_seconds) ? s.duration_seconds : null,
            linked_plan: linked
              ? {
                  id: linked.id,
                  title: (linked.title || "Plan registrado").slice(0, 2048),
                  date: linked.planned_date,
                  status: links[0].status,
                  objective:
                    typeof linked.objective === "string"
                      ? linked.objective.slice(0, 600)
                      : null,
                }
              : null,
            exercise_count: observed.length,
            unidentified_exercises: observed.length - identified.length,
            exercises: identified.slice(0, 12).map((e) => {
              const observation = exerciseObservation(e, date),
                reps = observedReps(e.reps_per_set);
              return {
                id: e.id,
                name: (
                  e.canonical_name ||
                  e.reported_name ||
                  "Ejercicio identificado"
                ).slice(0, 2048),
                variant: [e.execution_type, e.side, e.tempo_or_pause]
                  .filter(Boolean)
                  .join(" · "),
                load: observation.load,
                unit: e.load_unit || null,
                reps: reps ? reps.slice(0, 30) : null,
                reps_count: reps?.length || 0,
                known_volume: observation.volume,
                sets: numeric(e.sets_completed) ? e.sets_completed : null,
                rounds: numeric(e.rounds_completed) ? e.rounds_completed : null,
                notes:
                  typeof e.notes === "string" && e.notes.trim()
                    ? e.notes.slice(0, 600)
                    : null,
              };
            }),
            block_count: blocks.filter((b) => b.session_id === s.id).length,
            blocks: blocks
              .filter((b) => b.session_id === s.id)
              .sort((a, b) => a.block_order - b.block_order)
              .slice(0, 8)
              .map((b) => ({
                id: b.id,
                name:
                  typeof b.name === "string"
                    ? b.name.replaceAll("_", " ").slice(0, 2048)
                    : "Bloque registrado",
                notes:
                  typeof b.execution_notes === "string" &&
                  b.execution_notes.trim()
                    ? b.execution_notes.slice(0, 600)
                    : null,
              })),
          };
        }),
      };
    }),
    time_distribution: p.summary.modalities.map((m) => ({
      code: m.code,
      ...summarizeSessions(rows.filter((s) => s.modality === m.code)),
    })),
    highlights: p.highlights,
    insights: p.insights.slice(0, 50).map((i) => ({
      ...i,
      session_ids: i.session_ids.slice(-12),
      exercise_ids: i.exercise_ids.slice(-12),
      plan_ids: i.plan_ids.slice(-12),
    })),
    observed_records: p.strength.reduce((n, e) => n + e.record_count, 0),
    assessment: rows.length
      ? `Has registrado ${p.summary.sessions} actividades en ${activeDays} días. ${planning.linked} planes tienen una ejecución enlazada. La semana está en curso; no inferimos una mejora por acumular más actividad.`
      : "Todavía no hay actividades registradas esta semana. Los planes pendientes no son actividades realizadas.",
    quality: {
      ...p.data_quality,
      duration_known: p.summary.duration_known,
      sessions: p.summary.sessions,
      unknown_modality: rows.filter((s) => s.modality === "unknown").length,
      explanation:
        "Sólo actividades canónicas ejecutadas hasta hoy. Los minutos suman duraciones conocidas. Sin registro no significa descanso; sin enlace no significa que no hayas entrenado. Las mejoras se contrastan con el histórico compatible declarado.",
    },
  };
}
