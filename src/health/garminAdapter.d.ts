import type { DataConfidence, GarminDataType, GarminHealthRecord, GarminSourcePage, GarminTransport, JsonValue } from "./garminSource.js";
export interface CanonicalHealthRecord {
  schema_version: "enqidu.wearable.v1";
  data_type: GarminDataType;
  calendar_date: string;
  timezone: string | null;
  observed_at: string | null;
  provenance: GarminTransport & {
    provider: "garmin"; source_identifier: string | null; retrieved_at: string;
    source_updated_at: string | null; data_confidence: DataConfidence;
  };
  metrics: Record<string, JsonValue>;
  samples: Record<string, JsonValue>[];
  stages: Record<string, JsonValue>[];
  evidence: { raw: JsonValue; source_dto: GarminHealthRecord };
}
export const WEARABLE_SCHEMA_VERSION: "enqidu.wearable.v1";
export const GARMIN_MEASUREMENT_FIELDS: Readonly<Record<GarminDataType, Readonly<Record<string, readonly [string, boolean?, boolean?]>>>>;
export function cloneHealthEvidence(value: unknown): JsonValue;
export function normalizeHealthTimestamp(value: unknown, field?: string, nullable?: boolean): string | null;
export function normalizeGarminHealthRecord(input: GarminHealthRecord): CanonicalHealthRecord;
export function validateCanonicalHealthRecord(input: unknown): CanonicalHealthRecord;
export function getGarminHealthNaturalKey(userId: string, input: CanonicalHealthRecord): string;
export class GarminAdapter {
  normalize(record: GarminHealthRecord): CanonicalHealthRecord;
  normalizePage(page: GarminSourcePage): { records: CanonicalHealthRecord[]; next_cursor: string | null; source_metadata: JsonValue };
}
