import { createToolExecutionContext } from "../../../src/enqiduTools/runtime.js";
import { createEnqiduReadDomain } from "../../../src/enqiduTools/readTools.js";
import { ingestGarminDaily } from "./garminDailyIngestion.js";

/** Single server operation. sourceForUser is trusted integration code binding connection ownership.
 * readDb carries the caller JWT; serviceDb is used ONLY by the fixed ingestion RPC.
 * No apply capability is accepted, imported, or invoked.
 */
export async function runAutonomousMorning({ readDb, serviceDb, sourceForUser, now = new Date(), days = 2, observe } = {}) {
  if (typeof window !== "undefined") throw new Error("server_only");
  const context = await createToolExecutionContext({ db: readDb, source: "agent", now, capabilities: { writes: false } });
  const userId = context.authenticated_user_id;
  const source = await sourceForUser(userId);
  const ingestion = await ingestGarminDaily({ db: serviceDb, authenticatedUser: { id: userId }, source,
    timezone: context.profile_timezone, now: context.generated_at, days, observe });
  // Construct after ingestion: no pre-sync read cache may survive this boundary.
  const domain = createEnqiduReadDomain({ db: readDb, userId, calendar: { date: context.request_calendar_date, timezone: context.profile_timezone }, now: context.generated_at });
  let brief = null;
  let morning_error_code = null;
  try { brief = await domain.read("get_morning_coach_brief"); }
  catch {
    // Ingestion already committed atomically. Do not hide its result behind a read failure.
    morning_error_code = "morning_read_unavailable";
    ingestion.warnings.push(morning_error_code);
  }
  return { schema_version: "autonomous_morning_v1", ingestion, brief, morning_error_code, applied: false };
}
