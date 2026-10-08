import assert from "node:assert/strict";

export const TOOL_USER_A = "10000000-0000-4000-8000-000000000001";
export const TOOL_USER_B = "10000000-0000-4000-8000-000000000002";
export const toolId = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const TOOL_NOW = "2026-10-05T10:00:00.000Z";
export const TOOL_CALENDAR = { date: "2026-10-05", timezone: "Europe/Madrid" };

/** Fixed canonical contract fixture. Mutations are deliberately absent from the read client. */
export function createToolsDb({ userId = TOOL_USER_A, empty = false } = {}) {
  const provenance = { provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector", data_confidence: "observed" };
  const plan = (n, date, patch = {}) => ({ id: toolId(n), user_id: TOOL_USER_A, planned_date: date, planned_time: null, title: "Lower Strength", session_type: "strength", status: "planned", location_type: "home", planned_intensity: "RPE 7-8", planned_duration_min: 50, planned_duration_max: 50, objective: "Strength", source: "enkidu_coach", linked_completed_session_id: null, ...patch });
  const block = (n, plannedId) => ({ id: toolId(n), planned_session_id: plannedId, block_order: 1, block_type: "strength", title: "Strength", objective: null, planned_duration_seconds: 3000, planned_rounds: null, planned_exercises: [{ name: "Squat", target_sets: 3, target_reps: "5", load: "40 kg" }] });
  const dates = ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];
  const execution = { id: toolId(20), user_id: TOOL_USER_A, title: "Lower Strength", local_date: "2026-10-03", started_at: "2026-10-03T08:00:00Z", ended_at: "2026-10-03T08:50:00Z", session_status: "completed", source_id: toolId(30), sport: "strength", activity_type: "strength", duration_seconds: 3000, moving_duration_seconds: 2400, distance_meters: null, elevation_gain_meters: null, calories_total: 300, average_heart_rate: 115, max_heart_rate: 160, training_load: 50, raw_provider_payload: { secret: "RAW_SECRET" } };
  const tables = {
    profiles: [{ id: TOOL_USER_A, timezone: "Europe/Madrid" }, { id: TOOL_USER_B, timezone: "America/Los_Angeles" }],
    planned_training_sessions: [plan(1, "2026-10-03", { status: "completed", linked_completed_session_id: execution.id }), plan(2, "2026-10-05"), plan(3, "2026-10-06"), plan(4, "2026-10-06", { user_id: TOOL_USER_B, title: "FOREIGN_SECRET" })],
    planned_session_blocks: [block(11, toolId(1)), block(12, toolId(2)), block(13, toolId(3)), block(14, toolId(4))],
    training_availability_overrides: [{ user_id: TOOL_USER_A, calendar_date: "2026-10-07", availability_status: "unavailable", source: "user" }],
    weekly_plans: [{ id: toolId(40), user_id: TOOL_USER_A, week_start: "2026-10-05", weekly_focus: "Strength", updated_at: TOOL_NOW }],
    coach_athlete_constraints: [{ user_id: TOOL_USER_A, constraint_type: "schedule", severity: "low", description: "50 minutes", active: true }, { user_id: TOOL_USER_B, description: "FOREIGN_SECRET", active: true }],
    user_training_locations: [{ id: toolId(50), user_id: TOOL_USER_A, display_name: "Home", location_type: "home", access_mode: "independent", prescription_scope: "autonomous", coached_sessions_available: false, is_active: true }],
    user_equipment: [{ id: toolId(51), user_id: TOOL_USER_A, equipment_id: toolId(52), location_label: "home", available: true }],
    equipment_catalog: [{ id: toolId(52), name: "Dumbbell", equipment_category: "free_weights", unit: "piece" }],
    training_sessions: [execution, { ...execution, id: toolId(21), user_id: TOOL_USER_B, title: "FOREIGN_SECRET" }],
    session_blocks: [{ id: toolId(22), session_id: execution.id, block_order: 1, name: "Strength", block_type: "strength", duration_seconds: 3000, rounds_completed: null, prescription: {}, data_confidence: "observed" }],
    session_exercises: [{ id: toolId(23), session_id: execution.id, block_id: toolId(22), exercise_order: 1, reported_name: "Squat", sets_completed: 3, reps_per_set: [5, 5, 4], load_value: 40, load_unit: "kg", side: "bilateral", data_confidence: "observed" }],
    session_metrics: [{ id: toolId(24), session_id: execution.id, metric_code: "rpe_global", value_numeric: 9, value_text: null, unit: "RPE", metric_scope: "session", source_path: "chatgpt_session_correction", confidence: "manual" }, { id: toolId(25), session_id: execution.id, metric_code: "session_completion", value_numeric: null, value_text: "completed", unit: null, metric_scope: "session", source_path: "chatgpt_session_correction", confidence: "manual" }, { id: toolId(26), session_id: execution.id, metric_code: "provider_secret", value_numeric: 9, value_text: "RAW_SECRET", unit: null, metric_scope: "session" }],
    training_sources: [{ id: toolId(30), user_id: TOOL_USER_A, source_type: "garmin_fit", raw_metadata: { secret: "RAW_SECRET" } }],
    block_items: [], item_exercises: [], performed_sets: [],
    wearable_health_daily: dates.map((calendar_date, index) => ({ id: `daily-${index}`, user_id: TOOL_USER_A, calendar_date, ...provenance, resting_heart_rate_bpm: 55, average_stress_level: 25, body_battery_current: 70, spo2_avg_pct: 98, respiration_avg_brpm: 14, updated_at: TOOL_NOW, raw_payload: "RAW_SECRET" })),
    wearable_sleep_sessions: dates.map((calendar_date, index) => ({ id: `sleep-${index}`, user_id: TOOL_USER_A, calendar_date, ...provenance, total_duration_seconds: 28000, sleep_score: 85, hrv_last_night_avg_ms: 50, updated_at: TOOL_NOW, raw_payload: "RAW_SECRET" })),
    wearable_hrv_nightly_summaries: dates.map((calendar_date, index) => ({ id: `hrv-${index}`, user_id: TOOL_USER_A, calendar_date, ...provenance, last_night_avg_ms: 50, updated_at: TOOL_NOW })),
    wearable_hrv_nightly_samples: [{ id: "hrv-sample", user_id: TOOL_USER_A, hrv_summary_id: "hrv-9", hrv_ms: 50, recorded_at: "2026-10-05T05:00:00Z" }],
    wearable_body_battery_samples: [{ id: "battery-sample", user_id: TOOL_USER_A, ...provenance, body_battery_value: 75, recorded_at: "2026-10-05T08:00:00Z" }],
    wearable_health_imports: [],
  };
  if (empty) for (const name of Object.keys(tables)) if (name !== "profiles") tables[name] = [];
  const calls = [];
  const db = {
    auth: { async getUser() { calls.push({ auth: true }); return { data: { user: userId ? { id: userId } : null }, error: null }; } },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      assert.equal(name, "get_ai_coach_context");
      assert.equal(args.p_user_id, userId);
      return { error: null, data: { athlete_context: empty ? {} : { athlete: { display_name: "Athlete", experience_level: "intermediate", primary_goal: "strength", private_notes: "RAW_SECRET" }, goals: [{ name: "Strength", priority: 1, payload: "RAW_SECRET" }], constraints: [{ display_name: "Home", location_type: "home", access_mode: "independent", prescription_scope: "autonomous", coached_sessions_available: false, is_active: true }], equipment: [{ name: "Dumbbell", category: "free_weights", location: "home", available: true, payload: "RAW_SECRET" }] } } };
    },
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
      const filters = [], sorts = [];
      let maximum = Infinity, start = 0, head = false;
      const call = { table, filters: [] };
      calls.push(call);
      const add = (key, op, value, predicate) => { call.filters.push({ key, op, value }); filters.push(predicate); return query; };
      const query = {
        select(columns, options) { call.select = columns; head = options?.head === true; return query; },
        eq(key, value) { return add(key, "eq", value, (row) => row[key] === value); },
        neq(key, value) { return add(key, "neq", value, (row) => row[key] !== value); },
        gte(key, value) { return add(key, "gte", value, (row) => row[key] >= value); },
        lte(key, value) { return add(key, "lte", value, (row) => row[key] <= value); },
        lt(key, value) { return add(key, "lt", value, (row) => row[key] < value); },
        in(key, values) { return add(key, "in", values, (row) => values.includes(row[key])); },
        order(key, { ascending = true } = {}) { sorts.push({ key, ascending }); return query; },
        limit(value) { maximum = value; return query; },
        range(from, to) { start = from; maximum = to - from + 1; return query; },
        then(resolve, reject) {
          const results = tables[table].filter((row) => filters.every((filter) => filter(row))).sort((a, b) => {
            for (const { key, ascending } of sorts) { const comparison = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0; if (comparison) return ascending ? comparison : -comparison; }
            return 0;
          });
          return Promise.resolve({ data: head ? null : structuredClone(results.slice(start, start + maximum)), count: head ? results.length : undefined, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { db, tables, calls };
}
