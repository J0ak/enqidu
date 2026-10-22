import { createClient } from "@supabase/supabase-js";
import { toolError } from "../enqiduTools/errors.js";

// Capability facade over the existing server credential: no mutations, raw payload tables,
// arbitrary RPC, Auth admin or credential-bearing client properties reach the tool runtime.
const tables = new Set([
  "profiles",
  "exercise_catalog",
  "sport_modalities",
  "equipment_catalog",
  "training_sessions",
  "session_blocks",
  "session_exercises",
  "session_metrics",
  "training_sources",
  "planned_training_sessions",
  "planned_session_blocks",
  "training_availability_overrides",
  "weekly_plans",
  "coach_athlete_constraints",
  "user_training_locations",
  "user_equipment",
  "daily_coach_events",
  "wearable_health_daily",
  "wearable_sleep_sessions",
  "wearable_hrv_nightly_summaries",
  "wearable_health_imports",
  "wearable_body_battery_samples",
  "wearable_hrv_nightly_samples",
  "user_wearable_connections",
  "block_items",
  "item_exercises",
  "performed_sets",
]);
// Catalogs are shared; child tables are reachable only through the canonical
// owned-parent traversal. Every directly owned table is also scoped by this facade.
const parentScopedChildren = new Set([
  "session_blocks",
  "session_exercises",
  "session_metrics",
  "planned_session_blocks",
  "block_items",
  "item_exercises",
  "performed_sets",
]);
const sharedCatalogs = new Set([
  "exercise_catalog",
  "sport_modalities",
  "equipment_catalog",
]);
const methods = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is",
  "not",
  "or",
  "order",
  "limit",
  "range",
  "maybeSingle",
  "single",
];
function readQuery(query) {
  const facade = { then: query.then.bind(query) };
  for (const name of methods)
    if (typeof query[name] === "function")
      facade[name] = (...args) => readQuery(query[name](...args));
  return Object.freeze(facade);
}
export function readOnlyDataPlane(raw, userId) {
  if (typeof userId !== "string" || !userId) throw toolError("invalid_user");
  return Object.freeze({
    from(table) {
      if (!tables.has(table)) throw toolError("canonical_read_unavailable");
      return Object.freeze({
        select: (...args) => {
          let query = raw.from(table).select(...args);
          if (table === "profiles") query = query.eq("id", userId);
          else if (
            !sharedCatalogs.has(table) &&
            !parentScopedChildren.has(table)
          )
            query = query.eq("user_id", userId);
          return readQuery(query);
        },
      });
    },
    async rpc(name, args) {
      if (name === "get_ai_coach_context" && args.p_user_id === userId)
        return raw.rpc(name, args);
      if (
        name === "read_training_semantics_v1" &&
        Object.keys(args).join() === "p_session_id"
      ) {
        const parent = await raw
          .from("training_sessions")
          .select("id,user_id")
          .eq("user_id", userId)
          .eq("id", args.p_session_id)
          .limit(1);
        if (parent.error) throw toolError("canonical_read_unavailable");
        if (
          !parent.data?.some(
            (s) => s.id === args.p_session_id && s.user_id === userId,
          )
        )
          return { data: null, error: null };
        // Only this service-only adapter differs; the canonical state function is unchanged.
        return raw.rpc("read_training_semantics_for_mcp_v1", {
          p_user_id: userId,
          p_session_id: args.p_session_id,
        });
      }
      throw toolError("canonical_read_unavailable");
    },
  });
}
export function createRemoteDataPlane(
  config,
  userId,
  clientFactory = createClient,
) {
  const raw = clientFactory(config.supabaseUrl, config.dataKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return readOnlyDataPlane(raw, userId);
}
