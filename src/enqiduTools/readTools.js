import { loadHealthIntelligence } from "../health/loadHealthIntelligence.js";
import { loadClosedLoopAssessments } from "../closedLoop/loadClosedLoopAssessments.js";
import { isValidCalendarDate, isValidTimeZone } from "../time/userCalendar.js";
import { shiftHealthCalendarDate } from "../health/healthEvidence.js";
import { buildWeekPlanProgress } from "../coachContext/weekPlanProgress.js";

const PLAN_SELECT = "id,user_id,planned_date,planned_time,title,session_type,status,location_type,planned_intensity,planned_duration_min,planned_duration_max,objective,source,linked_completed_session_id";
const BLOCK_SELECT = "id,planned_session_id,block_order,block_type,title,objective,planned_duration_seconds,planned_rounds,planned_exercises";
const EXECUTION_SELECT = "id,user_id,title,local_date,started_at,ended_at,session_status,sport,activity_type,duration_seconds,moving_duration_seconds,distance_meters,elevation_gain_meters,calories_total,average_heart_rate,max_heart_rate,training_load";
const METRIC_CODES = ["rpe_global", "rpe", "discomfort", "session_completion", "distance_meters", "duration_seconds", "average_heart_rate", "max_heart_rate", "training_load"];
const array = (value) => Array.isArray(value) ? value : [];
const scalar = (value) => typeof value === "string" ? value.slice(0, 1000) : typeof value === "number" && Number.isFinite(value) || typeof value === "boolean" ? value : null;
const pick = (value, keys) => Object.fromEntries(keys.filter((key) => value?.[key] !== undefined).map((key) => [key, scalar(value[key])]));
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

function weekBounds(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const from = shiftHealthCalendarDate(date, -((weekday + 6) % 7));
  return { from, to: shiftHealthCalendarDate(from, 6) };
}

function compactPlan(row, blocks = []) {
  return {
    ...pick(row, ["id", "planned_date", "planned_time", "title", "session_type", "status", "location_type", "planned_intensity", "planned_duration_min", "planned_duration_max", "objective", "source", "linked_completed_session_id"]),
    blocks: blocks.filter((block) => block.planned_session_id === row.id).map((block) => ({
      ...pick(block, ["id", "block_order", "block_type", "title", "objective", "planned_duration_seconds", "planned_rounds"]),
      planned_exercises: array(block.planned_exercises).slice(0, 50).map((exercise) => pick(exercise, ["id", "name", "target_sets", "target_reps", "load", "notes"])),
    })),
  };
}

function compactExecution(row) {
  return pick(row, EXECUTION_SELECT.split(",").filter((key) => key !== "user_id"));
}

/** Tools operate on an authenticated server context, never request-supplied ownership.
 * A fresh instance belongs to ONE request. Its memoized reads must never be reused for apply.
 */
export function createEnqiduReadDomain({ db, userId, calendar, now = new Date() } = {}) {
  if (!db?.from || !db?.rpc || typeof userId !== "string" || !userId.trim()) fail("authenticated_context_required");
  if (!isValidCalendarDate(calendar?.date) || !isValidTimeZone(calendar?.timezone)) fail("profile_calendar_required");
  const instant = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(instant.getTime())) fail("invalid_request_time");
  const generatedAt = instant.toISOString();
  const cache = new Map();
  const memo = (key, loader) => {
    if (!cache.has(key)) cache.set(key, Promise.resolve().then(loader));
    return cache.get(key);
  };
  const scope = { calendar_date: calendar.date, timezone: calendar.timezone };
  const canonicalCoachContext = (date = calendar.date) => memo(`coach:${date}`, async () => {
    if (!isValidCalendarDate(date)) fail("invalid_date");
    const response = await db.rpc("get_ai_coach_context", { p_user_id: userId, p_date: date, p_mode: "today_coach", p_from_date: date, p_to_date: date, p_session_id: null });
    if (response.error) fail("canonical_read_unavailable");
    return response.data || {};
  });
  const rows = async (query) => {
    const result = await query;
    if (result.error) fail("canonical_read_unavailable");
    return array(result.data);
  };
  const boundedRows = async (query, max) => {
    const result = await rows(query.limit(max + 1));
    if (result.length > max) fail("output_limit_exceeded");
    return result;
  };
  const ownerRows = async (query, max) => (await boundedRows(query, max)).filter((row) => row.user_id === userId);
  const health = (date = calendar.date) => {
    if (!isValidCalendarDate(date) || date > calendar.date) fail("invalid_date");
    return memo(`health:${date}`, () => loadHealthIntelligence(db, {
      userId, calendarDate: date, timezone: calendar.timezone, generatedAt,
    }));
  };
  const planRows = (from, to) => memo(`plans:${from}:${to}`, () => ownerRows(db.from("planned_training_sessions").select(PLAN_SELECT).eq("user_id", userId).gte("planned_date", from).lte("planned_date", to).order("planned_date", { ascending: true }).order("planned_time", { ascending: true, nullsFirst: false }).order("id", { ascending: true }), 50));
  const blocksFor = (sessions) => memo(`blocks:${sessions.map((row) => row.id).join(",")}`, async () => {
    const ids = sessions.map((row) => row.id);
    if (!ids.length) return [];
    // Children are scoped only through already owned parents; no request controls this list.
    return (await boundedRows(db.from("planned_session_blocks").select(BLOCK_SELECT).in("planned_session_id", ids).order("block_order", { ascending: true }).order("id", { ascending: true }), 250)).filter((row) => ids.includes(row.planned_session_id));
  });
  const availability = (from, to) => memo(`availability:${from}:${to}`, async () => (await ownerRows(db.from("training_availability_overrides").select("user_id,calendar_date,availability_status,source").eq("user_id", userId).gte("calendar_date", from).lte("calendar_date", to).order("calendar_date", { ascending: true }), 31)).map((row) => pick(row, ["calendar_date", "availability_status", "source"])));
  const plannedSession = (id) => memo(`plan:${id}`, async () => {
    const found = await ownerRows(db.from("planned_training_sessions").select(PLAN_SELECT).eq("user_id", userId).eq("id", id), 1);
    return found[0] || null;
  });
  const assessments = ({ session_id = null, date = null } = {}) => memo(`closed:${session_id || ""}:${date || ""}`, async () => {
    if (date && (!isValidCalendarDate(date) || date > calendar.date)) fail("invalid_date");
    let fromDate = date, toDate = date;
    if (session_id) {
      const owned = await ownerRows(db.from("training_sessions").select("id,user_id,local_date").eq("user_id", userId).eq("id", session_id), 1);
      if (!owned.length) fail("session_not_found");
      // The persisted exact link is authoritative even when execution took place
      // on a different calendar day from the plan (including overnight sessions).
      const linked = await ownerRows(db.from("planned_training_sessions").select("id,user_id,planned_date").eq("user_id", userId).eq("linked_completed_session_id", session_id).order("planned_date", { ascending: true }), 20);
      if (!linked.length) return [];
      const dates = linked.map((row) => row.planned_date).sort();
      if (dates.some((value) => !isValidCalendarDate(value) || value > calendar.date)) fail("invalid_date");
      if (date && !dates.includes(date)) fail("invalid_arguments");
      fromDate = date || dates[0];
      toDate = date || dates.at(-1);
      if (fromDate < shiftHealthCalendarDate(toDate, -31)) fail("canonical_state_limit");
    }
    return loadClosedLoopAssessments(db, {
      userId, calendarDate: calendar.date, timezone: calendar.timezone, generatedAt,
      sessionId: session_id, fromDate, toDate, limit: 5,
      healthLoader: (_db, { calendarDate }) => health(calendarDate),
    });
  });
  const handlers = {
    async get_athlete_context() {
      // This fixed canonical RPC already applies the athlete scope. Do not expose its arbitrary JSON.
      const result = (await canonicalCoachContext()).athlete_context || {};
      const constraints = await memo("constraints", () => ownerRows(db.from("coach_athlete_constraints").select("user_id,constraint_type,severity,description,active").eq("user_id", userId).eq("active", true), 50));
      const locations = array(result.constraints).filter((item) => item?.location_type);
      return {
        schema_version: "enqidu_athlete_context_v1", ...scope,
        profile: pick(result.athlete, ["display_name", "experience_level", "primary_goal"]),
        goals: array(result.goals).slice(0, 30).map((goal) => pick(goal, ["name", "description", "goal_type", "priority", "target_value", "target_unit", "target_date", "status"])),
        constraints: constraints.map((constraint) => pick(constraint, ["constraint_type", "severity", "description", "active"])),
        locations: locations.slice(0, 30).map((location) => pick(location, ["display_name", "location_type", "access_mode", "prescription_scope", "coached_sessions_available", "is_active"])),
        equipment: array(result.equipment).filter((item) => item.available === true || item.available === "true").slice(0, 100).map((item) => pick(item, ["name", "category", "location", "available", "quantity", "unit"])),
      };
    },
    async get_today_plan() {
      const sessions = await planRows(calendar.date, calendar.date);
      const [blocks, available] = await Promise.all([blocksFor(sessions), availability(calendar.date, calendar.date)]);
      return { schema_version: "enqidu_today_plan_v1", ...scope, status: sessions.length ? "persisted" : "no_persisted_plan", sessions: sessions.map((row) => compactPlan(row, blocks)), availability: available };
    },
    async get_week_plan() {
      const { from, to } = weekBounds(calendar.date);
      const [sessions, available, focus] = await Promise.all([
        planRows(from, to), availability(from, to),
        memo(`focus:${from}`, () => rows(db.from("weekly_plans").select("user_id,weekly_focus").eq("user_id", userId).eq("week_start", from).order("updated_at", { ascending: false }).limit(1))),
      ]);
      const blocks = await blocksFor(sessions);
      const weekly_focus = scalar(focus.find((row) => row.user_id === userId)?.weekly_focus);
      const projected = sessions.map((row) => compactPlan(row, blocks));
      return { schema_version: "enqidu_week_plan_v1", ...scope, from, to, weekly_focus, sessions: projected, availability: available, progress: buildWeekPlanProgress({ sessions: projected, from, to, reference_date: calendar.date, weekly_focus }) };
    },
    async get_recent_training({ limit = 10, date = null } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) fail("invalid_arguments");
      if (date && (!isValidCalendarDate(date) || date > calendar.date)) fail("invalid_date");
      let query = db.from("training_sessions").select(EXECUTION_SELECT).eq("user_id", userId).in("session_status", ["completed", "enriched"]).lte("local_date", calendar.date).order("local_date", { ascending: false }).order("id", { ascending: true }).limit(limit + 1);
      if (date) query = query.eq("local_date", date);
      const sessions = (await rows(query)).filter((row) => row.user_id === userId);
      return { schema_version: "enqidu_recent_training_v1", ...scope, date, sessions: sessions.slice(0, limit).map(compactExecution), has_more: sessions.length > limit };
    },
    async get_training_session({ session_id } = {}) {
      if (typeof session_id !== "string" || !session_id) fail("invalid_arguments");
      const sessions = await ownerRows(db.from("training_sessions").select(EXECUTION_SELECT).eq("user_id", userId).eq("id", session_id).in("session_status", ["completed", "enriched"]).lte("local_date", calendar.date), 1);
      if (!sessions.length) fail("session_not_found");
      const [blocks, metrics] = await Promise.all([
        boundedRows(db.from("session_blocks").select("id,session_id,block_order,name,block_type,duration_seconds,rounds_completed").eq("session_id", session_id).order("block_order", { ascending: true }).order("id", { ascending: true }), 100),
        boundedRows(db.from("session_metrics").select("session_id,metric_code,value_numeric,unit,metric_scope,confidence").eq("session_id", session_id).eq("metric_scope", "session").in("metric_code", METRIC_CODES).order("id", { ascending: true }), 100),
      ]);
      return { schema_version: "enqidu_training_session_v1", ...scope, session: compactExecution(sessions[0]), blocks: blocks.filter((row) => row.session_id === session_id).map((row) => pick(row, ["id", "block_order", "name", "block_type", "duration_seconds", "rounds_completed"])), metrics: metrics.filter((row) => row.session_id === session_id).map((row) => pick(row, ["metric_code", "value_numeric", "unit", "confidence"])) };
    },
    async get_health_status({ date = calendar.date } = {}) { return health(date); },
    async get_readiness({ date = calendar.date } = {}) { return (await health(date)).readiness; },
    async get_closed_loop_assessment(args) { return { schema_version: "enqidu_closed_loop_result_v1", ...scope, assessments: await assessments(args) }; },
    async get_adaptation_proposal(args) {
      return { schema_version: "enqidu_adaptation_proposals_v1", ...scope, proposals: (await assessments(args)).map((assessment) => ({ planned_session_id: assessment.planned_session?.id ?? null, executed_session_id: assessment.executed_session?.id ?? null, proposal: assessment.adaptation_proposal })) };
    },
  };
  return Object.freeze({
    health, assessments, plannedSession, canonicalCoachContext,
    async read(tool, args = {}) {
      if (!Object.hasOwn(handlers, tool)) fail("unknown_tool");
      const result = await handlers[tool](args);
      // Fail closed on unexpectedly large canonical output rather than silently dropping evidence.
      if (new TextEncoder().encode(JSON.stringify(result)).length > 131072) fail("output_limit_exceeded");
      return structuredClone(result);
    },
  });
}

export const CLOSED_LOOP_ACTION_POLICY_VERSION = "enqidu.closed-loop-action.v1.0.0";

/** Translate the existing proposal; the existing duration action remains the only writer.
 * The policy reduces the lower duration bound by 20%, rounded down to 5 minutes, minimum 10.
 * A recovery_bias caused by reported discomfort is left for explicit athlete review, never prescribed.
 */
export async function resolveClosedLoopAction({ domain, args = {} } = {}) {
  const assessments = await domain.assessments(args);
  if (assessments.length !== 1) fail(assessments.length ? "ambiguous_proposal" : "proposal_not_found");
  const assessment = assessments[0];
  const proposal = assessment.adaptation_proposal;
  if (!["reduce", "recovery_bias"].includes(proposal?.action) || proposal.reasons?.includes("user_reported_discomfort")) fail("proposal_not_actionable");
  if (proposal.affected_future_sessions?.length !== 1) fail("proposal_not_actionable");
  const target = proposal.affected_future_sessions[0];
  const session = await domain.plannedSession(target.id);
  if (!session || session.planned_date !== target.planned_date) fail("proposal_not_actionable");
  const duration = Number(session.planned_duration_min ?? session.planned_duration_max);
  if (!Number.isFinite(duration) || duration <= 10) fail("proposal_not_actionable");
  const durationMinutes = Math.max(10, Math.floor(duration * 0.8 / 5) * 5);
  return { action: "adapt_session_duration", args: { source_date: target.planned_date, duration_minutes: durationMinutes }, proposal, assessment, policy_version: CLOSED_LOOP_ACTION_POLICY_VERSION };
}
