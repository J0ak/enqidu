import test from "node:test";
import assert from "node:assert/strict";
import { createEnqiduToolRuntime } from "../../src/enqiduTools/runtime.js";
import { prepareEnqiduAction } from "../../src/enqiduTools/actions.js";
import { DAY, NOW, CALENDAR, fixture, preview, apply, rawApply, persisted, race, database } from "./local-postgres.mjs";

const unavailable = (f) => preview(f, "set_training_unavailability", { date_reference: "today" });

test("AP2 SQL availability uses existing writer, confirms once, reads back, isolates users", async (t) => {
  const f = await fixture(t), before = await persisted(f.monitor, [f.userId, f.otherId]);
  const runtime = await createEnqiduToolRuntime({ db: database(f.reader), adminDb: database(f.a), now: NOW });
  const first = await runtime.execute("preview_set_training_unavailability", { date_reference: "today" });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.deepEqual(await persisted(f.monitor, [f.userId, f.otherId]), before);
  const args = { date_reference: "today", fingerprint: first.data.fingerprint, expires_at: first.data.expires_at, confirmation: true };
  assert.equal((await runtime.execute("apply_set_training_unavailability", { ...args, confirmation: false })).error.code, "explicit_confirmation_required");
  const result = await runtime.execute("apply_set_training_unavailability", args);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.data.persistence_verified, true);
  assert.equal(result.data.persisted_availability.availability_status, "unavailable");
  const after = await persisted(f.monitor, [f.userId, f.otherId]);
  assert.deepEqual(after.plans, before.plans); assert.deepEqual(after.blocks, before.blocks);
  assert.deepEqual(after.history, before.history); assert.deepEqual(after.fit, before.fit);
  assert.equal(after.availability.length, 1); assert.equal(after.availability[0].row.user_id, f.userId);
  assert.equal((await runtime.execute("apply_set_training_unavailability", args)).error.code, "preview_stale");
  assert.deepEqual(await persisted(f.monitor, [f.userId, f.otherId]), after, "double confirmation performs zero updates including xmin");
  const again = await runtime.execute("preview_set_training_unavailability", { date_reference: "today" });
  assert.equal(again.data.requires_confirmation, false);
});

for (const change of ["insert_availability", "plan_change", "phantom_plan", "child_change"]) test(`AP2 SQL availability rejects concurrent ${change} before UPSERT`, async (t) => {
  const f = await fixture(t), prepared = await unavailable(f);
  await race(t, f, prepared, async (a) => {
    if (change === "insert_availability") await a.query("insert into public.training_availability_overrides(user_id,calendar_date,availability_status,source) values($1,$2,'available','user')", [f.userId, DAY]);
    if (change === "plan_change") await a.query("update public.planned_training_sessions set title='Concurrent' where id=$1", [f.source.id]);
    if (change === "phantom_plan") await a.query("insert into public.planned_training_sessions(user_id,planned_date,title,session_type,status,source) values($1,$2,'Concurrent second session','strength','planned','enkidu_coach')", [f.userId, DAY]);
    if (change === "child_change") await a.query("update public.planned_session_blocks set notes='Concurrent prescription' where id=$1", [f.source.blockId]);
  });
});

test("AP2 SQL availability double confirmation serializes; second cannot update xmin", async (t) => {
  const f = await fixture(t), prepared = await unavailable(f);
  await race(t, f, prepared, async (a) => assert.equal((await apply(a, f.userId, prepared)).ok, true));
});

test("AP2 SQL expected owner cannot be reassigned to another authenticated athlete", async (t) => {
  const f = await fixture(t), prepared = await unavailable(f), before = await persisted(f.monitor, [f.userId, f.otherId]);
  assert.equal((await rawApply(f.a, f.otherId, prepared.transaction)).ok, false);
  assert.deepEqual(await persisted(f.monitor, [f.userId, f.otherId]), before);
});

test("AP2 SQL semantic guard refuses crafted duration reduction of a strength prescription", async (t) => {
  const f = await fixture(t);
  await f.monitor.query("update public.planned_session_blocks set block_type='strength',planned_exercises='[{\"name\":\"Squat\",\"reps\":8}]' where id=$1", [f.source.blockId]);
  const refused = await prepareEnqiduAction({ db: database(f.reader), userId: f.userId, calendar: CALENDAR, action: "adapt_duration", args: { source_date: DAY, duration_minutes: 30 }, now: NOW });
  assert.equal(refused.error, "duration_adaptation_unavailable");
  // Build the authentic current snapshot using another existing action, then
  // prove even the privileged closed RPC refuses a crafted unsafe command.
  const base = await preview(f, "cancel_session", { source_date: DAY });
  const before = await persisted(f.monitor, [f.userId, f.otherId]);
  const result = await rawApply(f.a, f.userId, { ...base.transaction, action: "adapt_duration", command: {
    sourceDate: DAY, sessionId: f.source.id, duration: 30, blocks: [{ id: f.source.blockId, duration_seconds: 1800 }],
  } });
  assert.equal(result.ok, false);
  assert.deepEqual(await persisted(f.monitor, [f.userId, f.otherId]), before);
});

for (const status of ["completed", "enriched", "skipped"]) test(`AP2 SQL and JS weekly eligibility agree for ${status}`, async (t) => {
  const f = await fixture(t);
  await f.monitor.query("select public.set_coach_training_unavailability($1,$2)", [f.userId, DAY]);
  const eligible = await preview(f, "adapt_remaining_week", {});
  await f.monitor.query("update public.planned_training_sessions set status=$1 where id=$2", [status, f.source.id]);
  const refused = await prepareEnqiduAction({ db: database(f.reader), userId: f.userId, calendar: CALENDAR, action: "adapt_remaining_week", args: {}, now: NOW });
  assert.equal(refused.error, "source_plan_not_adaptable");
  const before = await persisted(f.monitor, [f.userId, f.otherId]);
  assert.equal((await rawApply(f.a, f.userId, eligible.transaction)).ok, false);
  assert.deepEqual(await persisted(f.monitor, [f.userId, f.otherId]), before);
});

test("AP2 SQL selected same-day session changes alone; other prescription and execution remain exact", async (t) => {
  const f = await fixture(t);
  const { insertPlan } = await import("./local-postgres.mjs");
  const second = await insertPlan(f.monitor, f.userId, DAY, { title: "Selected second session" });
  const before = await persisted(f.monitor, [f.userId, f.otherId]);
  const prepared = await preview(f, "adapt_duration", { source_date: DAY, duration_minutes: 30, planned_session_id: second.id });
  assert.equal((await apply(f.a, f.userId, prepared)).ok, true);
  const after = await persisted(f.monitor, [f.userId, f.otherId]);
  assert.deepEqual(after.plans.filter((p) => p.row.id !== second.id), before.plans.filter((p) => p.row.id !== second.id));
  assert.deepEqual(after.blocks.filter((p) => p.row.planned_session_id !== second.id), before.blocks.filter((p) => p.row.planned_session_id !== second.id));
  assert.equal(after.plans.find((p) => p.row.id === second.id).row.planned_duration_min, 30);
  assert.deepEqual(after.history, before.history); assert.deepEqual(after.fit, before.fit);
});
