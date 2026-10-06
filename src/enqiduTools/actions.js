import { buildTrainingRecommendation } from "../coachContext/trainingRecommendation.js";
import { normalizeCoachPlanLocation, toPlannedRecommendationPayload } from "../coachContext/coachPlanAction.js";
import {
  isValidPlanCalendarDate, isPlanDateOnOrAfter, planRemainingWeekReschedule,
  resolveNextWeekdayDate, resolveRemainingWeekEndDate, scalePlannedBlockDurations, shiftPlanCalendarDate,
} from "../coachTools/planActions.js";
import { isValidTimeZone } from "../time/userCalendar.js";
import { loadHealthIntelligence } from "../health/loadHealthIntelligence.js";

// Only this module constructs writer arguments. No caller supplies RPC names,
// ownership, block replacements or arbitrary changes. The writer is unchanged.
const preparedActions = new WeakSet();
const aliases = Object.freeze({
  move_planned_session: "move_session", adapt_session_duration: "adapt_duration",
  adapt_session_environment: "adapt_environment", cancel_planned_session: "cancel_session",
});
const legacyNames = Object.freeze({
  move_session: "move_planned_session", adapt_duration: "adapt_session_duration",
  adapt_environment: "adapt_session_environment", cancel_session: "cancel_planned_session",
  adapt_remaining_week: "adapt_remaining_week", save_recommendation_today: "save_recommendation_today",
  set_training_unavailability: "set_training_unavailability",
});
const allowedArguments = Object.freeze({
  move_session: ["source_date", "target_weekday", "target_date"], adapt_duration: ["source_date", "duration_minutes"],
  adapt_environment: ["source_date", "environment"], cancel_session: ["source_date"],
  adapt_remaining_week: [], save_recommendation_today: ["date", "location"],
  set_training_unavailability: ["date_reference"],
});
const planColumns = "id,user_id,planned_date,planned_time,title,status,source,linked_completed_session_id,location_type,session_type,planned_intensity,planned_duration_min,planned_duration_max,objective,coach_notes,constraints,created_at,updated_at";
const blockColumns = "id,planned_session_id,block_order,block_type,title,objective,planned_duration_seconds,planned_rounds,planned_exercises,constraints,notes,created_at";
const reject = (error) => ({ ok: false, error });
const own = (rows, userId) => rows.filter((row) => row.user_id === userId);
const active = (rows) => rows.filter((row) => row.status !== "cancelled");

async function rows(query, maximum = 100) {
  const result = await query.limit(maximum + 1);
  if (result.error) throw new Error("canonical_read_failed");
  const data = Array.isArray(result.data) ? result.data : [];
  if (data.length > maximum) throw new Error("canonical_state_limit");
  return data;
}

export async function loadActionPlans(db, userId, from, to = from) {
  return own(await rows(db.from("planned_training_sessions").select(planColumns)
    .eq("user_id", userId).gte("planned_date", from).lte("planned_date", to)
    .order("planned_date", { ascending: true }).order("id", { ascending: true }), 100), userId);
}

async function loadBlocks(db, ids) {
  if (!ids.length) return [];
  const data = await rows(db.from("planned_session_blocks").select(blockColumns)
    .in("planned_session_id", ids).order("block_order", { ascending: true }).order("id", { ascending: true }), 1200);
  const scoped = data.filter((row) => ids.includes(row.planned_session_id));
  if (ids.some((id) => scoped.filter((row) => row.planned_session_id === id).length > 120)) throw new Error("canonical_state_limit");
  return scoped;
}

async function loadAvailability(db, userId, from, to = from) {
  return own(await rows(db.from("training_availability_overrides")
    .select("user_id,calendar_date,availability_status,source")
    .eq("user_id", userId).gte("calendar_date", from).lte("calendar_date", to)
    .order("calendar_date", { ascending: true }), 100), userId);
}

function boundedPlanJson(value) {
  // This is canonical planned prescription detail, never provider/FIT JSON.
  // Encoding as text preserves the exact before/after for heterogeneous legacy
  // prescription arrays without offering an arbitrary mutation contract.
  const text = JSON.stringify(value ?? []);
  if (text.length > 4000) throw new Error("canonical_state_limit");
  return text;
}

function snapshot(session, blocks = []) {
  return {
    id: session.id || null, date: session.planned_date, title: String(session.title || "").slice(0, 160),
    status: session.status, session_type: session.session_type, environment: session.location_type || null,
    duration_minutes: session.planned_duration_max ?? session.planned_duration_min ?? null,
    duration_min: session.planned_duration_min ?? null, duration_max: session.planned_duration_max ?? null,
    intensity: session.planned_intensity || null, objective: String(session.objective || "").slice(0, 700) || null,
    completed: Boolean(session.linked_completed_session_id),
    blocks: blocks.filter((block) => block.planned_session_id === session.id).map((block) => ({
      id: block.id, block_order: block.block_order, title: String(block.title || "").slice(0, 160),
      duration_seconds: block.planned_duration_seconds ?? null,
      duration_minutes: block.planned_duration_seconds == null ? null : block.planned_duration_seconds / 60,
      block_type: block.block_type || null, objective: block.objective || null,
      planned_rounds: block.planned_rounds ?? null, exercises_text: boundedPlanJson(block.planned_exercises),
      constraints_text: boundedPlanJson(block.constraints), notes: block.notes || null,
    })),
  };
}

function recommendationSnapshot(recommendation, date, source = null) {
  return {
    id: source?.id || null, date, title: recommendation.title.slice(0, 160),
    status: source ? "modified" : "planned", session_type: recommendation.session_type,
    environment: recommendation.environment, duration_minutes: recommendation.duration_minutes,
    duration_min: recommendation.duration_minutes, duration_max: recommendation.duration_minutes,
    intensity: recommendation.intensity || null, objective: recommendation.objective || null, completed: false,
    blocks: recommendation.blocks.map((block, index) => ({
      id: null, block_order: index + 1, title: block.title.slice(0, 160),
      duration_seconds: block.duration_minutes == null ? null : block.duration_minutes * 60,
      duration_minutes: block.duration_minutes ?? null,
      block_type: null, objective: null, planned_rounds: null, exercises_text: "[]", constraints_text: "[]", notes: null,
    })),
  };
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function prepare({ userId, calendar, action, args, before = [], after = [], state, mutation = null, legacy = {}, reasons = [], consequences = [] }) {
  const result = freeze({
    ok: true, action, args: { ...args }, before, after,
    state: { userId, calendar: { date: calendar.date, timezone: calendar.timezone }, ...state }, mutation, legacy,
    affected_entities: before.map((session) => ({ type: "planned_session", id: session.id, date: session.date })),
    reasons, consequences, warnings: [],
  });
  preparedActions.add(result);
  return result;
}

/** Bind already-derived canonical evidence (for example Closed Loop) without
 * accepting any replacement mutation from a transport or language model. */
export function bindEnqiduActionEvidence(prepared, evidence) {
  if (!preparedActions.has(prepared)) throw new TypeError("A server-prepared action is required");
  const proposalReasons = Array.isArray(evidence?.proposal?.reasons)
    ? evidence.proposal.reasons.filter((reason) => typeof reason === "string").slice(0, 50) : [];
  const next = freeze({ ...prepared, ...(proposalReasons.length ? { reasons: proposalReasons } : {}),
    state: { ...prepared.state, bound_evidence: structuredClone(evidence) } });
  preparedActions.add(next);
  return next;
}

function sourceError(sessions, action) {
  if (!sessions.length) return "source_plan_not_found";
  if (sessions.length > 1) return "source_plan_ambiguous";
  const source = sessions[0];
  if (source.linked_completed_session_id) return "source_plan_already_completed";
  if (["cancelled", "skipped", "completed"].includes(source.status)) return "source_plan_not_adaptable";
  if (["adapt_duration", "adapt_environment"].includes(action) && source.source !== "enkidu_coach") return "unsupported_plan_source";
  return null;
}

async function recommendationContext(db, userId, calendar, date, availability, now) {
  const [contextResult, constraints, health] = await Promise.all([
    db.rpc("get_ai_coach_context", {
      p_user_id: userId, p_date: date, p_mode: "today_coach", p_from_date: null, p_to_date: null, p_session_id: null,
    }),
    rows(db.from("coach_athlete_constraints").select("user_id,constraint_type,severity,description,active,updated_at")
      .eq("user_id", userId).eq("active", true).order("id", { ascending: true }), 100),
    loadHealthIntelligence(db, { userId, calendarDate: date, timezone: calendar.timezone, generatedAt: new Date(now).toISOString() }),
  ]);
  if (contextResult.error) throw new Error("canonical_read_failed");
  const context = contextResult.data || {};
  // The source plan is being explicitly replaced. All other recommendation
  // inputs remain authoritative and are included in the consistency snapshot.
  context.request = { ...(context.request || {}), date, reference_date: calendar.date };
  context.planned_training = { date, sessions: [] };
  context.training_availability = availability[0] ? {
    date: availability[0].calendar_date, status: availability[0].availability_status, source: availability[0].source,
  } : null;
  context.recommendation_context = { constraints: own(constraints, userId) };
  context.health_recovery = health;
  context.readiness = health.readiness;
  return context;
}

/** Pure preparation after canonical reads: this function never writes. */
export async function prepareEnqiduAction({ db, userId, calendar, action: requestedAction, args = {}, now = new Date() } = {}) {
  const action = aliases[requestedAction] || requestedAction;
  if (!userId || typeof userId !== "string") return reject("auth_required");
  if (!calendar || !isValidPlanCalendarDate(calendar.date) || !isValidTimeZone(calendar.timezone)) return reject("invalid_calendar");
  if (!Object.hasOwn(allowedArguments, action)) return reject("unsupported_action");
  if (!args || typeof args !== "object" || Array.isArray(args)
    || Object.keys(args).some((key) => !allowedArguments[action].includes(key))) return reject("invalid_arguments");

  if (action === "set_training_unavailability") {
    if (!["today", "tomorrow"].includes(args.date_reference)) return reject("invalid_date_reference");
    const date = args.date_reference === "today" ? calendar.date : shiftPlanCalendarDate(calendar.date, 1);
    const [plans, availability] = await Promise.all([loadActionPlans(db, userId, date), loadAvailability(db, userId, date)]);
    return prepare({ userId, calendar, action, args, state: { plans, availability },
      mutation: { kind: action, date },
      legacy: { date_reference: args.date_reference, date, marked_unavailable: true,
        planned_conflict: active(plans).length > 0, planned_titles: active(plans).map((row) => row.title) },
      reasons: ["explicit_training_unavailability"], consequences: ["existing_plans_preserved"],
    });
  }

  if (action === "adapt_remaining_week") {
    const end = resolveRemainingWeekEndDate(calendar.date);
    const [plans, availability] = await Promise.all([
      loadActionPlans(db, userId, calendar.date, end), loadAvailability(db, userId, calendar.date, end),
    ]);
    const reschedule = planRemainingWeekReschedule({ sessions: plans,
      unavailableDates: availability.filter((row) => row.availability_status === "unavailable").map((row) => row.calendar_date),
      fromDate: calendar.date, toDate: end,
    });
    if (!reschedule.ok) return reject(reschedule.error);
    // Include all plans and blocks in the fingerprint; a non-moving session
    // can constrain capacity or become the next adaptation target.
    const blocks = await loadBlocks(db, plans.map((row) => row.id));
    const moving = plans.filter((row) => reschedule.moves.some((move) => move.planned_session_id === row.id));
    const before = moving.map((row) => snapshot(row, blocks));
    const after = before.map((row) => ({ ...row, status: "rescheduled",
      date: reschedule.moves.find((move) => move.planned_session_id === row.id).target_date }));
    return prepare({ userId, calendar, action, args, before, after, state: { plans, blocks, availability },
      mutation: reschedule.moves.length ? { kind: action, from: calendar.date, to: end, moves: reschedule.moves } : null,
      legacy: { from_date: calendar.date, to_date: end, adapted: reschedule.moves.length > 0, moves: reschedule.moves,
        moved_count: reschedule.moves.length, ...(!reschedule.moves.length ? { message: "No hay sesiones pendientes de recolocar por disponibilidad esta semana." } : {}) },
      reasons: ["explicit_remaining_week_adaptation"], consequences: ["same_week_only", "executed_training_unchanged"],
    });
  }

  if (action === "save_recommendation_today") {
    const date = args.date || calendar.date;
    if (!isValidPlanCalendarDate(date)) return reject("invalid_date");
    if (date !== calendar.date) return reject("stale_recommendation_date");
    const location = args.location == null ? null : normalizeCoachPlanLocation(args.location);
    if (args.location != null && !location) return reject("invalid_location");
    const [plans, availability] = await Promise.all([loadActionPlans(db, userId, date), loadAvailability(db, userId, date)]);
    if (active(plans).length) return reject("plan_already_exists");
    const context = await recommendationContext(db, userId, calendar, date, availability, now);
    const recommendation = buildTrainingRecommendation(context, { requestedLocation: location ? { key: location } : null });
    if (!recommendation || recommendation.insufficient) return reject("recommendation_unavailable");
    const storage = toPlannedRecommendationPayload(recommendation);
    if (!storage) return reject("unsupported_recommendation_type");
    return prepare({ userId, calendar, action, args, before: [], after: [recommendationSnapshot(storage, date)],
      state: { plans, availability, recommendation_context: context }, mutation: { kind: action, date, session: storage },
      legacy: { saved: true }, reasons: ["explicit_recommendation_acceptance"], consequences: ["creates_persisted_plan"],
    });
  }

  const sourceDate = args.source_date;
  if (!isValidPlanCalendarDate(sourceDate)) return reject("invalid_date");
  if (!isPlanDateOnOrAfter(sourceDate, calendar.date)) return reject("stale_plan_source_date");
  if (action === "adapt_duration" && (!Number.isInteger(args.duration_minutes) || args.duration_minutes < 10 || args.duration_minutes > 180)) return reject("invalid_duration");
  const environment = action === "adapt_environment" ? normalizeCoachPlanLocation(args.environment) : null;
  if (action === "adapt_environment" && !environment) return reject("invalid_location");
  if (action === "move_session" && args.target_date != null && args.target_weekday != null) return reject("invalid_arguments");
  if (action === "move_session" && args.target_date != null
    && (!isValidPlanCalendarDate(args.target_date) || args.target_date <= sourceDate)) return reject("invalid_target_date");
  const targetDate = action === "move_session" ? (args.target_date || resolveNextWeekdayDate(sourceDate, args.target_weekday)) : sourceDate;
  if (!targetDate) return reject("invalid_target_weekday");
  const [plans, availability] = await Promise.all([
    loadActionPlans(db, userId, sourceDate, targetDate), loadAvailability(db, userId, sourceDate, targetDate),
  ]);
  const sources = active(plans).filter((row) => row.planned_date === sourceDate);
  const error = sourceError(sources, action);
  if (error) return reject(error);
  const source = sources[0];
  const blocks = await loadBlocks(db, [source.id]);
  const before = [snapshot(source, blocks)];
  const state = { plans, blocks, availability };
  const base = { userId, calendar, action, args, before, state,
    reasons: [`explicit_${action}`], consequences: ["executed_training_unchanged"],
    legacy: { source_date: sourceDate, planned_session_id: source.id, title: source.title },
  };

  if (action === "move_session") {
    if (active(plans).some((row) => row.planned_date === targetDate)) return reject("target_plan_already_exists");
    if (availability.some((row) => row.calendar_date === targetDate && row.availability_status === "unavailable")) return reject("target_date_unavailable");
    return prepare({ ...base, after: [{ ...before[0], date: targetDate, status: "rescheduled" }],
      mutation: { kind: action, sourceDate, targetDate }, legacy: { ...base.legacy, moved: true, target_date: targetDate },
    });
  }
  if (action === "cancel_session") {
    return prepare({ ...base, after: [{ ...before[0], status: "cancelled" }],
      mutation: { kind: action, sourceDate, sessionId: source.id }, legacy: { ...base.legacy, cancelled: true },
      consequences: ["plan_history_preserved", "executed_training_unchanged"],
    });
  }
  if (action === "adapt_duration") {
    if (availability.some((row) => row.calendar_date === sourceDate && row.availability_status === "unavailable")) return reject("athlete_unavailable");
    const scaled = scalePlannedBlockDurations(blocks, args.duration_minutes);
    if (!scaled) return reject("duration_adaptation_unavailable");
    const changed = before[0].duration_min !== args.duration_minutes || before[0].duration_max !== args.duration_minutes
      || blocks.reduce((sum, block) => sum + block.planned_duration_seconds, 0) !== args.duration_minutes * 60;
    return prepare({ ...base, after: [changed ? { ...before[0], status: "modified",
      duration_minutes: args.duration_minutes, duration_min: args.duration_minutes, duration_max: args.duration_minutes,
      blocks: before[0].blocks.map((block) => ({ ...block, ...scaled.find((item) => item.id === block.id) })),
    } : before[0]], mutation: changed ? { kind: action, sourceDate, sessionId: source.id, duration: args.duration_minutes,
      blocks: scaled.map((block) => ({ id: block.id, duration_seconds: block.duration_seconds })) } : null,
    legacy: { ...base.legacy, adapted: changed }, consequences: ["block_structure_preserved", "executed_training_unchanged"],
    });
  }
  const context = await recommendationContext(db, userId, calendar, sourceDate, availability, now);
  const recommendation = buildTrainingRecommendation(context, { requestedLocation: { key: environment } });
  if (!recommendation || recommendation.insufficient) return reject(recommendation?.reason === "athlete_unavailable" ? "athlete_unavailable" : "recommendation_unavailable");
  const storage = toPlannedRecommendationPayload({ ...recommendation, environment: recommendation.environment || environment });
  if (!storage || storage.environment !== environment) return reject("unsupported_recommendation_type");
  return prepare({ ...base, after: [recommendationSnapshot(storage, sourceDate, source)],
    state: { ...state, recommendation_context: context }, mutation: { kind: action, sourceDate, sessionId: source.id, session: storage },
    legacy: { ...base.legacy, adapted: true }, consequences: ["planned_blocks_replaced", "executed_training_unchanged"],
  });
}

/** Execute only a server-prepared action via the existing transactional writer. */
export async function executePreparedEnqiduAction({ adminDb, userId, prepared } = {}) {
  if (!preparedActions.has(prepared) || prepared.state.userId !== userId) return reject("invalid_prepared_action");
  const command = prepared.mutation;
  let response = { ok: true };
  if (command) {
    let result;
    switch (command.kind) {
      case "move_session":
        result = await adminDb.rpc("move_coach_planned_session", { p_user_id: userId, p_source_date: command.sourceDate, p_target_date: command.targetDate }); break;
      case "adapt_duration":
        result = await adminDb.rpc("adapt_coach_planned_session_duration", { p_user_id: userId, p_planned_date: command.sourceDate, p_planned_session_id: command.sessionId, p_duration_minutes: command.duration, p_blocks: command.blocks }); break;
      case "adapt_environment":
        result = await adminDb.rpc("adapt_coach_planned_session_environment", { p_user_id: userId, p_planned_date: command.sourceDate, p_planned_session_id: command.sessionId, p_session: command.session }); break;
      case "cancel_session":
        result = await adminDb.rpc("cancel_coach_planned_session", { p_user_id: userId, p_planned_date: command.sourceDate, p_planned_session_id: command.sessionId }); break;
      case "adapt_remaining_week":
        result = await adminDb.rpc("adapt_coach_remaining_week", { p_user_id: userId, p_from_date: command.from, p_to_date: command.to, p_moves: command.moves.map(({ planned_session_id, source_date, target_date }) => ({ planned_session_id, source_date, target_date })) }); break;
      case "save_recommendation_today":
        result = await adminDb.rpc("save_coach_recommendation_plan", { p_user_id: userId, p_planned_date: command.date, p_session: command.session }); break;
      case "set_training_unavailability":
        result = await adminDb.rpc("set_coach_training_unavailability", { p_user_id: userId, p_date: command.date }); break;
      default: return reject("unsupported_action");
    }
    if (result.error) return reject("plan_write_failed");
    response = result.data || {};
    if (response.ok !== true) return reject(safeActionError(response.error));
  }
  const after = prepared.after[0];
  const result = { ok: true, action: legacyNames[prepared.action], ...prepared.legacy,
    ...(response.planned_session_id ? { planned_session_id: response.planned_session_id } : {}),
    response_mode: "deterministic_action", llm_used: false, usage: null,
    request_date: prepared.state.calendar.date, calendar_timezone: prepared.state.calendar.timezone,
  };
  if (["adapt_duration", "adapt_environment", "save_recommendation_today"].includes(prepared.action) && after) {
    result.planned_session = { date: after.date, title: after.title, session_type: after.session_type,
      duration_minutes: after.duration_minutes, intensity: after.intensity, environment: after.environment,
      blocks: after.blocks.map(({ title, duration_minutes }) => ({ title, duration_minutes })), blocks_count: after.blocks.length,
    };
  }
  return result;
}

const safeCodes = new Set([
  "invalid_request", "invalid_duration", "invalid_blocks", "invalid_location", "invalid_recommendation", "too_many_blocks",
  "source_plan_not_found", "source_plan_ambiguous", "source_plan_not_movable", "source_plan_not_adaptable", "source_plan_not_cancellable",
  "source_plan_already_completed", "unsupported_plan_source", "target_plan_already_exists", "block_set_mismatch", "invalid_block",
  "invalid_block_duration", "duration_sum_mismatch", "invalid_week_range", "too_many_moves", "duplicate_planned_session",
  "duplicate_target_date", "invalid_move_date", "invalid_target_date", "plan_already_exists",
]);
function safeActionError(value) { return safeCodes.has(value) ? value : "plan_write_rejected"; }
