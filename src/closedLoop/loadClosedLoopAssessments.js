import { assessClosedLoop, feedbackFromSessionMetrics, isClosedLoopExecutionUsable } from "./closedLoopAssessment.js";
import { loadHealthIntelligence } from "../health/loadHealthIntelligence.js";
import { calendarDateInTimeZone, isValidCalendarDate, isValidTimeZone } from "../time/userCalendar.js";

const PLAN_SELECT = "id,user_id,planned_date,planned_time,title,session_type,status,planned_intensity,planned_duration_min,planned_duration_max,linked_completed_session_id";
const BLOCK_SELECT = "id,planned_session_id,block_order,title,block_type,planned_duration_seconds,planned_rounds,planned_exercises";
const EXECUTION_SELECT = "id,user_id,title,local_date,started_at,ended_at,session_status,duration_seconds,source_id";
const EXECUTED_BLOCK_SELECT = "id,session_id,name,block_order,duration_seconds,rounds_completed,data_confidence,prescription";
const EXERCISE_SELECT = "id,session_id,block_id,exercise_order,reported_name,sets_completed,reps_per_set,load_value,load_unit,side,data_confidence";
const METRIC_SELECT = "id,session_id,metric_code,value_numeric,value_text,unit,metric_scope,source_path,confidence";
const array = (value) => Array.isArray(value) ? value : [];
const shiftDate = (value, days) => {
  const instant = new Date(`${value}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
};
const uniqueRows = (rows) => [...new Map(rows.filter((row) => row?.id).map((row) => [row.id, row])).values()];
const optionalContractMissing = (error) => ["42P01", "42703", "42501", "PGRST204", "PGRST205"].includes(error?.code);
const structuralOrder = (a, b) => Number(a.block_order ?? a.exercise_order ?? a.set_index ?? 0) - Number(b.block_order ?? b.exercise_order ?? b.set_index ?? 0) || String(a.id).localeCompare(String(b.id));
const READ_PAGE_SIZE = 200;
const READ_MAX_PAGES = 10;

async function read(query) {
  const result = await query;
  if (result.error) throw result.error;
  return array(result.data);
}

async function readChildren(db, table, select, column, ids, missing, optional = false, ownerUserId = null) {
  if (!ids.length) return [];
  const loaded = [];
  for (let page = 0; page < READ_MAX_PAGES; page++) {
    let query = db.from(table).select(select).in(column, ids).order("id", { ascending: true }).range(page * READ_PAGE_SIZE, (page + 1) * READ_PAGE_SIZE - 1);
    if (ownerUserId) query = query.eq("user_id", ownerUserId);
    const result = await query;
    if (result.error) {
      if (optional && optionalContractMissing(result.error)) { missing.push(`${table}_contract_unavailable`); return []; }
      throw result.error;
    }
    const rows = array(result.data);
    loaded.push(...rows);
    if (rows.length < READ_PAGE_SIZE) {
      const allowed = new Set(ids);
      return uniqueRows(loaded.filter((row) => allowed.has(row?.[column]) && (!ownerUserId || row.user_id === ownerUserId))).sort(structuralOrder);
    }
  }
  // Whole-source completeness matters for both exact link uniqueness and derived volume.
  missing.push(`${table}_coverage_truncated`);
  return [];
}

async function readPerformedSetHierarchy(db, blocks, missing) {
  const items = await readChildren(db, "block_items", "id,block_id", "block_id", blocks.map((block) => block.id), missing, true);
  const exercises = await readChildren(db, "item_exercises", "id,block_item_id,display_name", "block_item_id", items.map((item) => item.id), missing, true);
  const sets = await readChildren(db, "performed_sets", "id,item_exercise_id,set_index,reps,reps_left,reps_right,load_kg,completed", "item_exercise_id", exercises.map((exercise) => exercise.id), missing, true);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return exercises.map((exercise) => ({ ...exercise, block_id: itemsById.get(exercise.block_item_id)?.block_id, performed_sets: sets.filter((set) => set.item_exercise_id === exercise.id) }));
}

/** JWT-scoped canonical reads only. Every child scope originates in an authenticated owned parent. */
export async function loadClosedLoopAssessments(db, { userId, calendarDate, timezone, generatedAt = null, sessionId = null, plannedSessionId = null, fromDate = null, toDate = null, limit = 5, healthLoader = loadHealthIntelligence } = {}) {
  if (!db?.from || !db?.auth?.getUser || !userId) throw new Error("closed_loop_authenticated_client_required");
  const auth = await db.auth.getUser();
  if (auth.error || auth.data?.user?.id !== userId) throw new Error("closed_loop_user_scope_mismatch");
  if (!isValidCalendarDate(calendarDate) || !isValidTimeZone(timezone)) throw new Error("closed_loop_profile_calendar_required");
  if (generatedAt != null && (typeof generatedAt !== "string" || !Number.isFinite(Date.parse(generatedAt)))) throw new Error("closed_loop_invalid_generated_at");
  const from = fromDate ?? shiftDate(calendarDate, -7);
  const to = toDate ?? calendarDate;
  if (!isValidCalendarDate(from) || !isValidCalendarDate(to) || from > to || to > calendarDate || from < shiftDate(to, -31)) throw new Error("closed_loop_invalid_date_range");
  const max = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 20) : 5;
  let query = db.from("planned_training_sessions").select(PLAN_SELECT).eq("user_id", userId).gte("planned_date", from).lte("planned_date", to).order("planned_date", { ascending: false }).order("id", { ascending: true }).limit(max + 1);
  if (sessionId) query = query.eq("linked_completed_session_id", sessionId);
  if (plannedSessionId) query = query.eq("id", plannedSessionId);
  const [loadedPlans, loadedFuture] = await Promise.all([
    read(query),
    read(db.from("planned_training_sessions").select(PLAN_SELECT).eq("user_id", userId).gte("planned_date", calendarDate).lte("planned_date", shiftDate(calendarDate, 7)).order("planned_date", { ascending: true }).order("id", { ascending: true }).limit(50)),
  ]);
  const missing = [];
  const ownedPlans = uniqueRows(loadedPlans.filter((row) => row.user_id === userId && isValidCalendarDate(row.planned_date) && row.planned_date >= from && row.planned_date <= to));
  if (ownedPlans.length > max) missing.push("assessment_coverage_truncated");
  const plans = ownedPlans.slice(0, max);
  if (!plans.length) return [];
  const future = uniqueRows(loadedFuture.filter((row) => row.user_id === userId && isValidCalendarDate(row.planned_date) && row.planned_date >= calendarDate));
  if (future.length >= 50) missing.push("future_session_coverage_truncated");
  const planIds = plans.map((plan) => plan.id);
  const executionIds = [...new Set(plans.map((plan) => plan.linked_completed_session_id).filter(Boolean))];
  const [plannedBlocks, executionRows, linkedPlans] = await Promise.all([
    readChildren(db, "planned_session_blocks", BLOCK_SELECT, "planned_session_id", planIds, missing),
    executionIds.length ? read(db.from("training_sessions").select(EXECUTION_SELECT).eq("user_id", userId).in("id", executionIds).limit(max)) : [],
    readChildren(db, "planned_training_sessions", "id,user_id,linked_completed_session_id", "linked_completed_session_id", executionIds, missing, false, userId),
  ]);
  const executions = uniqueRows(executionRows.filter((row) => {
    const usable = row.user_id === userId && executionIds.includes(row.id) && isClosedLoopExecutionUsable(row, { calendarDate, timezone, generatedAt });
    if (!usable && row.user_id === userId && executionIds.includes(row.id)) missing.push("execution_temporal_or_status_conflict");
    return usable;
  }));
  const ownedExecutionIds = executions.map((row) => row.id);
  const sourceIds = [...new Set(executions.map((row) => row.source_id).filter(Boolean))];
  const [blocks, exercises, metrics, sources] = await Promise.all([
    readChildren(db, "session_blocks", EXECUTED_BLOCK_SELECT, "session_id", ownedExecutionIds, missing),
    readChildren(db, "session_exercises", EXERCISE_SELECT, "session_id", ownedExecutionIds, missing),
    readChildren(db, "session_metrics", METRIC_SELECT, "session_id", ownedExecutionIds, missing),
    sourceIds.length ? read(db.from("training_sources").select("id,user_id,source_type").eq("user_id", userId).in("id", sourceIds).limit(max)) : [],
  ]);
  const hierarchy = await readPerformedSetHierarchy(db, blocks, missing);
  const hierarchyTruncated = ["block_items", "item_exercises", "performed_sets"].some((table) => missing.includes(`${table}_coverage_truncated`));
  const sourcesById = new Map(sources.filter((source) => source.user_id === userId && sourceIds.includes(source.id)).map((source) => [source.id, source]));
  const executionsById = new Map(executions.map((execution) => [execution.id, {
    ...execution,
    source_type: sourcesById.get(execution.source_id)?.source_type ?? null,
    local_date: isValidCalendarDate(execution.local_date) ? execution.local_date : execution.started_at ? calendarDateInTimeZone(execution.started_at, timezone) : null,
    session_blocks: blocks.filter((block) => block.session_id === execution.id).map((block) => {
      const canonical = hierarchy.filter((exercise) => exercise.block_id === block.id);
      // Prefer the normalized set hierarchy for this block; never add legacy overlays to it.
      const selected = canonical.length ? canonical : exercises.filter((exercise) => exercise.session_id === execution.id && exercise.block_id === block.id);
      return { ...block, exercises: hierarchyTruncated ? selected.map((exercise) => ({ ...exercise, performed_sets: [], reps_per_set: null })) : selected };
    }),
  }]));
  const linkCounts = new Map();
  for (const plan of uniqueRows(linkedPlans.filter((row) => row.user_id === userId && executionIds.includes(row.linked_completed_session_id)))) linkCounts.set(plan.linked_completed_session_id, (linkCounts.get(plan.linked_completed_session_id) ?? 0) + 1);
  const linkCoverageTruncated = missing.includes("planned_training_sessions_coverage_truncated");
  if (linkCoverageTruncated) missing.push("execution_link_coverage_truncated");
  const healthCache = new Map();
  const healthForDate = async (referenceDate) => {
    if (!referenceDate || referenceDate > calendarDate) return null;
    if (!healthCache.has(referenceDate)) healthCache.set(referenceDate, healthLoader(db, { userId, calendarDate: referenceDate, timezone, generatedAt }).catch(() => null));
    return await healthCache.get(referenceDate);
  };
  const result = [];
  const healthExecutionIds = new Set(plans.filter((plan) => linkCounts.get(plan.linked_completed_session_id) === 1 && !linkCoverageTruncated).map((plan) => executionsById.get(plan.linked_completed_session_id)).filter(Boolean).sort((a, b) => String(b.local_date || "").localeCompare(String(a.local_date || "")) || String(a.id).localeCompare(String(b.id))).slice(0, 3).map((execution) => execution.id));
  for (const plan of plans) {
    const shared = plan.linked_completed_session_id && (linkCounts.get(plan.linked_completed_session_id) > 1 || linkCoverageTruncated);
    const execution = shared ? null : executionsById.get(plan.linked_completed_session_id) ?? null;
    const executionDate = execution?.local_date ?? null;
    const beforeDate = executionDate ? shiftDate(executionDate, -1) : null;
    // An overnight execution's next morning must not be labelled post-session if it overlaps it.
    const endDate = execution?.ended_at ? calendarDateInTimeZone(execution.ended_at, timezone) : executionDate;
    const afterDate = endDate ? shiftDate(endDate < executionDate ? executionDate : endDate, 1) : null;
    const loadHealth = execution && healthExecutionIds.has(execution.id);
    const [healthBefore, healthAfter] = loadHealth ? await Promise.all([healthForDate(beforeDate), healthForDate(afterDate)]) : [null, null];
    const assessment = assessClosedLoop({ userId, plannedSession: { ...plan, planned_session_blocks: plannedBlocks.filter((block) => block.planned_session_id === plan.id) }, executedSession: execution, userFeedback: execution ? feedbackFromSessionMetrics(metrics.filter((metric) => metric.user_id == null || metric.user_id === userId).map((metric) => ({ ...metric, user_id: userId })), { sessionId: execution.id, userId }) : null, healthBefore, healthAfter, beforeDate, afterDate, futureSessions: future, calendarDate, timezone, generatedAt, missingEvidence: [...missing, ...(shared ? ["ambiguous_shared_execution_link"] : []), ...(execution && !loadHealth ? ["health_assessment_coverage_limited"] : [])] });
    assessment.scope_coverage = { from_date: from, to_date: to, limit: max, truncated: missing.includes("assessment_coverage_truncated") };
    result.push(assessment);
  }
  return result;
}
