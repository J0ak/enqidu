/** Presentation adapter only. All data/decisions come from the same tool results
 * as App and MCP; this maps field names used by the established Coach renderer.
 */
export function applyToolResultsToCoachContext(context, results = []) {
  for (const result of results) {
    if (!result.ok) continue;
    const data = result.data;
    switch (result.tool) {
      case "get_today_plan": {
        const sessions = data.sessions.filter((session) => session.status !== "cancelled");
        context.planned_training = { date: data.calendar_date, sessions: sessions.map((session) => ({ ...session, blocks_count: session.blocks.length })) };
        const availability = data.availability[0];
        context.training_availability = availability ? { date: availability.calendar_date, status: availability.availability_status, source: availability.source } : null;
        break;
      }
      case "get_week_plan":
        context.weekly_planning = { from: data.from, to: data.to, reference_date: data.calendar_date, weekly_focus: data.weekly_focus, sessions: data.sessions };
        break;
      case "get_athlete_context":
        context.recommendation_context = { constraints: data.constraints };
        break;
      case "get_health_status": context.health_recovery = data; context.readiness = data.readiness; break;
      case "get_readiness": context.readiness = data; break;
      case "get_closed_loop_assessment": context.closed_loop_assessments = data.assessments; break;
      case "get_recent_training":
        context.training_period = { ...(context.training_period || {}), sessions: data.sessions.map((session) => ({ ...session, date: session.local_date, duration_seconds: session.duration_seconds })) };
        break;
      default: break;
    }
  }
  return context;
}

export function closedLoopReviewCard(context = {}) {
  const assessment = (context.closed_loop_assessments || []).find((item) =>
    item.executed_session?.id && item.identity_match === "exact_persisted_link"
    && ["reduce", "recovery_bias"].includes(item.adaptation_proposal?.action)
    && item.adaptation_proposal?.requires_explicit_action === true && item.adaptation_proposal.applied === false
    && item.adaptation_proposal.affected_future_sessions?.length === 1
    && !item.adaptation_proposal.reasons?.includes("user_reported_discomfort"));
  if (!assessment) return null;
  const target = assessment.adaptation_proposal.affected_future_sessions[0];
  return {
    id: "closed_loop_adaptation_proposal", type: "adaptation_proposal", badge: "Propuesta", title: "Propuesta para tu próximo entrenamiento",
    subtitle: target.planned_date, summary: `Te propongo revisar una reducción de ${target.title || "la próxima sesión"}.`,
    status_label: "Pendiente de revisión", metrics: [],
    actions: [{ type: "review_closed_loop_proposal", label: "Revisar cambio", session_id: assessment.executed_session.id }],
  };
}
