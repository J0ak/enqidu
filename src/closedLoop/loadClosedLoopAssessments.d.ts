import type { ClosedLoopAssessmentV1 } from "./closedLoopAssessment.js";
export interface ClosedLoopLoadOptions {
  userId: string; calendarDate: string; timezone: string; generatedAt?: string | null;
  /** Existing executed session identity; no fuzzy or derived session identity. */
  sessionId?: string | null; plannedSessionId?: string | null;
  fromDate?: string | null; toDate?: string | null; limit?: number;
  healthLoader?: (db: unknown, options: { userId: string; calendarDate: string; timezone: string; generatedAt: string | null }) => Promise<Record<string, unknown>>;
}
export function loadClosedLoopAssessments(db: unknown, options: ClosedLoopLoadOptions): Promise<ClosedLoopAssessmentV1[]>;
