import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadHealthIntelligence } from "../../../src/health/loadHealthIntelligence.js";
import { loadClosedLoopAssessments } from "../../../src/closedLoop/loadClosedLoopAssessments.js";
import { isValidTimeZone, resolveUserCalendar } from "../../../src/time/userCalendar.js";

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

function compactAiCoachContext(context: any) {
  const athleteContext = context?.athlete_context || {};
  const athlete = athleteContext?.athlete || {};
  const goals = Array.isArray(athleteContext?.goals) ? athleteContext.goals : [];
  const constraints = Array.isArray(athleteContext?.constraints) ? athleteContext.constraints : [];
  const equipment = Array.isArray(athleteContext?.equipment) ? athleteContext.equipment : [];
  const availableEquipment = equipment.filter((item: any) =>
    item && typeof item === "object" && (item.available === true || String(item.available).toLowerCase() === "true")
  );
  const locations = [...new Set(availableEquipment.map((item: any) => item.location).filter(Boolean))];
  const categories = [...new Set(availableEquipment.map((item: any) => item.category || item.type).filter(Boolean))].sort();
  const sessionsCount = Number(context?.training_period?.summary?.sessions_count || 0);
  const hasContext = Boolean(
    athlete?.display_name
    || goals.length
    || constraints.length
    || availableEquipment.length
    || sessionsCount
    || ["available", "partial"].includes(context?.health_recovery?.status)
  );
  const normalizedGoals = goals.map((goal: any) => ({
    priority: goal.priority ?? null,
    description: goal.name || goal.description || null,
    source_key: null,
  }));
  const normalizedConstraints = constraints.map((constraint: any) => ({
    type: constraint.constraint_type || constraint.type || null,
    description: constraint.description || constraint.name || null,
    active: constraint.active !== false,
    source_key: null,
  }));

  return {
    context_version: context?.context_version || "ai_context_v1",
    request: context?.request || {},
    status: hasContext ? "available" : "empty",
    scope: {
      type: "user",
      fixture_user: null,
    },
    profile: athlete?.display_name ? {
      display_name: athlete.display_name,
      profile_type: "user",
      source_key: null,
    } : null,
    goals: normalizedGoals,
    primaryGoal: normalizedGoals[0] || null,
    constraints: normalizedConstraints,
    equipmentSummary: {
      locations: locations.length,
      items: availableEquipment.length,
      categories,
    },
    sourcesCount: 0,
    sessionsCount,
    dataQuality: context?.data_quality || { warnings: [] },
    traceability: {
      sourceKeys: ["get_ai_coach_context"],
    },
    updatedAt: null,
    health_recovery: context?.health_recovery || {},
    readiness: context?.readiness || null,
    closed_loop_assessments: context?.closed_loop_assessments || [],
    cardContext: {
      request: context?.request || {},
      training_period: context?.training_period || {},
      health_recovery: context?.health_recovery || {},
      readiness: context?.readiness || null,
      closed_loop_assessments: context?.closed_loop_assessments || [],
      athlete_context: {
        equipment: availableEquipment,
      },
    },
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

    if (!fixtureUser) {
      const profileResult = await userDb.from("profiles").select("timezone").eq("id", userId).limit(1);
      if (profileResult.error) throw profileResult.error;
      const timezone = profileResult.data?.[0]?.timezone || null;
      if (!isValidTimeZone(timezone)) return reply({ error: "profile_timezone_required" }, 400);
      const calendar = resolveUserCalendar({
        explicitDate: body.date || null,
        explicitDateSource: body.date ? "explicit" : null,
        profileTimezone: timezone,
        now: new Date(),
      });
      if (!calendar.ok || !calendar.date) return reply({ error: calendar.error || "invalid_calendar" }, 400);
      const contextResult = await userDb.rpc("get_ai_coach_context", {
        p_user_id: userId,
        p_date: calendar.date,
        p_mode: body.context_mode || "today_coach",
        p_from_date: body.from_date || null,
        p_to_date: body.to_date || null,
        p_session_id: body.session_id || null,
      });
      if (contextResult.error) throw contextResult.error;
      const canonical = contextResult.data || {};
      canonical.request = {
        ...(canonical.request || {}),
        date: calendar.date,
        calendar_timezone: calendar.timezone,
        date_source: calendar.source,
      };
      canonical.health_recovery = await loadHealthIntelligence(userDb, {
        userId,
        calendarDate: calendar.date,
        timezone: calendar.timezone,
        generatedAt: new Date().toISOString(),
      });
      canonical.readiness = canonical.health_recovery.readiness;
      canonical.closed_loop_assessments = await loadClosedLoopAssessments(userDb, {
        userId,
        calendarDate: calendar.date,
        timezone: calendar.timezone,
        generatedAt: canonical.health_recovery.generated_at,
        sessionId: body.session_id || null,
        fromDate: body.from_date || null,
        toDate: body.to_date || null,
      });
      return reply({ ok: true, context: compactAiCoachContext(canonical) });
    }

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
