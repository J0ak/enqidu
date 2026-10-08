import assert from "node:assert/strict";
import test from "node:test";
import { prepareEnqiduAction, executePreparedEnqiduAction, bindEnqiduActionEvidence } from "../src/enqiduTools/actions.js";
import { fingerprintEnqiduAction } from "../src/enqiduTools/actionPreview.js";
import { createEnqiduToolRuntime } from "../src/enqiduTools/runtime.js";
import { createEnqiduToolsHttpHandler } from "../src/enqiduTools/http.js";
import { buildTrainingRecommendation } from "../src/coachContext/trainingRecommendation.js";
import { toPlannedRecommendationPayload } from "../src/coachContext/coachPlanAction.js";
import { actionDatabase, ACTION_DATE, ACTION_NOW, ACTION_USER, ACTION_PLAN, ACTION_BLOCK } from "./fixtures/enqidu-action-db.mjs";

const calendar = { date: ACTION_DATE, timezone: "Europe/Madrid" };
const prepare = (fixture, action = "adapt_duration", args = { source_date: ACTION_DATE, duration_minutes: 40 }, extra = {}) =>
  prepareEnqiduAction({ db: fixture.db, userId: ACTION_USER, calendar, action, args, now: ACTION_NOW, ...extra });

test("TRANSACTION CONTRACT: move previews respect the bounded SQL date-lock scope", async () => {
  const fixture = actionDatabase();
  const target = (days) => new Date(Date.parse(`${ACTION_DATE}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  assert.equal((await prepare(fixture, "move_session", { source_date: ACTION_DATE, target_date: target(366) })).ok, true);
  assert.equal((await prepare(fixture, "move_session", { source_date: ACTION_DATE, target_date: target(367) })).error, "invalid_target_date");
});

test("TRANSACTION CONTRACT: only the closed compare-and-write RPC receives prepared commands", async () => {
  for (const [action, args] of [
    ["move_session", { source_date: ACTION_DATE, target_date: "2026-10-08" }],
    ["adapt_duration", { source_date: ACTION_DATE, duration_minutes: 40 }],
    ["adapt_environment", { source_date: ACTION_DATE, environment: "home" }],
    ["cancel_session", { source_date: ACTION_DATE }],
    ["adapt_remaining_week", {}],
  ]) {
    const fixture = actionDatabase({ action });
    const prepared = await prepare(fixture, action, args);
    assert.equal(prepared.ok, true);
    const calls = [];
    const result = await executePreparedEnqiduAction({ userId: ACTION_USER, prepared, adminDb: {
      async rpc(name, rpcArgs) { calls.push({ name, args: rpcArgs }); return { data: { ok: true }, error: null }; },
    } });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "apply_enqidu_action_v1");
    assert.deepEqual(Object.keys(calls[0].args).sort(), ["p_action", "p_command", "p_expected", "p_user_id"]);
    assert.equal(calls[0].args.p_user_id, ACTION_USER);
    assert.equal(calls[0].args.p_action, action);
    const { expected, command } = prepared.transaction;
    assert.equal(expected.version, 1);
    assert.deepEqual(expected.calendar, calendar);
    assert.equal(expected.scope.selection, "action");
    assert.equal(expected.blocks[0].id, ACTION_BLOCK);
    assert.equal(expected.blocks[0].planned_duration_seconds, 3000);
    assert.deepEqual(expected.blocks[0].planned_exercises, fixture.state.planned_session_blocks[0].planned_exercises);
    assert.equal(Object.isFrozen(expected.blocks[0]), true);
    assert.equal(Object.hasOwn(command, "user_id"), false);
    assert.equal(Object.hasOwn(expected, "fingerprint"), false);
    assert.equal(Object.hasOwn(expected, "health"), false);
    assert.equal(expected.prescription === null, action !== "adapt_environment");
    if (action === "adapt_environment") {
      assert.deepEqual(Object.keys(command.session).sort(), ["blocks", "duration_minutes", "environment", "intensity", "objective", "session_type", "title"]);
      assert.deepEqual(Object.keys(command.session.blocks[0]).sort(), ["duration_minutes", "title"]);
    }
  }
});

test("TRANSACTION CONTRACT: missing RPC fails closed without falling back to a legacy writer", async () => {
  const fixture = actionDatabase();
  const prepared = await prepare(fixture);
  const calls = [];
  const result = await executePreparedEnqiduAction({ userId: ACTION_USER, prepared, adminDb: {
    async rpc(name) { calls.push(name); return { error: { code: "PGRST202", message: "Internal schema/cache SQL details" } }; },
  } });
  assert.deepEqual(calls, ["apply_enqidu_action_v1"]);
  assert.deepEqual(result, { ok: false, error: "plan_write_failed" });
  assert.equal(fixture.state.planned_training_sessions[0].planned_duration_max, 50);
});

test("TRANSACTION CONTRACT: runtime sanitizes an unavailable wrapper without mutation fallback", async () => {
  const fixture = actionDatabase();
  const calls = [];
  const runtime = await createEnqiduToolRuntime({ db: fixture.db, now: ACTION_NOW, adminDb: {
    async rpc(name) { calls.push(name); return { error: { code: "PGRST202", message: "PRIVATE SQL CACHE DETAIL" } }; },
  } });
  const args = { source_date: ACTION_DATE, duration_minutes: 40 };
  const preview = await runtime.execute("preview_adapt_duration", args);
  const result = await runtime.execute("apply_adapt_duration", { ...args, confirmation: true,
    fingerprint: preview.data.fingerprint, expires_at: preview.data.expires_at });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "plan_write_failed");
  assert.match(result.error.safe_message, /Consulta el plan/);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|SQL|CACHE|PGRST202/);
  assert.deepEqual(calls, ["apply_enqidu_action_v1"]);
  assert.equal(fixture.state.planned_training_sessions[0].planned_duration_max, 50);
});

test("TRANSACTION CONTRACT: database stale conflict reaches HTTP 409 and never retries", async () => {
  const fixture = actionDatabase();
  const calls = [];
  const adminDb = {
    async rpc(name) { calls.push(name); return { data: { ok: false, error: "preview_stale", internal: "PRIVATE_STATE" }, error: null }; },
  };
  const runtime = await createEnqiduToolRuntime({ db: fixture.db, now: ACTION_NOW, adminDb });
  const preview = await runtime.execute("preview_adapt_duration", { source_date: ACTION_DATE, duration_minutes: 40 });
  const handler = createEnqiduToolsHttpHandler({ now: ACTION_NOW, createClients: async () => ({ db: fixture.db, adminDb }) });
  const response = await handler(new Request("http://localhost/enqidu-tools", {
    method: "POST", headers: { Authorization: "Bearer local-test", "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "apply_adapt_duration", arguments: { source_date: ACTION_DATE, duration_minutes: 40,
      fingerprint: preview.data.fingerprint, expires_at: preview.data.expires_at, confirmation: true } }),
  }));
  assert.equal(response.status, 409);
  const result = await response.json();
  assert.equal(result.error.code, "preview_stale");
  assert.match(result.error.safe_message, /nueva propuesta/);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_STATE/);
  assert.deepEqual(calls, ["apply_enqidu_action_v1"]);
  assert.equal(fixture.state.planned_training_sessions[0].planned_duration_max, 50);
});

test("TRANSACTION CONTRACT: environment recommendation consumes its exact authority snapshot", async () => {
  const fixture = actionDatabase();
  // Deliberately disagree with the canonical raw authority. The RPC cannot
  // provide permission or inventory from a different point in time.
  fixture.context.athlete_context.constraints = [{ location_type: "home", prescription_scope: "coach_led_only" }];
  fixture.context.athlete_context.equipment = [];
  const prepared = await prepare(fixture, "adapt_environment", { source_date: ACTION_DATE, environment: "home" });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.transaction.command.session.session_type, "strength");
  assert.equal(prepared.transaction.expected.prescription.locations[0].prescription_scope, "autonomous");
  assert.equal(prepared.transaction.expected.prescription.catalog[0].name, "Dumbbells");
  fixture.state.user_training_locations[0].prescription_scope = "coach_led_only";
  fixture.context.athlete_context.constraints = [{ location_type: "home", prescription_scope: "autonomous" }];
  assert.equal((await prepare(fixture, "adapt_environment", { source_date: ACTION_DATE, environment: "home" })).error, "recommendation_unavailable");
});

test("TRANSACTION CONTRACT: later authority reads cannot replace facts used to prescribe", async () => {
  const fixture = actionDatabase();
  const originalRpc = fixture.db.rpc;
  fixture.db.rpc = async (...args) => {
    fixture.state.user_training_locations[0].prescription_scope = "coach_led_only";
    fixture.state.equipment_catalog[0].name = "Removed dumbbells";
    return originalRpc(...args);
  };
  const prepared = await prepare(fixture, "adapt_environment", { source_date: ACTION_DATE, environment: "home" });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.transaction.expected.prescription.locations[0].prescription_scope, "autonomous");
  assert.equal(prepared.transaction.expected.prescription.catalog[0].name, "Dumbbells");
  assert.equal(prepared.transaction.command.session.session_type, "strength");
  // The changed rows now disagree with expected; the real SQL suite exercises
  // this comparison under concurrent locks rather than implementing SQL here.
  assert.notEqual(prepared.transaction.expected.prescription.locations[0].prescription_scope, fixture.state.user_training_locations[0].prescription_scope);
});

test("TRANSACTION CONTRACT: authority projection preserves the existing recommendation policy and scoped inventory", async () => {
  const fixture = actionDatabase();
  const inventory = fixture.state.user_equipment[0];
  fixture.state.user_equipment.push(
    { ...inventory, id: "50000000-0000-4000-8000-000000000004", location_label: "pool" },
    { ...inventory, id: "50000000-0000-4000-8000-000000000005", available: false },
    { ...inventory, id: "50000000-0000-4000-8000-000000000006", valid_from: "2026-10-06" },
    { ...inventory, id: "50000000-0000-4000-8000-000000000007", valid_to: "2026-10-04" },
  );
  const prepared = await prepare(fixture, "adapt_environment", { source_date: ACTION_DATE, environment: "home" });
  assert.equal(prepared.ok, true);
  const context = prepared.state.recommendation_context;
  assert.deepEqual(context.athlete_context.equipment.map(({ location }) => location), ["home", "pool"]);
  const canonical = buildTrainingRecommendation(context, { requestedLocation: { key: "home" } });
  assert.deepEqual(canonical.equipment, ["Dumbbells"]);
  assert.deepEqual(prepared.mutation.session, toPlannedRecommendationPayload(canonical));
  // Unavailable/future/expired rows are still expected authority: becoming
  // eligible before the transaction must invalidate this prescription.
  assert.equal(prepared.transaction.expected.prescription.equipment.length, 5);
  assert.equal(prepared.transaction.expected.prescription.equipment[2].available, false);
  assert.equal(prepared.transaction.expected.prescription.equipment[3].valid_from, "2026-10-06");
});

test("TRANSACTION CONTRACT: Closed Loop protects every earlier candidate up to a later confirmed target", async () => {
  const fixture = actionDatabase();
  fixture.state.planned_training_sessions[0].planned_date = "2026-10-09";
  const extra = { targetSelection: "closed_loop_target" };
  const args = { source_date: "2026-10-09", duration_minutes: 40 };
  const first = await prepare(fixture, "adapt_duration", args, extra);
  assert.equal(first.ok, true);
  assert.deepEqual(first.transaction.expected.scope, { selection: "closed_loop_target", from_date: "2026-10-06",
    to_date: "2026-10-09", block_session_ids: [ACTION_PLAN] });
  fixture.state.planned_training_sessions.push({ ...fixture.state.planned_training_sessions[0],
    id: "20000000-0000-4000-8000-000000000009", planned_date: "2026-10-07" });
  assert.equal((await prepare(fixture, "adapt_duration", args, extra)).error, "proposal_not_actionable");
  fixture.state.planned_training_sessions[1].status = "cancelled";
  const second = await prepare(fixture, "adapt_duration", args, extra);
  assert.equal(second.transaction.expected.plans.length, 2);
  assert.notEqual(await fingerprintEnqiduAction(first), await fingerprintEnqiduAction(second));
});

test("TRANSACTION CONTRACT: advisory evidence changes preflight consistency, never the confirmed command", async () => {
  const prepared = await prepare(actionDatabase());
  const first = bindEnqiduActionEvidence(prepared, { proposal: { action: "reduce", reasons: ["rpe_above_range"] }, health: { score: 60 } });
  const next = bindEnqiduActionEvidence(prepared, { proposal: { action: "reduce", reasons: ["rpe_above_range"] }, health: { score: 59 } });
  assert.deepEqual(first.transaction, next.transaction);
  assert.notEqual(await fingerprintEnqiduAction(first), await fingerprintEnqiduAction(next));
  assert.equal(first.transaction.command.duration, 40);
  assert.equal(first.transaction.command.sessionId, ACTION_PLAN);
});
