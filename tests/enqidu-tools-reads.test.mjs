import test from "node:test";
import assert from "node:assert/strict";
import { createEnqiduReadDomain, resolveClosedLoopAction } from "../src/enqiduTools/readTools.js";
import { READ_OUTPUT_SCHEMAS } from "../src/enqiduTools/readSchemas.js";
import { matchesSchema } from "../src/enqiduTools/schema.js";
import { createEnqiduToolRuntime } from "../src/enqiduTools/runtime.js";
import { createToolsDb, TOOL_USER_A, TOOL_USER_B, TOOL_NOW, TOOL_CALENDAR, toolId } from "./support/enqiduToolsDb.mjs";

const domainFor = (state, patch = {}) => createEnqiduReadDomain({ db: state.db, userId: TOOL_USER_A, calendar: TOOL_CALENDAR, now: TOOL_NOW, ...patch });

function schemaErrors(value, schema, path = "data") {
  if (matchesSchema(value, schema)) return [];
  if (schema.anyOf) return schema.anyOf.flatMap((item) => schemaErrors(value, item, path)).slice(0, 8);
  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) return Object.entries(value).flatMap(([key, item]) => schema.properties[key] ? schemaErrors(item, schema.properties[key], `${path}.${key}`) : [`${path}.${key}: additional property`]);
  if (schema.type === "array" && Array.isArray(value)) return value.flatMap((item, index) => schemaErrors(item, schema.items, `${path}[${index}]`));
  return [`${path}: ${JSON.stringify(value)} does not match ${JSON.stringify(schema)}`];
}

for (const empty of [false, true]) test(`TOOLS READ: all nine canonical outputs match schemas (${empty ? "empty" : "full evidence"})`, async () => {
  const state = createToolsDb({ empty });
  const domain = domainFor(state);
  for (const [name, schema] of Object.entries(READ_OUTPUT_SCHEMAS)) {
    if (empty && name === "get_training_session") continue;
    const args = name === "get_training_session" ? { session_id: toolId(20) } : name.includes("closed_loop") || name === "get_adaptation_proposal" ? { date: "2026-10-03" } : {};
    const result = await domain.read(name, args);
    assert.ok(matchesSchema(result, schema), `${name}: ${schemaErrors(result, schema).join("\n")}`);
    assert.doesNotMatch(JSON.stringify(result), /RAW_SECRET|FOREIGN_SECRET|raw_payload|raw_provider_payload|user_id|private_notes/);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 131072);
  }
  assert.ok(state.calls.every((call) => !call.rpc || call.rpc === "get_ai_coach_context"));
});

test("TOOLS READ: plan query uses two bounded reads plus availability, no health or generic context", async () => {
  const state = createToolsDb();
  const result = await domainFor(state).read("get_today_plan");
  assert.equal(result.sessions[0].id, toolId(2));
  assert.equal(result.sessions[0].blocks[0].planned_duration_seconds, 3000);
  assert.equal(state.calls.length, 3);
  assert.ok(state.calls.every((call) => ["planned_training_sessions", "planned_session_blocks", "training_availability_overrides"].includes(call.table)));
});

test("TOOLS READ: health and readiness share canonical reads inside a request", async () => {
  const state = createToolsDb();
  const domain = domainFor(state);
  const [health, readiness] = await Promise.all([domain.read("get_health_status"), domain.read("get_readiness")]);
  assert.deepEqual(health.readiness, readiness);
  assert.equal(health.readiness.score, 66);
  assert.equal(state.calls.filter((call) => call.table === "wearable_health_daily").length, 1);
  const before = state.calls.length;
  assert.deepEqual(await domain.read("get_health_status"), health);
  assert.equal(state.calls.length, before);
  health.sleep.sleep_score = 0;
  assert.equal((await domain.read("get_health_status")).sleep.sleep_score, 85);
});

test("TOOLS READ: canonical session detail scopes owned parent before all child reads", async () => {
  const state = createToolsDb();
  await assert.rejects(domainFor(state).read("get_training_session", { session_id: toolId(21) }), { code: "session_not_found" });
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].table, "training_sessions");
  assert.ok(state.calls[0].filters.some((item) => item.key === "user_id" && item.value === TOOL_USER_A));
  const result = await domainFor(state).read("get_training_session", { session_id: toolId(20) });
  assert.deepEqual(result.metrics.map((item) => item.metric_code), ["rpe_global", "session_completion"]);
  assert.equal(result.session.id, toolId(20));
});

test("TOOLS READ: closed loop exact link survives execution on different calendar date", async () => {
  const state = createToolsDb();
  state.tables.training_sessions[0].local_date = "2026-10-04";
  state.tables.training_sessions[0].started_at = "2026-10-04T08:00:00Z";
  state.tables.training_sessions[0].ended_at = "2026-10-04T08:50:00Z";
  const result = await domainFor(state).read("get_closed_loop_assessment", { session_id: toolId(20) });
  assert.equal(result.assessments.length, 1);
  assert.equal(result.assessments[0].planned_session.calendar_date, "2026-10-03");
  assert.equal(result.assessments[0].executed_session.calendar_date, "2026-10-04");
  assert.equal(result.assessments[0].identity_match, "exact_persisted_link");
  await assert.rejects(domainFor(state).read("get_closed_loop_assessment", { session_id: toolId(20), date: "2026-10-02" }), { code: "invalid_arguments" });
});

test("TOOLS READ: closed loop and proposal reuse evidence; bridge is deterministic and read-only", async () => {
  const state = createToolsDb();
  const snapshot = structuredClone(state.tables);
  const domain = domainFor(state);
  const args = { session_id: toolId(20) };
  const assessment = await domain.read("get_closed_loop_assessment", args);
  const calls = state.calls.length;
  const proposals = await domain.read("get_adaptation_proposal", args);
  assert.equal(state.calls.length, calls);
  assert.deepEqual(proposals.proposals[0].proposal, assessment.assessments[0].adaptation_proposal);
  const action = await resolveClosedLoopAction({ domain, args });
  assert.deepEqual(action.args, { source_date: "2026-10-06", duration_minutes: 40 });
  assert.equal(action.action, "adapt_session_duration");
  assert.equal(action.proposal.applied, false);
  assert.deepEqual(await resolveClosedLoopAction({ domain, args }), action);
  assert.deepEqual(state.tables, snapshot);
});

test("TOOLS READ: discomfort proposal remains explicit review and cannot invent treatment", async () => {
  const state = createToolsDb();
  state.tables.session_metrics.push({ ...state.tables.session_metrics[0], id: toolId(99), metric_code: "discomfort", value_numeric: 1 });
  const domain = domainFor(state);
  assert.equal((await domain.read("get_adaptation_proposal", { session_id: toolId(20) })).proposals[0].proposal.action, "recovery_bias");
  await assert.rejects(resolveClosedLoopAction({ domain, args: { session_id: toolId(20) } }), { code: "proposal_not_actionable" });
});

test("TOOLS READ: a foreign owner cannot contribute health, plans, sessions or assessments", async () => {
  const state = createToolsDb({ userId: TOOL_USER_B });
  const domain = domainFor(state, { userId: TOOL_USER_B });
  assert.equal((await domain.read("get_health_status")).status, "unavailable");
  assert.equal((await domain.read("get_today_plan")).sessions.length, 0);
  await assert.rejects(domain.read("get_training_session", { session_id: toolId(20) }), { code: "session_not_found" });
  await assert.rejects(domain.read("get_closed_loop_assessment", { session_id: toolId(20) }), { code: "session_not_found" });
});

test("TOOLS READ: invalid/future dates and excessive limits fail without reads", async () => {
  const state = createToolsDb();
  const domain = domainFor(state);
  for (const name of ["get_health_status", "get_readiness", "get_recent_training", "get_closed_loop_assessment"]) for (const date of ["2026-02-30", "2026-10-06"]) await assert.rejects(domain.read(name, { date }), { code: "invalid_date" });
  await assert.rejects(domain.read("get_recent_training", { limit: 21 }), { code: "invalid_arguments" });
  assert.equal(state.calls.length, 0);
});

test("TOOLS READ: historical health uses requested profile calendar date; current context remains canonical", async () => {
  const state = createToolsDb();
  const result = await domainFor(state).read("get_health_status", { date: "2026-10-04" });
  assert.equal(result.calendar_date, "2026-10-04");
  assert.equal(result.timezone, "Europe/Madrid");
  assert.equal(result.readiness.calendar_date, "2026-10-04");
  assert.ok(matchesSchema(result, READ_OUTPUT_SCHEMAS.get_health_status));
});

test("TOOLS READ: runtime validates every full evidence output and batch memoizes health", async () => {
  const state = createToolsDb();
  const runtime = await createEnqiduToolRuntime({ db: state.db, source: "coach", now: TOOL_NOW });
  const requests = Object.keys(READ_OUTPUT_SCHEMAS).map((tool) => ({ tool, arguments: tool === "get_training_session" ? { session_id: toolId(20) } : tool.includes("closed_loop") || tool === "get_adaptation_proposal" ? { session_id: toolId(20) } : {} }));
  const results = await runtime.executeMany(requests);
  for (const result of results) assert.equal(result.ok, true, JSON.stringify(result));
});
