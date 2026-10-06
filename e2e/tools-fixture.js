import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { normalizeGarminHealthRecord } from "../src/health/garminAdapter.js";

export const TOOLS_SECRET_MARKER = "synthetic-local-provider-payload-must-stay-private";
export const TOOLS_PASSWORD = "LocalTools-E2E-Only-57!";
export const toolsDate = (offset = 0, instant = new Date()) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

const requireResult = (result, operation) => {
  assert.equal(result.error, null, `${operation} failed: ${result.error?.message || ""}`);
  return result.data;
};

/** Disposable local users only. Service credentials never enter the browser. */
export async function createToolsFixture(label, { health = true, plans = true } = {}) {
  const url = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname), "Tools E2E refuses remote Supabase");
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(anonKey && serviceKey, "Disposable local anon and service credentials are required");
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const adminDb = createClient(url, serviceKey, options);
  const db = createClient(url, anonKey, options);
  const email = `tools-${label}-${crypto.randomUUID()}@enqidu.local`;
  const { user } = requireResult(await adminDb.auth.admin.createUser({ email, password: TOOLS_PASSWORD, email_confirm: true }), "create local user");
  const insert = async (table, values) => {
    // Only the test fixture owns table names/privileged inserts; no consumer input enters here.
    if (Array.isArray(values)) {
      const rows = [];
      for (const value of values) rows.push(...await insert(table, value));
      return rows;
    }
    return requireResult(await adminDb.from(table).insert(values).select(), `seed ${table}`);
  };
  await insert("profiles", { id: user.id, display_name: "Atleta Tools local", timezone: "Europe/Madrid", experience_level: "intermediate", primary_goal: "Fuerza sostenible", disciplines: ["strength"], usual_environment: ["home"] });
  await insert("user_training_locations", { user_id: user.id, display_name: "Casa", location_type: "home", access_mode: "own", prescription_scope: "autonomous", is_active: true });
  const { session } = requireResult(await db.auth.signInWithPassword({ email, password: TOOLS_PASSWORD }), "sign in local user");
  const now = new Date();
  const date = (offset = 0) => toolsDate(offset, now);
  if (health) {
    for (let offset = -14; offset <= 0; offset += 1) {
      const calendarDate = date(offset);
      const records = [
        ["daily_health", { resting_heart_rate_bpm: { value: offset ? 52 : 58, unit: "bpm" }, body_battery_current: { value: offset ? 75 : 35, unit: "score" }, average_stress_level: { value: 0, unit: "score" } }],
        ["hrv", { last_night_avg_ms: { value: offset ? 60 : 42, unit: "ms" } }],
        ["sleep", { total_duration_seconds: { value: offset ? 28800 : 25200, unit: "s" }, sleep_score: { value: offset ? 85 : 70, unit: "score" } }],
      ];
      for (const [dataType, measurements] of records) {
        const record = normalizeGarminHealthRecord({ provider: "garmin", provider_mode: "aggregator", data_confidence: "reported", ingestion_channel: "fitness_ai_connector", data_type: dataType, calendar_date: calendarDate, timezone: "Europe/Madrid", retrieved_at: `${calendarDate}T08:00:00.000Z`, measurements, raw: { provider_secret: TOOLS_SECRET_MARKER } });
        requireResult(await adminDb.rpc("ingest_garmin_health_record", { p_user_id: user.id, p_record: record }), "canonical local Health ingestion");
      }
    }
  }
  const identities = {};
  if (plans) {
    const [source] = await insert("training_sources", { user_id: user.id, source_type: "garmin_fit", provider: "garmin", file_name: "synthetic-tools.fit", raw_metadata: { original_fit_marker: TOOLS_SECRET_MARKER } });
    [identities.execution] = await insert("training_sessions", { user_id: user.id, source_id: source.id, title: "Lower Strength ejecutado", local_date: date(-1), session_date: date(-1), started_at: `${date(-1)}T10:00:00Z`, ended_at: `${date(-1)}T10:50:00Z`, duration_seconds: 3000, session_status: "completed", sport: "strength" });
    [identities.historicalPlan, identities.todayPlan, identities.futurePlan] = await insert("planned_training_sessions", [
      { user_id: user.id, planned_date: date(-1), title: "Lower Strength anterior", session_type: "strength", status: "planned", planned_duration_min: 50, planned_duration_max: 50, planned_intensity: "RPE 6-7", linked_completed_session_id: identities.execution.id, source: "enkidu_coach" },
      { user_id: user.id, planned_date: date(), title: "Fuerza vigente hoy", session_type: "strength", status: "planned", planned_duration_min: 40, planned_duration_max: 40, location_type: "home", source: "enkidu_coach" },
      { user_id: user.id, planned_date: date(1), title: "Lower Strength siguiente", session_type: "strength", status: "planned", planned_duration_min: 50, planned_duration_max: 50, location_type: "home", source: "enkidu_coach" },
    ]);
    await insert("planned_session_blocks", [
      { planned_session_id: identities.historicalPlan.id, block_order: 1, title: "Sentadilla", block_type: "strength", planned_duration_seconds: 3000, planned_exercises: [{ name: "Sentadilla", sets: 3, reps: 5, load_kg: 45 }] },
      { planned_session_id: identities.todayPlan.id, block_order: 1, title: "Fuerza", block_type: "strength", planned_duration_seconds: 2400 },
      { planned_session_id: identities.futurePlan.id, block_order: 1, title: "Fuerza principal", block_type: "strength", planned_duration_seconds: 3000 },
    ]);
    const [block] = await insert("session_blocks", { session_id: identities.execution.id, block_order: 1, title: "Sentadilla", name: "Sentadilla", block_type: "strength", duration_seconds: 3000, data_confidence: "reported" });
    await insert("session_exercises", { session_id: identities.execution.id, block_id: block.id, exercise_order: 1, name: "Sentadilla", reported_name: "Sentadilla", sets_completed: 3, reps_per_set: [5, 5, 5], load_value: 45, load_unit: "kg", data_confidence: "manual" });
    await insert("session_metrics", [
      { session_id: identities.execution.id, metric_code: "rpe_global", value_numeric: 9, metric_scope: "session", source_path: "chatgpt_session_correction", confidence: "manual" },
      { session_id: identities.execution.id, metric_code: "session_completion", value_text: "completed", metric_scope: "session", source_path: "chatgpt_session_correction", confidence: "manual" },
    ]);
    await insert("fit_message_payloads", { user_id: user.id, session_id: identities.execution.id, message_type: "session", message_index: 0, payload: { duration_seconds: 3000, original_fit_marker: TOOLS_SECRET_MARKER } });
  }
  const snapshot = async () => {
    const own = async (table) => requireResult(await adminDb.from(table).select("*").eq("user_id", user.id).order("id"), `snapshot ${table}`);
    const plans = await own("planned_training_sessions");
    const executions = await own("training_sessions");
    const children = async (table, key, ids) => ids.length ? requireResult(await adminDb.from(table).select("*").in(key, ids).order("id"), `snapshot ${table}`) : [];
    return { plans, blocks: await children("planned_session_blocks", "planned_session_id", plans.map((row) => row.id)), executions, fit: await own("fit_message_payloads"), sources: await own("training_sources"), metrics: await children("session_metrics", "session_id", executions.map((row) => row.id)), executionBlocks: await children("session_blocks", "session_id", executions.map((row) => row.id)), exercises: await children("session_exercises", "session_id", executions.map((row) => row.id)) };
  };
  return { db, adminDb, url, anonKey, user, email, token: session.access_token, now, date, identities, snapshot, insert,
    headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    async dispose() {
      await db.auth.signOut();
      // Foundation raw evidence rejects deletes by Auth's internal admin role.
      // Remove only this synthetic user's evidence with the local server client
      // before Auth cascades the remaining disposable rows.
      requireResult(await adminDb.from("wearable_provider_raw_payloads").delete().eq("user_id", user.id), "delete disposable local raw evidence");
      requireResult(await adminDb.auth.admin.deleteUser(user.id), "delete disposable local user");
    },
  };
}
