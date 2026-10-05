export const CLOSED_LOOP_ALGORITHM_VERSION = "enqidu.closed-loop.v1.0.0";
const finite = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
const names = (blocks) => new Set((blocks || []).map((block) => String(block?.title || block?.name || "").trim().toLowerCase()).filter(Boolean));

export function assessClosedLoop({ plannedSession = null, executedSession = null, userFeedback = null, healthBefore = null, healthAfter = null, generatedAt = null } = {}) {
  const facts = [];
  let completion = "unknown";
  let durationDelta = null;
  const omittedBlocks = [];
  if (!plannedSession) facts.push("planned_session_missing");
  if (!executedSession) facts.push("execution_missing");
  if (plannedSession && executedSession) {
    const plannedSeconds = finite(plannedSession.duration_seconds) ? Number(plannedSession.duration_seconds) : finite(plannedSession.planned_duration_max) ? Number(plannedSession.planned_duration_max) * 60 : null;
    const actualSeconds = finite(executedSession.duration_seconds) ? Number(executedSession.duration_seconds) : null;
    if (plannedSeconds != null && actualSeconds != null) durationDelta = { planned_seconds: plannedSeconds, executed_seconds: actualSeconds, seconds: actualSeconds - plannedSeconds, ratio: plannedSeconds === 0 ? null : Math.round(actualSeconds / plannedSeconds * 100) / 100 };
    const completed = names(executedSession.blocks);
    for (const block of names(plannedSession.blocks)) if (!completed.has(block)) omittedBlocks.push(block);
    completion = omittedBlocks.length || (durationDelta?.ratio != null && durationDelta.ratio < 0.75) ? "partial" : "completed";
  }
  if (userFeedback?.discomfort === true || userFeedback?.pain === true) facts.push("user_reported_discomfort");
  if (finite(userFeedback?.rpe)) facts.push("user_reported_rpe");
  const reasons = [...facts];
  if (completion === "partial") reasons.push("execution_below_plan");
  if (healthAfter?.readiness?.score != null && healthBefore?.readiness?.score != null && healthAfter.readiness.score < healthBefore.readiness.score) reasons.push("subsequent_readiness_lower_than_pre_session");
  let action = "no_change";
  if (facts.includes("user_reported_discomfort")) action = "recovery_bias";
  else if (completion === "partial" || Number(userFeedback?.rpe) >= 9) action = "reduce";
  else if (completion === "completed") action = "keep";
  return {
    schema_version: "closed_loop_assessment_v1", algorithm_version: CLOSED_LOOP_ALGORITHM_VERSION, generated_at: generatedAt,
    planned_session: plannedSession ? { id: plannedSession.id || null, title: plannedSession.title || null } : null,
    executed_session: executedSession ? { id: executedSession.id || null, linked_planned_session_id: executedSession.planned_session_id || plannedSession?.linked_completed_session_id || null, source: executedSession.source || null } : null,
    completion, duration_delta: durationDelta, omitted_blocks: omittedBlocks, user_feedback: userFeedback,
    health_before: healthBefore, health_after: healthAfter, evidence_used: reasons,
    assessment: { status: reasons.length ? "available" : "insufficient_evidence", facts: reasons },
    adaptation_proposal: { action, confidence: facts.includes("user_reported_discomfort") ? "high" : completion === "unknown" ? "low" : "medium", reasons, affected_future_sessions: [] },
    applied: false,
  };
}
