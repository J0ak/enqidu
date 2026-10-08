import assert from "node:assert/strict";
import test from "node:test";
import { createEnqiduToolRuntime, createToolExecutionContext } from "../src/enqiduTools/runtime.js";
import { createEnqiduToolsHttpHandler } from "../src/enqiduTools/http.js";
import { listEnqiduTools, getEnqiduTool } from "../src/enqiduTools/registry.js";
import { matchesSchema } from "../src/enqiduTools/schema.js";
import { applyToolResultsToCoachContext, closedLoopReviewCard } from "../src/enqiduTools/coachAdapter.js";
import { detectCoachIntents } from "../src/coachContext/coachCards.js";
import { createToolsDb, TOOL_USER_A, TOOL_USER_B, TOOL_NOW, toolId } from "./support/enqiduToolsDb.mjs";

for (const [now, date] of [
  ["2026-10-05T21:59:59Z", "2026-10-05"], ["2026-10-05T22:00:00Z", "2026-10-06"],
  ["2026-03-28T23:30:00Z", "2026-03-29"], ["2026-03-29T22:30:00Z", "2026-03-30"],
  ["2026-10-24T22:30:00Z", "2026-10-25"], ["2026-10-25T23:30:00Z", "2026-10-26"],
]) test(`TOOLS CALENDAR: Madrid midnight/DST ${now}`, async () => {
  const { db } = createToolsDb({ empty: true });
  for (const source of ["app", "coach", "mcp"]) {
    const context = await createToolExecutionContext({ db, now, source });
    assert.equal(context.request_calendar_date, date);
    assert.equal(context.profile_timezone, "Europe/Madrid");
    assert.equal(context.authenticated_user_id, TOOL_USER_A);
  }
});

test("TOOLS AUTH: no identity or profile means fail closed without client timezone fallback", async () => {
  await assert.rejects(createEnqiduToolRuntime({ db: createToolsDb({ userId: null }).db, now: TOOL_NOW }), { code: "invalid_user" });
  const fixture = createToolsDb();
  fixture.tables.profiles[0].timezone = null;
  await assert.rejects(createEnqiduToolRuntime({ db: fixture.db, now: TOOL_NOW }), { code: "profile_timezone_required" });
});

test("TOOLS CONTRACT: closed manifest is versioned, typed, bounded and fails unknown/malformed/injected calls", async () => {
  assert.equal(listEnqiduTools().length, 21);
  assert.equal(listEnqiduTools({ includeWrites: false }).length, 15);
  const { db } = createToolsDb();
  const runtime = await createEnqiduToolRuntime({ db, now: TOOL_NOW });
  for (const definition of listEnqiduTools()) {
    assert.equal(definition.authentication, "required");
    assert.equal(definition.input_schema.additionalProperties, false);
    assert.equal(definition.output_schema.additionalProperties, false);
    const injected = await runtime.execute(definition.id, { user_id: TOOL_USER_B, confirmation: true });
    assert.equal(injected.ok, false, definition.id);
    assert.equal(injected.error.code, "invalid_arguments");
  }
  for (const args of [null, [], "bad", { client_timezone: "America/Los_Angeles" }, { date: "2026-02-30" }, { __proto__: null, constructor: "sql" }]) {
    const result = await runtime.execute("get_health_status", args);
    assert.equal(result.ok, false);
  }
  assert.equal((await runtime.execute("execute_query", {})).error.code, "unknown_tool");
  assert.equal((await runtime.execute("get_recent_training", { limit: 21 })).error.code, "invalid_arguments");
});

test("TOOLS SECURITY: cross-user session/closed-loop/proposal access and ownership injection fail before mutation", async () => {
  const { db, tables } = createToolsDb();
  const runtime = await createEnqiduToolRuntime({ db, now: TOOL_NOW });
  for (const tool of ["get_training_session", "get_closed_loop_assessment", "get_adaptation_proposal", "preview_closed_loop_proposal"]) {
    const result = await runtime.execute(tool, { session_id: toolId(21) });
    assert.equal(result.ok, false, tool);
    assert.equal(result.error.code, "session_not_found");
  }
  tables.planned_training_sessions = tables.planned_training_sessions.filter((row) => row.user_id === TOOL_USER_B);
  const preview = await runtime.execute("preview_cancel_session", { source_date: "2026-10-06" });
  assert.equal(preview.error.code, "source_plan_not_found");
  for (const tool of ["get_today_plan", "get_week_plan", "get_health_status", "get_readiness"]) {
    const result = await runtime.execute(tool, {});
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.doesNotMatch(JSON.stringify(result), /FOREIGN_SECRET|RAW_SECRET|raw_payload|raw_provider_payload/);
  }
});

test("TOOLS AUTH: reusing runtime reloads profile calendar and catches changed identity", async () => {
  const fixture = createToolsDb();
  let now = "2026-10-05T21:59:59Z";
  const runtime = await createEnqiduToolRuntime({ db: fixture.db, now: () => now });
  assert.equal((await runtime.execute("get_today_plan", {})).calendar_date, "2026-10-05");
  now = "2026-10-05T22:00:01Z";
  assert.equal((await runtime.execute("get_today_plan", {})).calendar_date, "2026-10-06");
  fixture.db.auth.getUser = async () => ({ data: { user: { id: TOOL_USER_B } } });
  assert.equal((await runtime.execute("get_today_plan", {})).error.code, "identity_changed");
});

test("TOOLS PERFORMANCE/PARITY: shared health/readiness batch equals standalone domain; Coach only projects", async () => {
  const fixture = createToolsDb();
  const events = [];
  const runtime = await createEnqiduToolRuntime({ db: fixture.db, now: TOOL_NOW, source: "coach", observe: (event) => events.push(event) });
  const results = await runtime.executeMany([
    { tool: "get_health_status", arguments: {} }, { tool: "get_readiness", arguments: {} }, { tool: "get_today_plan", arguments: {} },
  ]);
  for (const result of results) assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(results[0].data.readiness, results[1].data);
  const healthReads = fixture.calls.filter((call) => call.table === "wearable_health_daily");
  const alone = createToolsDb();
  await (await createEnqiduToolRuntime({ db: alone.db, now: TOOL_NOW })).execute("get_health_status", {});
  assert.equal(healthReads.length, alone.calls.filter((call) => call.table === "wearable_health_daily").length);
  const context = applyToolResultsToCoachContext({}, results);
  assert.deepEqual(context.health_recovery, results[0].data);
  assert.deepEqual(context.readiness, results[1].data);
  assert.deepEqual(context.planned_training.sessions[0].blocks, results[2].data.sessions[0].blocks);
  assert.equal(events.length, 3);
  for (const event of events) {
    assert.deepEqual(Object.keys(event).sort(), ["request_id", "tool_id", "tool_version", "timestamp", "status", "duration_ms", "error_code"].sort());
    assert.doesNotMatch(JSON.stringify(event), /RAW_SECRET|FOREIGN_SECRET|health_recovery|access_token/);
  }
});

test("TOOLS COACH: specified natural language paths and explicit proposal review action", async () => {
  assert.equal(detectCoachIntents("¿Cómo estoy?").recovery, true);
  assert.equal(detectCoachIntents("Evalúa lo de ayer").closedLoop, true);
  assert.equal(detectCoachIntents("Evalúa mi entrenamiento de ayer").closedLoop, true);
  const runtime = await createEnqiduToolRuntime({ db: createToolsDb().db, now: TOOL_NOW });
  const result = await runtime.execute("get_closed_loop_assessment", { session_id: toolId(20) });
  assert.equal(result.ok, true, JSON.stringify(result));
  const card = closedLoopReviewCard(applyToolResultsToCoachContext({}, [result]));
  assert.equal(card.actions[0].type, "review_closed_loop_proposal");
  assert.equal(card.actions[0].session_id, toolId(20));
});

test("TOOLS HTTP: bearer auth, closed body, size bound and safe errors", async () => {
  const fixture = createToolsDb();
  let clientCalls = 0;
  const handler = createEnqiduToolsHttpHandler({ now: TOOL_NOW, createClients: () => { clientCalls++; return fixture; } });
  const request = (body, authenticated = true) => new Request("http://localhost/enqidu-tools", { method: "POST", headers: authenticated ? { Authorization: "Bearer local-test-token" } : {}, body: JSON.stringify(body) });
  assert.equal((await handler(request({ tool: "get_today_plan", arguments: {} }, false))).status, 401);
  assert.equal(clientCalls, 0);
  assert.equal((await handler(request({ tool: "get_today_plan", arguments: {}, user_id: TOOL_USER_B }))).status, 400);
  assert.equal((await handler(request({ tool: "get_today_plan", arguments: { data: "x".repeat(20000) } }))).status, 413);
  assert.equal(clientCalls, 0);
  const good = await handler(request({ tool: "get_today_plan", arguments: {} }));
  assert.equal(good.status, 200);
  assert.equal(good.headers.get("cache-control"), "no-store");
  assert.ok(matchesSchema(await good.json(), getEnqiduTool("get_today_plan").output_schema));
  fixture.db.from = () => { throw new Error("SELECT secret service_role RAW_SECRET at private-stack"); };
  const bad = await handler(request({ tool: "get_today_plan", arguments: {} }));
  assert.doesNotMatch(await bad.text(), /SELECT|service_role|RAW_SECRET|private-stack/);
});
