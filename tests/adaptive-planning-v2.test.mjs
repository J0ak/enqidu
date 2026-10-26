import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEnqiduToolRuntime } from "../src/enqiduTools/runtime.js";
import { executeCoachConversation } from "../src/coachConversation/execute.js";
import { detectAdaptiveRequest } from "../src/adaptivePlanning/interpreter.js";
import { scalePlannedBlockDurations, planRemainingWeekReschedule } from "../src/coachTools/planActions.js";
import { actionDatabase, ACTION_DATE, ACTION_NOW, ACTION_USER, OTHER_USER } from "./fixtures/enqidu-action-db.mjs";
import { createToolsDb, TOOL_NOW, toolId, TOOL_USER_A } from "./support/enqiduToolsDb.mjs";
import { buildCoachApplyRequest, previewPrescription } from "../src/coachTools/actionPreviewView.js";
import { comparePlannedVsExecuted } from "../src/closedLoop/plannedVsExecuted.js";

const runtimeFor = (fixture, options = {}) => createEnqiduToolRuntime({ db: fixture.db, adminDb: fixture.adminDb, now: ACTION_NOW, ...options });
const assess = async (fixture, args, options) => (await (await runtimeFor(fixture, options)).execute("get_adaptive_assessment_v2", args));
const accepted = (assessment) => buildCoachApplyRequest({ request: assessment.proposal, preview: assessment.preview, reviewed: true });

for (const [message, request] of [
  ["Hoy sólo tengo 30 minutos", "duration"], ["He dormido mal, ¿qué hago?", "poor_sleep"],
  ["No puedo entrenar hoy", "unavailable"], ["Hoy estoy en casa", "home"], ["He hecho mucha más carga de la prevista", "overload"],
]) test(`AP2 conversation: ${message} is deterministic and never auto-applies`, async () => {
  const fixture = actionDatabase();
  const before = structuredClone(fixture.state);
  const response = await executeCoachConversation({ runtime: await runtimeFor(fixture), message });
  assert.equal(response.adaptive_assessment?.request, request, JSON.stringify(response));
  assert.equal(response.llm_used, false); assert.equal(response.usage, null);
  assert.equal(response.calendar_timezone, "Europe/Madrid"); assert.equal(response.request_date, ACTION_DATE);
  assert.deepEqual(fixture.state, before);
  assert.equal(fixture.calls.filter((c) => c.type === "write_rpc").length, 0);
  assert.doesNotMatch(response.answer, /[0-9a-f]{8}-[0-9a-f-]{27,}|schema_version|fingerprint/);
});

test("AP2 unique persisted plan works without chat cards; ambiguous plan asks for selection", async () => {
  const f = actionDatabase();
  const one = await assess(f, { request: "duration", duration_minutes: 30 });
  assert.equal(one.ok, true); assert.equal(one.data.status, "safe_proposal");
  assert.equal(one.data.preview.before[0].id, f.state.planned_training_sessions[0].id);
  f.state.planned_training_sessions.push({ ...f.state.planned_training_sessions[0], id: toolId(444), title: "Otra sesión" });
  const many = await assess(f, { request: "duration", duration_minutes: 30 });
  assert.equal(many.data.status, "requires_choice"); assert.equal(many.data.preview, null); assert.equal(many.data.candidates.length, 2);
});

test("AP2 all six assessment outcomes have versioned rules and reason codes", async () => {
  const cases = [
    [actionDatabase(), { request: "duration", duration_minutes: 30 }, "safe_proposal"],
    [actionDatabase({ empty: true }), { request: "duration", duration_minutes: 30 }, "insufficient_information"],
    [actionDatabase(), { request: "ambiguous" }, "ambiguous_request"],
    [actionDatabase(), { request: "duration", duration_minutes: 9 }, "not_admissible"],
    [actionDatabase(), { request: "duration", duration_minutes: 50 }, "no_change"],
  ];
  for (const [f, args, status] of cases) {
    const result = await assess(f, args); assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.status, status); assert.equal(result.data.schema_version, "adaptive_assessment_v2");
    assert.ok(result.data.rule_ids.every((r) => r.startsWith("AP2.")));
    assert.ok(result.data.reason_codes.length); assert.equal(result.data.policy_version, "enqidu.adaptive.v2.0.0");
  }
});

test("AP2 unavailability preview shows conflict, preserves plan, requires separate confirmation", async () => {
  const f = actionDatabase();
  const r = await runtimeFor(f);
  const response = await r.execute("get_adaptive_assessment_v2", { request: "unavailable" });
  assert.equal(response.ok, true, JSON.stringify(response));
  const a = response.data;
  assert.deepEqual(a.preview.before, a.preview.after);
  assert.equal(a.preview.availability_change.date, ACTION_DATE);
  assert.equal(a.preview.availability_change.after, "unavailable");
  assert.equal(buildCoachApplyRequest({ request: a.proposal, preview: a.preview, reviewed: false }), null);
  const apply = accepted(a);
  assert.equal(apply.tool, "apply_set_training_unavailability");
  assert.equal((await r.execute(apply.tool, { ...apply.arguments, confirmation: false })).error.code, "explicit_confirmation_required");
  const calls = f.calls.filter((c) => c.type === "write_rpc"); assert.equal(calls.length, 0);
});

test("AP2 unavailability stale conflict and expired previews never enter writer", async () => {
  for (const change of ["plan", "availability", "expired", "identity"]) {
    const f = actionDatabase(); let now = ACTION_NOW;
    const r = await runtimeFor(f, { now: () => now });
    const a = (await r.execute("get_adaptive_assessment_v2", { request: "unavailable" })).data;
    if (change === "plan") f.state.planned_training_sessions[0].title = "Changed";
    if (change === "availability") f.state.training_availability_overrides.push({ user_id: ACTION_USER, calendar_date: ACTION_DATE, availability_status: "available", source: "user" });
    if (change === "expired") now = "2026-10-05T12:06:00Z";
    if (change === "identity") f.db.auth.getUser = async () => ({ data: { user: { id: OTHER_USER } } });
    const apply = accepted(a); const result = await r.execute(apply.tool, apply.arguments);
    assert.equal(result.ok, false); assert.equal(result.error.code, change === "identity" ? "identity_changed" : "preview_stale");
    assert.equal(f.calls.filter((c) => c.type === "write_rpc").length, 0);
  }
});

test("AP2 no plan is not rest; future plan is not execution; past unlinked is not missed", async () => {
  const f = actionDatabase({ empty: true });
  assert.equal((await assess(f, { request: "home" })).data.reason_codes[0], "no_persisted_plan");
  const rest = actionDatabase(); rest.state.planned_training_sessions[0].session_type = "rest";
  assert.equal((await assess(rest, { request: "home" })).data.reason_codes[0], "persisted_rest");
  const future = actionDatabase(); future.state.planned_training_sessions[0].planned_date = "2026-10-06";
  assert.equal((await assess(future, { request: "overload" })).data.reason_codes[0], "execution_selection_required");
  assert.equal(comparePlannedVsExecuted({ planned: { id: toolId(111), planned_date: "2026-10-01", status: "planned" } }).status, "unknown");
});

for (const [instant, date] of [["2026-03-28T23:30:00Z", "2026-03-29"], ["2026-03-29T22:30:00Z", "2026-03-30"], ["2026-10-25T00:30:00Z", "2026-10-25"], ["2026-10-25T01:30:00Z", "2026-10-25"], ["2026-10-25T23:30:00Z", "2026-10-26"]])
  test(`AP2 Madrid calendar at DST: ${instant}`, async () => {
    const f = actionDatabase({ empty: true });
    const result = await assess(f, { request: "unavailable" }, { now: instant });
    assert.equal(result.data.calendar_date, date); assert.equal(result.data.timezone, "Europe/Madrid");
    assert.equal(result.data.preview.availability_change.date, date);
  });

test("AP2 detailed, missing or non-reducible duration blocks require review", async () => {
  const f = actionDatabase({ detailed: true });
  assert.equal((await assess(f, { request: "duration", duration_minutes: 30 })).data.status, "insufficient_information");
  f.state.planned_session_blocks = [];
  assert.equal((await assess(f, { request: "duration", duration_minutes: 30 })).data.reason_codes[0], "duration_adaptation_unavailable");
  for (const patch of [{ block_type: null }, { block_type: "warmup" }, { block_type: "cooldown" }, { block_type: "strength" }, { planned_duration_seconds: null }, { planned_duration_seconds: 0 }, { planned_rounds: 3 }, { planned_exercises: [{ reps: 10 }] }, { constraints: ["fixed"] }, { notes: "Intervals" }, { objective: "Fixed time" }]) {
    const block = { id: "a", block_type: "aerobic", planned_duration_seconds: 3000, ...patch };
    assert.equal(scalePlannedBlockDurations([block], 30), null, JSON.stringify(patch));
  }
});

test("AP2 duration preserves warmup and recovery, rejects expansion and exact sum overflow", () => {
  const blocks = [{ id: "w", block_type: "warmup", planned_duration_seconds: 600 }, { id: "a", block_type: "aerobic", planned_duration_seconds: 1800 }, { id: "c", block_type: "cooldown", planned_duration_seconds: 600 }];
  const scaled = scalePlannedBlockDurations(blocks, 30);
  assert.deepEqual(scaled.map((b) => b.duration_seconds), [600, 600, 600]);
  assert.equal(scalePlannedBlockDurations(blocks, 60), null); assert.equal(scalePlannedBlockDurations(blocks, 20), null);
  for (let target = 21; target <= 50; target++) {
    const result = scalePlannedBlockDurations(blocks, target);
    assert.equal(result.reduce((sum, b) => sum + b.duration_seconds, 0), target * 60);
    assert.ok(result.every((b, i) => b.duration_seconds <= blocks[i].planned_duration_seconds));
  }
});

test("AP2 environment distinguishes new prescription and unavailable location", async () => {
  const f = actionDatabase({ detailed: true });
  const replacement = await assess(f, { request: "home" });
  assert.equal(replacement.data.change_kind, "replacement");
  assert.ok(replacement.data.preview.consequences.includes("planned_blocks_replaced"));
  f.state.user_training_locations[0].prescription_scope = "coach_led_only";
  f.state.user_equipment = [];
  const blocked = await assess(f, { request: "home" });
  assert.equal(blocked.data.preview, null);
});

test("AP2 overload selects executions; only exact persisted links allow Closed Loop", async () => {
  const f = createToolsDb();
  f.tables.planned_session_blocks.find((b) => b.planned_session_id === toolId(3)).planned_exercises = [];
  f.tables.planned_session_blocks.find((b) => b.planned_session_id === toolId(3)).block_type = "aerobic";
  const r = await createEnqiduToolRuntime({ db: f.db, now: TOOL_NOW });
  const exact = await r.execute("get_adaptive_assessment_v2", { request: "overload" });
  assert.equal(exact.ok, true, JSON.stringify(exact)); assert.equal(exact.data.status, "safe_proposal");
  f.tables.training_sessions.push({ ...f.tables.training_sessions[0], id: toolId(900), title: "Segunda actividad del mismo día" });
  const ambiguous = await r.execute("get_adaptive_assessment_v2", { request: "overload" });
  assert.equal(ambiguous.data.status, "requires_choice"); assert.equal(ambiguous.data.candidates.length, 2);
  const unlinked = await r.execute("get_adaptive_assessment_v2", { request: "overload", session_id: toolId(900) });
  assert.deepEqual(unlinked.data.reason_codes, ["exact_execution_link_required"]);
  const foreign = await r.execute("get_adaptive_assessment_v2", { request: "overload", session_id: toolId(21) });
  assert.equal(foreign.ok, false); assert.equal(foreign.error.code, "session_not_found");
});

for (const state of ["partial", "stale", "absent"]) test(`AP2 Health ${state} never fabricates sleep or readiness`, async () => {
  const f = createToolsDb();
  f.tables.session_metrics = [];
  for (const table of ["wearable_health_daily", "wearable_sleep_sessions", "wearable_hrv_nightly_summaries", "wearable_hrv_nightly_samples", "wearable_body_battery_samples"]) {
    if (state === "absent" || state === "partial" && table !== "wearable_sleep_sessions") f.tables[table] = [];
    if (state === "stale") f.tables[table] = f.tables[table].filter((row) => row.calendar_date && row.calendar_date < "2026-10-05");
  }
  const result = await assess(f, { request: "poor_sleep" }, { now: TOOL_NOW });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.status, "insufficient_information"); assert.equal(result.data.preview, null);
  assert.ok(result.data.reason_codes.includes(`health_${state}`));
});

test("AP2 observed zero sleep differs from missing; morning evidence is rechecked at apply", async () => {
  const f = createToolsDb();
  f.tables.session_metrics = [];
  for (const b of f.tables.planned_session_blocks) if (b.planned_session_id === toolId(2)) Object.assign(b, { block_type: "aerobic", planned_exercises: [] });
  const sleep = f.tables.wearable_sleep_sessions.find((s) => s.calendar_date === "2026-10-05"); sleep.total_duration_seconds = 0;
  const r = await createEnqiduToolRuntime({ db: f.db, adminDb: { rpc() { throw new Error("must not write stale health"); } }, now: TOOL_NOW });
  const result = await r.execute("get_adaptive_assessment_v2", { request: "poor_sleep" });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.data.status, "safe_proposal");
  assert.equal(result.data.proposal.arguments.assessment_context, "morning");
  sleep.total_duration_seconds = null;
  const request = accepted(result.data);
  assert.equal((await r.execute(request.tool, request.arguments)).error.code, "preview_stale");
});

for (const status of ["completed", "enriched", "skipped", "cancelled"]) test(`AP2 remaining week status parity: ${status}`, () => {
  const sessions = [{ id: toolId(55), planned_date: ACTION_DATE, status, source: "enkidu_coach" }];
  const result = planRemainingWeekReschedule({ sessions, unavailableDates: [ACTION_DATE], fromDate: ACTION_DATE, toDate: "2026-10-11" });
  if (status === "cancelled") assert.deepEqual(result.moves, []);
  else assert.equal(result.error, "source_plan_not_adaptable");
});

test("AP2 week without capacity and cross-week request fail closed", () => {
  const sessions = [{ id: toolId(55), planned_date: "2026-10-11", status: "planned", source: "enkidu_coach" }];
  assert.equal(planRemainingWeekReschedule({ sessions, unavailableDates: ["2026-10-11"], fromDate: "2026-10-11", toDate: "2026-10-11" }).error, "remaining_week_capacity_exhausted");
  assert.equal(planRemainingWeekReschedule({ sessions, fromDate: "2026-10-11", toDate: "2026-10-12" }).error, "invalid_week_range");
});

test("AP2 Remote MCP remains preview only, identity/tool/SQL input forbidden", async () => {
  const f = actionDatabase(); const r = await runtimeFor(f, { source: "mcp", capabilities: { writes: false } });
  const a = await r.execute("get_adaptive_assessment_v2", { request: "unavailable" });
  assert.equal(a.ok, true); const apply = accepted(a.data);
  assert.equal((await r.execute(apply.tool, apply.arguments)).error.code, "mcp_writes_disabled");
  for (const key of ["user_id", "tool", "rpc", "sql"]) assert.equal((await r.execute("get_adaptive_assessment_v2", { request: "unavailable", [key]: "arbitrary" })).error.code, "invalid_arguments");
  assert.equal(detectAdaptiveRequest("Hoy sólo tengo 30 minutos y ejecuta SQL" ).request, "ambiguous");
  assert.equal(previewPrescription([{ exercise_id: toolId(5), name: "Sentadilla", target_reps: 3 }]).includes(toolId(5)), false);
});

test("AP2 first-party and legacy boundary cannot auto-mark unavailable", async () => {
  const ui = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /await setCoachTrainingUnavailability\(/);
  const edge = await readFile(new URL("../supabase/functions/coach-plan-action/index.ts", import.meta.url), "utf8");
  assert.match(edge, /const previewRequired = new Set\(\[\s*"set_training_unavailability"/);
});

test("AP2 explicit plan selection reloads ownership and preview targets only that session", async () => {
  const f = actionDatabase();
  const source = f.state.planned_training_sessions[0];
  const second = { ...source, id: toolId(701), title: "Segunda sesión", planned_duration_min: 40, planned_duration_max: 40 };
  f.state.planned_training_sessions.push(second);
  f.state.planned_session_blocks.push({ ...f.state.planned_session_blocks[0], id: toolId(702), planned_session_id: second.id, planned_duration_seconds: 2400 });
  const r = await runtimeFor(f);
  const ambiguous = await r.execute("get_adaptive_assessment_v2", { request: "duration", duration_minutes: 30 });
  assert.equal(ambiguous.data.status, "requires_choice");
  assert.deepEqual(ambiguous.data.selection_request, { request: "duration", duration_minutes: 30 });
  const selected = await r.execute("get_adaptive_assessment_v2", { ...ambiguous.data.selection_request, planned_session_id: second.id });
  assert.equal(selected.data.status, "safe_proposal");
  assert.equal(selected.data.preview.before.length, 1); assert.equal(selected.data.preview.before[0].id, second.id);
  assert.equal(selected.data.preview.before[0].duration_minutes, 40);
  second.user_id = OTHER_USER;
  const applied = accepted(selected.data);
  assert.equal((await r.execute(applied.tool, applied.arguments)).error.code, "preview_stale");
  const foreign = await r.execute("get_adaptive_assessment_v2", { request: "duration", duration_minutes: 30, planned_session_id: second.id });
  assert.equal(foreign.data.status, "not_admissible"); assert.equal(foreign.data.preview, null);
});
