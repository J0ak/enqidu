import { buildWeeklyDashboard } from "./weeklyDashboard.js";
import { buildExerciseCatalogIndex } from "./exerciseCatalogIdentity.js";
import {
  buildProgress,
  exerciseIdentity,
  periodBounds,
  monday,
  modality as observedModality,
} from "./domain.js";
import { shiftHealthCalendarDate as shift } from "../health/healthEvidence.js";
const SESSION =
  "id,user_id,title,local_date,session_status,duration_seconds,distance_meters,elevation_gain_meters,modality_id,fit_sport:session_structure->garmin_fit_summary->>sport,fit_sub_sport:session_structure->garmin_fit_summary->>sub_sport";
const PLAN =
  "id,user_id,title,objective,planned_date,session_type,status,linked_completed_session_id";
const EXERCISE =
  "id,session_id,block_id,exercise_id,exercise_order,reported_name,execution_type,side,tempo_or_pause,load_value,load_unit,reps_per_set,sets_completed,rounds_completed,notes";
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
export async function loadProgressDomain(
  db,
  { userId, calendar, period = "4", modality = "all" },
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
  const [sessions, plans, first, codes, catalog] = await Promise.all([
    readPages(() =>
      ownSessions().gte("local_date", from).lte("local_date", calendar.date),
    ),
    readPages(() =>
      db
        .from("planned_training_sessions")
        .select(
          "id,user_id,title,objective,planned_date,session_type,status,linked_completed_session_id",
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
    readPages(
      () =>
        db.from("exercise_catalog").select("id,code,name,metadata,is_active"),
      { maxRows: 2000 },
    ),
  ]);
  if (first.error || codes.error) throw new Error("canonical_read_unavailable");
  const withCanonicalIdentity = buildExerciseCatalogIndex(catalog);
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
      )
        .filter((e) => ids.includes(e.session_id))
        .map(withCanonicalIdentity),
    );
    if (exercises.length > 50000) throw new Error("progress_scope_too_large");
  }
  // Only current exercise identities require historical evidence. Read a declared 52-week
  // lookback on the server; never ship raw history or silently truncate it.
  const comparisonFrom = period === "week" ? shift(bounds.from, -364) : null;
  const baselineExercises = [],
    blocks = [];
  if (period === "week") {
    const keys = new Set(exercises.map(exerciseIdentity).filter(Boolean));
    if (keys.size) {
      const history = (
        await readPages(() =>
          ownSessions()
            .gte("local_date", comparisonFrom)
            .lt("local_date", bounds.from),
        )
      ).filter((s) => s.user_id === userId);
      for (const s of history) {
        s.modality_code =
          codes.data?.find((m) => m.id === s.modality_id)?.code || null;
        if (!owned.some((row) => row.id === s.id)) owned.push(s);
      }
      let historyRead = 0;
      for (let i = 0; i < history.length; i += 100) {
        const ids = history.slice(i, i + 100).map((s) => s.id);
        const rows = await readPages(() =>
          db.from("session_exercises").select(EXERCISE).in("session_id", ids),
        );
        historyRead += rows.length;
        if (historyRead > 50000) throw new Error("progress_scope_too_large");
        baselineExercises.push(
          ...rows
            .filter((e) => ids.includes(e.session_id))
            .map(withCanonicalIdentity)
            .filter((e) => keys.has(exerciseIdentity(e))),
        );
      }
    }
    for (let i = 0; i < selected.length; i += 100) {
      const ids = selected.slice(i, i + 100).map((s) => s.id);
      const [b, linked] = await Promise.all([
        readPages(() =>
          db
            .from("session_blocks")
            .select("id,session_id,name,execution_notes,block_order")
            .in("session_id", ids),
        ),
        readPages(() =>
          db
            .from("planned_training_sessions")
            .select(PLAN)
            .eq("user_id", userId)
            .in("linked_completed_session_id", ids),
        ),
      ]);
      blocks.push(...b.filter((row) => ids.includes(row.session_id)));
      for (const plan of linked.filter((row) => row.user_id === userId))
        if (!ownedPlans.some((p) => p.id === plan.id)) ownedPlans.push(plan);
      if (blocks.length > 50000 || ownedPlans.length > 50000)
        throw new Error("progress_scope_too_large");
    }
  }
  const result = buildProgress({
    sessions: owned.map((s) => ({
      ...s,
      modality_code:
        codes.data?.find((m) => m.id === s.modality_id)?.code || null,
    })),
    exercises,
    baselineExercises,
    comparisonFrom,
    plans: ownedPlans,
    today: calendar.date,
    timezone: calendar.timezone,
    period,
    filter: modality,
    firstDate: first.data?.[0]?.local_date || null,
  });
  return { result, sessions: owned, plans: ownedPlans, exercises, blocks };
}

export async function loadProgress(db, options) {
  const {
    result,
    sessions: owned,
    plans: ownedPlans,
    exercises,
    blocks,
  } = await loadProgressDomain(db, options);
  const { period = "4", skills_only = false, exercise_page = 0 } = options;
  // Aggregate all evidence on the server; transport only the requested card page and recent evidence.
  const cards = result.strength.filter((e) => !skills_only || e.skill);
  const compact = (value) => ({
    ...value,
    session_ids: value.session_ids.slice(-12),
  });
  return {
    ...result,
    weekly_dashboard:
      period === "week"
        ? buildWeeklyDashboard({
            progress: result,
            sessions: owned,
            plans: ownedPlans,
            exercises,
            blocks,
          })
        : null,
    execution_links: result.execution_links.slice(-12),
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
    insights: result.insights.slice(0, 50).map((i) => ({
      ...i,
      session_ids: i.session_ids.slice(-12),
      exercise_ids: i.exercise_ids.slice(-12),
      plan_ids: i.plan_ids.slice(-12),
    })),
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
