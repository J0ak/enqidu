import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadHealthIntelligence } from "../src/health/loadHealthIntelligence.js";
import { buildPersonalBaseline, calculateReadiness, READINESS_ALGORITHM_VERSION } from "../src/health/readinessV1.js";
import { assessClosedLoop } from "../src/closedLoop/closedLoopAssessment.js";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const DATE = "2026-10-05";
const CANARY = "provider-secret-canary-never-public";
const provenance = { provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector" };
const owned = (userId, values) => ({ user_id: userId, calendar_date: DATE, ...provenance, ...values, raw_payload: { access_token: CANARY }, source_asset_metadata: { credentials: CANARY } });

// A query-capable fake verifies the public read boundary, including ownership
// and date predicates, instead of matching the loader's source text alone.
function readOnlyDb(tables = {}, { errorTable = null, ignoreOwnership = false } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, select: null, selectOptions: null, filters: [], orders: [], limit: null, range: null };
      calls.push(call);
      const query = {
        select(columns, options) { call.select = columns; call.selectOptions = options; return this; },
        eq(column, value) { call.filters.push(["eq", column, value]); return this; },
        neq(column, value) { call.filters.push(["neq", column, value]); return this; },
        gte(column, value) { call.filters.push(["gte", column, value]); return this; },
        lte(column, value) { call.filters.push(["lte", column, value]); return this; },
        gt(column, value) { call.filters.push(["gt", column, value]); return this; },
        lt(column, value) { call.filters.push(["lt", column, value]); return this; },
        in(column, value) { call.filters.push(["in", column, value]); return this; },
        order(column, options) { call.orders.push([column, options]); return this; },
        limit(value) { call.limit = value; return this; },
        range(from, to) { call.range = [from, to]; return this; },
        then(resolve, reject) {
          if (table === errorTable) return Promise.resolve({ data: null, error: { message: "blocked_database_failure" } }).then(resolve, reject);
          let rows = structuredClone(tables[table] || []);
          for (const [operator, column, value] of call.filters) {
            if (ignoreOwnership && column === "user_id") continue;
            rows = rows.filter((row) => {
              if (operator === "eq") return row[column] === value;
              if (operator === "neq") return row[column] !== value;
              if (operator === "gte") return row[column] >= value;
              if (operator === "lte") return row[column] <= value;
              if (operator === "gt") return row[column] > value;
              if (operator === "lt") return row[column] < value;
              return value.includes(row[column]);
            });
          }
          for (const [column, options] of call.orders.toReversed()) rows.sort((a, b) => String(a[column] || "").localeCompare(String(b[column] || "")) * (options?.ascending === false ? -1 : 1));
          const count = rows.length;
          if (call.limit != null) rows = rows.slice(0, call.limit);
          if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
          if (call.select && call.select !== "*") rows = rows.map((row) => Object.fromEntries(call.select.split(",").filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])));
          return Promise.resolve({ data: call.selectOptions?.head ? null : rows, count, error: null }).then(resolve, reject);
        },
      };
      for (const method of ["insert", "update", "upsert", "delete"]) query[method] = () => { throw new Error(`forbidden_mutation:${method}`); };
      return query;
    },
    rpc() { throw new Error("unexpected_rpc_boundary"); },
  };
}

const options = (userId = USER_A) => ({ userId, calendarDate: DATE, timezone: "Europe/Madrid", generatedAt: "2026-10-05T08:00:00Z" });
const healthOf = (result) => result.health_recovery || result;

test("health intelligence reads only allowlisted canonical columns inside owner and temporal bounds", async () => {
  const db = readOnlyDb({
    wearable_health_daily: [owned(USER_A, { body_battery_current: 0, average_stress_level: 0 }), owned(USER_B, { body_battery_current: 95 }), owned(USER_A, { calendar_date: "2026-10-06", body_battery_current: 100 })],
    wearable_sleep_sessions: [owned(USER_A, { sleep_score: 80, total_duration_seconds: 28000 }), owned(USER_B, { sleep_score: 30, total_duration_seconds: 14000 })],
  });
  const [resultA, resultB] = await Promise.all([loadHealthIntelligence(db, options(USER_A)), loadHealthIntelligence(db, options(USER_B))]);
  const healthA = healthOf(resultA);
  const healthB = healthOf(resultB);
  assert.equal(healthA.sleep.sleep_score ?? healthA.sleep.score, 80);
  assert.equal(healthB.sleep.sleep_score ?? healthB.sleep.score, 30);
  assert.equal(healthA.body_battery.current, 0);
  assert.equal(healthB.body_battery.current, 95);
  assert.doesNotMatch(JSON.stringify([resultA, resultB]), new RegExp(CANARY));
  assert.doesNotMatch(JSON.stringify([resultA, resultB]), /raw_payload|source_asset_metadata|access_token|credentials/);
  assert.ok(db.calls.length >= 6);
  for (const call of db.calls) {
    assert.match(call.table, /^wearable_/);
    assert.notEqual(call.table, "wearable_provider_raw_payloads");
    assert.ok(call.filters.some(([operator, column, value]) => operator === "eq" && column === "user_id" && [USER_A, USER_B].includes(value)), `${call.table} must be owner scoped`);
    assert.ok(call.filters.some(([operator, column]) => ["lt", "lte"].includes(operator) && ["calendar_date", "observation_date", "recorded_at"].includes(column)), `${call.table} must be date bounded`);
    assert.ok(call.select && !call.select.includes("*"), `${call.table} must select explicit columns`);
    assert.doesNotMatch(call.select, /raw_payload|source_asset_metadata|token|credential|secret/i);
  }
});

test("canonical row ownership is also verified before exposing returned metrics", async () => {
  const db = readOnlyDb({
    wearable_health_daily: [owned(USER_B, { body_battery_current: 99 })],
    wearable_sleep_sessions: [owned(USER_B, { sleep_score: 88, total_duration_seconds: 28000 })],
  }, { ignoreOwnership: true });
  const result = await loadHealthIntelligence(db, options(USER_A));
  const health = healthOf(result);
  assert.equal(health.status, "unavailable");
  assert.equal(Object.hasOwn(health, "sleep"), false);
  assert.equal(Object.hasOwn(health, "body_battery"), false);
  assert.equal((result.readiness || health.readiness)?.score, null);
});

test("missing owner is rejected before any canonical health query", async () => {
  for (const userId of [null, undefined, "", "   "]) {
    const db = readOnlyDb();
    await assert.rejects(loadHealthIntelligence(db, { ...options(), userId }), /user|owner|scope/i);
    assert.equal(db.calls.length, 0);
  }
});

test("a failed canonical read cannot become observed health or synthetic readiness", async () => {
  const db = readOnlyDb({}, { errorTable: "wearable_health_daily" });
  let result;
  try {
    result = await loadHealthIntelligence(db, options());
  } catch (error) {
    assert.match(error.message, /blocked_database_failure/);
    return;
  }
  const health = healthOf(result);
  assert.equal(Object.hasOwn(health, "body_battery"), false);
  assert.equal(Object.hasOwn(health, "heart_rate"), false);
  assert.equal((result.readiness || health.readiness)?.score, null);
  assert.doesNotMatch(JSON.stringify(result), /blocked_database_failure/);
});

test("readiness traceability allowlists provenance for current factors and personal baseline evidence", () => {
  const maliciousProvenance = { ...provenance, data_confidence: "reported", raw_payload: { access_token: CANARY }, credentials: CANARY };
  const history = Array.from({ length: 7 }, (_, index) => ({
    user_id: USER_A,
    calendar_date: new Date(Date.UTC(2026, 8, 28 + index, 12)).toISOString().slice(0, 10),
    hrv: 40,
    provenance: { hrv: maliciousProvenance },
  }));
  const baseline = buildPersonalBaseline(history, "hrv", { calendarDate: DATE, userId: USER_A });
  assert.equal(baseline.observations, 7);
  assert.doesNotMatch(JSON.stringify(baseline), new RegExp(CANARY));
  assert.doesNotMatch(JSON.stringify(baseline), /raw_payload|access_token|credentials/);
  const result = calculateReadiness({
    schema_version: "health_recovery_v1", calendar_date: DATE, timezone: "Europe/Madrid", status: "partial", freshness: "current",
    sleep: { calendar_date: DATE, freshness: "current", sleep_score: 80, provenance: maliciousProvenance },
    hrv: { calendar_date: DATE, freshness: "current", last_night_avg_ms: 42, provenance: maliciousProvenance },
  }, history, { userId: USER_A });
  assert.notEqual(result.score, null);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(CANARY));
  assert.doesNotMatch(JSON.stringify(result), /raw_payload|access_token|credentials/);
});

test("closed loop projects safe feedback and health evidence and never applies its proposal", () => {
  const input = {
    userId: USER_A, calendarDate: DATE, timezone: "Europe/Madrid", afterDate: DATE,
    plannedSession: { id: "plan", user_id: USER_A, planned_date: "2026-10-04", title: "Lower Strength", linked_completed_session_id: "execution", planned_duration_min: 30, planned_duration_max: 30, raw_payload: { token: CANARY } },
    executedSession: { id: "execution", user_id: USER_A, local_date: "2026-10-04", duration_seconds: 1800, source_type: "garmin_fit", credentials: CANARY },
    userFeedback: { user_id: USER_A, confirmed: true, source: "user_confirmed", session_id: "execution", discomfort: true, rpe: 9, raw_payload: { token: CANARY } },
    healthAfter: {
      schema_version: "health_recovery_v1", calendar_date: DATE, timezone: "Europe/Madrid", freshness: "current", raw_payload: { token: CANARY },
      provenance: [{ ...provenance, raw_payload: { token: CANARY } }],
      hrv: { calendar_date: DATE, freshness: "current", last_night_avg_ms: 38, raw_payload: { token: CANARY } },
      readiness: { schema_version: "readiness_v1", algorithm_version: READINESS_ALGORITHM_VERSION, status: "partial", score: 60, credentials: CANARY, factors: [{ metric: "hrv", observed_value: 38, evidence_date: DATE, reason: "relative_to_personal_baseline", contribution: 15, baseline: { value: 42, observations: 7, method: "rolling_median", raw_payload: { token: CANARY } } }] },
    },
    futureSessions: [{ id: "future", user_id: USER_A, title: "Upper Strength", planned_date: DATE, status: "planned", raw_payload: { token: CANARY } }],
  };
  const before = structuredClone(input);
  const result = assessClosedLoop(input);
  assert.equal(result.adaptation_proposal.action, "recovery_bias");
  assert.equal(result.adaptation_proposal.requires_explicit_action, true);
  assert.equal(result.adaptation_proposal.applied, false);
  assert.equal(result.applied, false);
  assert.equal(result.health_after.readiness.score, null, "one factor cannot preserve an injected readiness score");
  assert.doesNotMatch(JSON.stringify(result), new RegExp(CANARY));
  assert.doesNotMatch(JSON.stringify(result), /raw_payload|credentials|token/);
  assert.deepEqual(input, before);
});

test("closed loop rejects foreign or missing parent ownership and disregards foreign feedback", () => {
  const plannedSession = { id: "plan", user_id: USER_A, planned_date: DATE, linked_completed_session_id: "execution" };
  const executedSession = { id: "execution", user_id: USER_A, local_date: DATE };
  assert.throws(() => assessClosedLoop({ userId: USER_A, plannedSession, executedSession: { ...executedSession, user_id: USER_B } }), /scope_mismatch/);
  assert.throws(() => assessClosedLoop({ userId: USER_A, plannedSession: { id: "unowned" } }), /scope_mismatch/);
  const result = assessClosedLoop({
    userId: USER_A, plannedSession, executedSession,
    userFeedback: { user_id: USER_B, confirmed: true, source: "user_confirmed", session_id: "execution", discomfort: true },
  });
  assert.equal(result.user_feedback, null);
  assert.notEqual(result.adaptation_proposal.action, "recovery_bias");
});

test("browser integration has no privileged Supabase credential and derived domains have no mutation path", async () => {
  const paths = ["../src/integrations/supabase/client.js", "../src/services/coachContextService.js", "../src/services/aiCoachContextService.js"];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:VITE_\w*(?:SERVICE|SECRET)|SUPABASE_SERVICE_ROLE_KEY|sb_secret_)/i, path);
  }
  for (const path of ["../src/health/healthEvidence.js", "../src/health/readinessV1.js", "../src/health/loadHealthIntelligence.js", "../src/closedLoop/closedLoopAssessment.js", "../src/closedLoop/loadClosedLoopAssessments.js"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete)\s*\(/, path);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|requestOpenAiResponses|fetch\s*\(/, path);
  }
});
