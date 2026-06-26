import {
  COACH_CONTEXT_SCOPE,
  COACH_CONTEXT_STATUS,
  COACH_CONTEXT_TABLES,
  emptyCoachContextDto,
} from "./coachContextTypes.js";

const TABLE_CONFIG = {
  coach_athlete_profiles: {
    key: "profiles",
    select: "id,user_id,fixture_user,display_name,profile_type,product,source_key,source_traceability,data_quality,created_at,updated_at",
    order: ["created_at"],
  },
  coach_athlete_training_goals: {
    key: "goals",
    select: "id,athlete_profile_id,user_id,fixture_user,goal_type,priority,description,source_key,source_traceability,data_quality,payload,created_at,updated_at",
    order: ["created_at"],
  },
  coach_athlete_constraints: {
    key: "constraints",
    select: "id,athlete_profile_id,user_id,fixture_user,constraint_type,severity,description,active,source_key,source_traceability,data_quality,payload,created_at,updated_at",
    order: ["created_at"],
  },
  coach_equipment_locations: {
    key: "locations",
    select: "id,athlete_profile_id,user_id,fixture_user,location_id,location_type,label,constraints,source_key,source_traceability,data_quality,created_at,updated_at",
    order: ["location_type", "label"],
  },
  coach_equipment_items: {
    key: "items",
    select: "id,equipment_location_id,athlete_profile_id,user_id,fixture_user,item_id,category,name,quantity,unit,value,raw_path,source_key,source_traceability,data_quality,payload,created_at,updated_at",
    order: ["category", "name"],
  },
  coach_context_sources: {
    key: "sources",
    select: "id,user_id,fixture_user,source_key,source_type,raw_file,normalized_file,role,checksum,source_traceability,data_quality,created_at,updated_at",
    order: ["source_type", "source_key"],
  },
  coach_context_snapshots: {
    key: "snapshots",
    select: "id,athlete_profile_id,user_id,fixture_user,snapshot_type,schema_version,source_key,payload,source_traceability,data_quality,created_at,updated_at",
    order: ["created_at"],
  },
  coach_session_fixtures: {
    key: "sessions",
    select: "id,athlete_profile_id,user_id,fixture_user,source_key,session_date,title,sport,session_type,intent_type,location_type,duration_seconds,distance_meters,calories_total,raw_source_file,normalized_source_file,payload,source_traceability,data_quality,created_at,updated_at",
    order: ["session_date", "source_key"],
  },
  coach_session_blocks: {
    key: "blocks",
    select: "id,session_fixture_id,athlete_profile_id,user_id,fixture_user,source_key,block_index,block_type,title,payload,source_traceability,data_quality,created_at,updated_at",
    order: ["block_index", "source_key"],
  },
  coach_session_exercises: {
    key: "exercises",
    select: "id,session_fixture_id,block_id,athlete_profile_id,user_id,fixture_user,source_key,exercise_index,name,category,sets,metrics,payload,source_traceability,data_quality,created_at,updated_at",
    order: ["exercise_index", "source_key"],
  },
  coach_seed_runs: {
    key: "seed_runs",
    select: "id,seed_key,mode,fixture_user,status,input_plan,result_summary,warnings,created_at,updated_at",
    order: ["created_at"],
  },
};

export function resolveCoachContextScope({ userId = null, fixtureUser = null, allowFixture = false } = {}) {
  if (fixtureUser && !allowFixture) {
    return {
      type: COACH_CONTEXT_SCOPE.fixture,
      fixture_user: fixtureUser,
      user_id: null,
      blocked: true,
      reason: "fixture_scope_requires_backend_or_explicit_allowance",
    };
  }

  if (fixtureUser) {
    return {
      type: COACH_CONTEXT_SCOPE.fixture,
      fixture_user: fixtureUser,
      user_id: null,
      blocked: false,
      reason: null,
    };
  }

  if (userId) {
    return {
      type: COACH_CONTEXT_SCOPE.user,
      user_id: userId,
      fixture_user: null,
      blocked: false,
      reason: null,
    };
  }

  return {
    type: COACH_CONTEXT_SCOPE.empty,
    user_id: null,
    fixture_user: null,
    blocked: false,
    reason: "missing_scope",
  };
}

function applyScope(query, scope) {
  if (scope.type === COACH_CONTEXT_SCOPE.fixture) {
    return query.eq("fixture_user", scope.fixture_user).is("user_id", null);
  }
  if (scope.type === COACH_CONTEXT_SCOPE.user) {
    return query.eq("user_id", scope.user_id);
  }
  return query;
}

async function selectRows(db, table, scope) {
  const config = TABLE_CONFIG[table];
  let query = applyScope(db.from(table).select(config.select), scope);
  for (const column of config.order) query = query.order(column, { ascending: true, nullsFirst: false });
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message ?? error}`);
  return Array.isArray(data) ? data : [];
}

export function buildCoachContextDto(rowsByTable = {}, scope = {}) {
  const counts = Object.fromEntries(
    COACH_CONTEXT_TABLES.map((table) => [table, rowsByTable[table]?.length ?? 0]),
  );
  const totalRows = Object.values(counts).reduce((sum, count) => sum + count, 0);

  if (!totalRows) return emptyCoachContextDto(scope);

  const profiles = rowsByTable.coach_athlete_profiles ?? [];
  const dto = {
    ...emptyCoachContextDto(scope),
    status: COACH_CONTEXT_STATUS.available,
    profile: profiles[0] ?? null,
    goals: rowsByTable.coach_athlete_training_goals ?? [],
    constraints: rowsByTable.coach_athlete_constraints ?? [],
    equipment: {
      locations: rowsByTable.coach_equipment_locations ?? [],
      items: rowsByTable.coach_equipment_items ?? [],
    },
    sources: rowsByTable.coach_context_sources ?? [],
    snapshots: rowsByTable.coach_context_snapshots ?? [],
    sessions: rowsByTable.coach_session_fixtures ?? [],
    blocks: rowsByTable.coach_session_blocks ?? [],
    exercises: rowsByTable.coach_session_exercises ?? [],
    seed_runs: rowsByTable.coach_seed_runs ?? [],
    counts,
    data_quality: {
      warnings: [],
    },
    source_traceability: {
      source_keys: COACH_CONTEXT_TABLES.flatMap((table) =>
        (rowsByTable[table] ?? []).map((row) => row.source_key ?? row.seed_key).filter(Boolean),
      ),
    },
  };

  if (!dto.profile) dto.data_quality.warnings.push("coach_context_profile_missing");
  return dto;
}

export function createCoachContextRepository(db) {
  if (!db?.from) throw new Error("coach_context_repository_requires_supabase_like_client");

  return {
    async load({ userId = null, fixtureUser = null, allowFixture = false } = {}) {
      const scope = resolveCoachContextScope({ userId, fixtureUser, allowFixture });
      if (scope.blocked) {
        return {
          ...emptyCoachContextDto(scope),
          status: COACH_CONTEXT_STATUS.blocked,
          data_quality: { warnings: [scope.reason] },
        };
      }
      if (scope.type === COACH_CONTEXT_SCOPE.empty) return emptyCoachContextDto(scope);

      const rowsByTable = {};
      for (const table of COACH_CONTEXT_TABLES) rowsByTable[table] = await selectRows(db, table, scope);
      return buildCoachContextDto(rowsByTable, scope);
    },
  };
}
