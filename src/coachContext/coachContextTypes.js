export const COACH_CONTEXT_SCOPE = Object.freeze({
  user: "user",
  fixture: "fixture",
  empty: "empty",
});

export const COACH_CONTEXT_STATUS = Object.freeze({
  available: "available",
  empty: "empty",
  blocked: "blocked",
  error: "error",
});

export const COACH_CONTEXT_TABLES = Object.freeze([
  "coach_athlete_profiles",
  "coach_athlete_training_goals",
  "coach_athlete_constraints",
  "coach_equipment_locations",
  "coach_equipment_items",
  "coach_context_sources",
  "coach_context_snapshots",
  "coach_session_fixtures",
  "coach_session_blocks",
  "coach_session_exercises",
  "coach_seed_runs",
]);

export function emptyCoachContextDto(scope = {}) {
  return {
    product: "ENQIDU",
    status: COACH_CONTEXT_STATUS.empty,
    scope: {
      type: scope.type ?? COACH_CONTEXT_SCOPE.empty,
      user_id: scope.user_id ?? null,
      fixture_user: scope.fixture_user ?? null,
    },
    profile: null,
    goals: [],
    constraints: [],
    equipment: {
      locations: [],
      items: [],
    },
    sources: [],
    snapshots: [],
    sessions: [],
    blocks: [],
    exercises: [],
    seed_runs: [],
    counts: Object.fromEntries(COACH_CONTEXT_TABLES.map((table) => [table, 0])),
    data_quality: {
      warnings: ["coach_context_empty"],
    },
    source_traceability: {},
  };
}
