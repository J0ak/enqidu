import type { HealthFreshness, HealthProvenance, HealthRecoveryV1, HealthSource } from "./healthEvidence.js";
export type ReadinessMetric = "sleep_score" | "sleep_duration" | "body_battery" | "hrv" | "resting_heart_rate";
export type BaselineMetric = "hrv" | "resting_heart_rate" | "sleep_duration";
export interface ReadinessHistoryObservation {
  user_id?: string;
  calendar_date: string;
  freshness?: HealthFreshness | "invalid";
  hrv?: number | null;
  resting_heart_rate?: number | null;
  sleep_duration?: number | null;
  provenance?: Partial<Record<BaselineMetric, HealthProvenance>>;
  sources?: Partial<Record<BaselineMetric, HealthSource>>;
}
export interface PersonalBaseline {
  value: number;
  observations: number;
  method: "rolling_median";
  window_days: number;
  minimum_observations: number;
  start_date: string;
  end_date: string;
  evidence_dates: string[];
  evidence: { calendar_date: string; value: number; provenance?: HealthProvenance; source?: HealthSource }[];
}
export interface ReadinessFactor {
  metric: ReadinessMetric;
  observed_value: number;
  baseline: PersonalBaseline | null;
  factor_score: number;
  weight: number;
  contribution: number | null;
  evidence_date: string;
  provenance: HealthProvenance | null;
  source: HealthSource | null;
  reason: string;
  reason_code: string;
}
export interface ReadinessV1 {
  schema_version: "readiness_v1";
  algorithm_version: "enqidu.readiness.v1.0.0";
  calendar_date: string | null;
  timezone: string | null;
  status: "available" | "partial" | "unavailable";
  score: number | null;
  confidence: "none" | "low" | "medium";
  factors: ReadinessFactor[];
  evidence_dates: string[];
  provenance: HealthProvenance[];
  generated_at: string | null;
  missing_relevant_data: string[];
  minimum_usable_factors: 2;
}
export const READINESS_ALGORITHM_VERSION: "enqidu.readiness.v1.0.0";
export const READINESS_SCHEMA_VERSION: "readiness_v1";
export const READINESS_BASELINE_WINDOW_DAYS: 28;
export const READINESS_BASELINE_MINIMUM_OBSERVATIONS: 7;
export function buildPersonalBaseline(history: ReadinessHistoryObservation[], field: BaselineMetric, options: { calendarDate: string; userId?: string | null; minimum?: number; window?: number }): PersonalBaseline | null;
export function calculateReadiness(evidence: Partial<HealthRecoveryV1>, history?: ReadinessHistoryObservation[], options?: { generatedAt?: string | null; userId?: string | null }): ReadinessV1;
