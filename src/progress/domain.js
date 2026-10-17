import { comparePlannedVsExecuted } from "../closedLoop/plannedVsExecuted.js";
import { shiftHealthCalendarDate as shift } from "../health/healthEvidence.js";
export const numeric = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
export const normalizeName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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
function summary(rows) {
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
export function buildProgress({
  sessions,
  exercises,
  plans,
  today,
  timezone,
  period = "4",
  filter = "all",
  firstDate = null,
}) {
  const bounds = periodBounds(today, period);
  const owned = [
    ...new Map(
      sessions.map((s) => [s.id, { ...s, modality: modality(s) }]),
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
    if (!currentIds.has(e.session_id) || !normalizeName(e.reported_name))
      continue;
    // Preserve execution variant, side and tempo even when an exercise identity exists.
    const key = JSON.stringify([
      e.exercise_id || normalizeName(e.reported_name),
      e.execution_type,
      e.side,
      e.tempo_or_pause,
      e.load_unit,
    ]);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(e);
  }
  const strength = [...grouped.entries()]
    .map(([key, rows]) => {
      const points = rows
        .map((e) => {
          const reps = observedReps(e.reps_per_set);
          const load =
            units.has(e.load_unit) && numeric(e.load_value)
              ? e.load_value
              : null;
          return {
            exercise_id: e.id,
            session_id: e.session_id,
            date: current.find((s) => s.id === e.session_id).local_date,
            load,
            max_reps: reps ? Math.max(...reps) : null,
            volume:
              load !== null && reps
                ? load * reps.reduce((a, b) => a + b, 0)
                : null,
          };
        })
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.exercise_id.localeCompare(b.exercise_id),
        );
      const records = [];
      for (const point of points) {
        const before = points.filter(
          (p) => p.date < point.date && p.session_id !== point.session_id,
        );
        const loads = before.map((p) => p.load).filter(numeric);
        if (
          numeric(point.load) &&
          loads.length &&
          point.load > Math.max(...loads)
        )
          records.push({
            kind: "load",
            value: point.load,
            previous: Math.max(...loads),
            date: point.date,
            exercise_id: point.exercise_id,
            session_id: point.session_id,
          });
        const reps = before
          .filter(
            (p) =>
              p.load === point.load &&
              (point.load !== null || rows[0].load_unit === "bodyweight"),
          )
          .map((p) => p.max_reps)
          .filter(numeric);
        if (
          numeric(point.max_reps) &&
          reps.length &&
          point.max_reps > Math.max(...reps)
        )
          records.push({
            kind: "reps_at_load",
            value: point.max_reps,
            previous: Math.max(...reps),
            date: point.date,
            exercise_id: point.exercise_id,
            session_id: point.session_id,
          });
      }
      // Repeated blocks/sets at the same day's best mark are one observed record.
      // A date groups record observations only; it never reconciles activities.
      const dailyRecords = new Map();
      for (const record of records) {
        const load = points.find(
          (p) => p.exercise_id === record.exercise_id,
        )?.load;
        const recordKey = JSON.stringify([
          record.kind,
          record.date,
          record.kind === "reps_at_load" ? load : null,
        ]);
        if (
          !dailyRecords.has(recordKey) ||
          dailyRecords.get(recordKey).value < record.value
        )
          dailyRecords.set(recordKey, record);
      }
      const observedRecords = [...dailyRecords.values()];
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
      const midpoint = shift(bounds.from, bounds.days / 2);
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
        period !== "all" && earlier.length >= 2 && later.length >= 2
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
        name: rows[0].reported_name,
        unit: rows[0].load_unit || null,
        variant: [rows[0].execution_type, rows[0].side, rows[0].tempo_or_pause]
          .filter(Boolean)
          .join(" · "),
        exposures,
        best_load: bestLoad,
        records: observedRecords,
        record_count: observedRecords.length,
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
    weeks.push({ from, to, partial: to >= today, ...summary(rows) });
  }
  const cardioWeeks = Array.from(
    { length: period === "4" ? 4 : 12 },
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
        ...summary(rows),
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
  const plan = relevant.map((p) => {
    const executed =
      owned.find((s) => s.id === p.linked_completed_session_id) || null;
    const ambiguous =
      Boolean(p.linked_completed_session_id) &&
      relevant.filter(
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
  });
  const counts = Object.fromEntries(
    ["linked", "modified", "skipped", "unknown"].map((status) => [
      status,
      plan.filter((p) => p.status === status).length,
    ]),
  );
  const s = summary(current),
    previous = summary(prior);
  const adequate =
    period !== "all" && firstDate && firstDate <= bounds.previousFrom;
  return {
    schema_version: "progress_performance_v1",
    status:
      !current.length && !relevant.length
        ? "empty"
        : s.duration_known < s.sessions ||
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
