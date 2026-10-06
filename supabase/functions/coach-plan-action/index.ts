import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { prepareEnqiduAction, executePreparedEnqiduAction } from "../../../src/enqiduTools/actions.js";
import { validateEnqiduActionPreview } from "../../../src/enqiduTools/actionPreview.js";
import { isValidTimeZone, resolveUserCalendar } from "../../../src/time/userCalendar.js";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const actionArgs: Record<string, string[]> = {
  save_recommendation_today: ["date", "location"],
  move_planned_session: ["source_date", "target_weekday", "target_date"],
  set_training_unavailability: ["date_reference"],
  adapt_session_environment: ["source_date", "environment"],
  adapt_session_duration: ["source_date", "duration_minutes"],
  cancel_planned_session: ["source_date"],
  adapt_remaining_week: [],
};
const previewRequired = new Set([
  "move_planned_session", "adapt_session_environment", "adapt_session_duration",
  "cancel_planned_session", "adapt_remaining_week",
]);
const transportKeys = new Set([
  "action", "client_timezone", "confirmation", "confirmed", "fingerprint", "expires_at",
  "preview_fingerprint", "preview_expires_at",
]);

async function loadUserTimezone(db: any, userId: string) {
  const result = await db.from("profiles").select("timezone").eq("id", userId).limit(1);
  if (result.error) throw new Error("profile_read_failed");
  return result.data?.[0]?.timezone || null;
}

// Compatibility transport. Existing-plan mutations require the same preview
// receipt as ENQIDU Tools; this endpoint is not a way around confirmation.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  const requestId = crypto.randomUUID();
  try {
    const auth = req.headers.get("Authorization");
    if (!auth || !/^Bearer\s+\S+$/i.test(auth)) return reply({ ok: false, error: "auth_required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return reply({ ok: false, error: "server_configuration_error" }, 500);
    const userDb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const userId = (await userDb.auth.getUser()).data.user?.id;
    if (!userId) return reply({ ok: false, error: "invalid_user" }, 401);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ ok: false, error: "invalid_arguments" }, 400);
    const action = typeof body.action === "string" ? body.action : "";
    if (!Object.hasOwn(actionArgs, action)) return reply({ ok: false, error: "unsupported_action" }, 400);
    if (Object.keys(body).some((key) => !transportKeys.has(key) && !actionArgs[action].includes(key))) {
      return reply({ ok: false, error: "invalid_arguments" }, 400);
    }
    if (previewRequired.has(action) && body.confirmation !== true && body.confirmed !== true) {
      return reply({ ok: false, error: "explicit_confirmation_required" }, 400);
    }
    const profileTimezone = await loadUserTimezone(userDb, userId);
    if (!isValidTimeZone(profileTimezone)) return reply({ ok: false, error: "profile_timezone_required" }, 400);
    const now = new Date();
    const calendar = resolveUserCalendar({ profileTimezone, now });
    const args = Object.fromEntries(actionArgs[action].filter((key) => key in body).map((key) => [key, body[key]]));
    const prepared = await prepareEnqiduAction({ db: userDb, userId, calendar, action, args, now });
    if (!prepared.ok) return reply(prepared);
    if (previewRequired.has(action)) {
      const check = await validateEnqiduActionPreview({ prepared,
        fingerprint: body.fingerprint ?? body.preview_fingerprint,
        expiresAt: body.expires_at ?? body.preview_expires_at, now,
      });
      if (!check.ok) return reply(check, 409);
    }
    // The server secret never leaves this boundary. Fixed RPC names and all
    // mutation values are produced by the shared domain preparation above.
    const adminDb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await executePreparedEnqiduAction({ adminDb, userId, prepared });
    console.info(JSON.stringify({ request_id: requestId, tool_id: action, tool_version: "enqidu_tools_v1",
      timestamp: now.toISOString(), status: result.ok ? "ok" : "error", error_code: result.ok ? null : result.error }));
    return reply(result);
  } catch {
    console.error(JSON.stringify({ request_id: requestId, status: "error", error_code: "coach_plan_action_failed" }));
    return reply({ ok: false, error: "coach_plan_action_failed", message: "No se ha podido validar el cambio. Vuelve a consultar el plan." }, 500);
  }
});
