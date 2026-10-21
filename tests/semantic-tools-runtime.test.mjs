import test from "node:test";
import assert from "node:assert/strict";
import { semanticDatabase, semanticFixture } from "./helpers/semantic-db.mjs";
import { createEnqiduToolRuntime } from "../src/enqiduTools/runtime.js";
import { matchesSchema } from "../src/enqiduTools/schema.js";
import { getEnqiduTool } from "../src/enqiduTools/registry.js";
const key = "local-test-signing-key-only-".repeat(3);
let sql;
test.before(async () => {
  sql = await semanticDatabase();
});
test.after(async () => {
  await sql?.close();
});
function adapter(user, { failReadback = false } = {}) {
  let applied = false;
  return {
    auth: { getUser: async () => ({ data: { user: { id: user } } }) },
    from(table) {
      const filters = [],
        params = [];
      let columns = "id",
        limit = 200;
      const q = {
        select(v) {
          columns = v;
          return q;
        },
        eq(k, v) {
          filters.push(`${k}=$${params.push(v)}`);
          return q;
        },
        order() {
          return q;
        },
        limit(v) {
          limit = v;
          return q;
        },
        then(resolve, reject) {
          return sql
            .query(
              `select ${columns} from ${table} ${filters.length ? "where " + filters.join(" and ") : ""} limit ${limit}`,
              params,
            )
            .then(
              (r) => ({ data: r.rows }),
              (e) => ({ error: e }),
            )
            .then(resolve, reject);
        },
      };
      return q;
    },
    async rpc(name, args) {
      try {
        if (name === "read_training_semantics_v1") {
          if (applied && failReadback)
            return { error: { message: "readback down" } };
          return {
            data: (
              await sql.query("select training_semantics.state($1,$2) s", [
                user,
                args.p_session_id,
              ])
            ).rows[0].s,
          };
        }
        assert.equal(name, "apply_training_semantics_v1");
        const c = args;
        const r = await sql.query(
          "select apply_training_semantics_v1($1,$2,$3,$4,$5,$6,$7,$8) r",
          [
            c.p_user_id,
            c.p_session_id,
            c.p_revision,
            c.p_fingerprint,
            c.p_expires_at,
            JSON.stringify(c.p_operations),
            c.p_channel,
            c.p_materialization ? JSON.stringify(c.p_materialization) : null,
          ],
        );
        applied = true;
        return { data: r.rows[0].r };
      } catch (error) {
        return { error };
      }
    },
  };
}
async function runtime(f, options = {}) {
  const db = adapter(f.user, options);
  return createEnqiduToolRuntime({
    db,
    adminDb: db,
    semanticSigningKey: key,
    ...options,
  });
}
const accept = (p) => ({
  session_id: p.session_id,
  operations: p.operations,
  channel: p.channel,
  revision: p.revision,
  fingerprint: p.fingerprint,
  expires_at: p.expires_at,
  confirmation: true,
  ...(p.materialization ? { materialization: p.materialization } : {}),
});
test("SEMANTIC TOOLS signed preview, confirmation, tamper, stale, readback and retry", async () => {
  const f = await semanticFixture(sql),
    rt = await runtime(f);
  const current = await rt.execute("get_training_semantics_v1", {
    session_id: f.session,
  });
  assert.equal(current.ok, true);
  assert.equal(current.data.llm_used, false);
  assert.equal(current.data.usage, null);
  const p = await rt.execute("preview_training_semantics_v1", {
    session_id: f.session,
    operations: [{ op: "set_last_reps", target: f.exercise, value: 9 }],
  });
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.ok(matchesSchema(p, getEnqiduTool(p.tool).output_schema));
  assert.equal(p.data.llm_used, false);
  assert.equal(p.data.usage, null);
  assert.equal(
    (
      await rt.execute("apply_training_semantics_v1", {
        ...accept(p.data),
        confirmation: false,
      })
    ).error.code,
    "explicit_confirmation_required",
  );
  assert.equal(
    (
      await rt.execute("apply_training_semantics_v1", {
        ...accept(p.data),
        operations: [{ op: "set_last_reps", target: f.exercise, value: 8 }],
      })
    ).error.code,
    "preview_stale",
  );
  assert.equal(
    (
      await rt.execute("apply_training_semantics_v1", {
        ...accept(p.data),
        channel: "coach",
      })
    ).error.code,
    "preview_stale",
  );
  const applied = await rt.execute(
    "apply_training_semantics_v1",
    accept(p.data),
  );
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(applied.data.persistence_verified, true);
  assert.deepEqual(applied.data.state.exercises[0].reps_per_set, [10, 10, 9]);
  const retry = await rt.execute("apply_training_semantics_v1", accept(p.data));
  assert.equal(retry.ok, true);
  assert.equal(retry.data.replayed, true);
  assert.equal(retry.data.event_id, applied.data.event_id);
  const stale = await rt.execute("preview_training_semantics_v1", {
    session_id: f.session,
    operations: [{ op: "set_load", target: f.exercise, value: 45, unit: "kg" }],
  });
  await sql.query("update session_exercises set load_value=42.5 where id=$1", [
    f.exercise,
  ]);
  assert.equal(
    (await rt.execute("apply_training_semantics_v1", accept(stale.data))).error
      .code,
    "preview_stale",
  );
});
test("SEMANTIC TOOLS confirmed mutation survives failed readback without a false failure", async () => {
  const f = await semanticFixture(sql),
    rt = await runtime(f, { failReadback: true });
  const p = await rt.execute("preview_training_semantics_v1", {
    session_id: f.session,
    operations: [
      { op: "set_load", target: f.exercise, value: 0, unit: "kg_each" },
    ],
  });
  const applied = await rt.execute(
    "apply_training_semantics_v1",
    accept(p.data),
  );
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(applied.data.applied, true);
  assert.equal(applied.data.persistence_verified, false);
  assert.deepEqual(applied.warnings, ["semantic_readback_unavailable"]);
  assert.ok(matchesSchema(applied, getEnqiduTool(applied.tool).output_schema));
});
test("SEMANTIC TOOLS identity cannot be forged and MCP writes remain disabled even with a capability", async () => {
  const f = await semanticFixture(sql),
    rt = await runtime(f);
  assert.equal(
    (await rt.execute("get_training_semantics_v1", { session_id: f.foreign }))
      .error.code,
    "session_not_found",
  );
  const p = await rt.execute("preview_training_semantics_v1", {
    session_id: f.session,
    operations: [{ op: "set_load", target: f.exercise, value: 45, unit: "kg" }],
  });
  const mcp = await runtime(f, {
    source: "mcp",
    capabilities: { writes: true },
  });
  assert.equal(
    (await mcp.execute("apply_training_semantics_v1", accept(p.data))).error
      .code,
    "mcp_writes_disabled",
  );
  const noKey = await createEnqiduToolRuntime({ db: adapter(f.user) });
  assert.equal(
    (
      await noKey.execute("preview_training_semantics_v1", {
        session_id: f.session,
        operations: p.data.operations,
      })
    ).error.code,
    "mutation_unavailable",
  );
});

test("SEMANTIC MCP real SDK previews are read-only and cannot authorize App writes", async () => {
  const { connectEnqiduMcp } = await import("./support/enqiduMcp.mjs");
  const f = await semanticFixture(sql),
    db = adapter(f.user);
  const connection = await connectEnqiduMcp({
    db,
    adminDb: db,
    writesEnabled: true,
  });
  try {
    const tools = (await connection.client.listTools()).tools;
    assert.ok(!tools.some((t) => t.name === "apply_training_semantics_v1"));
    const p = (
      await connection.client.callTool({
        name: "preview_training_semantics_v1",
        arguments: {
          session_id: f.session,
          operations: [{ op: "set_last_reps", target: f.exercise, value: 9 }],
        },
      })
    ).structuredContent;
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.equal(p.data.llm_used, false);
    assert.deepEqual(p.data.after[0].reps_per_set, [10, 10, 9]);
    assert.equal(
      (
        await sql.query(
          "select count(*)::int n from enkidu_conversation_enrichments where session_id=$1",
          [f.session],
        )
      ).rows[0].n,
      0,
    );
    const app = await runtime(f);
    assert.equal(
      (await app.execute("apply_training_semantics_v1", accept(p.data))).error
        .code,
      "preview_stale",
    );
    const denied = (
      await connection.client.callTool({
        name: "apply_training_semantics_v1",
        arguments: accept(p.data),
      })
    ).structuredContent;
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, "mcp_writes_disabled");
  } finally {
    await connection.close();
  }
});

test("103 runtime golden: text → facts → signed #102 → canonical data → provenance → retry", async () => {
  const f = await semanticFixture(sql),
    rt = await runtime(f);
  const text =
    "Hoy en press banca hice 40 kg, 10, 10 y 9. En RDL hice 3x8 con 45 kg. No hice dead bug.";
  const before = (
    await sql.query(
      "select to_jsonb(s) s from training_sessions s where id=$1",
      [f.session],
    )
  ).rows[0].s;
  const source = (
    await sql.query("select original_json from training_sources where id=$1", [
      f.source,
    ])
  ).rows[0];
  const p = await rt.execute("interpret_training_correction_v1", {
    text,
    session_id: f.session,
  });
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(p.data.status, "preview_ready");
  assert.equal(p.data.materialization.observations.length, 3);
  assert.equal(
    (
      await sql.query(
        "select count(*)::int n from session_exercises where session_id=$1",
        [f.session],
      )
    ).rows[0].n,
    1,
  );
  const request = accept(p.data.preview);
  const forged = structuredClone(request);
  forged.materialization.original_text = "Texto falsificado";
  assert.equal(
    (await rt.execute("apply_training_semantics_v1", forged)).error.code,
    "preview_stale",
  );
  const receipt = await rt.execute("apply_training_semantics_v1", request);
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  assert.equal(receipt.data.persistence_verified, true);
  assert.equal(receipt.data.state.exercises.length, 3);
  assert.ok(receipt.data.state.exercises.every((e) => e.exercise_id));
  assert.deepEqual(
    receipt.data.state.exercises.find((e) => e.id === f.exercise).reps_per_set,
    [10, 10, 9],
  );
  const event = (
    await sql.query(
      "select payload from enkidu_conversation_enrichments where id=$1",
      [receipt.data.event_id],
    )
  ).rows[0].payload;
  assert.equal(event.materialization.original_text, text);
  assert.deepEqual(event.materialization.facts, p.data.materialization);
  assert.deepEqual(event.operations, request.operations);
  assert.equal(event.actor_id, f.user);
  assert.equal(event.channel, "coach");
  assert.ok(event.timestamp);
  assert.equal(event.before.exercises.length, 1);
  assert.equal(event.after.exercises.length, 3);
  assert.equal(event.receipt.session_id, f.session);
  assert.deepEqual(
    (
      await sql.query(
        "select to_jsonb(s) s from training_sessions s where id=$1",
        [f.session],
      )
    ).rows[0].s,
    before,
  );
  assert.deepEqual(
    (
      await sql.query(
        "select original_json from training_sources where id=$1",
        [f.source],
      )
    ).rows[0],
    source,
  );
  const retry = await rt.execute("apply_training_semantics_v1", request);
  assert.equal(retry.data.replayed, true);
  const noChange = await rt.execute("interpret_training_correction_v1", {
    text,
    session_id: f.session,
  });
  assert.equal(noChange.data.status, "already_materialized");
  assert.equal(noChange.data.preview, null);
  const other = await createEnqiduToolRuntime({
    db: adapter(f.other),
    adminDb: adapter(f.other),
    semanticSigningKey: key,
  });
  assert.equal(
    (await other.execute("apply_training_semantics_v1", request)).error.code,
    "preview_stale",
  );
});
