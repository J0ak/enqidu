import { calendarDateInTimeZone, isValidCalendarDate, isValidTimeZone } from "../time/userCalendar.js";
import { READINESS_ALGORITHM_VERSION } from "../health/readinessV1.js";
import { healthTimestamp, safeHealthProvenance, safeHealthSource } from "../health/healthEvidence.js";

export const CLOSED_LOOP_SCHEMA_VERSION = "closed_loop_assessment_v1";
export const CLOSED_LOOP_ALGORITHM_VERSION = "enqidu.closed-loop.v1.0.0";
export const ADAPTATION_PROPOSAL_SCHEMA_VERSION = "adaptation_proposal_v1";
const list = (value) => Array.isArray(value) ? value : [];
const text = (value, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : null;
const number = (value) => (typeof value !== "number" && !(typeof value === "string" && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value))) || !Number.isFinite(Number(value)) ? null : Number(value);
const nonnegative = (value) => { const parsed = number(value); return parsed != null && parsed >= 0 ? parsed : null; };
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const round = (value) => Math.round(value * 100) / 100;
const date = (value) => isValidCalendarDate(value) ? value : null;
const owned = (row, userId) => !row || !userId || row.user_id === userId;
const CONFIRMED_SOURCES = new Set(["user_confirmed", "manual_entry", "user_feedback", "chatgpt_manual_pilot", "chatgpt_session_correction"]);
const CONFIRMED_CONFIDENCE = new Set(["manual", "reported", "user_confirmed"]);

function plannedBlocks(session) { return list(session?.planned_session_blocks ?? session?.blocks); }
function executedBlocks(session) { return list(session?.session_blocks ?? session?.blocks); }
function blockName(block) { return text(block?.title ?? block?.name); }
function exercises(block, planned) { return list(planned ? block?.planned_exercises : block?.exercises ?? block?.session_exercises); }
function exerciseName(exercise) { return text(exercise?.reported_name ?? exercise?.display_name ?? exercise?.name); }

/** Shared status/time eligibility for pure calculations and canonical read adapters. */
export function isClosedLoopExecutionUsable(execution, { calendarDate = null, timezone = null, generatedAt = null } = {}) {
  if (!execution || execution.session_status === "archived") return false;
  const started = execution.started_at == null ? null : healthTimestamp(execution.started_at);
  const ended = execution.ended_at == null ? null : healthTimestamp(execution.ended_at);
  if ((execution.started_at != null && !started) || (execution.ended_at != null && !ended) || (started && ended && ended < started)) return false;
  const executionDate = date(execution.local_date) ?? (started && isValidTimeZone(timezone) ? calendarDateInTimeZone(started, timezone) : null);
  if (date(calendarDate) && executionDate && executionDate > calendarDate) return false;
  const asOf = generatedAt == null ? null : healthTimestamp(generatedAt);
  if (generatedAt != null && !asOf) return false;
  return !asOf || ((!started || started <= asOf) && (!ended || ended <= asOf));
}

/** Only persisted metrics from a known explicit user path are confirmed feedback. */
export function feedbackFromSessionMetrics(metrics = [], { sessionId, userId = null } = {}) {
  const eligible = list(metrics).filter((metric) => metric?.session_id === sessionId && owned(metric, userId)
    && (metric.metric_scope ?? "session") === "session" && CONFIRMED_SOURCES.has(metric.source_path)
    && CONFIRMED_CONFIDENCE.has(metric.confidence));
  const values = (codes) => eligible.filter((metric) => codes.includes(metric.metric_code));
  const rpes = values(["rpe", "rpe_global", "session_rpe"]).filter((metric) => number(metric.value_numeric) != null && number(metric.value_numeric) >= 0 && number(metric.value_numeric) <= 10);
  const discomfort = values(["discomfort", "discomfort_reported", "pain", "pain_reported"])
    .filter((metric) => [0, 1].includes(number(metric.value_numeric)) || ["yes", "no", "si", "true", "false"].includes(normalize(metric.value_text)));
  const result = { confirmed: true, source: "user_confirmed", user_id: userId, session_id: sessionId, evidence: [] };
  // Conflicting values remain unknown: database row order cannot decide the answer.
  if (rpes.length && new Set(rpes.map((metric) => number(metric.value_numeric))).size === 1) result.rpe = number(rpes[0].value_numeric);
  const discomfortValues = discomfort.map((metric) => number(metric.value_numeric) != null ? number(metric.value_numeric) === 1 : ["yes", "si", "true"].includes(normalize(metric.value_text)));
  if (discomfortValues.length && new Set(discomfortValues).size === 1) result.discomfort = discomfortValues[0];
  const completions = values(["session_completion"]).filter((metric) => ["completed", "partial", "not_executed"].includes(metric.value_text));
  if (completions.length && new Set(completions.map((metric) => metric.value_text)).size === 1) result.completion = completions[0].value_text;
  for (const metric of [...rpes, ...discomfort, ...completions]) result.evidence.push({ source: "session_metrics", record_id: text(metric.id), metric: text(metric.metric_code), confirmation_source: text(metric.source_path) });
  return result.evidence.length ? result : null;
}

function safeFeedback(feedback, sessionId, userId) {
  if (!feedback || feedback.confirmed !== true || !CONFIRMED_SOURCES.has(feedback.source) || !owned(feedback, userId)
    || !sessionId || feedback.session_id !== sessionId) return null;
  const result = { confirmed: true, source: feedback.source, session_id: sessionId, evidence: list(feedback.evidence).map((item) => ({ source: text(item?.source), record_id: text(item?.record_id), metric: text(item?.metric), confirmation_source: text(item?.confirmation_source) })) };
  const rpe = number(feedback.rpe);
  if (rpe != null && rpe >= 0 && rpe <= 10) result.rpe = rpe;
  if (typeof feedback.discomfort === "boolean") result.discomfort = feedback.discomfort;
  if (["completed", "partial", "not_executed"].includes(feedback.completion)) result.completion = feedback.completion;
  if (feedback.structure_complete === true) result.structure_complete = true;
  if (Array.isArray(feedback.omitted_blocks)) result.omitted_blocks = feedback.omitted_blocks.map((item) => text(item)).filter(Boolean).slice(0, 40);
  return result;
}

function safeBaseline(baseline) {
  if (!baseline || number(baseline.value) == null) return null;
  return { value: number(baseline.value), observations: nonnegative(baseline.observations), method: text(baseline.method), window_days: nonnegative(baseline.window_days), start_date: date(baseline.start_date), end_date: date(baseline.end_date), evidence_dates: list(baseline.evidence_dates).map(date).filter(Boolean), evidence: list(baseline.evidence).filter((item) => date(item?.calendar_date) && number(item?.value) != null).map((item) => ({ calendar_date: item.calendar_date, value: number(item.value), ...(item.provenance ? { provenance: safeHealthProvenance(item.provenance) } : {}), ...(item.source ? { source: safeHealthSource(item.source) } : {}) })) };
}

function safeHealth(health, referenceDate) {
  if (!health || health.schema_version !== "health_recovery_v1" || !date(referenceDate) || health.calendar_date !== referenceDate || health.freshness !== "current") return null;
  const result = { schema_version: text(health.schema_version), calendar_date: referenceDate, timezone: text(health.timezone), freshness: "current", temporal_scope: "calendar_day", provenance: list(health.provenance).map((item) => safeHealthProvenance(item)).filter(Boolean) };
  for (const [family, fields] of Object.entries({ sleep: ["duration_seconds", "sleep_score", "deep_seconds", "light_seconds", "rem_seconds", "awake_seconds", "sleep_start_utc", "sleep_end_utc"], hrv: ["last_night_avg_ms", "last_night_5min_high_ms", "readings_count"], body_battery: ["current", "charged", "drained"], heart_rate: ["resting", "min", "max"], stress: ["average", "max", "qualifier"], spo2: ["average", "min"], respiration: ["average", "min"] })) {
    const source = health[family];
    if (!source || source.freshness !== "current" || (source.calendar_date ?? source.observed_date) !== referenceDate) continue;
    result[family] = { calendar_date: referenceDate, source: safeHealthSource(source.source), provenance: safeHealthProvenance(source.provenance), temporal_scope: source.temporal_scope === "instant" ? "instant" : "calendar_day", field_sources: {} };
    for (const field of fields) if (source[field] != null) {
      const value = field.endsWith("_utc") ? healthTimestamp(source[field]) : field === "qualifier" ? (/^[\p{L}\p{N}_ .-]{1,100}$/u.test(source[field]) ? source[field] : null) : nonnegative(source[field]);
      if (value != null) {
        result[family][field] = value;
        const lineage = source.field_sources?.[field];
        if (lineage) result[family].field_sources[field] = { ...safeHealthSource(lineage), ...(date(lineage.calendar_date) ? { calendar_date: lineage.calendar_date } : {}), ...(safeHealthProvenance(lineage.provenance) ? { provenance: safeHealthProvenance(lineage.provenance) } : {}), ...(healthTimestamp(lineage.observed_at) ? { observed_at: healthTimestamp(lineage.observed_at) } : {}), ...(healthTimestamp(lineage.as_of) ? { as_of: healthTimestamp(lineage.as_of) } : {}), ...(text(lineage.linked_summary_id) ? { linked_summary_id: text(lineage.linked_summary_id) } : {}) };
      }
    }
    if (family === "body_battery" && healthTimestamp(source.current_observed_at)) result[family].current_observed_at = healthTimestamp(source.current_observed_at);
    if (family === "hrv" && typeof source.readings_count_method === "string" && /^[a-z_]{1,80}$/.test(source.readings_count_method)) result[family].readings_count_method = source.readings_count_method;
  }
  if (health.readiness?.schema_version === "readiness_v1" && health.readiness.algorithm_version === READINESS_ALGORITHM_VERSION) {
    const readiness = health.readiness;
    const factors = list(readiness.factors).filter((factor) => factor?.evidence_date === referenceDate && number(factor.observed_value) != null).map((factor) => ({ metric: text(factor.metric), observed_value: number(factor.observed_value), baseline: safeBaseline(factor.baseline), contribution: number(factor.contribution), evidence_date: referenceDate, reason: text(factor.reason, 500), ...(factor.provenance ? { provenance: safeHealthProvenance(factor.provenance) } : {}), ...(factor.source ? { source: safeHealthSource(factor.source) } : {}) }));
    const available = ["available", "partial"].includes(readiness.status) && factors.length >= 2 && number(readiness.score) != null && number(readiness.score) >= 0 && number(readiness.score) <= 100;
    result.readiness = { schema_version: "readiness_v1", algorithm_version: READINESS_ALGORITHM_VERSION, status: available ? readiness.status : "unavailable", score: available ? number(readiness.score) : null, confidence: available ? text(readiness.confidence) : "none", factors };
  }
  return result;
}

function durationRange(session) {
  const minimum = nonnegative(session?.planned_duration_min);
  const maximum = nonnegative(session?.planned_duration_max);
  if (minimum == null && maximum == null) return null;
  if (minimum != null && maximum != null && minimum > maximum) return null;
  return { min_seconds: minimum == null ? null : minimum * 60, max_seconds: maximum == null ? null : maximum * 60 };
}

function durationComparison(planned, executed) {
  const range = durationRange(planned);
  const actual = nonnegative(executed?.duration_seconds);
  if (!range || actual == null) return null;
  const below = range.min_seconds != null && actual < range.min_seconds;
  const above = range.max_seconds != null && actual > range.max_seconds;
  const comparison = below ? "shorter" : above ? "longer" : "within_range";
  const boundary = below ? range.min_seconds : above ? range.max_seconds : null;
  const exact = range.min_seconds != null && range.min_seconds === range.max_seconds ? range.min_seconds : null;
  return { planned_min_seconds: range.min_seconds, planned_max_seconds: range.max_seconds, executed_seconds: actual, comparison, seconds: boundary != null ? actual - boundary : 0, exact_target_delta_seconds: exact == null ? null : actual - exact, ratio: exact > 0 ? round(actual / exact) : null };
}

function matchByName(planned, executed, nameOf) {
  const used = new Set();
  return planned.map((item) => {
    const name = normalize(nameOf(item));
    const matchingPlans = planned.filter((candidate) => normalize(nameOf(candidate)) === name);
    const candidates = executed.filter((candidate) => !used.has(candidate) && normalize(nameOf(candidate)) === name);
    const matched = name && matchingPlans.length === 1 && candidates.length === 1 ? candidates[0] : null;
    if (matched) used.add(matched);
    return { planned: item, executed: matched };
  });
}

function totalVolume(exercise, planned = false) {
  if (planned && exercise?.target_sets != null) {
    // These are the documented PlannedExercise JSON keys persisted by the existing writer.
    const count = nonnegative(exercise.target_sets);
    const reps = /^\d+$/.test(String(exercise.target_reps ?? "")) ? nonnegative(exercise.target_reps) : null;
    const loadMatch = typeof exercise.load === "string" ? exercise.load.match(/^(\d+(?:\.\d+)?)\s*kg$/i) : null;
    const load = loadMatch ? nonnegative(loadMatch[1]) : null;
    if (!Number.isInteger(count) || reps == null || load == null) return null;
    const volume = round(count * reps * load);
    if (!Number.isFinite(volume)) return null;
    return { value: volume, unit: "kg_repetitions", source: "planned_exercises", evidence: [{ record_id: text(exercise.id), target_sets: count, target_reps: reps, load_kg: load }] };
  }
  if (planned) return null;
  const sets = list(exercise?.performed_sets);
  if (!planned && sets.length) {
    const identities = sets.map((set) => text(set.id) ?? (Number.isInteger(set.set_index) ? `index:${set.set_index}` : null));
    if (identities.some((identity) => identity == null) || new Set(identities).size !== identities.length) return null;
    if (sets.some((set) => set.completed !== true || nonnegative(set.reps) == null || nonnegative(set.load_kg) == null || set.reps_left != null || set.reps_right != null)) return null;
    const volume = round(sets.reduce((sum, set) => sum + Number(set.reps) * Number(set.load_kg), 0));
    if (!Number.isFinite(volume)) return null;
    return { value: volume, unit: "kg_repetitions", source: "performed_sets", evidence: sets.map((set) => ({ record_id: text(set.id), reps: Number(set.reps), load_kg: Number(set.load_kg), completed: true })) };
  }
  // No body-weight proxy, invented load, or guessed expansion of a scalar reps value.
  const reps = list(exercise?.reps_per_set);
  const load = nonnegative(exercise?.load_value);
  const count = nonnegative(exercise?.sets_completed);
  if (!reps.length || load == null || normalize(exercise?.load_unit) !== "kg" || count == null || count !== reps.length || reps.some((value) => nonnegative(value) == null) || ![null, "na", "bilateral"].includes(exercise.side ?? null)) return null;
  const volume = round(reps.reduce((sum, value) => sum + Number(value) * load, 0));
  if (!Number.isFinite(volume)) return null;
  return { value: volume, unit: "kg_repetitions", source: "session_exercises", evidence: [{ record_id: text(exercise.id), reps_per_set: reps.map(Number), sets: count, load_kg: load }] };
}

function compareStructure(planned, executed, feedback) {
  const plans = plannedBlocks(planned);
  const actuals = executedBlocks(executed);
  const mappings = matchByName(plans, actuals, blockName);
  const omitted = new Set(list(feedback?.omitted_blocks).map(normalize));
  const blocks = mappings.map(({ planned: block, executed: actual }) => {
    const name = blockName(block);
    const status = actual ? "matched" : omitted.has(normalize(name)) || (feedback?.structure_complete === true && actuals.length) ? "omitted_confirmed" : "unverified";
    const exerciseMatches = matchByName(exercises(block, true), exercises(actual, false), exerciseName).map(({ planned: exercise, executed: performed }) => {
      const target = totalVolume(exercise, true);
      const observed = totalVolume(performed, false);
      const volume = target && observed && target.unit === observed.unit ? { planned: target.value, executed: observed.value, delta: round(observed.value - target.value), unit: target.unit, sources: [target.source, observed.source], evidence: { planned: target.evidence, executed: observed.evidence }, comparison: observed.value < target.value ? "lower" : observed.value > target.value ? "higher" : "equal" } : null;
      return { planned_name: exerciseName(exercise), executed_name: exerciseName(performed), executed_id: text(performed?.id), status: performed ? "matched" : "unverified", volume_delta: volume };
    });
    return { planned_id: text(block.id), planned_name: name, executed_id: text(actual?.id), executed_name: blockName(actual), status, exercises: exerciseMatches };
  });
  const allExercises = blocks.flatMap((block) => block.exercises);
  const volumeDeltas = allExercises.map((exercise) => exercise.volume_delta).filter(Boolean);
  // A subset must not masquerade as whole-session volume.
  const completeVolume = allExercises.length > 0 && volumeDeltas.length === allExercises.length;
  const volume = completeVolume ? { planned: round(volumeDeltas.reduce((sum, value) => sum + value.planned, 0)), executed: round(volumeDeltas.reduce((sum, value) => sum + value.executed, 0)), delta: round(volumeDeltas.reduce((sum, value) => sum + value.delta, 0)), unit: "kg_repetitions", scope: "matched_planned_exercises" } : null;
  return { blocks, volume_delta: volume, omitted_blocks: blocks.filter((block) => block.status === "omitted_confirmed").map((block) => block.planned_name), complete_match: plans.length > 0 && blocks.every((block) => block.status === "matched" && block.exercises.every((exercise) => exercise.status === "matched")) };
}

function plannedRpe(session) {
  const match = String(session?.planned_intensity || "").match(/^\s*RPE\s*(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?\s*$/i);
  if (!match) return null;
  const lower = Number(match[1]); const upper = Number(match[2] ?? match[1]);
  return lower >= 0 && upper <= 10 && lower <= upper ? { min: lower, max: upper } : null;
}

/** Pure read-only domain. Association requires the existing exact persisted execution link. */
export function assessClosedLoop({ userId = null, plannedSession = null, executedSession = null, userFeedback = null, healthBefore = null, healthAfter = null, beforeDate = null, afterDate = null, futureSessions = [], calendarDate = null, timezone = null, generatedAt = null, missingEvidence = [] } = {}) {
  userId = userId ?? plannedSession?.user_id ?? executedSession?.user_id ?? null;
  if (!owned(plannedSession, userId) || !owned(executedSession, userId) || (plannedSession?.user_id && executedSession?.user_id && plannedSession.user_id !== executedSession.user_id)) throw new Error("closed_loop_user_scope_mismatch");
  if (executedSession && !isClosedLoopExecutionUsable(executedSession, { calendarDate, timezone, generatedAt })) {
    executedSession = null;
    missingEvidence = [...list(missingEvidence), "execution_temporal_or_status_conflict"];
  }
  const facts = []; const missing = [...list(missingEvidence).map((item) => text(item)).filter(Boolean)]; const evidence = [];
  const fact = (code, reason, details = {}) => facts.push({ code, reason, ...details });
  if (!plannedSession) missing.push("planned_session");
  if (!executedSession) missing.push("execution");
  const linked = Boolean(plannedSession?.id && executedSession?.id && plannedSession.linked_completed_session_id === executedSession.id);
  if (plannedSession && executedSession && !linked) missing.push("exact_persisted_execution_link");
  const feedback = safeFeedback(userFeedback, linked ? executedSession.id : plannedSession?.id, userId);
  if (!feedback) missing.push("confirmed_user_feedback");
  if (plannedSession) evidence.push({ source: "planned_training_sessions", record_id: text(plannedSession.id), calendar_date: date(plannedSession.planned_date) });
  if (linked) {
    evidence.push({ source: "training_sessions", record_id: text(executedSession.id), calendar_date: date(executedSession.local_date), provider_source: text(executedSession.source_type) });
    fact("execution_linked", "La ejecución está enlazada explícitamente con la sesión planificada.");
  }
  const duration = linked ? durationComparison(plannedSession, executedSession) : null;
  if (!duration) missing.push("comparable_duration");
  else if (duration.comparison === "shorter") fact("duration_shorter", "La duración registrada es menor que el mínimo planificado.", { observed_value: duration.executed_seconds, planned_value: duration.planned_min_seconds, unit: "seconds" });
  else if (duration.comparison === "longer") fact("duration_longer", "La duración registrada es mayor que el máximo planificado.", { observed_value: duration.executed_seconds, planned_value: duration.planned_max_seconds, unit: "seconds" });
  else fact("duration_within_range", "La duración registrada está dentro del rango planificado.");
  const structure = linked ? compareStructure(plannedSession, executedSession, feedback) : { blocks: [], volume_delta: null, omitted_blocks: [], complete_match: false };
  if (!structure.blocks.length || structure.blocks.some((block) => block.status === "unverified")) missing.push("complete_execution_structure");
  if (!structure.volume_delta) missing.push("comparable_volume");
  for (const block of structure.blocks) {
    if (block.executed_id) evidence.push({ source: "session_blocks", record_id: block.executed_id, planned_record_id: block.planned_id });
    for (const exercise of block.exercises) if (exercise.executed_id) evidence.push({ source: exercise.volume_delta?.sources?.includes("performed_sets") ? "item_exercises" : "session_exercises", record_id: exercise.executed_id });
    if (block.status === "omitted_confirmed") fact("block_omitted_confirmed", "Un bloque planificado consta como omitido en feedback confirmado.", { block: block.planned_name });
    for (const exercise of block.exercises) if (exercise.volume_delta && exercise.volume_delta.comparison !== "equal") fact(`volume_${exercise.volume_delta.comparison}`, "El volumen comparable registrado difiere del plan para este ejercicio.", { exercise: exercise.planned_name, ...exercise.volume_delta });
  }
  let completion = "unknown";
  const completionConflict = (linked && (feedback?.completion === "not_executed" || plannedSession?.status === "skipped")) || (!linked && feedback?.completion === "completed" && plannedSession?.status === "skipped");
  if (completionConflict) {
    fact("confirmed_completion_conflict", "La ejecución enlazada y la evidencia confirmada de completitud se contradicen; hace falta revisar el enlace y el feedback.");
    missing.push("consistent_completion_evidence");
  }
  else if (!executedSession && (plannedSession?.status === "skipped" || feedback?.completion === "not_executed")) completion = "not_executed";
  else if (linked) {
    if (feedback?.completion === "partial" || structure.omitted_blocks.length) completion = "partial";
    else if (feedback?.completion === "completed" || ["completed", "enriched"].includes(plannedSession.status) || (feedback?.structure_complete === true && structure.complete_match)) completion = "completed";
  }
  // 'completed' covers the measured execution; missing details stay explicitly unverified.
  const targetRpe = plannedRpe(plannedSession); let intensity = null;
  if (feedback) {
    evidence.push(...feedback.evidence);
    if (feedback.discomfort === true) fact("user_reported_discomfort", "Has confirmado una molestia en esta sesión.");
    if (feedback.rpe != null) {
      fact("user_reported_rpe", "El esfuerzo percibido proviene de feedback confirmado.", { observed_value: feedback.rpe, unit: "RPE" });
      if (targetRpe) {
        const comparison = feedback.rpe < targetRpe.min ? "lower" : feedback.rpe > targetRpe.max ? "higher" : "within_range";
        intensity = { planned_min_rpe: targetRpe.min, planned_max_rpe: targetRpe.max, reported_rpe: feedback.rpe, comparison };
        if (comparison !== "within_range") fact(`rpe_${comparison}`, "El RPE confirmado difiere del rango de RPE planificado.", { ...intensity });
      }
    }
  }
  if (!intensity) missing.push("comparable_intensity");
  const executionDate = date(executedSession?.local_date);
  const executionEndDate = executedSession?.ended_at && isValidTimeZone(timezone) ? calendarDateInTimeZone(executedSession.ended_at, timezone) : executionDate;
  const before = executionDate && date(beforeDate) && beforeDate < executionDate && (!timezone || healthBefore?.timezone === timezone) ? safeHealth(healthBefore, beforeDate) : null;
  const after = executionDate && date(afterDate) && afterDate > executionDate && afterDate > executionEndDate && (!calendarDate || afterDate <= calendarDate) && (!timezone || healthAfter?.timezone === timezone) ? safeHealth(healthAfter, afterDate) : null;
  if (!before) missing.push("health_before");
  if (!after) missing.push("health_after");
  const recovery = [];
  if (linked && after && executionDate && after.calendar_date > executionDate) {
    for (const factor of list(after.readiness?.factors)) {
      if (!["hrv", "resting_heart_rate"].includes(factor.metric) || !factor.baseline || factor.baseline.value <= 0 || factor.baseline.observations < 7 || factor.baseline.method !== "rolling_median" || factor.baseline.window_days !== 28) continue;
      const dates = [...new Set(factor.baseline.evidence_dates)];
      const earliest = new Date(Date.parse(`${after.calendar_date}T12:00:00Z`) - 28 * 86_400_000).toISOString().slice(0, 10);
      if (dates.length < 7 || dates.some((value) => value >= after.calendar_date || value < earliest)) continue;
      const adverse = factor.metric === "hrv" ? factor.observed_value < factor.baseline.value : factor.observed_value > factor.baseline.value;
      const comparison = factor.observed_value < factor.baseline.value ? "below_baseline" : factor.observed_value > factor.baseline.value ? "above_baseline" : "at_baseline";
      recovery.push({ metric: factor.metric, observed_value: factor.observed_value, baseline: factor.baseline, evidence_date: factor.evidence_date, comparison, causal_claim: false });
      if (adverse) fact(`subsequent_${factor.metric}_${comparison}`, factor.metric === "hrv" ? "La HRV registrada después de esta sesión está por debajo de tu baseline personal; no permite atribuir una causa." : "La frecuencia cardiaca en reposo registrada después de esta sesión está por encima de tu baseline personal; no permite atribuir una causa.", { observed_value: factor.observed_value, baseline_value: factor.baseline.value, evidence_date: factor.evidence_date });
    }
  }
  for (const health of [before, after].filter(Boolean)) evidence.push({ source: "health_recovery_v1", calendar_date: health.calendar_date, provenance: health.provenance, readiness_algorithm_version: health.readiness?.algorithm_version ?? null });
  let action = "no_change"; const reasons = [];
  if (completionConflict) reasons.push("confirmed_completion_conflict");
  else if (feedback?.discomfort === true) { action = "recovery_bias"; reasons.push("user_reported_discomfort"); }
  else if (feedback?.rpe != null && targetRpe && feedback.rpe > targetRpe.max) { action = "reduce"; reasons.push("rpe_higher"); }
  else if (new Set(recovery.filter((metric) => (metric.metric === "hrv" && metric.comparison === "below_baseline") || (metric.metric === "resting_heart_rate" && metric.comparison === "above_baseline")).map((metric) => metric.metric)).size >= 2) { action = "recovery_bias"; reasons.push("multiple_subsequent_personal_baseline_signals"); }
  else if (completion === "completed") { action = "keep"; reasons.push("execution_compatible_with_plan"); }
  else reasons.push("insufficient_evidence_for_adaptation");
  // Short duration alone gives no reason for prescribing less training.
  const affected = userId && ["reduce", "recovery_bias"].includes(action) && date(calendarDate) ? list(futureSessions).filter((session) => session?.user_id === userId && date(session.planned_date) && session.planned_date > calendarDate && session.id !== plannedSession?.id && !["cancelled", "canceled", "completed", "enriched", "skipped"].includes(session.status) && !session.linked_completed_session_id).sort((a, b) => `${a.planned_date}${a.id}`.localeCompare(`${b.planned_date}${b.id}`)).slice(0, 1).map((session) => ({ id: text(session.id), title: text(session.title), planned_date: session.planned_date })) : [];
  return {
    schema_version: CLOSED_LOOP_SCHEMA_VERSION, algorithm_version: CLOSED_LOOP_ALGORITHM_VERSION, generated_at: text(generatedAt, 40), calendar_date: date(calendarDate), timezone: text(timezone),
    planned_session: plannedSession ? { id: text(plannedSession.id), title: text(plannedSession.title), calendar_date: date(plannedSession.planned_date), status: text(plannedSession.status), duration_range: durationRange(plannedSession) } : null,
    executed_session: linked ? { id: text(executedSession.id), title: text(executedSession.title), linked_planned_session_id: text(plannedSession.id), calendar_date: executionDate, source: text(executedSession.source_type), duration_seconds: nonnegative(executedSession.duration_seconds), evidence_kind: executedSession.source_type === "garmin_fit" ? "objective_fit" : "canonical_execution" } : null,
    identity_match: linked ? "exact_persisted_link" : "unlinked", completion, duration_delta: duration, volume_delta: structure.volume_delta, block_exercise_matching: structure.blocks, omitted_blocks: structure.omitted_blocks, intensity_delta: intensity,
    user_feedback: feedback, health_before: before, health_after: after, recovery_comparison: recovery, evidence_used: evidence, missing_evidence: [...new Set(missing)].sort(), assessment: { status: linked || feedback || completion === "not_executed" ? "available" : "insufficient_evidence", facts },
    adaptation_proposal: { schema_version: ADAPTATION_PROPOSAL_SCHEMA_VERSION, algorithm_version: CLOSED_LOOP_ALGORITHM_VERSION, action, confidence: action === "no_change" ? "low" : action === "keep" ? "medium" : feedback?.discomfort === true ? "high" : "medium", reasons, affected_future_sessions: affected, requires_explicit_action: true, applied: false }, applied: false,
  };
}
