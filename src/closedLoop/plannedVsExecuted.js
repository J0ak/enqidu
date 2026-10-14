/** Canonical comparison. Dates and titles never establish session identity.
 * A unique persisted link wins, including cross-day execution. This schema has
 * no shared plan/execution identity for a date fallback: those cases stay unknown.
 * Callers must supply owned, complete link evidence (Closed Loop does this).
 */
export function comparePlannedVsExecuted({ planned = null, executed = null, assessment = null, ambiguous = false } = {}) {
  const exact = !ambiguous && planned && executed && planned.linked_completed_session_id === executed.id
    && assessment?.identity_match === "exact_persisted_link" && assessment.executed_session?.id === executed.id
    && assessment.planned_session?.id === planned.id;
  const rest = planned?.session_type === "rest";
  const typeMap = { hybrid_training: ["hybrid"], functional_strength: ["strength", "functional"], mobility: ["mobility"], recovery: ["recovery"], running: ["running"], swimming: ["swim"], trail_running: ["trail"], yoga_pilates: ["yoga"] };
  const actualTypes = exact ? typeMap[executed.modality_code] : null;
  const typeComparison = actualTypes && planned.session_type ? actualTypes.includes(planned.session_type) ? "compatible" : "different" : "unknown";
  const delta = exact ? assessment.duration_delta ?? null : null;
  let status = "unknown";
  if (!planned || rest && !executed) status = "no_session_planned";
  else if (!ambiguous && assessment?.completion === "not_executed" && !executed) status = "missed";
  else if (!ambiguous && planned.status === "skipped" && !executed) status = "missed";
  else if (exact && assessment.completion === "partial") status = "partial";
  else if (exact && assessment.completion === "completed") {
    const changed = typeComparison === "different" || delta && delta.comparison !== "within_range"
      || assessment.intensity_delta && assessment.intensity_delta.comparison !== "within_range"
      || assessment.volume_delta && assessment.volume_delta.comparison !== "equal"
      || assessment.omitted_blocks?.length;
    status = changed ? "completed_modified" : delta ? "completed_as_planned" : "unknown";
  }
  return { schema_version: "planned_vs_executed_v1", planned_id: planned?.id ?? null,
    executed_id: exact || !planned ? executed?.id ?? null : null,
    planned_date: planned?.planned_date ?? null, executed_date: exact || !planned ? executed?.local_date ?? null : null,
    identity_match: exact ? "exact_persisted_link" : "unlinked", status, planned_rest: rest,
    planned_title: planned?.title ?? null, executed_title: exact || !planned ? executed?.title ?? null : null,
    type_comparison: typeComparison, duration_delta: delta, comparison_scope: "observed_dimensions_only",
    missing_evidence: exact ? [...(assessment.missing_evidence || [])] : planned && !rest ? [ambiguous ? "ambiguous_execution_link" : "canonical_execution_link"] : [] };
}

export function compareTrainingDay({ plans = [], executions = [], assessments = [], hasMore = false } = {}) {
  const relevant = plans.filter((p) => !["cancelled", "rescheduled", "recommended"].includes(p.status));
  const used = new Set();
  const comparisons = relevant.map((planned) => {
    const assessment = assessments.find((a) => a.planned_session?.id === planned.id);
    const executed = executions.find((e) => e.id === planned.linked_completed_session_id)
      || (assessment?.executed_session ? { ...assessment.executed_session, local_date: assessment.executed_session.calendar_date } : null);
    const ambiguous = hasMore || relevant.filter((p) => p.linked_completed_session_id && p.linked_completed_session_id === planned.linked_completed_session_id).length > 1;
    const result = !ambiguous && assessment?.planned_vs_executed || comparePlannedVsExecuted({ planned, executed, assessment, ambiguous });
    if (result.executed_id) used.add(result.executed_id);
    return result;
  });
  for (const executed of executions) if (!used.has(executed.id)) {
    // A cross-day exact assessment still beats today's absence of a plan.
    const assessment = assessments.find((a) => a.executed_session?.id === executed.id && a.identity_match === "exact_persisted_link");
    const planned = assessment ? { ...assessment.planned_session, planned_date: assessment.planned_session.calendar_date, linked_completed_session_id: executed.id } : null;
    comparisons.push(!hasMore && assessment?.planned_vs_executed || comparePlannedVsExecuted({ planned, executed, assessment, ambiguous: hasMore }));
  }
  const statuses = comparisons.map((c) => c.status);
  const status = hasMore ? "unknown" : !statuses.length ? "no_session_planned"
    : statuses.every((s) => s === statuses[0]) ? statuses[0]
      : statuses.includes("unknown") ? "unknown" : statuses.includes("partial") || statuses.includes("missed") ? "partial"
        : statuses.includes("completed_modified") ? "completed_modified" : "unknown";
  return { schema_version: "training_day_comparison_v1", status, comparisons, has_more: hasMore };
}
