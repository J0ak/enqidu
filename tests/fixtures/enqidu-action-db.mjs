export const ACTION_DATE = "2026-10-05";
export const ACTION_NOW = "2026-10-05T12:00:00.000Z";
export const ACTION_USER = "10000000-0000-4000-8000-000000000001";
export const OTHER_USER = "10000000-0000-4000-8000-000000000002";
export const ACTION_PLAN = "20000000-0000-4000-8000-000000000001";
export const ACTION_BLOCK = "30000000-0000-4000-8000-000000000001";

export function actionDatabase({ action = "adapt_duration", owner = ACTION_USER, empty = false } = {}) {
  const calls = [];
  const state = {
    profiles: [{ id: ACTION_USER, timezone: "Europe/Madrid" }, { id: OTHER_USER, timezone: "America/Los_Angeles" }],
    planned_training_sessions: empty ? [] : [{
      id: ACTION_PLAN, user_id: owner, planned_date: ACTION_DATE, title: "Lower Strength", status: "planned",
      session_type: "strength", source: "enkidu_coach", linked_completed_session_id: null, location_type: "outdoor",
      planned_duration_min: 50, planned_duration_max: 50, planned_intensity: "moderada", objective: "Fuerza general",
      created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
    }],
    planned_session_blocks: empty ? [] : [{
      id: ACTION_BLOCK, planned_session_id: ACTION_PLAN, block_order: 1, title: "Main", planned_duration_seconds: 3000,
      block_type: "strength", objective: "Controlled repetitions", planned_rounds: 3,
      planned_exercises: [{ name: "Squat", target_sets: 3, target_reps: 8 }], constraints: ["No impact"], notes: "Move slowly",
    }],
    training_availability_overrides: action === "adapt_remaining_week" ? [{
      user_id: owner, calendar_date: ACTION_DATE, availability_status: "unavailable", source: "coach_explicit",
    }] : [],
    coach_athlete_constraints: [], training_sessions: [], session_blocks: [], session_metrics: [], weekly_plans: [],
    user_training_locations: [{ id: "50000000-0000-4000-8000-000000000001", user_id: ACTION_USER,
      display_name: "Home", location_type: "home", access_mode: "independent", prescription_scope: "autonomous",
      coached_sessions_available: false, is_active: true }],
    user_equipment: [{ id: "50000000-0000-4000-8000-000000000002", user_id: ACTION_USER,
      equipment_id: "50000000-0000-4000-8000-000000000003", quantity: 2, unit: "piece", location_label: "home", available: true }],
    equipment_catalog: [{ id: "50000000-0000-4000-8000-000000000003", name: "Dumbbells", equipment_category: "free_weights", unit: "piece" }],
    wearable_health_daily: [], wearable_sleep_sessions: [], wearable_hrv_nightly_summaries: [], wearable_health_imports: [],
    wearable_body_battery_samples: [], wearable_hrv_nightly_samples: [],
  };
  const context = {
    athlete_context: {
      athlete: { display_name: "Local athlete" }, goals: [{ name: "Improve strength", active: true }],
      equipment_summary: [{ name: "Dumbbells", location: "home", available: true }],
      equipment: [{ name: "Dumbbells", location: "home", available: true }], constraints: [],
    }, training_period: { sessions: [] },
  };
  function from(table) {
    calls.push({ type: "read", table });
    const filters = [];
    const orders = [];
    let max = Infinity, offset = 0, count = false;
    const query = {
      select(_columns, options = {}) { count = options.count === "exact"; return query; },
      eq(column, value) { filters.push((row) => row[column] === value); return query; },
      neq(column, value) { filters.push((row) => row[column] !== value); return query; },
      gte(column, value) { filters.push((row) => row[column] >= value); return query; },
      lte(column, value) { filters.push((row) => row[column] <= value); return query; },
      lt(column, value) { filters.push((row) => row[column] < value); return query; },
      in(column, values) { filters.push((row) => values.includes(row[column])); return query; },
      order(column, options = {}) { orders.push([column, options.ascending !== false]); return query; },
      limit(value) { max = Math.min(max, value); return query; },
      range(first, last) { offset = first; max = last - first + 1; return query; },
      then(resolve, reject) {
        let result = (state[table] || []).filter((row) => filters.every((filter) => filter(row)));
        result = [...result].sort((a, b) => {
          for (const [key, ascending] of orders) {
            const delta = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
            if (delta) return ascending ? delta : -delta;
          }
          return 0;
        });
        return Promise.resolve({ data: structuredClone(result.slice(offset, offset + max)), error: null,
          ...(count ? { count: result.length } : {}),
        }).then(resolve, reject);
      },
    };
    return query;
  }
  const db = {
    auth: { async getUser() { return { data: { user: { id: ACTION_USER } }, error: null }; } },
    from,
    async rpc(name, args) {
      calls.push({ type: "read_rpc", name, args: structuredClone(args) });
      if (name === "get_ai_coach_context") return { data: structuredClone(context), error: null };
      return { data: null, error: { message: "unexpected read RPC" } };
    },
  };
  const adminDb = {
    async rpc(name, args) {
      calls.push({ type: "write_rpc", name, args: structuredClone(args) });
      // Transport fixture only. Actual compare/locks/writer behavior is covered
      // by the PostgreSQL acceptance and concurrent transaction suites.
      if (name === "apply_enqidu_action_v1") {
        const command = args.p_command;
        const userId = args.p_user_id;
        if (args.p_action === "move_session") {
          name = "move_coach_planned_session";
          args = { p_user_id: userId, p_source_date: command.sourceDate, p_target_date: command.targetDate };
        } else if (args.p_action === "adapt_remaining_week") {
          name = "adapt_coach_remaining_week";
          args = { p_user_id: userId, p_moves: command.moves };
        } else {
          const names = { adapt_duration: "adapt_coach_planned_session_duration", adapt_environment: "adapt_coach_planned_session_environment",
            cancel_session: "cancel_coach_planned_session" };
          name = names[args.p_action];
          args = { p_user_id: userId, p_planned_session_id: command.sessionId, p_duration_minutes: command.duration,
            p_blocks: command.blocks, p_session: command.session };
        }
      }
      const plan = state.planned_training_sessions.find((row) => row.user_id === args.p_user_id
        && (args.p_planned_session_id ? row.id === args.p_planned_session_id : row.planned_date === args.p_source_date));
      if (name === "adapt_coach_remaining_week") {
        // Mock the existing RPC's validation-before-write contract, not its SQL.
        const moves = args.p_moves.map((move) => ({ move, plan: state.planned_training_sessions.find((row) =>
          row.id === move.planned_session_id && row.user_id === args.p_user_id && row.planned_date === move.source_date) }));
        if (moves.some(({ plan: target }) => !target || target.linked_completed_session_id)) return { data: { ok: false, error: "source_plan_not_found" }, error: null };
        moves.forEach(({ move, plan: target }) => { target.planned_date = move.target_date; target.status = "rescheduled"; });
        return { data: { ok: true, moved_count: moves.length }, error: null };
      }
      if (!plan) return { data: { ok: false, error: "source_plan_not_found" }, error: null };
      if (plan.linked_completed_session_id) return { data: { ok: false, error: "source_plan_already_completed" }, error: null };
      if (name === "move_coach_planned_session") { plan.planned_date = args.p_target_date; plan.status = "rescheduled"; }
      else if (name === "cancel_coach_planned_session") plan.status = "cancelled";
      else if (name === "adapt_coach_planned_session_duration") {
        plan.planned_duration_min = plan.planned_duration_max = args.p_duration_minutes; plan.status = "modified";
        for (const block of args.p_blocks) state.planned_session_blocks.find((row) => row.id === block.id).planned_duration_seconds = block.duration_seconds;
      } else if (name === "adapt_coach_planned_session_environment") {
        const replacement = args.p_session;
        Object.assign(plan, { title: replacement.title, status: "modified", session_type: replacement.session_type,
          location_type: replacement.environment, planned_duration_min: replacement.duration_minutes,
          planned_duration_max: replacement.duration_minutes, planned_intensity: replacement.intensity, objective: replacement.objective });
        state.planned_session_blocks = state.planned_session_blocks.filter((row) => row.planned_session_id !== plan.id)
          .concat(replacement.blocks.map((block, index) => ({ id: `block-new-${index}`, planned_session_id: plan.id,
            block_order: index + 1, title: block.title, planned_duration_seconds: block.duration_minutes * 60 })));
      } else return { data: null, error: { message: "unexpected write RPC" } };
      return { data: { ok: true, planned_session_id: plan.id }, error: null };
    },
  };
  return { db, adminDb, state, context, calls };
}
