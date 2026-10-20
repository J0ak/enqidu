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
    "select has_function_privilege('anon','public.apply_training_semantics_v1(uuid,uuid,text,text,timestamptz,jsonb,text,jsonb)','execute') a,has_function_privilege('authenticated','public.apply_training_semantics_v1(uuid,uuid,text,text,timestamptz,jsonb,text,jsonb)','execute') b,has_function_privilege('service_role','public.apply_training_semantics_v1(uuid,uuid,text,text,timestamptz,jsonb,text,jsonb)','execute') c",
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

test("103 catalog DB/seed exact consistency and ambiguous aliases fail closed", async () => {
  const { catalogSeed } = await import("../src/training/catalogSeed.js");
  const { createCatalogResolver } = await import(
    "../src/training/catalogResolver.js"
  );
  const catalog = (
    await db.query(
      "select id,code,name,metadata,is_active from exercise_catalog",
    )
  ).rows;
  const resolve = createCatalogResolver(catalog);
  for (const seed of catalogSeed) {
    const actual = catalog.find((c) => c.code === seed.code);
    assert.ok(actual, seed.code);
    assert.deepEqual(actual.metadata, seed.metadata);
    for (const name of [seed.code, seed.name, ...seed.metadata.aliases]) {
      const sqlId = (
        await db.query("select training_semantics.resolve_exercise($1) id", [
          name,
        ])
      ).rows[0].id;
      assert.equal(
        sqlId,
        resolve({ reported_name: name }).exercise?.id || null,
        name,
      );
    }
  }
  for (const label of [
    "\tPÉSO   MUERTO RÚMANO\n",
    " HSPU ",
    "RDL\t",
    "\u00a0PESO\u202fMUERTO\u2009RUMANO\ufeff",
  ]) {
    assert.equal(
      (
        await db.query("select training_semantics.resolve_exercise($1) id", [
          label,
        ])
      ).rows[0].id,
      resolve({ reported_name: label }).exercise?.id || null,
    );
  }
  for (const name of ["Unknown", "algo RDL", "pike", "peso"])
    assert.equal(
      (
        await db.query("select training_semantics.resolve_exercise($1) id", [
          name,
        ])
      ).rows[0].id,
      null,
    );
  const duplicate = crypto.randomUUID();
  await db.query(
    "insert into exercise_catalog(id,code,name,metadata) values($1,'duplicate_103','Test duplicate','{\"aliases\":[\"RDL\"]}')",
    [duplicate],
  );
  assert.equal(
    (await db.query("select training_semantics.resolve_exercise('RDL') id"))
      .rows[0].id,
    null,
  );
  await db.query("delete from exercise_catalog where id=$1", [duplicate]);
  await db.query(
    "insert into exercise_catalog(id,code,name,metadata) values($1,'malformed_103','Malformed aliases','{\"aliases\":null}')",
    [duplicate],
  );
  assert.equal(
    (await db.query("select training_semantics.resolve_exercise('RDL') id"))
      .rows[0].id,
    resolve({ reported_name: "RDL" }).exercise.id,
  );
  await db.query("delete from exercise_catalog where id=$1", [duplicate]);
});

test("103 PostgreSQL materialization evidence, catalog stale, atomic golden and retry", async () => {
  const { parseMaterialization } = await import(
    "../src/training/materialization/parser.js"
  );
  const { compileMaterialization } = await import(
    "../src/training/materialization/compile.js"
  );
  const f = await semanticFixture(db),
    before = await state(db, f);
  const catalog = (await db.query("select * from exercise_catalog")).rows;
  const text =
    "Hoy en press banca hice 40 kg, 10, 10 y 9. En RDL hice 3x8 con 45 kg. No hice dead bug.";
  const c = compileMaterialization(parseMaterialization(text), before, catalog);
  assert.equal(c.status, "preview_ready");
  const request = await command(db, f, c.operations);
  const evidence = {
    original_text: text,
    facts: c.facts,
    generated_at: new Date().toISOString(),
  };
  const invoke = async () =>
    (
      await db.query(
        "select apply_training_semantics_v1($1,$2,$3,$4,$5,$6,$7,$8) r",
        [
          f.user,
          f.session,
          request.revision,
          request.fingerprint,
          request.expires,
          JSON.stringify(request.operations),
          "coach",
          JSON.stringify(evidence),
        ],
      )
    ).rows[0].r;
  await db.query(
    "update exercise_catalog set is_active=false where code='romanian_deadlift'",
  );
  await assert.rejects(invoke, /preview_stale/);
  assert.deepEqual(await state(db, f), before);
  await db.query(
    "update exercise_catalog set is_active=true where code='romanian_deadlift'",
  );
  await db.exec("set role service_role");
  let receipt;
  try {
    receipt = await invoke();
  } finally {
    await db.exec("reset role");
  }
  assert.equal(receipt.applied, true);
  assert.equal((await invoke()).replayed, true);
  const after = await state(db, f);
  assert.equal(after.exercises.length, 3);
  assert.ok(after.exercises.every((e) => e.exercise_id));
  assert.deepEqual(
    after.exercises.find((e) => e.id === f.exercise).reps_per_set,
    [10, 10, 9],
  );
  const event = (
    await db.query(
      "select payload from enkidu_conversation_enrichments where id=$1",
      [receipt.event_id],
    )
  ).rows[0].payload;
  assert.deepEqual(event.materialization, evidence);
  assert.deepEqual(event.operations, request.operations);
  assert.equal(event.actor_id, f.user);
  assert.equal(event.channel, "coach");
  assert.ok(event.timestamp);
  assert.deepEqual(
    (
      await db.query("select original_json from training_sources where id=$1", [
        f.source,
      ])
    ).rows[0].original_json,
    { immutable: "FIT raw marker" },
  );
  assert.equal(
    compileMaterialization(parseMaterialization(text), after, catalog).status,
    "already_materialized",
  );
});
