import { progressInsights } from "./insights.js";
import { comparePlannedVsExecuted } from "../closedLoop/plannedVsExecuted.js";
import { shiftHealthCalendarDate as shift } from "../health/healthEvidence.js";
import {
  normalizeExactName as normalizeName,
  isUnknownName as isUnknownExerciseName,
} from "../training/catalogResolver.js";
export { normalizeName, isUnknownExerciseName };
export const numeric = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const units = new Set([
  "kg",
  "lb",
  "kg_each",
  "kg_total",
  "kg total",
  "kg_external_discs",
]);
export const monday = (date) =>
  shift(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
export function periodBounds(today, period) {
  if (period === "week")
    return {
      from: monday(today),
      to: shift(monday(today), 6),
      previousFrom: shift(monday(today), -7),
      days: 7,
    };
  const to = shift(monday(today), -1); // completed weeks only; today never compared against a full day
  const days = period === "4" ? 28 : 84;
  return {
    from: period === "all" ? "0001-01-01" : shift(to, 1 - days),
    to,
    previousFrom: shift(to, 1 - days * 2),
    days,
  };
}
export function observedReps(value) {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => numeric(v) && Number.isInteger(v))
    ? value
    : null;
}
export function exerciseIdentity(e) {
  if (["skipped", "planned"].includes(e.execution_type)) return null;
  const name = normalizeName(e.reported_name);
  if (!e.canonical_exercise_code && (!name || isUnknownExerciseName(name)))
    return null;
  return JSON.stringify([
    // Distinguish an unresolved name from a catalog code with the same spelling.
    e.canonical_exercise_code
      ? ["catalog", e.canonical_exercise_code]
      : ["reported", name],
    e.execution_type ?? null,
    e.side ?? null,
    e.tempo_or_pause ?? null,
    e.load_unit ?? null,
  ]);
}
export function exerciseObservation(e, date) {
  const reps = observedReps(e.reps_per_set);
  const load =
    units.has(e.load_unit) && numeric(e.load_value) ? e.load_value : null;
  return {
    exercise_id: e.id,
    session_id: e.session_id,
    date,
    load,
    max_reps: reps ? Math.max(...reps) : null,
    volume:
      load !== null && reps ? load * reps.reduce((a, b) => a + b, 0) : null,
  };
}
export function observedRecords(points, priorPoints, unit) {
  const records = [];
  for (const point of points) {
    const before = [...priorPoints, ...points].filter(
      (p) => p.date < point.date && p.session_id !== point.session_id,
    );
    const best = (rows, field) =>
      rows
        .filter((p) => numeric(p[field]))
        .sort((a, b) => b[field] - a[field] || b.date.localeCompare(a.date))[0];
    const load = best(before, "load");
    const reps = best(
      before.filter(
        (p) =>
          p.load === point.load &&
          (point.load !== null || unit === "bodyweight"),
      ),
      "max_reps",
    );
    for (const [kind, previous, field] of [
      ["load", load, "load"],
      ["reps_at_load", reps, "max_reps"],
    ]) {
      if (previous && numeric(point[field]) && point[field] > previous[field])
        records.push({
          kind,
          value: point[field],
          previous: previous[field],
          date: point.date,
          exercise_id: point.exercise_id,
          session_id: point.session_id,
          previous_exercise_id: previous.exercise_id,
          previous_session_id: previous.session_id,
          previous_date: previous.date,
          load: point.load,
        });
    }
  }
  const daily = new Map();
  for (const record of records) {
    const key = JSON.stringify([
      record.kind,
      record.date,
      record.kind === "reps_at_load" ? record.load : null,
    ]);
    if (!daily.has(key) || daily.get(key).value < record.value)
      daily.set(key, record);
  }
  return [...daily.values()];
}
export function modality(row) {
  if (row.modality_code) return row.modality_code;
  // Fixed observed FIT fields, never title/notes or date matching.
  const sport = row.fit_sport,
    sub = row.fit_sub_sport;
  if (sport === "running") return sub === "trail" ? "trail_running" : "running";
  return (
    {
      strength_training: "functional_strength",
      yoga: "yoga_pilates",
      pilates: "yoga_pilates",
    }[sub] ||
    { swimming: "swimming", cycling: "cycling" }[sport] ||
    "unknown"
  );
}
export function trend(previous, recent) {
  if (!numeric(previous) || !numeric(recent)) return "insufficient_data";
  return recent > previous
    ? "improving"
    : recent < previous
      ? "declining"
      : "stable";
}
const total = (values) => {
  const known = values.filter(numeric);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
};
export function summarizeSessions(rows) {
  return {
    sessions: rows.length,
    seconds: total(rows.map((s) => s.duration_seconds)),
    duration_known: rows.filter((s) => numeric(s.duration_seconds)).length,
    modalities: [...new Set(rows.map((s) => s.modality))]
      .sort()
      .map((code) => ({
        code,
        sessions: rows.filter((s) => s.modality === code).length,
      })),
    session_ids: rows.map((s) => s.id),
  };
}
export function confirmedRestDates(plans, sessions, from, today) {
  return [
    ...new Set(
      plans
        .filter(
          (p) =>
            p.session_type === "rest" &&
            p.status === "completed" &&
            p.planned_date >= from &&
            p.planned_date <= today &&
            !sessions.some((s) => s.local_date === p.planned_date),
        )
        .map((p) => p.planned_date),
    ),
  ].sort();
}
export const progressHighlights = (strength) =>
  strength
    .filter((e) => e.record_count > 0)
    .sort((a, b) => b.last_practice.localeCompare(a.last_practice))
    .slice(0, 3)
    .map((e) => ({ name: e.name, records: e.record_count }));
export function classifyProgressPlan(p, owned, plans, today) {
  const executed =
    (p.planned_date <= today
      ? owned.find((s) => s.id === p.linked_completed_session_id)
      : null) || null;
  const ambiguous =
    Boolean(p.linked_completed_session_id) &&
    plans.filter(
      (other) =>
        other.linked_completed_session_id === p.linked_completed_session_id,
    ).length > 1;
  // Reuse the canonical unknown/skipped semantics. A link measures adherence,
  // not a new assertion that every prescribed block was completed as planned.
  const comparison = comparePlannedVsExecuted({
    planned: p,
    executed,
    ambiguous,
  });
  return {
    id: p.id,
    session_id: executed?.id || null,
    status:
      executed && !ambiguous
        ? p.status === "modified"
          ? "modified"
          : "linked"
        : comparison.status === "missed"
          ? "skipped"
          : "unknown",
  };
}
export function buildProgress({
  sessions,
  exercises,
  plans,
  today,
  timezone,
  period = "4",
  filter = "all",
  firstDate = null,
  comparisonFrom = null,
  baselineExercises = [],
}) {
  const bounds = periodBounds(today, period);
  const owned = [
    ...new Map(
      sessions
        .filter(
          (s) =>
            ["completed", "recorded"].includes(s.session_status) &&
            s.local_date <= today,
        )
        .map((s) => [s.id, { ...s, modality: modality(s) }]),
    ).values(),
  ];
  owned.sort(
    (a, b) =>
      a.local_date.localeCompare(b.local_date) || a.id.localeCompare(b.id),
  );
  const modalities = [...new Set(owned.map((s) => s.modality))].sort();
  const matching = owned.filter(
    (s) => filter === "all" || s.modality === filter,
  );
  const current = matching.filter(
    (s) =>
      s.local_date >= bounds.from &&
      s.local_date <= (period === "all" ? today : bounds.to),
  );
  const prior = matching.filter(
    (s) => s.local_date >= bounds.previousFrom && s.local_date < bounds.from,
  );
  const currentIds = new Set(current.map((s) => s.id));
  const grouped = new Map();
  for (const e of exercises) {
    const key = exerciseIdentity(e);
    if (!currentIds.has(e.session_id) || !key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(e);
  }
  const strength = [...grouped.entries()]
    .map(([key, rows]) => {
      const points = rows
        .map((e) =>
          exerciseObservation(
            e,
            current.find((s) => s.id === e.session_id).local_date,
          ),
        )
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.exercise_id.localeCompare(b.exercise_id),
        );
      const historical = baselineExercises
        .filter((e) => exerciseIdentity(e) === key)
        .flatMap((e) => {
          const session = matching.find((s) => s.id === e.session_id);
          return session &&
            comparisonFrom &&
            session.local_date >= comparisonFrom &&
            session.local_date < bounds.from
            ? [exerciseObservation(e, session.local_date)]
            : [];
        });
      const records = observedRecords(points, historical, rows[0].load_unit);
      const exposures = new Set(points.map((p) => p.session_id)).size;
      const max = (values) =>
        values.filter(numeric).length
          ? Math.max(...values.filter(numeric))
          : null;
      const bestLoad = max(points.map((p) => p.load));
      const atLoad = points.filter(
        (p) =>
          (bestLoad !== null || rows[0].load_unit === "bodyweight") &&
          p.load === bestLoad &&
          numeric(p.max_reps),
      );
      // One observation per session. Four comparable sessions, two per half of selected complete weeks.
      const midpoint = shift(bounds.from, Math.floor(bounds.days / 2));
      const comparable = [
        ...new Map(
          [...atLoad]
            .sort((a, b) => a.max_reps - b.max_reps)
            .map((p) => [p.session_id, p]),
        ).values(),
      ];
      const earlier = comparable.filter((p) => p.date < midpoint),
        later = comparable.filter((p) => p.date >= midpoint);
      const direction =
        !["all", "week"].includes(period) &&
        earlier.length >= 2 &&
        later.length >= 2
          ? trend(
              max(earlier.map((p) => p.max_reps)),
              max(later.map((p) => p.max_reps)),
            )
          : "insufficient_data";
      const sessionVolumes = [...new Set(points.map((p) => p.session_id))].map(
        (id) => ({
          id,
          value: total(
            points.filter((p) => p.session_id === id).map((p) => p.volume),
          ),
        }),
      );
      return {
        key,
        name: rows[0].canonical_name || rows[0].reported_name,
        metric_requirements: rows[0].metric_requirements || null,
        unit: rows[0].load_unit || null,
        variant: [rows[0].execution_type, rows[0].side, rows[0].tempo_or_pause]
          .filter(Boolean)
          .join(" · "),
        exposures,
        best_load: bestLoad,
        records,
        record_count: records.length,
        best_reps: max(points.map((p) => p.max_reps)),
        best_reps_at_load: max(atLoad.map((p) => p.max_reps)),
        known_volume: total(points.map((p) => p.volume)),
        best_session_volume: max(sessionVolumes.map((p) => p.value)),
        volume_known: points.filter((p) => p.volume !== null).length,
        observations: points.length,
        trend: direction,
        last_practice: points.at(-1).date,
        skill:
          /\b(hspu|pike|muscle[ -]?up|high pull|pistol|dominadas? estrictas?|strict pull[ -]?ups?)\b/.test(
            normalizeName(rows[0].reported_name),
          ),
        notes: [...new Set(rows.map((e) => e.notes).filter(Boolean))].slice(-3),
        points,
      };
    })
    .sort((a, b) => b.exposures - a.exposures || a.name.localeCompare(b.name));
  const end = monday(today),
    weeks = [];
  for (let i = 11; i >= 0; i--) {
    const from = shift(end, -i * 7),
      to = shift(from, 6),
      rows = matching.filter(
        (s) =>
          s.local_date >= from && s.local_date <= to && s.local_date <= today,
      );
    weeks.push({ from, to, partial: to >= today, ...summarizeSessions(rows) });
  }
  const cardioWeeks = Array.from(
    { length: period === "week" ? 1 : period === "4" ? 4 : 12 },
    (_, i) => {
      const from = shift(
        period === "all" ? shift(end, -77) : bounds.from,
        i * 7,
      );
      return { from, to: shift(from, 6), partial: shift(from, 6) >= today };
    },
  );
  const cardio = ["running", "trail_running", "cycling", "swimming"]
    .filter((code) => current.some((s) => s.modality === code))
    .map((code) => {
      const rows = current.filter((s) => s.modality === code);
      const pairs = rows.filter(
        (s) =>
          numeric(s.distance_meters) &&
          s.distance_meters > 0 &&
          numeric(s.duration_seconds) &&
          s.duration_seconds > 0,
      );
      return {
        code,
        ...summarizeSessions(rows),
        distance: total(rows.map((s) => s.distance_meters)),
        distance_known: rows.filter((s) => numeric(s.distance_meters)).length,
        elevation: total(rows.map((s) => s.elevation_gain_meters)),
        pace_seconds_km: pairs.length
          ? (total(pairs.map((s) => s.duration_seconds)) /
              total(pairs.map((s) => s.distance_meters))) *
            1000
          : null,
        pace_sessions: pairs.length,
        weeks: cardioWeeks.map((w) => ({
          from: w.from,
          partial: w.partial,
          distance: total(
            rows
              .filter((s) => s.local_date >= w.from && s.local_date <= w.to)
              .map((s) => s.distance_meters),
          ),
        })),
      };
    });
  // Planning is intentionally unfiltered: execution modality must never establish plan identity.
  const relevant = plans.filter(
    (p) =>
      p.planned_date >= bounds.from &&
      p.planned_date <= (period === "all" ? today : bounds.to) &&
      !["cancelled", "canceled", "rescheduled", "recommended"].includes(
        p.status,
      ) &&
      p.session_type !== "rest",
  );
  const plan = relevant.map((p) =>
    classifyProgressPlan(p, owned, plans, today),
  );
  const counts = Object.fromEntries(
    ["linked", "modified", "skipped", "unknown"].map((status) => [
      status,
      plan.filter((p) => p.status === status).length,
    ]),
  );
  const s = summarizeSessions(current),
    previous = summarizeSessions(prior);
  const adequate =
    !["all", "week"].includes(period) &&
    firstDate &&
    firstDate <= bounds.previousFrom;
  const selectedExercises = exercises.filter((e) =>
    currentIds.has(e.session_id),
  );
  const identified = selectedExercises.filter((e) => exerciseIdentity(e));
  const volumeKnown = identified.filter(
    (e) => exerciseObservation(e, "").volume !== null,
  ).length;
  const coverage = (known, count) =>
    !count || !known ? "missing" : known === count ? "complete" : "partial";
  const quality = {
    status: !current.length
      ? "missing"
      : s.duration_known < s.sessions ||
          identified.length < selectedExercises.length ||
          volumeKnown < selectedExercises.length ||
          current.some(
            (session) =>
              !selectedExercises.some((e) => e.session_id === session.id),
          )
        ? "partial"
        : "complete",
    duration: coverage(s.duration_known, s.sessions),
    exercise_identity: coverage(identified.length, selectedExercises.length),
    volume: coverage(volumeKnown, selectedExercises.length),
    comparison: strength.some(
      (e) => e.records.length || e.trend !== "insufficient_data",
    )
      ? "partial"
      : "insufficient_data",
    exercise_count: selectedExercises.length,
    unidentified_exercises: selectedExercises.length - identified.length,
    volume_observations: volumeKnown,
    sessions_without_exercises: current.filter(
      (s) => !selectedExercises.some((e) => e.session_id === s.id),
    ).length,
  };
  const executionLinks = plans
    .filter(
      (p) =>
        currentIds.has(p.linked_completed_session_id) &&
        !["cancelled", "canceled", "rescheduled", "recommended"].includes(
          p.status,
        ),
    )
    .map((p) => classifyProgressPlan(p, owned, plans, today));
  const restDates = confirmedRestDates(
    plans,
    owned,
    bounds.from,
    period === "all" || period === "week" ? today : bounds.to,
  );
  return {
    schema_version: "progress_performance_v1",
    data_quality: quality,
    execution_links: executionLinks,
    confirmed_rest_dates: restDates,
    highlights: progressHighlights(strength),
    insights: progressInsights({
      strength,
      quality,
      summary: s,
      executionLinks,
      restDates,
      comparisonFrom,
    }),
    comparison_from: comparisonFrom,
    status:
      !current.length && !relevant.length
        ? "empty"
        : quality.status === "partial" ||
            s.duration_known < s.sessions ||
            strength.some((e) => e.volume_known < e.observations) ||
            current.some((s) => s.modality === "unknown")
          ? "partial"
          : current.length < 2
            ? "insufficient_data"
            : "available",
    calendar_date: today,
    timezone,
    period,
    from: period === "all" ? firstDate : bounds.from,
    to: period === "all" ? today : bounds.to,
    modalities,
    summary: s,
    previous,
    session_trend: adequate
      ? trend(previous.sessions, s.sessions)
      : "insufficient_data",
    minutes_trend:
      adequate &&
      previous.duration_known === previous.sessions &&
      s.duration_known === s.sessions
        ? trend(previous.seconds, s.seconds)
        : "insufficient_data",
    strength,
    cardio,
    weeks,
    active_weeks: weeks.filter((w) => w.sessions > 0).length,
    consistency_trend:
      firstDate && firstDate <= weeks[3].from
        ? trend(
            weeks.slice(3, 7).reduce((n, w) => n + w.sessions, 0),
            weeks.slice(7, 11).reduce((n, w) => n + w.sessions, 0),
          )
        : "insufficient_data",
    planning: {
      total: plan.length,
      ...counts,
      adherence:
        plan.length && counts.linked + counts.modified > 0
          ? (counts.linked + counts.modified) / plan.length
          : null,
      evidence: plan,
    },
  };
}
