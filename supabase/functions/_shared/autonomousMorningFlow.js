import { isGarminBrowserRuntime } from './garminServerRuntime.js';
import { withSyncDeadline } from './garminSyncDeadline.js';
import { createToolExecutionContext } from "../../../src/enqiduTools/runtime.js";
import { createEnqiduReadDomain } from "../../../src/enqiduTools/readTools.js";
import { consentCheckedPersistence } from "./garminSourceBinding.js";
import { resolveUserCalendar, isValidTimeZone } from "../../../src/time/userCalendar.js";
import { ingestGarminDaily } from "./garminDailyIngestion.js";

/** Single server operation. sourceForUser is trusted integration code binding connection ownership.
 * readDb carries the caller JWT; serviceDb is used ONLY by the fixed ingestion RPC.
 * No apply capability is accepted, imported, or invoked.
 */
export async function runAutonomousMorning({ readDb, serviceDb, sourceForUser, now = new Date(), days = 2, observe } = {}) {
  if (isGarminBrowserRuntime()) throw new Error("server_only");
  const context = await createToolExecutionContext({ db: readDb, source: "agent", now, capabilities: { writes: false } });
  return runMorningForOwner({ readDb, serviceDb, sourceForUser, userId: context.authenticated_user_id, now: context.generated_at, days, observe });
}

/** Internal server entrypoint for a DB-claimed owner. Never export through tools or request payloads. */
export async function runMorningForOwner({ readDb, serviceDb, sourceForUser, userId, now = new Date(), days = 2, observe, signal = AbortSignal.timeout(20_000) }) {
  if (isGarminBrowserRuntime()) throw new Error("server_only");
  const binding = await withSyncDeadline(() => sourceForUser(userId), signal);
  if (!binding?.source || binding.user_id !== userId || !Number.isSafeInteger(binding.binding_revision)) throw Object.assign(new Error("binding_unverified"), { code: "binding_unverified" });
  const profile = await withSyncDeadline(() => readDb.from("profiles").select("timezone").eq("id", userId).limit(1), signal);
  const calendar = resolveUserCalendar({ profileTimezone: profile.data?.[0]?.timezone, now });
  if (profile.error || !isValidTimeZone(profile.data?.[0]?.timezone) || !calendar.ok) throw Object.assign(new Error("profile_timezone_required"), { code: "profile_timezone_required" });
  const context = { profile_timezone: calendar.timezone, request_calendar_date: calendar.date, generated_at: new Date(now).toISOString() };
  const source = { getHealthRecords: (request) => withSyncDeadline(() => binding.source.getHealthRecords(request), signal) };
  const persistenceDb = consentCheckedPersistence(serviceDb, binding, signal);
  const ingestion = await ingestGarminDaily({ db: persistenceDb, authenticatedUser: { id: userId }, source,
    timezone: context.profile_timezone, now: context.generated_at, days, observe, signal });
  // Construct after ingestion: no pre-sync read cache may survive this boundary.
  const domain = createEnqiduReadDomain({ db: readDb, userId, calendar: { date: context.request_calendar_date, timezone: context.profile_timezone }, now: context.generated_at });
  let brief = null;
  let morning_error_code = null;
  try { brief = await withSyncDeadline(() => domain.read("get_morning_coach_brief"), signal); }
  catch {
    // Ingestion already committed atomically. Do not hide its result behind a read failure.
    morning_error_code = "morning_read_unavailable";
    ingestion.warnings.push(morning_error_code);
  }
  return { schema_version: "autonomous_morning_v1", ingestion, brief, morning_error_code, applied: false };
}
