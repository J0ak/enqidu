import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { ToolSchema } from "@modelcontextprotocol/core";
import { createEnqiduToolRuntime, MAX_TOOL_OUTPUT_BYTES } from "../src/enqiduTools/runtime.js";
import { getEnqiduTool, listEnqiduTools } from "../src/enqiduTools/registry.js";
import { matchesSchema } from "../src/enqiduTools/schema.js";
import { listEnqiduMcpTools, mcpWritesEnabled, MCP_MAX_RESULT_BYTES } from "../src/mcp/server.js";
import { readLocalMcpConfiguration, createLocalMcpAuthClient } from "../src/mcp/localAuth.js";
import { createToolsDb, TOOL_NOW, TOOL_USER_A, TOOL_USER_B, toolId } from "./support/enqiduToolsDb.mjs";
import { connectEnqiduMcp } from "./support/enqiduMcp.mjs";

const DATE = "2026-10-05";
const REQUESTS = [
  ["get_athlete_context", {}], ["get_today_plan", {}], ["get_week_plan", {}],
  ["get_recent_training", { limit: 2 }], ["get_training_session", { session_id: toolId(20) }],
  ["get_health_status", {}], ["get_readiness", {}],
  ["get_closed_loop_assessment", { session_id: toolId(20) }],
  ["get_adaptation_proposal", { session_id: toolId(20) }],
  ["preview_move_session", { source_date: DATE, target_date: "2026-10-08" }],
  ["preview_adapt_duration", { source_date: DATE, duration_minutes: 30 }],
  ["preview_adapt_environment", { source_date: DATE, environment: "home" }],
  ["preview_cancel_session", { source_date: DATE }],
  ["preview_adapt_remaining_week", {}],
  ["preview_closed_loop_proposal", { session_id: toolId(20) }],
];
const comparable = ({ traceability, ...result }) => result;

async function connected(t, options = {}) {
  const fixture = options.fixture || createToolsDb();
  const connection = await connectEnqiduMcp({ db: fixture.db, now: TOOL_NOW, ...options });
  t.after(() => connection.close());
  return { ...fixture, ...connection };
}

test("MCP: real SDK discovery exposes the exact closed read/preview registry and valid schemas", async (t) => {
  const { client } = await connected(t);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 15);
  assert.deepEqual(tools.map((tool) => tool.name), listEnqiduTools({ includeWrites: false }).map((tool) => tool.id));
  for (const descriptor of tools) {
    assert.ok(ToolSchema.safeParse(descriptor).success, descriptor.name);
    assert.deepEqual(descriptor.inputSchema, getEnqiduTool(descriptor.name).input_schema);
    assert.deepEqual(descriptor.outputSchema, getEnqiduTool(descriptor.name).output_schema);
    assert.deepEqual(descriptor.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    assert.equal(descriptor.inputSchema.additionalProperties, false);
    assert.equal(descriptor._meta["enqidu/authentication"], "required");
  }
});

test("MCP: all 21 descriptors have valid SDK schemas and conservative write annotations", () => {
  const tools = listEnqiduMcpTools({ writesEnabled: true });
  assert.equal(tools.length, 21);
  assert.equal(new Set(tools.map((tool) => tool.name)).size, 21);
  for (const descriptor of tools) {
    assert.ok(ToolSchema.safeParse(descriptor).success, descriptor.name);
    if (descriptor.name.startsWith("apply_")) {
      assert.deepEqual(descriptor.annotations, { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false });
      for (const required of ["fingerprint", "expires_at", "confirmation"]) assert.ok(descriptor.inputSchema.required.includes(required));
    }
  }
});

for (const [name, args] of REQUESTS) {
  test(`MCP: ${name} has real App/domain parity, repeatability, safe bounded wire output and no mutation`, async (t) => {
    const state = createToolsDb();
    // Exercise a real remaining-week change, rather than only its no-op case.
    state.tables.training_availability_overrides.push({ user_id: TOOL_USER_A, calendar_date: "2026-10-06", availability_status: "unavailable", source: "user" });
    // The closed-loop target must remain available for its duration adaptation.
    if (name === "preview_closed_loop_proposal") state.tables.training_availability_overrides.pop();
    const before = structuredClone(state.tables);
    const { client } = await connected(t, { fixture: state });
    await client.listTools(); // SDK client also compiles/validates advertised outputs.
    const app = await createEnqiduToolRuntime({ db: state.db, source: "app", now: TOOL_NOW });
    const expected = await app.execute(name, args);
    assert.equal(expected.ok, true, JSON.stringify(expected));
    const first = await client.callTool({ name, arguments: args });
    const second = await client.callTool({ name, arguments: args });
    assert.equal(first.isError, false);
    assert.deepEqual(comparable(first.structuredContent), comparable(expected));
    assert.deepEqual(comparable(second.structuredContent), comparable(expected));
    assert.deepEqual(JSON.parse(first.content[0].text), first.structuredContent);
    assert.equal(first.structuredContent.traceability.source, "mcp");
    assert.ok(matchesSchema(first.structuredContent, getEnqiduTool(name).output_schema), name);
    assert.ok(Buffer.byteLength(JSON.stringify(first.structuredContent)) <= MAX_TOOL_OUTPUT_BYTES);
    assert.doesNotMatch(JSON.stringify(first), /RAW_SECRET|FOREIGN_SECRET|raw_payload|raw_provider_payload|private_notes/);
    assert.deepEqual(state.tables, before);
  });
}

test("MCP: unknown calls and malformed/identity-injected arguments fail closed", async (t) => {
  const { client } = await connected(t);
  const invalid = [
    ["execute_query", { sql: "SELECT * FROM training_sessions" }, "unknown_tool"],
    ["get_today_plan", { user_id: TOOL_USER_B }, "invalid_arguments"],
    ["get_health_status", { authenticated_user_id: TOOL_USER_B }, "invalid_arguments"],
    ["get_today_plan", { timezone: "America/Los_Angeles" }, "invalid_arguments"],
    ["get_today_plan", { source: "app", capabilities: { writes: true } }, "invalid_arguments"],
    ["get_recent_training", { limit: 21 }, "invalid_arguments"],
    ["get_recent_training", { limit: "2" }, "invalid_arguments"],
    ["get_training_session", {}, "invalid_arguments"],
    ["preview_adapt_duration", { source_date: DATE, duration_minutes: 9 }, "invalid_arguments"],
    ["preview_adapt_environment", { source_date: DATE, environment: "sql" }, "invalid_arguments"],
    ["preview_move_session", { source_date: DATE, target_date: "2026-02-30" }, "invalid_arguments"],
    ["get_today_plan", { extra: "x".repeat(9000) }, "invalid_arguments"],
  ];
  for (const [name, args, code] of invalid) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, name);
    assert.equal(result.structuredContent.ok, false, name);
    assert.equal(result.structuredContent.error.code, code, name);
    if (getEnqiduTool(name)) assert.ok(matchesSchema(result.structuredContent, getEnqiduTool(name).output_schema), name);
    assert.doesNotMatch(JSON.stringify(result), /SELECT \*|RAW_SECRET|FOREIGN_SECRET|stack|service_role/);
  }
  await assert.rejects(() => client.callTool({ name: "get_today_plan", arguments: [] }));
});

test("MCP: default gate rejects all guessed apply calls, including request metadata and capability injection", async (t) => {
  const observations = [];
  const { client } = await connected(t, { observe: (event) => observations.push(event) });
  for (const definition of listEnqiduTools().filter((tool) => tool.access === "write")) {
    const result = await client.callTool({ name: definition.id, arguments: { confirmation: true, capabilities: { writes: true } }, _meta: { ENQIDU_MCP_WRITES_ENABLED: true, source: "app" } });
    assert.equal(result.structuredContent.error.code, "mcp_writes_disabled");
    assert.ok(matchesSchema(result.structuredContent, definition.output_schema));
  }
  assert.equal(observations.length, 6);
  assert.ok(observations.every((event) => event.status === "error" && event.error_code === "mcp_writes_disabled"));
  assert.doesNotMatch(JSON.stringify(observations), /user_id|arguments|confirmation|source_date/);
  assert.equal(mcpWritesEnabled(), false);
  for (const value of [undefined, false, true, "false", "1", "TRUE", "yes"]) assert.equal(mcpWritesEnabled({ ENQIDU_MCP_WRITES_ENABLED: value }), false);
  assert.equal(mcpWritesEnabled({ ENQIDU_MCP_WRITES_ENABLED: "true" }), true);
});

test("MCP: enabled gate does not invent mutation authority or bypass explicit confirmation", async (t) => {
  const { client } = await connected(t, { writesEnabled: true });
  assert.equal((await client.listTools()).tools.length, 21);
  const preview = (await client.callTool({ name: "preview_cancel_session", arguments: { source_date: DATE } })).structuredContent.data;
  const args = { source_date: DATE, fingerprint: preview.fingerprint, expires_at: preview.expires_at };
  const unconfirmed = await client.callTool({ name: "apply_cancel_session", arguments: args });
  assert.equal(unconfirmed.structuredContent.error.code, "explicit_confirmation_required");
  const noWriter = await client.callTool({ name: "apply_cancel_session", arguments: { ...args, confirmation: true } });
  assert.equal(noWriter.structuredContent.error.code, "mutation_unavailable");
});

test("MCP: trusted embedding applies through the existing writer and stale replay fails", async (t) => {
  const fixture = createToolsDb();
  const history = structuredClone(fixture.tables.training_sessions);
  const writes = [];
  const adminDb = { async rpc(name, args) {
    writes.push({ name, args });
    assert.equal(name, "apply_enqidu_action_v1");
    assert.equal(args.p_action, "cancel_session");
    assert.equal(args.p_user_id, TOOL_USER_A);
    const plan = fixture.tables.planned_training_sessions.find((row) => row.id === args.p_command.sessionId);
    assert.equal(plan.user_id, TOOL_USER_A);
    plan.status = "cancelled";
    return { data: { ok: true, planned_session_id: plan.id }, error: null };
  } };
  const { client } = await connected(t, { fixture, adminDb, writesEnabled: true });
  const preview = (await client.callTool({ name: "preview_cancel_session", arguments: { source_date: DATE } })).structuredContent.data;
  assert.equal(writes.length, 0);
  const args = { source_date: DATE, fingerprint: preview.fingerprint, expires_at: preview.expires_at, confirmation: true };
  const applied = (await client.callTool({ name: "apply_cancel_session", arguments: args })).structuredContent;
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(writes.length, 1);
  assert.equal(applied.data.persistence_verified, true);
  assert.equal(applied.data.persisted_plan.sessions.find((row) => row.id === toolId(2)).status, "cancelled");
  const replay = (await client.callTool({ name: "apply_cancel_session", arguments: args })).structuredContent;
  assert.equal(replay.error.code, "preview_stale");
  assert.equal(writes.length, 1);
  assert.deepEqual(fixture.tables.training_sessions, history);
});

test("MCP: another athlete cannot read execution/closed-loop evidence or preview a foreign-only date", async (t) => {
  const { client } = await connected(t);
  for (const name of ["get_training_session", "get_closed_loop_assessment", "get_adaptation_proposal", "preview_closed_loop_proposal"]) {
    const result = await client.callTool({ name, arguments: { session_id: toolId(21) } });
    assert.equal(result.structuredContent.ok, false, name);
    assert.doesNotMatch(JSON.stringify(result), /FOREIGN_SECRET|RAW_SECRET/);
  }
  const b = await connected(t, { fixture: createToolsDb({ userId: TOOL_USER_B }) });
  for (const name of ["preview_cancel_session", "preview_adapt_duration", "preview_adapt_environment", "preview_move_session"]) {
    const args = { source_date: DATE, ...(name.endsWith("duration") ? { duration_minutes: 30 } : {}), ...(name.endsWith("environment") ? { environment: "home" } : {}), ...(name.endsWith("move_session") ? { target_date: "2026-10-08" } : {}) };
    const result = await b.client.callTool({ name, arguments: args });
    assert.equal(result.structuredContent.ok, false, name);
    assert.equal(result.structuredContent.error.code, "source_plan_not_found", name);
  }
});

test("MCP: unauthenticated discovery/calls and database exceptions produce sanitized errors", async (t) => {
  const noAuth = await connected(t, { fixture: createToolsDb({ userId: null }) });
  await assert.rejects(() => noAuth.client.listTools(), /authentication required/);
  await assert.rejects(() => noAuth.client.callTool({ name: "get_today_plan", arguments: {} }), /authentication required/);
  const fixture = createToolsDb();
  const original = fixture.db.from;
  fixture.db.from = (table) => {
    if (table === "profiles") return original(table);
    throw new Error("SQL secret service_role RAW_SECRET https://credentials.example");
  };
  const { client } = await connected(t, { fixture });
  const result = await client.callTool({ name: "get_today_plan", arguments: {} });
  assert.equal(result.isError, true);
  assert.doesNotMatch(JSON.stringify(result), /SQL|secret|service_role|RAW_SECRET|credentials|stack/);
});

test("MCP: reads above the old 64KiB transport limit retain identical domain data", async (t) => {
  const fixture = createToolsDb();
  const template = fixture.tables.planned_training_sessions[1];
  fixture.tables.planned_training_sessions = Array.from({ length: 20 }, (_, index) => ({ ...template, id: toolId(100 + index), title: "t".repeat(1000), objective: "o".repeat(1000) }));
  fixture.tables.planned_session_blocks = [];
  const { client } = await connected(t, { fixture });
  const app = await createEnqiduToolRuntime({ db: fixture.db, now: TOOL_NOW });
  const expected = await app.execute("get_week_plan", {});
  assert.equal(expected.ok, true);
  assert.ok(Buffer.byteLength(JSON.stringify(expected)) > 65_536);
  const actual = (await client.callTool({ name: "get_week_plan", arguments: {} })).structuredContent;
  assert.deepEqual(comparable(actual), comparable(expected));
  assert.equal(MCP_MAX_RESULT_BYTES, MAX_TOOL_OUTPUT_BYTES);
});

test("MCP: canonical output cardinality overflow fails safely without partial success", async (t) => {
  const fixture = createToolsDb();
  const template = fixture.tables.planned_training_sessions[1];
  fixture.tables.planned_training_sessions = Array.from({ length: 51 }, (_, index) => ({ ...template, id: toolId(100 + index) }));
  const { client } = await connected(t, { fixture });
  const result = (await client.callTool({ name: "get_week_plan", arguments: {} })).structuredContent;
  assert.equal(result.error.code, "output_limit_exceeded");
  assert.equal(result.data, null);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < MAX_TOOL_OUTPUT_BYTES);
});

for (const [now, date] of [
  ["2026-10-05T22:30:00Z", "2026-10-06"],
  ["2026-03-28T23:30:00Z", "2026-03-29"], ["2026-03-29T22:30:00Z", "2026-03-30"],
  ["2026-10-24T22:30:00Z", "2026-10-25"], ["2026-10-25T23:30:00Z", "2026-10-26"],
]) {
  test(`MCP: Europe/Madrid date ${date} wins at ${now}, including 23h/25h DST`, async (t) => {
    const previous = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    t.after(() => { if (previous == null) delete process.env.TZ; else process.env.TZ = previous; });
    const { client } = await connected(t, { now });
    const result = (await client.callTool({ name: "get_today_plan", arguments: {}, _meta: { timezone: "Pacific/Auckland" } })).structuredContent;
    assert.equal(result.ok, true);
    assert.equal(result.calendar_date, date);
    assert.equal(result.data.calendar_date, date);
    assert.equal(result.timezone, "Europe/Madrid");
  });
}

const publicKey = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
const localEnv = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: publicKey, ENQIDU_MCP_ACCESS_TOKEN: "athlete-token" };

test("MCP local: remote URLs, credential-bearing URLs, privileged keys and missing tokens are rejected", async () => {
  assert.deepEqual(readLocalMcpConfiguration(localEnv), { url: "http://127.0.0.1:54321", anonKey: publicKey, accessToken: "athlete-token" });
  for (const url of ["https://project.supabase.co", "http://127.0.0.1.evil.test", "http://user:password@localhost", "http://localhost/?token=secret", "http://localhost/rest/v1", "file:///tmp/supabase"]) {
    assert.throws(() => readLocalMcpConfiguration({ ...localEnv, SUPABASE_URL: url }), /loopback/);
  }
  for (const key of ["sb_secret_sensitive", `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`, "", undefined]) {
    assert.throws(() => readLocalMcpConfiguration({ ...localEnv, SUPABASE_ANON_KEY: key }), /public/);
  }
  for (const token of ["", "Bearer token", undefined]) assert.throws(() => readLocalMcpConfiguration({ ...localEnv, ENQIDU_MCP_ACCESS_TOKEN: token }), /athlete access token/);
  await assert.rejects(() => createLocalMcpAuthClient({ url: "https://project.supabase.co", anonKey: publicKey, accessToken: "token" }), /loopback/);
});

test("MCP local: actual stdio executable verifies bearer auth for every call and keeps stdout protocol-only", async (t) => {
  // HTTP fixture verifies the auth boundary, not a fabricated authorization
  // mechanism: the production client must ask Supabase Auth on every request.
  let revoked = false;
  let authRequests = 0;
  const headers = [];
  const authServer = createServer((request, response) => {
    headers.push(request.headers.authorization);
    response.setHeader("Content-Type", "application/json");
    if (request.url.startsWith("/auth/v1/user")) {
      authRequests += 1;
      response.statusCode = revoked ? 401 : 200;
      response.end(JSON.stringify(revoked ? { message: "revoked" } : { id: TOOL_USER_A, role: "authenticated" }));
    } else if (request.url.startsWith("/rest/v1/profiles")) {
      response.end(JSON.stringify([{ timezone: "Europe/Madrid" }]));
    } else {
      response.end("[]");
    }
  });
  authServer.listen(0, "127.0.0.1");
  await once(authServer, "listening");
  t.after(() => { authServer.closeAllConnections(); authServer.close(); });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../scripts/mcp-local.mjs", import.meta.url))],
    env: { ...localEnv, SUPABASE_URL: `http://127.0.0.1:${authServer.address().port}`, ENQIDU_MCP_WRITES_ENABLED: "false" },
    stderr: "pipe",
  });
  let logs = "";
  transport.stderr.on("data", (chunk) => { logs += String(chunk); });
  const client = new Client({ name: "enqidu-stdio-auth-test", version: "1.0.0" });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 15);
  const result = await client.callTool({ name: "get_today_plan", arguments: {} });
  assert.equal(result.structuredContent.ok, true);
  assert.equal(result.structuredContent.timezone, "Europe/Madrid");
  assert.ok(authRequests >= 3); // process startup, discovery, tool call
  assert.ok(headers.every((value) => value === "Bearer athlete-token"));
  revoked = true;
  await assert.rejects(() => client.callTool({ name: "get_today_plan", arguments: {} }), /authentication required/);
  await client.close();
  assert.doesNotMatch(logs, /athlete-token|signature|user_id|Bearer/);
  const event = logs.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).find((entry) => entry.tool_id === "get_today_plan");
  assert.equal(event.status, "ok");
  assert.ok(event.request_id);
});
