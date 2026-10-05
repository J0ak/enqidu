import { GarminAdapter } from "../../../src/health/garminAdapter.js";
import { validateGarminSourceRequest } from "../../../src/health/garminSource.js";
import { persistGarminHealthRecord } from "./garminHealthPersistence.js";

/**
 * Server-only source → adapter → canonical persistence orchestration.
 * The caller supplies identity resolved from verified auth/connection consent.
 * A provider DTO never determines that identity. No transport is implemented here.
 * A failed page returns no cursor; retry the page through the idempotent RPC.
 */
export async function ingestGarminHealthPage({ db, authenticatedUser, source, request }) {
  if (typeof window !== "undefined") throw new Error("Health ingestion requires a server runtime");
  if (!authenticatedUser || typeof authenticatedUser.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authenticatedUser.id)) {
    throw new TypeError("Health ingestion requires a verified server user identity");
  }
  if (!db || typeof db.rpc !== "function") throw new TypeError("Health ingestion requires a server database client");
  if (!source || typeof source.getHealthRecords !== "function") throw new TypeError("Source must implement GarminSource.getHealthRecords");
  const sourceRequest = validateGarminSourceRequest(request);
  const page = await source.getHealthRecords(sourceRequest);
  if (!page || !Array.isArray(page.records) || page.records.length > 100) {
    throw new TypeError("A health source page must contain at most 100 records");
  }
  // Validate the complete page before any write. Each record remains atomic.
  const normalized = new GarminAdapter().normalizePage(page);
  if (normalized.records.some((record) => record.calendar_date < sourceRequest.from_date ||
      record.calendar_date > sourceRequest.to_date)) {
    throw new RangeError("Health source returned a date outside the requested range");
  }
  const results = [];
  for (const record of normalized.records) {
    results.push(await persistGarminHealthRecord({ db, authenticatedUser, record }));
  }
  return { processed_count: results.length, next_cursor: normalized.next_cursor,
    source_metadata: normalized.source_metadata, results };
}
