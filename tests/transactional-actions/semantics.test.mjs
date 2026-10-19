import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./local-postgres.mjs";
import { command, apply } from "../helpers/semantic-db.mjs";
async function seed(t) {
  const f = await fixture(t);
  f.exercise = crypto.randomUUID();
  await f.monitor.query(
    "insert into session_exercises(id,session_id,reported_name,execution_type,sets_completed,reps_per_set,load_value,load_unit) values($1,$2,'Press banca','performed',3,'[10,10,10]',40,'kg')",
    [f.exercise, f.executionId],
  );
  f.semantic = { user: f.userId, session: f.executionId };
  return f;
}
async function waiting(f) {
  const pid = (await f.b.query("select pg_backend_pid() pid")).rows[0].pid;
  return async () => {
    for (let i = 0; i < 100; i++) {
      const r = await f.monitor.query(
        "select cardinality(pg_blocking_pids($1)) n",
        [pid],
      );
      if (r.rows[0].n > 0) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.fail("Expected an observed PostgreSQL lock wait");
  };
}
test("SEMANTIC REAL PG: concurrent double acceptance commits once and returns the durable receipt", async (t) => {
  const f = await seed(t),
    c = await command(f.monitor, f.semantic, [
      { op: "set_last_reps", target: f.exercise, value: 9 },
    ]);
  const wait = await waiting(f);
  await f.a.query("begin");
  const first = await apply(f.a, c);
  const secondPromise = apply(f.b, c);
  await wait();
  await f.a.query("commit");
  const second = await secondPromise;
  assert.equal(second.replayed, true);
  assert.equal(second.event_id, first.event_id);
  assert.equal(
    (
      await f.monitor.query(
        "select count(*)::int n from enkidu_conversation_enrichments where session_id=$1 and enrichment_type='semantic_correction_v1'",
        [f.executionId],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.monitor.query(
        "select count(*)::int n from training_sessions where id=$1",
        [f.executionId],
      )
    ).rows[0].n,
    1,
  );
});
test("SEMANTIC REAL PG: competing previews cannot overwrite the winner", async (t) => {
  const f = await seed(t),
    a = await command(f.monitor, f.semantic, [
      { op: "set_load", target: f.exercise, value: 42.5, unit: "kg" },
    ]),
    b = await command(f.monitor, f.semantic, [
      { op: "set_load", target: f.exercise, value: 45, unit: "kg" },
    ]);
  const wait = await waiting(f);
  await f.a.query("begin");
  await apply(f.a, a);
  const accepted = apply(f.b, b).then(
    (x) => ({ x }),
    (error) => ({ error }),
  );
  await wait();
  await f.a.query("commit");
  assert.match((await accepted).error.message, /preview_stale/);
  assert.equal(
    (
      await f.monitor.query(
        "select load_value from session_exercises where id=$1",
        [f.exercise],
      )
    ).rows[0].load_value,
    42.5,
  );
});
test("SEMANTIC REAL PG: exercise edits outside the advisory protocol are compared after row lock wait", async (t) => {
  const f = await seed(t),
    c = await command(f.monitor, f.semantic, [
      { op: "set_last_reps", target: f.exercise, value: 9 },
    ]);
  const wait = await waiting(f);
  await f.a.query("begin");
  await f.a.query(
    "update session_exercises set reps_per_set='[10,10,8]' where id=$1",
    [f.exercise],
  );
  const accepted = apply(f.b, c).then(
    (x) => ({ x }),
    (error) => ({ error }),
  );
  await wait();
  await f.a.query("commit");
  assert.match((await accepted).error.message, /preview_stale/);
  assert.deepEqual(
    (
      await f.monitor.query(
        "select reps_per_set from session_exercises where id=$1",
        [f.exercise],
      )
    ).rows[0].reps_per_set,
    [10, 10, 8],
  );
});
test("SEMANTIC REAL PG: failure at final ledger insert rolls back exercise, block, source and link", async (t) => {
  const f = await seed(t),
    target = crypto.randomUUID(),
    c = await command(f.monitor, f.semantic, [
      { op: "add_exercise", target, reported_name: "RDL" },
      { op: "set_reps", target, reps: [8, 8, 8] },
    ]);
  const name = "semantic_fail_" + crypto.randomUUID().replaceAll("-", "");
  await f.monitor.query(
    `create function public.${name}() returns trigger language plpgsql as $$ begin if new.session_id='${f.executionId}'::uuid then raise exception 'forced ledger failure'; end if; return new; end $$; create trigger ${name} before insert on public.enkidu_conversation_enrichments for each row execute function public.${name}()`,
  );
  try {
    await assert.rejects(() => apply(f.a, c), /forced ledger failure/);
    assert.equal(
      (
        await f.monitor.query(
          "select count(*)::int n from session_exercises where id=$1",
          [target],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await f.monitor.query(
          "select count(*)::int n from training_sources where user_id=$1 and source_system='enqidu_semantics'",
          [f.userId],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await f.monitor.query(
          "select count(*)::int n from session_source_links where session_id=$1",
          [f.executionId],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await f.monitor.query(
          "select count(*)::int n from session_blocks where session_id=$1",
          [f.executionId],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await f.monitor.query(
      `drop trigger ${name} on public.enkidu_conversation_enrichments; drop function public.${name}()`,
    );
  }
});
