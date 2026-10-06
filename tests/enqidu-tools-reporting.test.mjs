import assert from "node:assert/strict";
import test from "node:test";
import { createEnqiduToolRuntime, MAX_TOOL_OUTPUT_BYTES } from "../src/enqiduTools/runtime.js";
import { createEnqiduReadDomain } from "../src/enqiduTools/readTools.js";
import { getEnqiduTool } from "../src/enqiduTools/registry.js";
import { matchesSchema } from "../src/enqiduTools/schema.js";

const USER = "10000000-0000-0000-0000-000000000001";
const NOW = "2026-10-05T10:00:00.000Z";
const DATE = "2026-10-05";
const id = (index) => `20000000-0000-0000-0000-${String(index).padStart(12, "0")}`;
const plan = (index, overrides = {}) => ({
  id: id(index), user_id: USER, planned_date: DATE, title: "Fuerza", status: "planned",
  session_type: "strength", source: "enkidu_coach", location_type: "home",
  planned_duration_min: 50, planned_duration_max: 50, linked_completed_session_id: null,
  ...overrides,
});

// A stateful fixed-table fake: exercises the real preparation, fingerprint,
// writer dispatcher, read projection and output validator together.
function fixture({ title = "Fuerza", morePlans = [], rejectWrite = false } = {}) {
  const source = plan(1, { title });
  const tables = {
    profiles: [{ id: USER, timezone: "Europe/Madrid" }],
    planned_training_sessions: [source, ...morePlans], planned_session_blocks: [],
    training_availability_overrides: [], weekly_plans: [],
  };
  const writes = [];
  const db = {
    auth: { async getUser() { return { data: { user: { id: USER } }, error: null }; } },
    async rpc() { throw new Error("Unexpected read RPC"); },
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
      const filters = [];
      let maximum = Infinity;
      const query = {
        select() { return query; }, order() { return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        gte(key, value) { filters.push((row) => row[key] >= value); return query; },
        lte(key, value) { filters.push((row) => row[key] <= value); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        limit(value) { maximum = value; return query; },
        then(resolve, reject) {
          return Promise.resolve({ data: structuredClone(tables[table].filter((row) => filters.every((filter) => filter(row))).slice(0, maximum)), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const adminDb = {
    async rpc(name, args) {
      writes.push({ name, args });
      assert.equal(name, "cancel_coach_planned_session");
      assert.equal(args.p_user_id, USER);
      assert.equal(args.p_planned_session_id, source.id);
      if (rejectWrite) return { error: null, data: { ok: false, error: "source_plan_already_completed" } };
      source.status = "cancelled";
      return { error: null, data: { ok: true, planned_session_id: source.id } };
    },
  };
  return { db, adminDb, source, tables, writes };
}

async function previewAndApply(state) {
  const runtime = await createEnqiduToolRuntime({ db: state.db, adminDb: state.adminDb, now: NOW });
  const preview = await runtime.execute("preview_cancel_session", { source_date: DATE });
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal(state.writes.length, 0);
  return runtime.execute("apply_cancel_session", {
    source_date: DATE, fingerprint: preview.data.fingerprint,
    expires_at: preview.data.expires_at, confirmation: true,
  });
}

function assertAcknowledgedFallback(result, state) {
  assert.equal(state.writes.length, 1);
  assert.equal(state.source.status, "cancelled");
  assert.equal(result.ok, true);
  assert.equal(result.error, undefined);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.persistence_verified, false);
  assert.deepEqual(result.warnings, ["applied_result_details_unavailable"]);
  assert.ok(matchesSchema(result, getEnqiduTool("apply_cancel_session").output_schema));
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < MAX_TOOL_OUTPUT_BYTES);
}

test("TOOLS REPORTING: acknowledged mutation stays successful when a legacy result fails its schema", async () => {
  const state = fixture({ title: "a".repeat(1001) });
  const result = await previewAndApply(state);
  assertAcknowledgedFallback(result, state);
  assert.equal(result.data.title, undefined);
});

test("TOOLS REPORTING: successful readback with an invalid contract cannot turn a committed write into failure", async () => {
  const state = fixture({ morePlans: [plan(2, { planned_date: "2026-10-06", status: 123 })] });
  assertAcknowledgedFallback(await previewAndApply(state), state);
});

test("TOOLS REPORTING: response envelope size is bounded without denying an acknowledged mutation", async () => {
  const fillers = Array.from({ length: 35 }, (_, index) => plan(index + 2, {
    planned_date: "2026-10-06", title: "t".repeat(1000), objective: "",
  }));
  const state = fixture({ morePlans: fillers });
  const domain = () => createEnqiduReadDomain({ db: state.db, userId: USER,
    calendar: { date: DATE, timezone: "Europe/Madrid" }, now: NOW });
  // Tune only fixture text so the read fits, but enclosing it in the apply
  // receipt crosses the shared transport bound. No business rule is mocked.
  state.source.status = "cancelled";
  let low = 0;
  let high = 1000;
  while (low < high) {
    const length = Math.ceil((low + high) / 2);
    fillers.forEach((row) => { row.objective = "o".repeat(length); });
    try {
      const data = await domain().read("get_week_plan");
      if (Buffer.byteLength(JSON.stringify(data)) <= MAX_TOOL_OUTPUT_BYTES - 64) low = length;
      else high = length - 1;
    } catch (error) {
      assert.equal(error.code, "output_limit_exceeded");
      high = length - 1;
    }
  }
  fillers.forEach((row) => { row.objective = "o".repeat(low); });
  const persisted = await domain().read("get_week_plan");
  assert.ok(matchesSchema(persisted, getEnqiduTool("get_week_plan").data_schema));
  assert.ok(Buffer.byteLength(JSON.stringify(persisted)) > MAX_TOOL_OUTPUT_BYTES - 200);
  state.source.status = "planned";
  assertAcknowledgedFallback(await previewAndApply(state), state);
});

test("TOOLS REPORTING: a rejected action remains a failure and does not get a success fallback", async () => {
  const state = fixture({ rejectWrite: true });
  const result = await previewAndApply(state);
  assert.equal(result.ok, false);
  assert.equal(state.source.status, "planned");
  assert.equal(result.data, null);
  assert.deepEqual(result.warnings, []);
});

test("TOOLS REPORTING: unknown tool names are never echoed into the safe result envelope", async () => {
  const state = fixture();
  const runtime = await createEnqiduToolRuntime({ db: state.db, adminDb: state.adminDb, now: NOW });
  const result = await runtime.execute("secret-or-SQL-in-an-unknown-tool-name", {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unknown_tool");
  assert.equal(result.tool, "unknown");
  assert.doesNotMatch(JSON.stringify(result), /secret-or-SQL/);
});
