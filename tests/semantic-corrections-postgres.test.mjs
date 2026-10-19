import test from "node:test";
import assert from "node:assert/strict";
import {
  semanticDatabase,
  semanticFixture,
  state,
  command,
  apply,
} from "./helpers/semantic-db.mjs";
import {
  exerciseObservation,
  exerciseIdentity,
} from "../src/progress/domain.js";
let db;
test.before(async () => {
  db = await semanticDatabase();
});
test.after(async () => {
  await db?.close();
});
test("SEMANTICS PostgreSQL A: same canonical FIT session, explicit RDL, supporting provenance and Progress", async () => {
  const f = await semanticFixture(db),
    target = crypto.randomUUID();
  const before = (
    await db.query(
      "select to_jsonb(s) s from training_sessions s where id=$1",
      [f.session],
    )
  ).rows[0].s;
  const c = await command(db, f, [
    { op: "add_exercise", target, reported_name: "RDL" },
    { op: "set_reps", target, reps: [8, 8, 8] },
    { op: "set_load", target, value: 45, unit: "kg" },
  ]);
  await db.exec("set role service_role");
  let receipt;
  try {
    receipt = await apply(db, c);
  } finally {
    await db.exec("reset role");
  }
  assert.equal(receipt.session_id, f.session);
  assert.equal(receipt.applied, true);
  assert.deepEqual(
    (
      await db.query(
        "select to_jsonb(s) s from training_sessions s where id=$1",
        [f.session],
      )
    ).rows[0].s,
    before,
  );
  const after = await state(db, f),
    e = after.exercises.find((e) => e.id === target);
  assert.ok(e.exercise_id);
  assert.deepEqual(e.reps_per_set, [8, 8, 8]);
  assert.equal(exerciseObservation(e, "2026-10-18").volume, 1080);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from training_sessions where user_id=$1",
        [f.user],
      )
    ).rows[0].n,
    1,
  );
  const audit = (
    await db.query(
      "select payload from enkidu_conversation_enrichments where id=$1",
      [receipt.event_id],
    )
  ).rows[0].payload;
  assert.equal(audit.actor_id, f.user);
  assert.deepEqual(audit.operations, c.operations);
  assert.equal(audit.before.exercises.length, 1);
  assert.equal(audit.after.exercises.length, 2);
  const links = (
    await db.query(
      "select source_role,is_primary from session_source_links where session_id=$1 order by source_role",
      [f.session],
    )
  ).rows;
  assert.deepEqual(links, [
    { source_role: "garmin_fit", is_primary: true },
    { source_role: "supporting", is_primary: false },
  ]);
});
test("SEMANTICS PostgreSQL B/C: last rep granular, omission retained and excluded", async () => {
  const f = await semanticFixture(db),
    before = await state(db, f);
  await apply(
    db,
    await command(db, f, [
      { op: "set_last_reps", target: f.exercise, value: 9 },
    ]),
  );
  const after = await state(db, f);
  assert.deepEqual(after.exercises[0], {
    ...before.exercises[0],
    data_confidence: "reported",
    reps_per_set: [10, 10, 9],
  });
  await apply(
    db,
    await command(db, f, [
      { op: "set_omitted", target: f.exercise, value: true },
    ]),
  );
  assert.equal(exerciseIdentity((await state(db, f)).exercises[0]), null);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from session_exercises where session_id=$1",
        [f.session],
      )
    ).rows[0].n,
    1,
  );
});
test("SEMANTICS PostgreSQL E: tenant scope and minimum execution privileges", async () => {
  const f = await semanticFixture(db),
    c = await command(db, f, [
      { op: "set_load", target: f.exercise, value: 0, unit: "kg" },
    ]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    f.other,
  ]);
  await db.exec("set role authenticated");
  try {
    assert.equal(
      (
        await db.query("select public.read_training_semantics_v1($1) s", [
          f.session,
        ])
      ).rows[0].s,
      null,
    );
    assert.equal(
      (
        await db.query("select training_semantics.state($1,$2) s", [
          f.user,
          f.session,
        ])
      ).rows[0].s,
      null,
    );
    await assert.rejects(() => apply(db, c), /permission denied/);
    await assert.rejects(
      () =>
        db.query("update session_exercises set load_value=1 where id=$1", [
          f.exercise,
        ]),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("delete from session_exercises where id=$1", [f.exercise]),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query("select public.capture_training_semantics_v1($1,$2)", [
          f.session,
          "{}",
        ]),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
  await assert.rejects(
    () => apply(db, { ...c, user: f.other }),
    /session_not_found/,
  );
  const grants = await db.query(
    "select has_function_privilege('anon','public.apply_training_semantics_v1(uuid,uuid,text,text,timestamptz,jsonb,text)','execute') a,has_function_privilege('authenticated','public.apply_training_semantics_v1(uuid,uuid,text,text,timestamptz,jsonb,text)','execute') b,has_function_privilege('service_role','public.apply_training_semantics_v1(uuid,uuid,text,text,timestamptz,jsonb,text)','execute') c",
  );
  assert.deepEqual(grants.rows[0], { a: false, b: false, c: true });
});
test("SEMANTICS PostgreSQL F/G: stale, retry after expiry, no duplicate source/block/event", async () => {
  const f = await semanticFixture(db),
    c = await command(db, f, [
      { op: "set_load", target: f.exercise, value: 45, unit: "kg" },
    ]);
  const receipt = await apply(db, c),
    after = await state(db, f);
  const retry = await apply(db, { ...c, expires: "2000-01-01T00:00:00Z" });
  assert.equal(retry.replayed, true);
  assert.equal(retry.event_id, receipt.event_id);
  assert.deepEqual(await state(db, f), after);
  await assert.rejects(
    () => apply(db, { ...c, fingerprint: "sha256:" + "b".repeat(64) }),
    /preview_stale/,
  );
  await assert.rejects(
    () =>
      apply(db, {
        ...c,
        operations: [
          { op: "set_load", target: f.exercise, value: 50, unit: "kg" },
        ],
      }),
    /invalid_arguments/,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from enkidu_conversation_enrichments where session_id=$1",
        [f.session],
      )
    ).rows[0].n,
    1,
  );
});
test("SEMANTICS PostgreSQL rollback includes earlier operations, blocks, evidence on failure", async () => {
  const f = await semanticFixture(db),
    target = crypto.randomUUID(),
    before = await state(db, f);
  const c = await command(db, f, [
    { op: "add_exercise", target, reported_name: "RDL" },
    { op: "set_load", target: f.exercise, value: 50, unit: "kg" },
    { op: "set_reps", target, reps: [8, -1] },
  ]);
  await assert.rejects(() => apply(db, c), /invalid_arguments/);
  assert.deepEqual(await state(db, f), before);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from enkidu_conversation_enrichments where session_id=$1",
        [f.session],
      )
    ).rows[0].n,
    0,
  );
});
test("SEMANTICS PostgreSQL unknown names preserved, identity aliases safe, unspecified fields immutable", async () => {
  const f = await semanticFixture(db);
  await apply(
    db,
    await command(db, f, [
      { op: "rename_exercise", target: f.exercise, reported_name: "peso" },
    ]),
  );
  let e = (await state(db, f)).exercises[0];
  assert.equal(e.reported_name, "peso");
  assert.equal(e.exercise_id, null);
  assert.equal(e.load_value, 40);
  await apply(
    db,
    await command(db, f, [
      { op: "rename_exercise", target: f.exercise, reported_name: " RDL " },
      { op: "set_side", target: f.exercise, value: "each_side" },
      { op: "set_tempo", target: f.exercise, value: "pausa de 2 segundos" },
      { op: "set_technical_note", target: f.exercise, value: "Controlado" },
      { op: "append_note", target: f.exercise, value: "Última difícil" },
    ]),
  );
  e = (await state(db, f)).exercises[0];
  assert.ok(e.exercise_id);
  assert.deepEqual(e.reps_per_set, [10, 10, 10]);
  assert.equal(e.notes, "Preserved\nÚltima difícil");
  assert.equal(e.technical_note, "Controlado");
  assert.equal(
    (
      await db.query(
        "select duration_seconds from session_exercises where id=$1",
        [f.exercise],
      )
    ).rows[0].duration_seconds,
    123,
  );
});
test("SEMANTICS PostgreSQL confirmed evidence is append-only", async () => {
  const f = await semanticFixture(db);
  const r = await apply(
    db,
    await command(db, f, [
      { op: "set_load", target: f.exercise, value: 0, unit: "kg_each" },
    ]),
  );
  await assert.rejects(
    () =>
      db.query(
        "update enkidu_conversation_enrichments set payload='{}' where id=$1",
        [r.event_id],
      ),
    /Immutable/,
  );
  await assert.rejects(
    () => db.query("delete from training_sources where id=$1", [r.source_id]),
    /Immutable/,
  );
  await assert.rejects(
    () =>
      db.query(
        "update session_source_links set source_id=(select source_id from training_sessions where id=$2) where source_id=$1",
        [r.source_id, f.session],
      ),
    /Immutable/,
  );
  await assert.rejects(
    () =>
      db.query("delete from session_source_links where source_id=$1", [
        r.source_id,
      ]),
    /Immutable/,
  );
});
