import type { SupabaseClient } from "@supabase/supabase-js";
import type { HealthRecoveryV1 } from "./healthEvidence.js";
import type { ReadinessV1 } from "./readinessV1.js";
export interface HealthIntelligenceRequest {
  userId: string;
  calendarDate: string;
  timezone: string;
  generatedAt?: string | null;
}
export function loadHealthIntelligence(db: Pick<SupabaseClient, "from">, request: HealthIntelligenceRequest): Promise<HealthRecoveryV1 & { readiness: ReadinessV1 }>;
