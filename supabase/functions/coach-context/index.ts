import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

type Scope = {
  type: "user" | "fixture";
  userId: string | null;
  fixtureUser: string | null;
};

const tableConfig = {
  coach_athlete_profiles: "id,user_id,fixture_user,display_name,profile_type,source_key,source_traceability,data_quality,updated_at",
  coach_athlete_training_goals: "id,user_id,fixture_user,goal_type,priority,description,source_key,source_traceability,data_quality,payload,updated_at",
  coach_athlete_constraints: "id,user_id,fixture_user,constraint_type,severity,description,active,source_key,source_traceability,data_quality,payload,updated_at",
  coach_equipment_locations: "id,user_id,fixture_user,location_id,location_type,label,source_key,source_traceability,data_quality,updated_at",
  coach_equipment_items: "id,user_id,fixture_user,item_id,category,name,quantity,unit,source_key,source_traceability,data_quality,updated_at",
  coach_context_sources: "id,user_id,fixture_user,source_key,source_type,role,source_traceability,data_quality,updated_at",
  coach_context_snapshots: "id,user_id,fixture_user,snapshot_type,schema_version,source_key,source_traceability,data_quality,updated_at",
  coach_session_fixtures: "id,user_id,fixture_user,source_key,session_date,title,sport,session_type,intent_type,location_type,source_traceability,data_quality,updated_at",
  coach_session_blocks: "id,user_id,fixture_user,source_key,block_index,block_type,title,source_traceability,data_quality,updated_at",
  coach_session_exercises: "id,user_id,fixture_user,source_key,exercise_index,name,category,source_traceability,data_quality,updated_at",
  coach_seed_runs: "id,seed_key,mode,fixture_user,status,result_summary,warnings,created_at,updated_at",
} as const;

function emptyContext(scope: Scope) {
  return {
    status: "empty",
    scope: {
      type: scope.type,
      fixture_user: scope.fixtureUser,
    },
    profile: null,
    goals: [],
    constraints: [],
    equipmentSummary: {
      locations: 0,
      items: 0,
      categories: [],
    },
    sourcesCount: 0,
    sessionsCount: 0,
    dataQuality: {
      warnings: ["coach_context_empty"],
    },
    traceability: {
      sourceKeys: [],
    },
  };
}

function errorContext(scope: Scope) {
  return {
    ...emptyContext(scope),
    status: "error",
    dataQuality: {
      warnings: ["coach_context_unavailable"],
    },
  };
}

function scopedQuery(db: any, table: keyof typeof tableConfig, scope: Scope) {
  let query = db.from(table).select(tableConfig[table]);
  if (scope.type === "fixture") {
    query = query.eq("fixture_user", scope.fixtureUser);
    if (table !== "coach_seed_runs") {
      query = query.is("user_id", null);
    }
  } else if (table !== "coach_seed_runs") {
    query = query.eq("user_id", scope.userId);
  } else {
    return null;
  }
  return query;
}

async function readRows(db: any, table: keyof typeof tableConfig, scope: Scope) {
  const query = scopedQuery(db, table, scope);
  if (!query) return [];
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

function firstGoal(goals: any[]) {
  const goal = goals[0];
  if (!goal) return null;
  return {
    priority: goal.priority || null,
    description: goal.description || null,
    source_key: goal.source_key || null,
  };
}

function compactContext(rows: Record<string, any[]>, scope: Scope) {
  const totalRows = Object.values(rows).reduce((sum, items) => sum + items.length, 0);
  if (!totalRows) return emptyContext(scope);

  const profile = rows.coach_athlete_profiles[0] || null;
  const equipmentItems = rows.coach_equipment_items || [];
  const categories = [...new Set(equipmentItems.map((item) => item.category).filter(Boolean))].sort();
  const sourceKeys = Object.values(rows)
    .flatMap((items) => items.map((item) => item.source_key || item.seed_key).filter(Boolean))
    .slice(0, 24);
  const warnings = Object.values(rows)
    .flatMap((items) => items.flatMap((item) => item.data_quality?.warnings || item.warnings || []))
    .filter(Boolean)
    .slice(0, 12);
  const updatedAt = Object.values(rows)
    .flatMap((items) => items.map((item) => item.updated_at).filter(Boolean))
    .sort()
    .at(-1) || null;

  return {
    status: "available",
    scope: {
      type: scope.type,
      fixture_user: scope.fixtureUser,
    },
    profile: profile ? {
      display_name: profile.display_name || null,
      profile_type: profile.profile_type || null,
      source_key: profile.source_key || null,
    } : null,
    goals: rows.coach_athlete_training_goals.map((goal) => ({
      priority: goal.priority || null,
      description: goal.description || null,
      source_key: goal.source_key || null,
    })),
    primaryGoal: firstGoal(rows.coach_athlete_training_goals),
    constraints: rows.coach_athlete_constraints.map((constraint) => ({
      type: constraint.constraint_type || null,
      description: constraint.description || null,
      active: Boolean(constraint.active),
      source_key: constraint.source_key || null,
    })),
    equipmentSummary: {
      locations: rows.coach_equipment_locations.length,
      items: equipmentItems.length,
      categories,
    },
    sourcesCount: rows.coach_context_sources.length,
    sessionsCount: rows.coach_session_fixtures.length,
    dataQuality: {
      warnings,
    },
    traceability: {
      sourceKeys,
      seedKeys: rows.coach_seed_runs.map((run) => run.seed_key).filter(Boolean),
    },
    updatedAt,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  let activeScope: Scope = { type: "user", userId: null, fixtureUser: null };

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return reply({ error: "auth_required" }, 401);

    const userDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const userId = (await userDb.auth.getUser()).data.user?.id;
    if (!userId) return reply({ error: "invalid_user" }, 401);

    const body = await req.json().catch(() => ({}));
    const fixtureUser = body.mode === "fixture_diagnostic" && body.fixture_user === "jotason"
      ? "jotason"
      : null;
    const scope: Scope = fixtureUser
      ? { type: "fixture", userId: null, fixtureUser }
      : { type: "user", userId, fixtureUser: null };
    activeScope = scope;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const db = fixtureUser && serviceKey
      ? createClient(Deno.env.get("SUPABASE_URL")!, serviceKey)
      : userDb;

    if (fixtureUser && !serviceKey) {
      return reply({
        ok: true,
        context: {
          ...emptyContext(scope),
          status: "empty",
          dataQuality: { warnings: ["fixture_diagnostic_service_role_unavailable"] },
        },
      });
    }

    const rows: Record<string, any[]> = {};
    for (const table of Object.keys(tableConfig) as Array<keyof typeof tableConfig>) {
      rows[table] = await readRows(db, table, scope);
    }

    return reply({ ok: true, context: compactContext(rows, scope) });
  } catch (error) {
    console.error(error);
    return reply({
      ok: true,
      context: errorContext(activeScope),
    });
  }
});
