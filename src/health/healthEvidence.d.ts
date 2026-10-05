import type { ReadinessV1 } from "./readinessV1.js";
export type HealthFreshness = "current" | "recent" | "stale" | "unavailable";
export type HealthFamilyName = "sleep" | "hrv" | "body_battery" | "stress" | "heart_rate" | "spo2" | "respiration";
export interface HealthProvenance {
  provider?: string;
  provider_mode?: string;
  ingestion_channel?: string;
  data_confidence?: string;
}
export interface HealthSource {
  table?: string;
  record_id?: number | string;
  foundation_record_key?: string;
}
export interface HealthFieldSource extends HealthSource {
  calendar_date: string;
  provenance: HealthProvenance;
  observed_at?: string;
  linked_summary_id?: string | number;
  as_of?: string | null;
}
export interface HealthFamilyEvidence {
  calendar_date: string;
  observed_date: string;
  freshness: HealthFreshness;
  temporal_scope: "calendar_day" | "instant";
  provenance: HealthProvenance;
  source: HealthSource;
  field_sources: Record<string, HealthFieldSource>;
  scope?: "sleep";
}
export interface HealthSleepEvidence extends HealthFamilyEvidence {
  duration_seconds?: number;
  sleep_score?: number;
  deep_seconds?: number;
  light_seconds?: number;
  rem_seconds?: number;
  awake_seconds?: number;
  sleep_start_utc?: string;
  sleep_end_utc?: string;
}
export interface HealthHrvEvidence extends HealthFamilyEvidence {
  last_night_avg_ms?: number;
  last_night_5min_high_ms?: number;
  readings_count?: number;
  readings_count_method?: "canonical_linked_valid_samples";
}
export interface HealthBodyBatteryEvidence extends HealthFamilyEvidence {
  current?: number;
  current_observed_at?: string;
  charged?: number;
  drained?: number;
}
export interface HealthRecoveryV1 {
  schema_version: "health_recovery_v1";
  calendar_date: string;
  timezone: string;
  temporal_scope: "calendar_day";
  status: "available" | "partial" | "unavailable";
  freshness: HealthFreshness;
  generated_at: string | null;
  evidence_dates: string[];
  provenance: HealthProvenance[];
  missing: HealthFamilyName[];
  evidence_quality: "complete" | "partial" | "unavailable";
  issues: string[];
  sleep?: HealthSleepEvidence;
  hrv?: HealthHrvEvidence;
  body_battery?: HealthBodyBatteryEvidence;
  stress?: HealthFamilyEvidence & { average?: number; max?: number; qualifier?: string };
  heart_rate?: HealthFamilyEvidence & { resting?: number; min?: number; max?: number };
  spo2?: HealthFamilyEvidence & { average?: number; min?: number };
  respiration?: HealthFamilyEvidence & { average?: number; min?: number };
  readiness?: ReadinessV1;
}
export interface CanonicalHealthRecords {
  daily?: Record<string, unknown>[];
  sleep?: Record<string, unknown>[];
  hrv?: Record<string, unknown>[];
  imports?: Record<string, unknown>[];
  body_battery_samples?: Record<string, unknown>[];
}
export interface HealthEvidenceRequest {
  calendarDate: string;
  timezone: string;
  userId?: string | null;
  records?: CanonicalHealthRecords;
  generatedAt?: string | null;
  readIssues?: string[];
}
export const HEALTH_EVIDENCE_SCHEMA_VERSION: "health_recovery_v1";
export const HEALTH_FAMILIES: readonly HealthFamilyName[];
export function healthNumber(value: unknown, options?: { positive?: boolean; maximum?: number; integer?: boolean }): number | null;
export function healthTimestamp(value: unknown): string | null;
export function safeHealthProvenance(value: unknown): HealthProvenance | null;
export function safeHealthSource(value: unknown, table?: string): HealthSource;
export function shiftHealthCalendarDate(value: string, days: number): string;
export function classifyFreshness(observedDate: string | null | undefined, calendarDate: string): HealthFreshness;
export function healthCalendarUtcBounds(calendarDate: string, timezone: string): { start_utc: string; end_utc: string };
export function buildHealthEvidence(request: HealthEvidenceRequest): HealthRecoveryV1;
