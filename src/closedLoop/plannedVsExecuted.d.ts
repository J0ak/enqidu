import type { CanonicalPlannedSession, CanonicalExecution, ClosedLoopAssessmentV1 } from "./closedLoopAssessment.js";
export interface PlannedVsExecuted {
  schema_version: "planned_vs_executed_v1";
  planned_id: string | null; executed_id: string | null;
  planned_title: string | null; executed_title: string | null;
  planned_date: string | null; executed_date: string | null;
  identity_match: "exact_persisted_link" | "unlinked";
  status: "completed_as_planned" | "completed_modified" | "partial" | "missed" | "no_session_planned" | "unknown";
  planned_rest: boolean; type_comparison: "compatible" | "different" | "unknown";
  duration_delta: ClosedLoopAssessmentV1["duration_delta"];
  comparison_scope: "observed_dimensions_only"; missing_evidence: string[];
}
export function comparePlannedVsExecuted(options?: { planned?: CanonicalPlannedSession | null; executed?: CanonicalExecution | null; assessment?: ClosedLoopAssessmentV1 | null; ambiguous?: boolean }): PlannedVsExecuted;
export function compareTrainingDay(options?: { plans?: CanonicalPlannedSession[]; executions?: CanonicalExecution[]; assessments?: ClosedLoopAssessmentV1[]; hasMore?: boolean }): { schema_version: "training_day_comparison_v1"; status: PlannedVsExecuted["status"]; comparisons: PlannedVsExecuted[]; has_more: boolean };
