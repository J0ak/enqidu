import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { readdirSync } from "node:fs";
import pg from "pg";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createRemoteMcpHandler } from "../src/mcp/remote.js";
import { listEnqiduTools } from "../src/enqiduTools/registry.js";
import {
  createToolsFixture,
  TOOLS_SECRET_MARKER,
} from "../e2e/tools-fixture.js";
import { catalogSeed } from "../src/training/catalogSeed.js";
import { auditOAuthBoundary } from "./audit-oauth-boundary.mjs";
if (process.env.ENQIDU_TRANSACTION_ENV_FILE)
  loadEnvFile(process.env.ENQIDU_TRANSACTION_ENV_FILE);
assert.equal(process.env.ENQIDU_TRANSACTION_LOCAL, "1");
for (const value of [process.env.API_URL, process.env.DB_URL])
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname),
  );
process.env.VITE_SUPABASE_URL = process.env.API_URL;
process.env.VITE_SUPABASE_ANON_KEY = process.env.ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
const a = await createToolsFixture("oauth-boundary-a"),
  b = await createToolsFixture("oauth-boundary-b");
const pgDb = new pg.Client({ connectionString: process.env.DB_URL });
await pgDb.connect();
const events = [];
let config;
const server = createServer(async (req, res) => {
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: req.headers,
    ...(["GET", "HEAD"].includes(req.method)
      ? {}
      : { body: req, duplex: "half" }),
  });
  const response = await createRemoteMcpHandler({
    config,
    observe: (e) => events.push(e),
  })(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const claims = JSON.parse(Buffer.from(a.token.split(".")[1], "base64url"));
config = {
  resource: `http://127.0.0.1:${server.address().port}/api/mcp`,
  issuer: claims.iss,
  supabaseUrl: a.url,
  key: a.anonKey,
  dataKey: process.env.SERVICE_ROLE_KEY,
};
const encoded = [
  { alg: "HS256", typ: "JWT" },
  {
    ...claims,
    client_id: "disposable-approved-client",
    aud: ["authenticated", config.resource],
  },
]
  .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
  .join(".");
const oauth = `${encoded}.${createHmac("sha256", process.env.JWT_SECRET).update(encoded).digest("base64url")}`;
const headers = { ...a.headers, Authorization: `Bearer ${oauth}` };
const client = new Client(
  { name: "real-local-oauth-boundary", version: "1" },
  { versionNegotiation: { mode: "legacy" } },
);
try {
  const audit = await auditOAuthBoundary(pgDb);
  assert.deepEqual(audit.errors, []);
  const seed = catalogSeed.find((e) => e.code === "high_pull_up");
  const catalog = await a.adminDb
    .from("exercise_catalog")
    .upsert(
      {
        code: seed.code,
        name: seed.name,
        metadata: seed.metadata,
        is_active: true,
      },
      { onConflict: "code" },
    )
    .select("id");
  assert.equal(catalog.error, null);
  for (const f of [a, b])
    assert.equal(
      (
        await f.adminDb
          .from("session_exercises")
          .update({
            exercise_id: catalog.data[0].id,
            name: "Dominada alta",
            reported_name: "Dominada alta",
            load_value: null,
            load_unit: "bodyweight",
            reps_per_set: f === a ? [3, 3, 2] : [777],
          })
          .eq("session_id", f.identities.execution.id)
      ).error,
      null,
    );
  const before = await a.snapshot(),
    foreignBefore = await b.snapshot();
  // Real application tables, direct SQL as authenticated: no HTTP pre-request hook.
  await pgDb.query("begin");
  try {
    await pgDb.query("set local role authenticated");
    await pgDb.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify(claims),
    ]);
    assert.equal(
      (
        await pgDb.query(
          "select id from public.training_sessions where id=$1",
          [a.identities.execution.id],
        )
      ).rowCount,
      1,
    );
    assert.equal(
      (
        await pgDb.query(
          "select id from public.training_sessions where id=$1",
          [b.identities.execution.id],
        )
      ).rowCount,
      0,
    );
    await pgDb.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ ...claims, client_id: "disposable-approved-client" }),
    ]);
    for (const table of [
      "training_sessions",
      "session_blocks",
      "session_exercises",
      "profiles",
      "wearable_health_daily",
      "fit_message_payloads",
    ])
      assert.equal(
        (await pgDb.query(`select * from public.${table}`)).rowCount,
        0,
        table,
      );
    for (const [sql, args] of [
      [
        "update public.training_sessions set title='forbidden' where id=$1",
        [a.identities.execution.id],
      ],
      [
        "delete from public.training_sessions where id=$1",
        [a.identities.execution.id],
      ],
      [
        "insert into public.training_sessions(user_id,title,session_date,local_date) values($1,'forbidden',$2,$2)",
        [a.user.id, a.date()],
      ],
    ]) {
      await pgDb.query("savepoint denied");
      try {
        assert.equal((await pgDb.query(sql, args)).rowCount, 0);
      } catch (error) {
        assert.equal(error.code, "42501");
      }
      await pgDb.query("rollback to savepoint denied");
    }
  } finally {
    await pgDb.query("rollback");
  }
  // Actual PostgREST, actual signed claims; no mocked API or RLS.
  for (const table of audit.relations) {
    const r = await fetch(`${a.url}/rest/v1/${table}?select=*&limit=1`, {
      headers,
    });
    assert.equal(r.status, 403, `OAuth direct SELECT ${table}`);
    assert.equal((await r.json()).message, "oauth_transport_forbidden");
  }
  for (const table of [
    "training_sessions",
    "session_blocks",
    "session_exercises",
    "session_metrics",
    "profiles",
    "wearable_health_daily",
    "fit_message_payloads",
  ]) {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const r = await fetch(
        `${a.url}/rest/v1/${table}${method === "POST" ? "" : "?id=not.is.null"}`,
        {
          method,
          headers,
          ...(method === "DELETE"
            ? {}
            : {
                body: JSON.stringify(
                  table === "profiles"
                    ? { display_name: "forbidden" }
                    : table === "training_sessions"
                      ? {
                          user_id: a.user.id,
                          title: "forbidden",
                          session_date: a.date(),
                          local_date: a.date(),
                        }
                      : {},
                ),
              }),
        },
      );
      assert.equal(r.status, 403, `${method} ${table}`);
      assert.equal((await r.json()).message, "oauth_transport_forbidden");
    }
  }
  for (const [rpc, args] of [
    [
      "set_garmin_sync_consent",
      { p_action: "enable", p_consent_version: "garmin_daily_v1" },
    ],
    ["get_ai_coach_context", { p_user_id: a.user.id }],
    [
      "read_training_semantics_for_mcp_v1",
      { p_user_id: a.user.id, p_session_id: a.identities.execution.id },
    ],
  ]) {
    const r = await fetch(`${a.url}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
    });
    assert.equal(r.status, 403, rpc);
  }
  // A normal frontend session retains owned reads/CRUD and cannot see athlete B.
  assert.equal(
    (
      await a.db
        .from("training_sessions")
        .select("id")
        .eq("id", a.identities.execution.id)
    ).data.length,
    1,
  );
  assert.equal(
    (
      await a.db
        .from("training_sessions")
        .select("id")
        .eq("id", b.identities.execution.id)
    ).data.length,
    0,
  );
  const block = {
    session_id: a.identities.execution.id,
    block_order: 99,
    title: "normal frontend CRUD",
    block_type: "strength",
  };
  const inserted = await a.db.from("session_blocks").insert(block).select();
  assert.equal(inserted.error, null);
  const id = inserted.data[0].id;
  assert.equal(
    (
      await a.db
        .from("session_blocks")
        .update({ title: "normal update" })
        .eq("id", id)
        .select()
    ).data.length,
    1,
  );
  assert.equal(
    (await a.db.from("session_blocks").delete().eq("id", id).select()).data
      .length,
    1,
  );
  const post = async (endpoint, body, h = headers) =>
    fetch(`${a.url}/functions/v1/${endpoint}`, {
      method: "POST",
      headers: h,
      body: JSON.stringify(body),
    });
  const previewResponse = await post(
    "enqidu-tools",
    { tool: "preview_cancel_session", arguments: { source_date: a.date(1) } },
    a.headers,
  );
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.ok, true);
  const acceptance = {
    source_date: a.date(1),
    confirmation: true,
    fingerprint: preview.data.fingerprint,
    expires_at: preview.data.expires_at,
  };
  const endpoints = readdirSync(
    new URL("../supabase/functions/", import.meta.url),
    { withFileTypes: true },
  )
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name);
  for (const endpoint of endpoints) {
    const r = await post(
      endpoint,
      endpoint === "coach-plan-action"
        ? { action: "cancel_planned_session", ...acceptance }
        : {},
    );
    assert.equal(r.status, 403, endpoint);
    assert.deepEqual(await r.json(), {
      ok: false,
      error: "oauth_transport_forbidden",
    });
  }
  for (const tool of listEnqiduTools().filter((t) => t.access === "write")) {
    const r = await post("enqidu-tools", {
      tool: tool.id,
      arguments: acceptance,
    });
    assert.equal(r.status, 403, tool.id);
    assert.equal((await r.json()).error, "oauth_transport_forbidden");
  }
  for (const action of [
    "preview_manual_health_import",
    "apply_manual_health_import",
  ]) {
    const r = await post("manual-health-import", {
      action,
      confirmation: true,
    });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error, "oauth_transport_forbidden");
  }
  // Same bearer succeeds ONLY through Remote MCP; internal service client sees both tenants.
  await client.connect(
    new StreamableHTTPClientTransport(new URL(config.resource), {
      requestInit: { headers: { Authorization: `Bearer ${oauth}` } },
    }),
  );
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 27);
  assert.ok(tools.every((t) => !t.name.startsWith("apply_")));
  const calls = [
    [
      "get_training_session_detail_v2",
      { session_id: a.identities.execution.id },
    ],
    ["get_training_session", { session_id: a.identities.execution.id }],
    ["get_recent_training", {}],
    ["get_today_plan", {}],
    ["get_week_plan", {}],
    ["get_athlete_context", {}],
    ["get_health_status", {}],
    ["get_readiness", {}],
    ["get_closed_loop_assessment", { session_id: a.identities.execution.id }],
    ["get_training_overview_v1", { period: "4" }],
    [
      "get_exercise_progress_v1",
      { canonical_code: "high_pull_up", period: "all" },
    ],
    [
      "get_exercise_history_v1",
      { canonical_code: "high_pull_up", from: a.date(-7), to: a.date() },
    ],
    ["get_training_semantics_v1", { session_id: a.identities.execution.id }],
  ];
  for (const [name, args] of calls) {
    const value = (await client.callTool({ name, arguments: args }))
      .structuredContent;
    assert.equal(value.ok, true, `${name}: ${JSON.stringify(value.error)}`);
    assert.equal(value.timezone, "Europe/Madrid");
    if (name === "get_exercise_progress_v1") {
      assert.equal(value.data.observations, 1);
      assert.equal(value.data.exercise.classification, "skill");
      assert.equal(value.data.exercise.display_name, "Dominada alta");
      assert.deepEqual(value.data.available_metrics, ["reps"]);
    }
    const wire = JSON.stringify(value);
    for (const secret of [
      oauth,
      config.dataKey,
      b.user.id,
      b.identities.execution.id,
      TOOLS_SECRET_MARKER,
    ])
      assert.ok(!wire.includes(secret), `${name} must not leak`);
  }
  for (const name of [
    "get_training_session_detail_v2",
    "get_training_session",
    "get_training_semantics_v1",
  ]) {
    const r = (
      await client.callTool({
        name,
        arguments: { session_id: b.identities.execution.id },
      })
    ).structuredContent;
    assert.equal(r.ok, false);
  }
  assert.deepEqual(await a.snapshot(), before);
  assert.deepEqual(await b.snapshot(), foreignBefore);
  for (const secret of [
    oauth,
    config.dataKey,
    a.user.id,
    b.user.id,
    TOOLS_SECRET_MARKER,
  ])
    assert.ok(!JSON.stringify(events).includes(secret));
  console.log(
    `Real local Supabase HTTP acceptance PASS: ${audit.relations.length} direct REST resources denied; CRUD/RPC/10 Edge endpoints denied; all seven applies denied; first-party CRUD preserved; real SDK Remote MCP reads + Health/Closed Loop + semantic RPC succeed, foreign rows and secrets absent.`,
  );
} finally {
  await client.close();
  server.closeAllConnections();
  server.close();
  await pgDb.end();
  await a.dispose();
  await b.dispose();
}
