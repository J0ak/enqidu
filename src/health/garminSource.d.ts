export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Measurement = { value: number | null; unit: string; [key: string]: unknown };
export type GarminDataType = "daily_health" | "sleep" | "hrv" | "stress" | "body_battery" |
  "respiration" | "spo2" | "body_composition" | "vendor_insight" | "heart_rate";
export type DataConfidence = "reported" | "user_verified" | "calculated" | "estimated" | "ocr_unverified" | "unknown";
export type GarminTransport =
  | { provider_mode: "aggregator"; ingestion_channel: "fitness_ai_connector" }
  | { provider_mode: "official_api"; ingestion_channel: "garmin_health_api" };
export interface GarminSourceRequest {
  from_date: string;
  to_date: string;
  timezone: string;
  cursor?: string | null;
}
export interface GarminSourcePage { records: GarminHealthRecord[]; next_cursor: string | null }

export interface GarminRecordEvidence {
  provider: "garmin";
  calendar_date: string;
  timezone?: string | null;
  observed_at?: string | null;
  retrieved_at: string;
  source_updated_at?: string | null;
  source_identifier?: string | null;
  data_confidence?: DataConfidence;
  raw?: JsonValue;
  [key: string]: unknown;
}
export type GarminRecordBase = GarminRecordEvidence & GarminTransport;
export type DailyMeasurements = Partial<Record<
  "resting_heart_rate_bpm" | "min_heart_rate_bpm" | "max_heart_rate_bpm" |
  "average_stress_level" | "max_stress_level" | "steps" | "intensity_minutes" |
  "active_kcal" | "bmr_kcal" | "distance_m" | "active_time_seconds" |
  "moderate_intensity_seconds" | "vigorous_intensity_seconds" | "steps_goal" |
  "intensity_goal_seconds" | "stress_duration_seconds" | "rest_stress_duration_seconds" |
  "activity_stress_duration_seconds" | "low_stress_duration_seconds" |
  "medium_stress_duration_seconds" | "high_stress_duration_seconds" |
  "body_battery_current" | "body_battery_charged" | "body_battery_drained" |
  "spo2_avg_pct" | "spo2_min_pct" | "respiration_avg_brpm" | "respiration_min_brpm",
  Measurement | null>>;
export type SleepMeasurements = Partial<Record<
  "total_duration_seconds" | "deep_sleep_seconds" | "light_sleep_seconds" | "rem_sleep_seconds" |
  "awake_seconds" | "unmeasurable_seconds" | "sleep_score" | "restless_moments_count" |
  "avg_sleep_heart_rate_bpm" | "resting_heart_rate_bpm" | "body_battery_change" |
  "spo2_avg_pct" | "spo2_min_pct" | "respiration_avg_brpm" | "respiration_min_brpm" |
  "hrv_last_night_avg_ms" | "hrv_last_night_5min_high_ms" | "skin_temperature_change_c",
  Measurement | null>>;
export interface GarminSample {
  recorded_at: string;
  measurement?: Measurement | null;
  context?: "daily" | "sleep" | "activity" | "on_demand" | "unknown";
  nominal_resolution?: Measurement | null;
  resolution_status?: "documented_by_derived_export" | "observed_to_validate" |
    "official_payload_validated" | "official_payload_pending" | "fit_exact";
  stress_status?: "measured" | "off_wrist" | "large_motion" | "not_enough_data" |
    "recovering_from_exercise" | "unidentified";
  raw?: JsonValue;
  [key: string]: unknown;
}
export interface GarminSleepStage {
  stage_code?: "awake" | "rem" | "light" | "deep" | "unmeasurable" | "unknown";
  start_at: string;
  end_at: string;
  duration?: Measurement | null;
  raw?: JsonValue;
  [key: string]: unknown;
}
export type GarminDailyHealth = GarminRecordBase & {
  data_type: "daily_health"; measurements?: DailyMeasurements; stress_qualifier?: string | null;
};
export type GarminSleep = GarminRecordBase & {
  data_type: "sleep"; measurements?: SleepMeasurements; stages?: GarminSleepStage[];
  sleep_start_at?: string | null; sleep_end_at?: string | null; respiration_variation_status?: string | null;
};
export type GarminHRV = GarminRecordBase & {
  data_type: "hrv"; measurements?: Partial<Record<"last_night_avg_ms" | "last_night_5min_high_ms", Measurement | null>>;
  status?: string | null; samples?: GarminSample[];
};
export type GarminStress = GarminRecordBase & {
  data_type: "stress"; measurements?: DailyMeasurements; stress_qualifier?: string | null; samples?: GarminSample[];
};
export type GarminBodyBattery = GarminRecordBase & {
  data_type: "body_battery"; measurements?: Partial<Record<"body_battery_current" | "body_battery_charged" | "body_battery_drained", Measurement | null>>;
  samples?: GarminSample[];
};
export type GarminRespiration = GarminRecordBase & {
  data_type: "respiration"; measurements?: Partial<Record<"respiration_avg_brpm" | "respiration_min_brpm", Measurement | null>>;
  samples?: GarminSample[];
};
export type GarminSpO2 = GarminRecordBase & {
  data_type: "spo2"; measurements?: Partial<Record<"spo2_avg_pct" | "spo2_min_pct", Measurement | null>>; samples?: GarminSample[];
};
export type GarminBodyComposition = GarminRecordBase & {
  data_type: "body_composition"; measured_at: string;
  measurements?: Partial<Record<"weight_kg" | "body_fat_pct" | "body_water_pct" | "skeletal_muscle_mass_kg" | "bone_mass_kg" | "bmi", Measurement | null>>;
};
export type GarminVendorInsight = GarminRecordBase & {
  data_type: "vendor_insight";
  insight: {
    code: string; domain: string; value_numeric?: number | null; value_text?: string | null;
    value_json?: JsonValue; unit?: string | null;
    api_availability?: "confirmed_official_metric_family" | "portal_payload_validation_required" |
      "not_publicly_confirmed" | "optional_conditions_apply";
    [key: string]: unknown;
  };
};
export type GarminHeartRate = GarminRecordBase & {
  data_type: "heart_rate"; measurements?: Partial<Record<"resting_heart_rate_bpm" | "min_heart_rate_bpm" | "max_heart_rate_bpm", Measurement | null>>;
  samples?: GarminSample[];
};
export type GarminHealthRecord = GarminDailyHealth | GarminSleep | GarminHRV | GarminStress |
  GarminBodyBattery | GarminRespiration | GarminSpO2 | GarminBodyComposition | GarminVendorInsight | GarminHeartRate;
export const GARMIN_HEALTH_DATA_TYPES: readonly GarminDataType[];
export const GARMIN_SOURCE_CHANNELS: Readonly<{ aggregator: "fitness_ai_connector"; official_api: "garmin_health_api" }>;
export const HEALTH_DATA_CONFIDENCE: readonly DataConfidence[];
export function validateCalendarDate(value: unknown, field?: string): string;
export function validateHealthTimezone(value: unknown, field?: string): string | null;
export function validateGarminSourceRequest(request: GarminSourceRequest): Required<GarminSourceRequest>;
export abstract class GarminSource {
  abstract getHealthRecords(request: GarminSourceRequest): Promise<GarminSourcePage>;
}
