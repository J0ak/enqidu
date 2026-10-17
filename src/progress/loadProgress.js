import { buildWeeklyDashboard } from "./weeklyDashboard.js";
import {
  buildProgress,
  periodBounds,
  monday,
  modality as observedModality,
} from "./domain.js";
import { shiftHealthCalendarDate as shift } from "../health/healthEvidence.js";
const SESSION =
  "id,user_id,title,local_date,session_status,duration_seconds,distance_meters,elevation_gain_meters,modality_id,fit_sport:session_structure->garmin_fit_summary->>sport,fit_sub_sport:session_structure->garmin_fit_summary->>sub_sport";
const EXERCISE =
  "id,session_id,block_id,exercise_id,reported_name,execution_type,side,tempo_or_pause,load_value,load_unit,reps_per_set,sets_completed,rounds_completed,notes";
export async function readPages(
  makeQuery,
  { pageSize = 250, maxRows = 50000 } = {},
) {
  const byId = new Map();
  let cursor = null;
  for (;;) {
    let query = makeQuery().order("id", { ascending: true }).limit(pageSize);
    if (cursor) query = query.gt("id", cursor);
    const result = await query;
    if (result.error) throw new Error("canonical_read_unavailable");
    const rows = result.data || [];
    for (const row of rows) byId.set(row.id, row);
    if (byId.size > maxRows) throw new Error("progress_scope_too_large");
    if (rows.length < pageSize) return [...byId.values()];
    const next = rows.at(-1).id;
    if (next === cursor || !next) throw new Error("invalid_progress_cursor");
    cursor = next;
  }
}
/** Runs only in the authenticated tool backend. Fixed queries; RLS plus explicit ownership.
 * All pages are aggregated before transport. A resource ceiling fails explicitly, never truncates.
 */
export async function loadProgress(
  db,
  {
    userId,
    calendar,
    period = "4",
    modality = "all",
    exercise_page = 0,
    skills_only = false,
  },
) {
  if (!userId || !["4", "12", "all", "week"].includes(period))
    throw new Error("invalid_arguments");
  const bounds = periodBounds(calendar.date, period);
  const from =
    period === "all"
      ? bounds.from
      : [bounds.previousFrom, shift(monday(calendar.date), -77)].sort()[0];
  const ownSessions = () =>
    db
      .from("training_sessions")
      .select(SESSION)
      .eq("user_id", userId)
      .in("session_status", ["completed", "recorded"]);
  const [sessions, plans, first, codes] = await Promise.all([
    readPages(() =>
      ownSessions().gte("local_date", from).lte("local_date", calendar.date),
    ),
    readPages(() =>
      db
        .from("planned_training_sessions")
        .select(
          "id,user_id,planned_date,session_type,status,linked_completed_session_id",
        )
        .eq("user_id", userId)
        .gte("planned_date", bounds.from)
        .lte("planned_date", period === "week" ? bounds.to : calendar.date),
    ),
    db
      .from("training_sessions")
      .select("local_date")
      .eq("user_id", userId)
      .in("session_status", ["completed", "recorded"])
      .lte("local_date", calendar.date)
      .order("local_date", { ascending: true })
      .limit(1),
    db.from("sport_modalities").select("id,code").limit(250),
  ]);
  if (first.error || codes.error) throw new Error("canonical_read_unavailable");
  const owned = sessions.filter((s) => s.user_id === userId),
    ownedPlans = plans.filter((p) => p.user_id === userId);
  const missingLinks = [
    ...new Set(
      ownedPlans
        .map((p) => p.linked_completed_session_id)
        .filter((id) => id && !owned.some((s) => s.id === id)),
    ),
  ];
  for (let i = 0; i < missingLinks.length; i += 100)
    owned.push(
      ...(
        await readPages(() =>
          ownSessions()
            .in("id", missingLinks.slice(i, i + 100))
            .lte("local_date", calendar.date),
        )
      ).filter((s) => s.user_id === userId),
    );
  for (const row of owned)
    row.modality_code =
      codes.data?.find((m) => m.id === row.modality_id)?.code || null;
  const selected = owned.filter(
    (s) =>
      s.local_date >= bounds.from &&
      (modality === "all" || observedModality(s) === modality) &&
      s.local_date <= (period === "all" ? calendar.date : bounds.to),
  );
  const exercises = [];
  for (let i = 0; i < selected.length; i += 100) {
    const ids = selected.slice(i, i + 100).map((s) => s.id);
    exercises.push(
      ...(
        await readPages(() =>
          db.from("session_exercises").select(EXERCISE).in("session_id", ids),
        )
      ).filter((e) => ids.includes(e.session_id)),
    );
    if (exercises.length > 50000) throw new Error("progress_scope_too_large");
  }
  const result = buildProgress({
    sessions: owned.map((s) => ({
      ...s,
      modality_code:
        codes.data?.find((m) => m.id === s.modality_id)?.code || null,
    })),
    exercises,
    plans: ownedPlans,
    today: calendar.date,
    timezone: calendar.timezone,
    period,
    filter: modality,
    firstDate: first.data?.[0]?.local_date || null,
  });
  // Aggregate all evidence on the server; transport only the requested card page and recent evidence.
  const cards = result.strength.filter((e) => !skills_only || e.skill);
  const compact = (value) => ({
    ...value,
    session_ids: value.session_ids.slice(-12),
  });
  return {
    ...result,
    weekly_dashboard: period === "week" ? buildWeeklyDashboard({ progress: result, sessions: owned, plans: ownedPlans }) : null,
    summary: compact(result.summary),
    previous: compact(result.previous),
    weeks: result.weeks.map(compact),
    cardio: result.cardio.map(compact),
    exercise_count: cards.length,
    exercise_page,
    improving_count: result.strength.filter((e) => e.trend === "improving")
      .length,
    stable_count: result.strength.filter((e) => e.trend === "stable").length,
    observed_records: result.strength.reduce((n, e) => n + e.record_count, 0),
    highlights: result.strength
      .filter((e) => e.record_count > 0)
      .sort((a, b) => b.last_practice.localeCompare(a.last_practice))
      .slice(0, 3)
      .map((e) => ({ name: e.name, records: e.record_count })),
    strength: cards
      .slice(exercise_page * 12, (exercise_page + 1) * 12)
      .map((e) => ({
        ...e,
        notes: e.notes.map((n) => n.slice(0, 2048)),
        points: e.points.slice(-12),
        records: e.records.slice(-12),
      })),
    planning: {
      ...result.planning,
      evidence: result.planning.evidence.slice(-12),
    },
    evidence_scope: "recent_sample_metrics_use_all_rows",
  };
}
