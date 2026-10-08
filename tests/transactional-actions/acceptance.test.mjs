import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { bindEnqiduActionEvidence } from "../../src/enqiduTools/actions.js";
import { createEnqiduReadDomain, resolveClosedLoopAction } from "../../src/enqiduTools/readTools.js";
import { prepareEnqiduAction } from "../../src/enqiduTools/actions.js";
import { normalizeGarminHealthRecord } from "../../src/health/garminAdapter.js";
import { DAY, day, NOW, CALENDAR, WRAPPER, fixture, preview, apply, rawApply, persisted, race, role, insertPlan, assertBlocked, database } from "./local-postgres.mjs";

const duration = (f, minutes = 40) => preview(f, "adapt_duration", { source_date: DAY, duration_minutes: minutes });
const cancel = async (client, f, source = f.source) => {
  const { rows } = await client.query("select public.cancel_coach_planned_session($1,$2,$3) as result", [f.userId, source.day, source.id]);
  assert.equal(rows[0].result.ok, true);
};
const unavailable = (client, f, date) => client.query("select public.set_coach_training_unavailability($1,$2)", [f.userId, date]);
const planFrom = (snapshot, id) => snapshot.plans.find(({ row }) => row.id === id).row;
const assertHistory = (before, after) => {
  assert.deepEqual(after.history, before.history, "Executed training is immutable to planning actions");
  assert.deepEqual(after.fit, before.fit, "Canonical FIT payload and xmin are unchanged");
};
async function remainingWeek(f) {
  await unavailable(f.monitor, f, DAY);
  f.second = await insertPlan(f.monitor, f.userId, day(1));
  await unavailable(f.monitor, f, day(1));
  const prepared = await preview(f, "adapt_remaining_week");
  assert.equal(prepared.transaction.command.moves.length, 2);
  return prepared;
}

test("A: duration preview followed by a concurrent cancellation stays cancelled with zero stale writes", async (t) => {
  const f = await fixture(t), prepared = await duration(f);
  await race(t, f, prepared, (a) => cancel(a, f), (state) => assert.equal(planFrom(state, f.source.id).status, "cancelled"));
});

test("B: two accepted duration previews serialize; the second cannot silently overwrite the first", async (t) => {
  const f = await fixture(t), first = await duration(f, 40), second = await duration(f, 30);
  await race(t, f, second, async (a) => assert.equal((await apply(a, f.userId, first)).ok, true), (state) => {
    assert.equal(planFrom(state, f.source.id).planned_duration_min, 40);
    assert.equal(state.blocks.find(({ row }) => row.id === f.source.blockId).row.planned_duration_seconds, 2400);
  });
});

test("C: environment preview cannot resurrect a concurrently cancelled session", async (t) => {
  const f = await fixture(t), prepared = await preview(f, "adapt_environment", { source_date: DAY, environment: "home" });
  await race(t, f, prepared, (a) => cancel(a, f), (state) => assert.equal(planFrom(state, f.source.id).location_type, "outdoor"));
});

test("profile timezone is locked authority even when the plan and command have not changed", async (t) => {
  const f = await fixture(t), prepared = await duration(f);
  await race(t, f, prepared, (a) => a.query("update public.profiles set timezone='America/Los_Angeles' where id=$1", [f.userId]));
});

for (const authority of ["constraint", "location", "equipment", "catalog"]) {
  test(`environment prescription rejects concurrently changed ${authority} authority`, async (t) => {
    const f = await fixture(t);
    if (["equipment", "catalog"].includes(authority)) {
      const equipmentId = randomUUID();
      f.catalogIds.push(equipmentId);
      await f.monitor.query("insert into public.equipment_catalog(id,name,equipment_category,unit) values($1,'Kettlebell','free_weights','kg')", [equipmentId]);
      await f.monitor.query("insert into public.user_equipment(user_id,equipment_id,quantity,unit,location_label,available) values($1,$2,1,'kg','home',true)", [f.userId, equipmentId]);
    }
    const prepared = await preview(f, "adapt_environment", { source_date: DAY, environment: "home" });
    await race(t, f, prepared, async (a) => {
      if (authority === "constraint") {
        await a.query("insert into public.coach_athlete_constraints(user_id,constraint_type,severity,description,active) values($1,'injury','high','No lower-body loading',true)", [f.userId]);
      } else if (authority === "location") await a.query("update public.user_training_locations set is_active=false where user_id=$1", [f.userId]);
      else if (authority === "equipment") await a.query("update public.user_equipment set available=false where user_id=$1", [f.userId]);
      else await a.query("update public.equipment_catalog set equipment_category='cardio' where id=$1", [f.catalogIds[0]]);
    }, (state) => assert.equal(planFrom(state, f.source.id).location_type, "outdoor"));
  });
}

test("D: a concurrent existing recommendation writer occupying the move target makes the preview stale", async (t) => {
  const f = await fixture(t), prepared = await preview(f, "move_session", { source_date: DAY, target_date: day(1) });
  await race(t, f, prepared, async (a) => {
    const payload = { title: "Concurrent target plan", session_type: "strength", environment: "home", intensity: "moderada", objective: "Strength", duration_minutes: 30, blocks: [{ title: "Main", duration_minutes: 30 }] };
    const { rows } = await a.query("select public.save_coach_recommendation_plan($1,$2,$3::jsonb) as result", [f.userId, day(1), JSON.stringify(payload)]);
    assert.equal(rows[0].result.ok, true);
  }, (state) => assert.equal(planFrom(state, f.source.id).planned_date, DAY));
});

test("E: move preview cannot act on a source concurrently moved by the existing writer", async (t) => {
  const f = await fixture(t), prepared = await preview(f, "move_session", { source_date: DAY, target_date: day(1) });
  await race(t, f, prepared, async (a) => {
    const { rows } = await a.query("select public.move_coach_planned_session($1,$2,$3) as result", [f.userId, DAY, day(2)]);
    assert.equal(rows[0].result.ok, true);
  }, (state) => assert.equal(planFrom(state, f.source.id).planned_date, day(2)));
});

test("F: availability inserted concurrently invalidates the whole remaining-week batch", async (t) => {
  const f = await fixture(t), prepared = await remainingWeek(f);
  await race(t, f, prepared, (a) => unavailable(a, f, day(2)), (state) => {
    assert.equal(planFrom(state, f.source.id).planned_date, DAY);
    assert.equal(planFrom(state, f.second.id).planned_date, day(1));
  });
});

test("G: cancellation of one remaining-week member rejects the whole batch, including the unchanged member", async (t) => {
  const f = await fixture(t), prepared = await remainingWeek(f);
  await race(t, f, prepared, (a) => cancel(a, f, f.second), (state) => {
    assert.equal(planFrom(state, f.source.id).planned_date, DAY);
    assert.equal(planFrom(state, f.second.id).status, "cancelled");
  });
});

for (const change of ["duration", "replacement", "insert"]) {
  test(`H: independently ${change === "duration" ? "updated" : change === "replacement" ? "replaced" : "inserted"} child block invalidates duration authority`, async (t) => {
    const f = await fixture(t), prepared = await duration(f);
    await race(t, f, prepared, async (a) => {
      if (change === "duration") await a.query("update public.planned_session_blocks set planned_duration_seconds=2700 where id=$1", [f.source.blockId]);
      else {
        if (change === "replacement") await a.query("delete from public.planned_session_blocks where id=$1", [f.source.blockId]);
        await a.query("insert into public.planned_session_blocks(planned_session_id,block_order,title,planned_duration_seconds) values($1,$2,'Concurrent child',600)", [f.source.id, change === "replacement" ? 1 : 2]);
      }
    }, (state) => assert.equal(planFrom(state, f.source.id).planned_duration_min, 50));
  });
}

const happyActions = [
  ["move_session", { source_date: DAY, target_date: day(1) }],
  ["adapt_duration", { source_date: DAY, duration_minutes: 40 }],
  ["adapt_environment", { source_date: DAY, environment: "home" }],
  ["cancel_session", { source_date: DAY }],
  ["adapt_remaining_week", {}],
];
for (const [action, args] of happyActions) {
  test(`unchanged authority commits the reviewed ${action} through its existing writer`, async (t) => {
    const f = await fixture(t);
    const before = await persisted(f.monitor, [f.userId, f.otherId]);
    const prepared = action === "adapt_remaining_week" ? await remainingWeek(f) : await preview(f, action, args);
    const afterPreview = await persisted(f.monitor, [f.userId, f.otherId]);
    if (action !== "adapt_remaining_week") assert.deepEqual(afterPreview, before, "Preview performs zero writes");
    const result = await apply(f.a, f.userId, prepared);
    assert.equal(result.ok, true, JSON.stringify(result));
    const after = await persisted(f.monitor, [f.userId, f.otherId]);
    assertHistory(before, after);
    for (const reviewed of prepared.after) {
      const actual = planFrom(after, reviewed.id);
      assert.equal(actual.planned_date, reviewed.date);
      assert.equal(actual.status, reviewed.status);
      assert.equal(actual.planned_duration_min, reviewed.duration_min);
      assert.equal(actual.planned_duration_max, reviewed.duration_max);
      assert.equal(actual.location_type, reviewed.environment);
      const blocks = after.blocks.filter(({ row }) => row.planned_session_id === reviewed.id).map(({ row }) => row).sort((a, b) => a.block_order - b.block_order);
      assert.deepEqual(blocks.map(({ title, planned_duration_seconds }) => ({ title, seconds: planned_duration_seconds })), reviewed.blocks.map(({ title, duration_seconds }) => ({ title, seconds: duration_seconds })));
    }
    assert.deepEqual(after.plans.filter(({ row }) => row.user_id === f.otherId), before.plans.filter(({ row }) => row.user_id === f.otherId));
    const afterCommitted = await persisted(f.monitor, [f.userId, f.otherId]);
    assert.deepEqual(await apply(f.a, f.userId, prepared), { ok: false, error: "preview_stale" }, "Lost response retry/double tap must not repeat a committed write");
    assert.deepEqual(await persisted(f.monitor, [f.userId, f.otherId]), afterCommitted);
  });
}

test("Closed Loop advice binds to the same duration transaction; observational changes cannot alter its exact confirmed command", async (t) => {
  const f = await fixture(t);
  const historical = await insertPlan(f.monitor, f.userId, day(-1));
  await f.monitor.query("update public.planned_training_sessions set linked_completed_session_id=$1,planned_intensity='RPE 6-7' where id=$2", [f.executionId, historical.id]);
  await f.monitor.query("update public.training_sessions set started_at=$1,ended_at=$2 where id=$3", [`${day(-1)}T10:00:00Z`, `${day(-1)}T10:50:00Z`, f.executionId]);
  await f.monitor.query("insert into public.session_metrics(session_id,metric_code,value_numeric,metric_scope,source_path,confidence) values($1,'rpe_global',9,'session','chatgpt_session_correction','manual')", [f.executionId]);
  await f.monitor.query("update public.planned_training_sessions set planned_date=$1 where id=$2", [day(3), f.source.id]);
  const domain = createEnqiduReadDomain({ db: database(f.reader), userId: f.userId, calendar: CALENDAR, now: NOW });
  const [assessment] = await domain.assessments({ session_id: f.executionId });
  assert.equal(assessment.adaptation_proposal.action, "reduce", JSON.stringify(assessment));
  const resolved = await resolveClosedLoopAction({ domain, args: { session_id: f.executionId } });
  assert.equal(resolved.proposal.action, "reduce");
  assert.equal(resolved.args.duration_minutes, 40);
  const prepared = await prepareEnqiduAction({ db: database(f.reader), userId: f.userId, calendar: CALENDAR, now: NOW,
    action: resolved.action, args: resolved.args, targetSelection: "closed_loop_target" });
  assert.equal(prepared.ok, true);
  const bound = bindEnqiduActionEvidence(prepared, resolved);
  assert.deepEqual(bound.transaction, prepared.transaction);
  await f.a.query("begin");
  await f.a.query("update public.training_sessions set perceived_exertion=9 where id=$1", [f.executionId]);
  const health = normalizeGarminHealthRecord({ provider: "garmin", provider_mode: "aggregator", data_confidence: "reported",
    ingestion_channel: "fitness_ai_connector", data_type: "daily_health", calendar_date: DAY,
    timezone: CALENDAR.timezone, retrieved_at: NOW,
    measurements: { resting_heart_rate_bpm: { value: 70, unit: "bpm" }, body_battery_current: { value: 20, unit: "score" } } });
  const healthResult = await f.a.query("select public.ingest_garmin_health_record($1,$2::jsonb) as result", [f.userId, JSON.stringify(health)]);
  assert.equal(healthResult.rows[0].result.status, "inserted");
  const before = await persisted(f.a, [f.userId, f.otherId]);
  assert.equal((await apply(f.b, f.userId, bound)).ok, true);
  // A is still uncommitted. Exact command acceptance never waited on advisory
  // execution/health rows; it neither recomputed nor changed the 50 -> 40 change.
  assert.equal((await f.a.query("select count(*)::int as count from public.wearable_health_daily where user_id=$1", [f.userId])).rows[0].count, 1);
  await f.a.query("commit");
  const after = await persisted(f.monitor, [f.userId, f.otherId]);
  assert.equal(planFrom(after, f.source.id).planned_duration_min, 40);
  assertHistory(before, after);
});

for (const targetChange of ["insert", "move"]) {
  test(`Closed Loop target selection rejects a concurrently ${targetChange === "insert" ? "inserted" : "moved"} earlier future session`, async (t) => {
    const f = await fixture(t);
    await f.monitor.query("update public.planned_training_sessions set planned_date=$1 where id=$2", [day(3), f.source.id]);
    const later = targetChange === "move" ? await insertPlan(f.monitor, f.userId, day(4)) : null;
    const prepared = await prepareEnqiduAction({ db: database(f.reader), userId: f.userId, calendar: CALENDAR, now: NOW,
      action: "adapt_duration", args: { source_date: day(3), duration_minutes: 40 }, targetSelection: "closed_loop_target" });
    assert.equal(prepared.ok, true);
    await race(t, f, prepared, async (a) => {
      if (targetChange === "insert") await insertPlan(a, f.userId, day(1));
      else await a.query("update public.planned_training_sessions set planned_date=$1 where id=$2", [day(1), later.id]);
    }, (state) => assert.equal(planFrom(state, f.source.id).planned_duration_min, 50));
  });
}

test("non-READ COMMITTED snapshots cannot bypass authority checks after a concurrent availability commit", async (t) => {
  const f = await fixture(t), prepared = await duration(f);
  await f.b.query("begin isolation level repeatable read");
  await f.b.query("select count(*) from public.training_availability_overrides where user_id=$1", [f.userId]);
  await unavailable(f.a, f, DAY);
  const afterA = await persisted(f.monitor, [f.userId, f.otherId]);
  const result = await rawApply(f.b, f.userId, prepared.transaction);
  assert.equal(result.ok, false);
  assert.ok(["invalid_request", "preview_stale"].includes(result.error));
  await f.b.query("commit");
  assert.deepEqual(await persisted(f.monitor, [f.userId, f.otherId]), afterA);
});

test("transaction rollback after successful acceptance reverts every parent and child write", async (t) => {
  const f = await fixture(t), prepared = await preview(f, "adapt_environment", { source_date: DAY, environment: "home" });
  const before = await persisted(f.monitor, [f.userId, f.otherId]);
  await f.a.query("begin");
  assert.equal((await apply(f.a, f.userId, prepared)).ok, true);
  await f.a.query("rollback");
  assert.deepEqual(await persisted(f.monitor, [f.userId, f.otherId]), before);
});

test("accepted apply retains locks until commit; direct child insertion must serialize after it", async (t) => {
  const f = await fixture(t), prepared = await duration(f);
  await f.a.query("begin");
  assert.equal((await apply(f.a, f.userId, prepared)).ok, true);
  let settled = false;
  const inserting = f.b.query("insert into public.planned_session_blocks(planned_session_id,block_order,title,planned_duration_seconds) values($1,2,'Subsequent child',300)", [f.source.id]).finally(() => { settled = true; });
  inserting.catch(() => {});
  await assertBlocked(f.monitor, f.a, f.b, () => settled);
  await f.a.query("commit");
  await inserting;
  assert.equal(planFrom(await persisted(f.monitor, [f.userId]), f.source.id).planned_duration_min, 40);
});

test("wrapper is SECURITY INVOKER with fixed search_path and service_role-only execute", async (t) => {
  const f = await fixture(t);
  const { rows: [definition] } = await f.monitor.query("select prosecdef,proconfig from pg_proc where oid=$1::regprocedure", [WRAPPER]);
  assert.equal(definition.prosecdef, false);
  assert.ok(definition.proconfig.some((value) => value.startsWith("search_path=")));
  for (const deniedRole of ["anon", "authenticated"]) {
    const { rows: [grant] } = await f.monitor.query("select has_function_privilege($1,$2,'EXECUTE') as allowed", [deniedRole, WRAPPER]);
    assert.equal(grant.allowed, false);
    await role(f.a, deniedRole, f.userId);
    await assert.rejects(() => f.a.query("select public.apply_enqidu_action_v1($1,'cancel_session','{}','{}')", [f.userId]), (error) => error.code === "42501");
  }
  const { rows: [grant] } = await f.monitor.query("select has_function_privilege('service_role',$1,'EXECUTE') as allowed", [WRAPPER]);
  assert.equal(grant.allowed, true);
});

test("closed DTO rejects ownership/identity injection, unknown action/RPC, malformed state and coercion without writes", async (t) => {
  const f = await fixture(t), prepared = await duration(f);
  const before = await persisted(f.monitor, [f.userId, f.otherId]);
  const cases = [
    ["unknown action", (x) => { x.action = "execute_rpc"; x.command = { name: "cancel_coach_planned_session", args: {} }; }],
    ["arbitrary RPC", (x) => { x.command.rpc = "cancel_coach_planned_session"; }],
    ["owner injection", (x) => { x.command.user_id = f.otherId; }],
    ["foreign expected owner", (x) => { x.expected.plans[0].user_id = f.otherId; }],
    ["foreign session ID", (x) => { x.command.sessionId = f.foreign.id; }],
    ["foreign block ID", (x) => { x.command.blocks[0].id = f.foreign.blockId; }],
    ["target date injection", (x) => { x.command.targetDate = day(1); }],
    ["unknown expected key", (x) => { x.expected.patch = { status: "planned" }; }],
    ["unknown plan key", (x) => { x.expected.plans[0].sql = "delete"; }],
    ["unknown block key", (x) => { x.expected.blocks[0].patch = {}; }],
    ["null expected", (x) => { x.expected = null; }],
    ["array expected", (x) => { x.expected = []; }],
    ["string duration", (x) => { x.command.duration = "40"; }],
    ["fractional duration", (x) => { x.command.duration = 40.5; }],
    ["invalid date", (x) => { x.command.sourceDate = "2026-02-30"; }],
    ["unknown scope key", (x) => { x.expected.scope.table = "training_sessions"; }],
    ["foreign block scope", (x) => { x.expected.scope.block_session_ids = [f.foreign.id]; }],
    ["duplicate block", (x) => { x.command.blocks.push(x.command.blocks[0]); }],
    ["random session", (x) => { x.command.sessionId = randomUUID(); }],
  ];
  for (const [label, mutate] of cases) {
    const contract = structuredClone(prepared.transaction);
    mutate(contract);
    const result = await rawApply(f.a, f.userId, contract);
    assert.equal(result.ok, false, label);
    assert.ok(["invalid_request", "preview_stale"].includes(result.error), `${label}: ${JSON.stringify(result)}`);
    assert.deepEqual(Object.keys(result).sort(), ["error", "ok"], `${label}: response contains no internal details`);
    assert.deepEqual(await persisted(f.monitor, [f.userId, f.otherId]), before, label);
  }
  assert.deepEqual(await apply(f.a, f.otherId, prepared), { ok: false, error: "invalid_prepared_action" });
  const foreignOwnerResult = await rawApply(f.a, f.otherId, prepared.transaction);
  assert.equal(foreignOwnerResult.ok, false);
  assert.deepEqual(await persisted(f.monitor, [f.userId, f.otherId]), before);
});
