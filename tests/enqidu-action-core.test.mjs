import assert from "node:assert/strict";
import test from "node:test";
import { prepareEnqiduAction, executePreparedEnqiduAction, bindEnqiduActionEvidence } from "../src/enqiduTools/actions.js";
import { buildEnqiduActionPreview, validateEnqiduActionPreview, fingerprintEnqiduAction } from "../src/enqiduTools/actionPreview.js";
import { actionDatabase, ACTION_DATE, ACTION_NOW, ACTION_USER, OTHER_USER, ACTION_PLAN, ACTION_BLOCK } from "./fixtures/enqidu-action-db.mjs";

const calendar = { date: ACTION_DATE, timezone: "Europe/Madrid" };
const actions = {
  move_session: { source_date: ACTION_DATE, target_date: "2026-10-08" },
  adapt_duration: { source_date: ACTION_DATE, duration_minutes: 40 },
  adapt_environment: { source_date: ACTION_DATE, environment: "home" },
  cancel_session: { source_date: ACTION_DATE },
  adapt_remaining_week: {},
};
const prep = (fixture, action, args = actions[action], userId = ACTION_USER) => prepareEnqiduAction({
  db: fixture.db, userId, calendar, action, args, now: ACTION_NOW,
});
const writeCalls = (fixture) => fixture.calls.filter((call) => call.type === "write_rpc");

for (const [action, args] of Object.entries(actions)) {
  test(`ACTION MATRIX ${action}: deterministic exact preview performs no writes`, async () => {
    const fixture = actionDatabase({ action });
    const original = structuredClone(fixture.state);
    const first = await prep(fixture, action);
    assert.equal(first.ok, true, JSON.stringify(first));
    const preview = await buildEnqiduActionPreview({ prepared: first, now: ACTION_NOW });
    const second = await buildEnqiduActionPreview({ prepared: await prep(fixture, action), now: ACTION_NOW });
    assert.deepEqual(preview, second);
    assert.deepEqual(fixture.state, original);
    assert.equal(writeCalls(fixture).length, 0);
    assert.equal(preview.before[0].id, ACTION_PLAN);
    assert.equal(preview.before[0].duration_minutes, 50);
    assert.equal(preview.requires_confirmation, true);
    assert.equal(preview.timezone, "Europe/Madrid");
    assert.equal(JSON.stringify(preview).includes("mutation"), false);
    assert.equal(JSON.stringify(preview).includes("p_user_id"), false);
  });

  test(`ACTION MATRIX ${action}: existing action commits exact reviewed change and preserves execution history`, async () => {
    const fixture = actionDatabase({ action });
    fixture.state.training_sessions.push({ id: "fit-preserved", user_id: ACTION_USER, raw_data: "canonical FIT evidence" });
    const beforeExecution = structuredClone(fixture.state.training_sessions);
    const prepared = await prep(fixture, action);
    const preview = await buildEnqiduActionPreview({ prepared, now: ACTION_NOW });
    const reloaded = await prep(fixture, action);
    assert.deepEqual(await validateEnqiduActionPreview({ prepared: reloaded, fingerprint: preview.fingerprint,
      expiresAt: preview.expires_at, now: ACTION_NOW }), { ok: true });
    const result = await executePreparedEnqiduAction({ adminDb: fixture.adminDb, userId: ACTION_USER, prepared: reloaded });
    assert.equal(result.ok, true);
    assert.equal(writeCalls(fixture).length, 1);
    assert.deepEqual(fixture.state.training_sessions, beforeExecution);
    const persisted = fixture.state.planned_training_sessions[0];
    assert.equal(persisted.planned_date, preview.after[0].date);
    assert.equal(persisted.status, preview.after[0].status);
    assert.equal(persisted.planned_duration_max, preview.after[0].duration_minutes);
    assert.equal(persisted.location_type, preview.after[0].environment);
    assert.equal(result.llm_used, false);
  });

  test(`ACTION MATRIX ${action}: relevant state change invalidates old receipt without writes`, async () => {
    const fixture = actionDatabase({ action });
    const first = await prep(fixture, action);
    const preview = await buildEnqiduActionPreview({ prepared: first, now: ACTION_NOW });
    fixture.state.planned_session_blocks[0].notes = "Changed after preview";
    const reloaded = await prep(fixture, action);
    const validation = await validateEnqiduActionPreview({ prepared: reloaded, fingerprint: preview.fingerprint,
      expiresAt: preview.expires_at, now: ACTION_NOW });
    assert.equal(validation.error, "preview_stale");
    assert.equal(writeCalls(fixture).length, 0);
  });

  test(`ACTION MATRIX ${action}: ownership, malformed arguments and prepared payload injection fail closed`, async () => {
    const fixture = actionDatabase({ action });
    const prepared = await prep(fixture, action);
    assert.equal((await prep(fixture, action, { ...args, user_id: OTHER_USER })).error, "invalid_arguments");
    assert.equal((await executePreparedEnqiduAction({ adminDb: fixture.adminDb, userId: OTHER_USER, prepared })).error, "invalid_prepared_action");
    assert.equal((await executePreparedEnqiduAction({ adminDb: fixture.adminDb, userId: ACTION_USER,
      prepared: structuredClone(prepared) })).error, "invalid_prepared_action");
    assert.equal(Object.isFrozen(prepared.mutation), true);
    const foreign = await prep(actionDatabase({ action, owner: OTHER_USER }), action);
    assert.equal(foreign.ok, action === "adapt_remaining_week");
    if (action === "adapt_remaining_week") assert.deepEqual(foreign.before, []);
    else assert.equal(foreign.error, "source_plan_not_found");
    assert.equal(writeCalls(fixture).length, 0);
  });

  if (action !== "adapt_remaining_week") {
    for (const [label, edit, expected] of [
      ["nonexistent", (state) => { state.planned_training_sessions = []; }, "source_plan_not_found"],
      ["completed", (state) => { state.planned_training_sessions[0].linked_completed_session_id = "execution"; }, "source_plan_already_completed"],
      ["cancelled", (state) => { state.planned_training_sessions[0].status = "cancelled"; }, "source_plan_not_found"],
      ["skipped", (state) => { state.planned_training_sessions[0].status = "skipped"; }, "source_plan_not_adaptable"],
      ["ambiguous", (state) => { state.planned_training_sessions.push({ ...state.planned_training_sessions[0], id: "other-plan" }); }, "source_plan_ambiguous"],
    ]) {
      test(`ACTION MATRIX ${action}: ${label} target rejected without mutation`, async () => {
        const fixture = actionDatabase({ action }); edit(fixture.state);
        const original = structuredClone(fixture.state);
        assert.equal((await prep(fixture, action)).error, expected);
        assert.deepEqual(fixture.state, original);
        assert.equal(writeCalls(fixture).length, 0);
      });
    }
    test(`ACTION MATRIX ${action}: impossible and historical calendar dates rejected`, async () => {
      const fixture = actionDatabase({ action });
      assert.equal((await prep(fixture, action, { ...args, source_date: "2026-02-30" })).error, "invalid_date");
      assert.equal((await prep(fixture, action, { ...args, source_date: "2026-10-04" })).error, "stale_plan_source_date");
    });
  }
}

test("ACTION MATRIX: invalid duration, environment, move target and unavailable days reject", async () => {
  const fixture = actionDatabase();
  for (const value of [null, 0, 9, 181, 30.5, "30", NaN]) assert.equal((await prep(fixture, "adapt_duration", { source_date: ACTION_DATE, duration_minutes: value })).error, "invalid_duration");
  for (const value of [null, "random", {}, []]) assert.equal((await prep(fixture, "adapt_environment", { source_date: ACTION_DATE, environment: value })).error, "invalid_location");
  for (const value of ["2026-02-30", ACTION_DATE, "2026-10-04"]) assert.equal((await prep(fixture, "move_session", { source_date: ACTION_DATE, target_date: value })).error, "invalid_target_date");
  fixture.state.training_availability_overrides.push({ user_id: ACTION_USER, calendar_date: ACTION_DATE, availability_status: "unavailable" });
  assert.equal((await prep(fixture, "adapt_duration")).error, "athlete_unavailable");
  assert.equal((await prep(fixture, "adapt_environment")).error, "athlete_unavailable");
  fixture.state.training_availability_overrides[0].calendar_date = "2026-10-08";
  assert.equal((await prep(fixture, "move_session")).error, "target_date_unavailable");
});

test("ACTION MATRIX: week handles missing/cancelled/foreign plans as unchanged, rejects completed/skipped/ambiguous", async () => {
  for (const status of ["cancelled", "skipped"]) {
    const fixture = actionDatabase({ action: "adapt_remaining_week" }); fixture.state.planned_training_sessions[0].status = status;
    const result = await prep(fixture, "adapt_remaining_week");
    if (status === "cancelled") assert.equal(result.mutation, null);
    else assert.equal(result.error, "source_plan_not_adaptable");
  }
  const completed = actionDatabase({ action: "adapt_remaining_week" }); completed.state.planned_training_sessions[0].linked_completed_session_id = "execution";
  assert.equal((await prep(completed, "adapt_remaining_week")).error, "source_plan_not_adaptable");
  const ambiguous = actionDatabase({ action: "adapt_remaining_week" }); ambiguous.state.planned_training_sessions.push({ ...ambiguous.state.planned_training_sessions[0], id: "duplicate" });
  assert.equal((await prep(ambiguous, "adapt_remaining_week")).error, "remaining_week_plan_ambiguous");
});

test("ACTION MATRIX: week remains one atomic existing RPC, errors never expose database details", async () => {
  const fixture = actionDatabase({ action: "adapt_remaining_week" });
  fixture.state.planned_training_sessions.push({ ...fixture.state.planned_training_sessions[0], id: "other-plan", planned_date: "2026-10-06" });
  fixture.state.training_availability_overrides.push({ user_id: ACTION_USER, calendar_date: "2026-10-06", availability_status: "unavailable" });
  const prepared = await prep(fixture, "adapt_remaining_week");
  assert.equal(prepared.mutation.moves.length, 2);
  const original = structuredClone(fixture.state);
  const failure = await executePreparedEnqiduAction({ userId: ACTION_USER, prepared,
    adminDb: { async rpc() { return { error: { message: "SQL password and stacktrace" } }; } },
  });
  assert.deepEqual(failure, { ok: false, error: "plan_write_failed" });
  assert.deepEqual(fixture.state, original);
  const result = await executePreparedEnqiduAction({ adminDb: fixture.adminDb, userId: ACTION_USER, prepared });
  assert.equal(result.moved_count, 2);
  assert.equal(writeCalls(fixture).length, 1);
  assert.equal(writeCalls(fixture)[0].name, "adapt_coach_remaining_week");
});

test("ACTION MATRIX: unchanged duration/week previews require no confirmation and never call writer", async () => {
  for (const [action, fixture, args] of [
    ["adapt_duration", actionDatabase(), { source_date: ACTION_DATE, duration_minutes: 50 }],
    ["adapt_remaining_week", actionDatabase({ empty: true }), {}],
  ]) {
    const prepared = await prep(fixture, action, args);
    const preview = await buildEnqiduActionPreview({ prepared, now: ACTION_NOW });
    assert.equal(preview.requires_confirmation, false);
    const result = await executePreparedEnqiduAction({ adminDb: fixture.adminDb, userId: ACTION_USER, prepared });
    assert.equal(result.adapted, false);
    assert.equal(writeCalls(fixture).length, 0);
  }
});

test("ACTION MATRIX: same-duration no-op does not predict block rescaling that will not be persisted", async () => {
  const fixture = actionDatabase();
  fixture.state.planned_session_blocks[0].planned_duration_seconds = 60;
  fixture.state.planned_session_blocks.push({ ...fixture.state.planned_session_blocks[0], id: "second-block", block_order: 2, planned_duration_seconds: 2940 });
  const prepared = await prep(fixture, "adapt_duration", { source_date: ACTION_DATE, duration_minutes: 50 });
  assert.equal(prepared.mutation, null);
  assert.deepEqual(prepared.after, prepared.before);
});

test("ACTION MATRIX: environment preview exposes discarded prescription details exactly", async () => {
  const fixture = actionDatabase();
  const preview = await buildEnqiduActionPreview({ prepared: await prep(fixture, "adapt_environment"), now: ACTION_NOW });
  const before = preview.before[0].blocks[0], after = preview.after[0].blocks[0];
  assert.equal(before.objective, "Controlled repetitions");
  assert.equal(before.planned_rounds, 3);
  assert.deepEqual(JSON.parse(before.exercises_text), [{ name: "Squat", target_sets: 3, target_reps: 8 }]);
  assert.deepEqual(JSON.parse(before.constraints_text), ["No impact"]);
  assert.equal(before.notes, "Move slowly");
  assert.equal(after.objective, null); assert.equal(after.planned_rounds, null);
  assert.equal(after.exercises_text, "[]"); assert.equal(after.constraints_text, "[]"); assert.equal(after.notes, null);
  assert.ok(preview.consequences.includes("planned_blocks_replaced"));
});

test("ACTION MATRIX: expiry, unrelated caller timezone and bound evidence follow consistency rules", async () => {
  const fixture = actionDatabase();
  const prepared = await prep(fixture, "adapt_duration");
  const preview = await buildEnqiduActionPreview({ prepared, now: ACTION_NOW });
  const check = (expiresAt, now) => validateEnqiduActionPreview({ prepared, fingerprint: preview.fingerprint, expiresAt, now });
  assert.equal((await check(preview.expires_at, "2026-10-05T12:05:00Z")).error, "preview_stale");
  assert.equal((await check("2026-10-05T15:00:00Z", ACTION_NOW)).error, "preview_stale");
  const updated = bindEnqiduActionEvidence(prepared, { proposal: "reduce", reasons: ["above_expected_rpe"] });
  assert.notEqual(await fingerprintEnqiduAction(updated), preview.fingerprint);
  const changed = bindEnqiduActionEvidence(prepared, { proposal: "reduce", reasons: ["new_feedback"] });
  assert.notEqual(await fingerprintEnqiduAction(updated), await fingerprintEnqiduAction(changed));
});

test("ACTION MATRIX: HRV count cutoff generation time is ephemeral, count/observation changes remain stale", async () => {
  const fixture = actionDatabase();
  const prepared = await prep(fixture, "adapt_duration");
  const evidence = (count, asOf, observedAt = "2026-10-05T04:00:00Z") => ({ health: { hrv: {
    readings_count: count, field_sources: { readings_count: { table: "wearable_hrv_nightly_samples", linked_summary_id: "summary",
      as_of: asOf, observed_at: observedAt } },
  } } });
  const first = bindEnqiduActionEvidence(prepared, evidence(100, ACTION_NOW));
  const second = bindEnqiduActionEvidence(prepared, evidence(100, "2026-10-05T12:01:00Z"));
  assert.equal(await fingerprintEnqiduAction(first), await fingerprintEnqiduAction(second));
  const changed = bindEnqiduActionEvidence(prepared, evidence(101, "2026-10-05T12:01:00Z"));
  assert.notEqual(await fingerprintEnqiduAction(first), await fingerprintEnqiduAction(changed));
  const observation = bindEnqiduActionEvidence(prepared, evidence(100, ACTION_NOW, "2026-10-05T05:00:00Z"));
  assert.notEqual(await fingerprintEnqiduAction(first), await fingerprintEnqiduAction(observation));
});

test("ACTION MATRIX: block revision, availability and recommendation equipment all participate in consistency", async () => {
  for (const edit of [
    (fixture) => { fixture.state.planned_training_sessions[0].updated_at = "2026-10-05T12:01:00Z"; },
    (fixture) => { fixture.state.planned_session_blocks[0].created_at = "2026-10-05T12:01:00Z"; },
    (fixture) => { fixture.context.athlete_context.equipment_summary[0].name = "New equipment"; },
    (fixture) => { fixture.state.training_availability_overrides.push({ user_id: ACTION_USER, calendar_date: ACTION_DATE, availability_status: "available" }); },
  ]) {
    const fixture = actionDatabase();
    const first = await fingerprintEnqiduAction(await prep(fixture, "adapt_environment"));
    edit(fixture);
    const second = await fingerprintEnqiduAction(await prep(fixture, "adapt_environment"));
    assert.notEqual(first, second);
  }
});

test("ACTION MATRIX: real health loader HRV cutoff changes preserve environment preview until sample count changes", async () => {
  const fixture = actionDatabase();
  fixture.state.wearable_hrv_nightly_summaries.push({
    id: "summary", user_id: ACTION_USER, calendar_date: ACTION_DATE, provider: "garmin",
    provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector", last_night_avg_ms: 47,
  });
  fixture.state.wearable_hrv_nightly_samples.push({ id: "sample", user_id: ACTION_USER,
    hrv_summary_id: "summary", hrv_ms: 47, recorded_at: "2026-10-05T04:00:00Z" });
  const first = await prep(fixture, "adapt_environment");
  assert.equal(first.state.recommendation_context.health_recovery.hrv.readings_count, 1);
  const later = await prepareEnqiduAction({ db: fixture.db, userId: ACTION_USER, calendar,
    action: "adapt_environment", args: actions.adapt_environment, now: "2026-10-05T12:01:00Z" });
  assert.notEqual(first.state.recommendation_context.health_recovery.hrv.field_sources.readings_count.as_of,
    later.state.recommendation_context.health_recovery.hrv.field_sources.readings_count.as_of);
  assert.equal(await fingerprintEnqiduAction(first), await fingerprintEnqiduAction(later));
  fixture.state.wearable_hrv_nightly_samples.push({ id: "sample-2", user_id: ACTION_USER,
    hrv_summary_id: "summary", hrv_ms: 48, recorded_at: "2026-10-05T05:00:00Z" });
  const changed = await prep(fixture, "adapt_environment");
  assert.notEqual(await fingerprintEnqiduAction(first), await fingerprintEnqiduAction(changed));
});

test("ACTION MATRIX: canonical Closed Loop reasons appear in reviewed proposal", async () => {
  const prepared = await prep(actionDatabase(), "adapt_duration");
  const bound = bindEnqiduActionEvidence(prepared, { proposal: { reasons: ["rpe_above_range"] } });
  const preview = await buildEnqiduActionPreview({ prepared: bound, now: ACTION_NOW });
  assert.deepEqual(preview.reasons, ["rpe_above_range"]);
});
