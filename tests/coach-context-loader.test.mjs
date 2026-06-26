import assert from "node:assert/strict";
import test from "node:test";

import {
  COACH_CONTEXT_STATUS,
  buildCoachContextDto,
  createCoachContextRepository,
  loadCoachContext,
} from "../src/coachContext/index.js";

function makeQuery(rows, table, calls) {
  const filters = [];
  const query = {
    select(columns) {
      calls.push({ table, action: "select", columns });
      return query;
    },
    eq(column, value) {
      filters.push({ column, value, type: "eq" });
      return query;
    },
    is(column, value) {
      filters.push({ column, value, type: "is" });
      return query;
    },
    order(column) {
      calls.push({ table, action: "order", column });
      return query;
    },
    then(resolve) {
      const filtered = rows.filter((row) =>
        filters.every((filter) => (
          filter.type === "eq"
            ? row[filter.column] === filter.value
            : row[filter.column] === filter.value
        )),
      );
      return Promise.resolve({ data: filtered, error: null }).then(resolve);
    },
  };
  return query;
}

function makeClient(rowsByTable) {
  const calls = [];
  return {
    calls,
    from(table) {
      return makeQuery(rowsByTable[table] ?? [], table, calls);
    },
  };
}

test("coach context loader returns controlled empty DTO without scope", async () => {
  const dto = await loadCoachContext(makeClient({}));

  assert.equal(dto.status, COACH_CONTEXT_STATUS.empty);
  assert.equal(dto.product, "ENQIDU");
  assert.equal(dto.profile, null);
  assert.deepEqual(dto.sessions, []);
  assert.match(dto.data_quality.warnings.join(","), /coach_context_empty/);
});

test("coach context repository blocks fixture reads unless explicitly allowed", async () => {
  const repo = createCoachContextRepository(makeClient({}));
  const dto = await repo.load({ fixtureUser: "jotason" });

  assert.equal(dto.status, COACH_CONTEXT_STATUS.blocked);
  assert.match(dto.data_quality.warnings.join(","), /fixture_scope_requires_backend/);
});

test("coach context loader builds stable fixture DTO with traceability", async () => {
  const db = makeClient({
    coach_athlete_profiles: [
      {
        id: "profile-1",
        user_id: null,
        fixture_user: "jotason",
        display_name: "Jotason",
        profile_type: "fixture",
        source_key: "jotason:athlete_profile",
        source_traceability: { normalized_file: "docs/coach-context/normalized/jotason/athlete-context.normalized.json" },
        data_quality: {},
      },
    ],
    coach_context_sources: [
      {
        id: "source-1",
        user_id: null,
        fixture_user: "jotason",
        source_key: "jotason:normalized_json:demo",
        source_type: "normalized_json",
        source_traceability: {},
        data_quality: {},
      },
    ],
    coach_session_fixtures: [
      {
        id: "session-1",
        user_id: null,
        fixture_user: "jotason",
        source_key: "jotason:session:demo",
        title: "Demo",
        data_quality: {},
        source_traceability: {},
      },
    ],
  });

  const dto = await loadCoachContext(db, { fixtureUser: "jotason", allowFixture: true });

  assert.equal(dto.status, COACH_CONTEXT_STATUS.available);
  assert.equal(dto.scope.type, "fixture");
  assert.equal(dto.scope.fixture_user, "jotason");
  assert.equal(dto.profile.display_name, "Jotason");
  assert.equal(dto.sources.length, 1);
  assert.equal(dto.sessions.length, 1);
  assert.equal(dto.counts.coach_athlete_profiles, 1);
  assert.ok(dto.source_traceability.source_keys.includes("jotason:athlete_profile"));
  assert.ok(db.calls.every((call) => !/garmin|fit|training_sessions/i.test(call.table)));
});

test("coach context DTO handles row maps without crashing", () => {
  const dto = buildCoachContextDto({
    coach_athlete_profiles: [],
    coach_session_fixtures: [],
  }, { type: "user", user_id: "user-1" });

  assert.equal(dto.status, COACH_CONTEXT_STATUS.empty);
  assert.equal(dto.scope.user_id, "user-1");
});

test("coach context loader handles Supabase errors as controlled error DTO", async () => {
  const db = {
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        then(resolve) {
          return Promise.resolve({ data: null, error: { message: `${table} unavailable` } }).then(resolve);
        },
      };
    },
  };

  const dto = await loadCoachContext(db, { userId: "user-1" });

  assert.equal(dto.status, COACH_CONTEXT_STATUS.error);
  assert.match(dto.error, /coach_athlete_profiles unavailable/);
  assert.match(dto.data_quality.warnings.join(","), /coach_context_load_failed/);
});

test("coach context loader skips seed runs for real user scope", async () => {
  const db = makeClient({
    coach_athlete_profiles: [
      {
        id: "profile-1",
        user_id: "user-1",
        fixture_user: null,
        display_name: "User",
        source_key: "user:athlete_profile",
      },
    ],
    coach_seed_runs: [
      {
        id: "seed-1",
        fixture_user: "jotason",
        seed_key: "coach_context_jotason_fixture_v1",
      },
    ],
  });

  const dto = await loadCoachContext(db, { userId: "user-1" });

  assert.equal(dto.status, COACH_CONTEXT_STATUS.available);
  assert.equal(dto.seed_runs.length, 0);
  assert.ok(!db.calls.some((call) => call.table === "coach_seed_runs" && call.action === "select"));
});
