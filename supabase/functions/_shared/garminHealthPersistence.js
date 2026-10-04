import { validateCanonicalHealthRecord } from "../../../src/health/garminAdapter.js";

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Internal server boundary. authenticatedUser must come from server-verified
 * authentication/connection ownership, never from source DTOs or model output.
 * The service client is injected; this module contains no keys or frontend path.
 */
export async function persistGarminHealthRecord({ db, authenticatedUser, record }) {
  if (typeof window !== "undefined") throw new Error("Garmin health persistence is server-only");
  if (!USER_ID.test(authenticatedUser?.id || "")) throw new TypeError("A server-authenticated user UUID is required");
  if (typeof db?.rpc !== "function") throw new TypeError("A server database client is required");
  const canonicalRecord = validateCanonicalHealthRecord(record);
  const { data, error } = await db.rpc("ingest_garmin_health_record", {
    p_user_id: authenticatedUser.id,
    p_record: canonicalRecord,
  });
  if (error) throw new Error(`Garmin health persistence failed: ${error.message || "database error"}`, { cause: error });
  if (!data || !["inserted", "updated", "unchanged", "ignored_stale"].includes(data.status)) {
    throw new Error("Garmin health persistence returned an invalid result");
  }
  return data;
}
