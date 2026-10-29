import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { readFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import pg from "pg";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createToolsFixture } from "../e2e/tools-fixture.js";
import { createOAuthHandler } from "../server/oauth/handler.js";
import { createOAuthStore } from "../server/oauth/store.js";
import {
  CLIENT_ID,
  CLAUDE_CLIENT_ID,
  SCOPES,
  opaque,
  hash,
} from "../server/oauth/protocol.js";
import { createRemoteMcpHandler } from "../src/mcp/remote.js";
import { catalogSeed } from "../src/training/catalogSeed.js";
if (process.env.ENQIDU_TRANSACTION_ENV_FILE)
  loadEnvFile(process.env.ENQIDU_TRANSACTION_ENV_FILE);
assert.equal(process.env.ENQIDU_TRANSACTION_LOCAL, "1");
// Approved client exercised by every existing group: chatgpt (default, unchanged
// behaviour) or claude. The cross-client group always runs with both. Run once per
// value for full coverage. Local-only: the URL guards below are unchanged.
const ACCEPTANCE_CLIENTS = {
  chatgpt: { id: CLIENT_ID, fixture: "chatgpt-client.json" },
  claude: { id: CLAUDE_CLIENT_ID, fixture: "claude-client.json" },
};
const clientName = process.env.ENQIDU_OAUTH_ACCEPTANCE_CLIENT || "chatgpt";
assert.ok(
  Object.hasOwn(ACCEPTANCE_CLIENTS, clientName),
  "ENQIDU_OAUTH_ACCEPTANCE_CLIENT must be chatgpt or claude",
);
for (const key of ["API_URL", "DB_URL"]) {
  const u = new URL(process.env[key]);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
      u.port &&
      !u.search &&
      !u.hash,
  );
}
Object.assign(process.env, {
  VITE_SUPABASE_URL: process.env.API_URL,
  VITE_SUPABASE_ANON_KEY: process.env.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SERVICE_ROLE_KEY,
});
const sql = new pg.Client({ connectionString: process.env.DB_URL });
await sql.connect();
const fixtures = [],
  clients = [],
  wire = [],
  events = [];
let server, config;
let passes = 0;
const check = async (name, fn) => {
  await fn();
  passes++;
  console.log(`PASS ${name}`);
};
try {
  // Local-only login for the least-privilege role. Never output its URL/password.
  const password = randomBytes(32).toString("hex");
  await sql.query(`alter role enqidu_mcp_oauth login password '${password}'`);
  const url = new URL(process.env.DB_URL);
  url.username = "enqidu_mcp_oauth";
  url.password = password;
  const store = createOAuthStore({ connectionString: url.href, local: true });
  for (const name of ["opaque-a", "opaque-b"])
    fixtures.push(
      await createToolsFixture(name, { health: false, plans: false }),
    );
  const [a, b] = fixtures;
  // Bounded official CIMD snapshots; no live third-party fetch in acceptance.
  const docs = Object.fromEntries(
    Object.values(ACCEPTANCE_CLIENTS).map(({ id, fixture }) => [
      id,
      JSON.parse(
        readFileSync(
          new URL(`../tests/fixtures/oauth/${fixture}`, import.meta.url),
        ),
      ),
    ]),
  );
  const OTHER_CLIENT =
    ACCEPTANCE_CLIENTS[clientName === "chatgpt" ? "claude" : "chatgpt"].id;
  const ACTIVE_CLIENT = ACCEPTANCE_CLIENTS[clientName].id;
  const doc = docs[ACTIVE_CLIENT];
  server = createServer(async (req, res) => {
    try {
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers,
        ...(["GET", "HEAD"].includes(req.method)
          ? {}
          : { body: req, duplex: "half" }),
      });
      // Entire handler and token plane rebuilt for every request; persisted state only.
      const response = await (
        new URL(request.url).pathname.startsWith("/api/mcp")
          ? createRemoteMcpHandler({
              config,
              tokenStore: store,
              observe: (e) => events.push(e),
            })
          : createOAuthHandler({
              config,
              store,
              fetchDocument: async (id) => docs[id],
              observe: (e) => events.push(e),
            })
      )(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end("test_server_failed");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const issuer = `http://127.0.0.1:${server.address().port}`;
  config = {
    issuer,
    resource: `${issuer}/api/mcp`,
    supabaseUrl: a.url,
    key: a.anonKey,
    dataKey: process.env.SERVICE_ROLE_KEY,
  };
  const http = async (path, options = {}) => {
    const r = await fetch(issuer + path, { redirect: "manual", ...options });
    const text = await r.text();
    wire.push(text);
    let body;
    try {
      body = JSON.parse(text);
    } catch {}
    return { status: r.status, headers: r.headers, body, text };
  };
  const post = (path, p, bearer) =>
    http(path, {
      method: "POST",
      headers: {
        "Content-Type": bearer
          ? "application/json"
          : "application/x-www-form-urlencoded",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: bearer ? JSON.stringify(p) : new URLSearchParams(p),
    });
  const authorize = async (
    scope = SCOPES.join(" "),
    patch = {},
    client = ACTIVE_CLIENT,
  ) => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const p = {
      response_type: "code",
      client_id: client,
      redirect_uri: docs[client].redirect_uris[0],
      resource: config.resource,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "opaque-state-104",
      scope,
      ...patch,
    };
    const r = await http("/oauth/authorize?" + new URLSearchParams(p));
    assert.equal(r.status, 302);
    const u = new URL(r.headers.get("location"));
    assert.equal(u.pathname, "/oauth/consent");
    return { handle: u.searchParams.get("request_id"), verifier, p, client };
  };
  const decide = async (auth, who = a, decision = "approve") => {
    const details = await post(
      "/api/oauth/details",
      { authorization_request_id: auth.handle },
      who.token,
    );
    assert.equal(details.status, 200);
    const r = await post(
      "/api/oauth/decision",
      { authorization_request_id: auth.handle, decision },
      who.token,
    );
    assert.equal(r.status, 200);
    const callback = new URL(r.body.redirect_url);
    assert.equal(
      callback.origin + callback.pathname,
      docs[auth.client].redirect_uris[0],
    );
    assert.equal(callback.searchParams.get("iss"), issuer);
    assert.equal(callback.searchParams.get("state"), auth.p.state);
    return { ...auth, code: callback.searchParams.get("code"), callback };
  };
  const exchange = (c, patch = {}) =>
    post("/oauth/token", {
      grant_type: "authorization_code",
      client_id: c.client,
      resource: config.resource,
      redirect_uri: docs[c.client].redirect_uris[0],
      code: c.code,
      code_verifier: c.verifier,
      ...patch,
    });
  const mint = async (who = a, scope, client = ACTIVE_CLIENT) => {
    const c = await decide(await authorize(scope, {}, client), who);
    const r = await exchange(c);
    assert.equal(r.status, 200);
    assert.match(r.body.access_token, /^enq_mcp_at_[A-Za-z0-9_-]{43}$/);
    return r.body;
  };
  const refresh = (token, patch = {}, client = ACTIVE_CLIENT) =>
    post("/oauth/token", {
      grant_type: "refresh_token",
      client_id: client,
      resource: config.resource,
      refresh_token: token,
      ...patch,
    });
  const mcpStatus = async (token) => {
    const r = await http("/api/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "oauth-acceptance", version: "1" },
        },
      }),
    });
    return r.status;
  };
  const sdk = async (token) => {
    const c = new Client(
      { name: "opaque-golden", version: "1" },
      { versionNegotiation: { mode: "legacy" } },
    );
    clients.push(c);
    await c.connect(
      new StreamableHTTPClientTransport(new URL(config.resource), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    return c;
  };
  await check(
    "private schema: no Data API/anon/authenticated/table grants; runtime only closed functions",
    async () => {
      const r = await sql.query(
        "select has_schema_privilege('anon','mcp_private','USAGE') a,has_schema_privilege('authenticated','mcp_private','USAGE') b",
      );
      assert.equal(r.rows[0].a, false);
      assert.equal(r.rows[0].b, false);
      const t = await sql.query(
        "select c.relname,c.relrowsecurity,has_table_privilege('enqidu_mcp_oauth',c.oid,'SELECT,INSERT,UPDATE,DELETE') exposed from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mcp_private' and c.relkind='r'",
      );
      assert.equal(t.rowCount, 4);
      for (const row of t.rows) {
        assert.equal(row.exposed, false);
        assert.equal(row.relrowsecurity, true);
      }
      const f = await sql.query(
        "select p.proname,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') a,has_function_privilege('authenticated',p.oid,'EXECUTE') b from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mcp_private'",
      );
      assert.equal(f.rowCount, 11);
      for (const row of f.rows) {
        assert.equal(row.a, false);
        assert.equal(row.b, false);
        assert.ok(row.proconfig.includes('search_path=""'));
      }
      assert.equal(
        (
          await sql.query(
            "select count(*)::int n from pg_policies where policyname='enqidu_oauth_no_direct_access'",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await sql.query(
            "select to_regprocedure('public.enqidu_data_api_guard()') absent",
          )
        ).rows[0].absent,
        null,
      );
    },
  );
  let golden;
  await check(
    "golden: human login, CIMD, consent, PKCE, opaque token and canonical high_pull_up via real SDK",
    async () => {
      const seed = catalogSeed.find((r) => r.code === "high_pull_up");
      const cat = await a.adminDb
        .from("exercise_catalog")
        .upsert(seed, { onConflict: "code" })
        .select("id")
        .single();
      assert.equal(cat.error, null);
      const [session] = await a.insert("training_sessions", {
        user_id: a.user.id,
        title: "Opaque golden",
        local_date: a.date(),
        session_date: a.date(),
        started_at: `${a.date()}T10:00:00Z`,
        duration_seconds: 600,
        session_status: "completed",
        sport: "strength",
      });
      const [block] = await a.insert("session_blocks", {
        session_id: session.id,
        block_order: 1,
        title: "Skill",
        name: "Skill",
        block_type: "strength",
        data_confidence: "reported",
      });
      await a.insert("session_exercises", {
        session_id: session.id,
        block_id: block.id,
        exercise_order: 1,
        exercise_id: cat.data.id,
        reported_name: "Dominada alta",
        execution_type: "performed",
        sets_completed: 1,
        reps_per_set: [3],
        load_unit: "bodyweight",
        data_confidence: "reported",
      });
      golden = await mint();
      const c = await sdk(golden.access_token);
      const tools = (await c.listTools()).tools;
      assert.equal(tools.length, 27);
      assert.ok(tools.every((t) => !t.name.startsWith("apply_")));
      const result = (
        await c.callTool({
          name: "get_exercise_progress_v1",
          arguments: { canonical_code: "high_pull_up", period: "all" },
        })
      ).structuredContent;
      assert.equal(result.ok, true);
      assert.equal(result.data.exercise.display_name, "Dominada alta");
      assert.equal(result.data.exercise.classification, "skill");
      assert.equal(result.data.observations, 1);
      assert.equal(result.timezone, "Europe/Madrid");
      assert.ok(result.data.available_metrics.includes("reps"));
      wire.push(JSON.stringify(result));
    },
  );
  await check(
    "EXACT SAME opaque token rejected by real Supabase Auth GET/PUT, REST, RPC and Edge; no account mutation",
    async () => {
      const before = (await a.adminDb.auth.admin.getUserById(a.user.id)).data
        .user;
      const headers = {
        ...a.headers,
        Authorization: `Bearer ${golden.access_token}`,
      };
      for (const [path, method, body] of [
        ["/auth/v1/user", "GET"],
        [
          "/auth/v1/user",
          "PUT",
          { data: { mcp_forbidden_probe: "must-not-change" } },
        ],
        ["/rest/v1/training_sessions?select=id", "GET"],
        [
          "/rest/v1/rpc/set_garmin_sync_consent",
          "POST",
          { p_action: "enable", p_consent_version: "garmin_daily_v1" },
        ],
        [
          "/functions/v1/enqidu-tools",
          "POST",
          { tool: "apply_cancel_session", args: { confirmation: true } },
        ],
        [
          "/functions/v1/coach-plan-action",
          "POST",
          { action: "cancel_session", confirmation: true },
        ],
        [
          "/functions/v1/manual-health-import",
          "POST",
          { action: "apply_manual_health_import" },
        ],
      ]) {
        const r = await fetch(a.url + path, {
          method,
          headers,
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        assert.ok(
          [400, 401, 403].includes(r.status),
          `${path} status ${r.status}`,
        );
      }
      assert.deepEqual(
        (await a.adminDb.auth.admin.getUserById(a.user.id)).data.user
          .user_metadata,
        before.user_metadata,
      );
      assert.equal(
        (await fetch(a.url + "/auth/v1/user", { headers: a.headers })).status,
        200,
      );
      assert.equal(
        (
          await fetch(a.url + "/rest/v1/training_sessions?select=id", {
            headers: a.headers,
          })
        ).status,
        200,
      );
    },
  );
  await check(
    "PKCE wrong/missing verifier and redirect/resource/client mismatches fail without consuming code",
    async () => {
      const c = await decide(await authorize());
      for (const patch of [
        { code_verifier: "z".repeat(43) },
        { code_verifier: "" },
        { redirect_uri: doc.redirect_uris[0] + "?changed=1" },
        { resource: "" },
        { resource: "https://other.test/api/mcp" },
        { client_id: "https://evil.test/client.json" },
      ])
        assert.equal((await exchange(c, patch)).status, 400);
      assert.equal((await exchange(c)).status, 200);
      assert.equal((await exchange(c)).status, 400);
    },
  );
  await check(
    "concurrent authorization code exchange: exactly one winner",
    async () => {
      const c = await decide(await authorize());
      assert.deepEqual(
        (await Promise.all([exchange(c), exchange(c)]))
          .map((r) => r.status)
          .sort(),
        [200, 400],
      );
    },
  );
  await check(
    "deny includes state and issuer; decision single use and account binding",
    async () => {
      const d = await decide(await authorize(), a, "deny");
      assert.equal(d.callback.searchParams.get("error"), "access_denied");
      assert.equal(d.code, null);
      assert.equal(
        (
          await post(
            "/api/oauth/decision",
            { authorization_request_id: d.handle, decision: "approve" },
            a.token,
          )
        ).status,
        400,
      );
      const r = await authorize();
      assert.equal(
        (
          await post(
            "/api/oauth/details",
            { authorization_request_id: r.handle },
            a.token,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await post(
            "/api/oauth/details",
            { authorization_request_id: r.handle },
            b.token,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await post(
            "/api/oauth/decision",
            {
              authorization_request_id: r.handle,
              decision: "approve",
              redirect_uri: "https://evil.test",
            },
            a.token,
          )
        ).status,
        400,
      );
      assert.deepEqual(
        (
          await Promise.all([
            post(
              "/api/oauth/decision",
              { authorization_request_id: r.handle, decision: "approve" },
              a.token,
            ),
            post(
              "/api/oauth/decision",
              { authorization_request_id: r.handle, decision: "approve" },
              a.token,
            ),
          ])
        )
          .map((x) => x.status)
          .sort(),
        [200, 400],
      );
    },
  );
  await check("expired request/code/access fail closed", async () => {
    const r = await authorize();
    await sql.query(
      "update mcp_private.authorization_requests set expires_at=now()-interval '1 second' where request_hash=$1",
      [hash(r.handle)],
    );
    assert.equal(
      (
        await post(
          "/api/oauth/details",
          { authorization_request_id: r.handle },
          a.token,
        )
      ).status,
      400,
    );
    const c = await decide(await authorize());
    await sql.query(
      "update mcp_private.authorization_codes set expires_at=now()-interval '1 second' where hash=$1",
      [hash(c.code)],
    );
    assert.equal((await exchange(c)).status, 400);
    const token = await mint();
    await sql.query(
      "update mcp_private.tokens set expires_at=now()-interval '1 second' where hash=$1",
      [hash(token.access_token)],
    );
    assert.equal(await mcpStatus(token.access_token), 401);
  });
  await check(
    "refresh rotates, remains persistent across requests, replay revokes entire grant",
    async () => {
      const t = await mint();
      assert.equal(
        (await refresh(t.refresh_token, { resource: "https://other.test" }))
          .status,
        400,
      );
      const r = await refresh(t.refresh_token);
      assert.equal(r.status, 200);
      assert.notEqual(r.body.refresh_token, t.refresh_token);
      assert.equal(await mcpStatus(r.body.access_token), 200);
      assert.equal((await refresh(t.refresh_token)).status, 400);
      assert.equal(await mcpStatus(r.body.access_token), 401);
      assert.equal((await refresh(r.body.refresh_token)).status, 400);
    },
  );
  await check(
    "concurrent refresh: one exchange, replay revocation commits even on OAuth error",
    async () => {
      const t = await mint();
      const rs = await Promise.all([
        refresh(t.refresh_token),
        refresh(t.refresh_token),
      ]);
      assert.deepEqual(rs.map((r) => r.status).sort(), [200, 400]);
      assert.equal(
        await mcpStatus(rs.find((r) => r.status === 200).body.access_token),
        401,
      );
    },
  );
  await check("expired refresh and offline_access gating", async () => {
    const t = await mint();
    await sql.query(
      "update mcp_private.tokens set expires_at=now()-interval '1 second' where hash=$1",
      [hash(t.refresh_token)],
    );
    assert.equal((await refresh(t.refresh_token)).status, 400);
    const read = await mint(a, "enqidu.read");
    assert.equal(read.refresh_token, undefined);
    const c = await sdk(read.access_token);
    assert.equal((await c.listTools()).tools.length, 27);
    assert.equal(
      (
        await c.callTool({
          name: "preview_cancel_session",
          arguments: { source_date: a.date() },
        })
      ).structuredContent.error.code,
      "insufficient_scope",
    );
  });
  await check(
    "first-party revoke ownership, access+refresh invalidation and RFC7009 revocation",
    async () => {
      const t = await mint();
      const {
        rows: [row],
      } = await sql.query(
        "select grant_id from mcp_private.tokens where hash=$1",
        [hash(t.access_token)],
      );
      assert.equal(
        (await post("/api/oauth/revoke", { grant_id: row.grant_id }, b.token))
          .status,
        200,
      );
      assert.equal(await mcpStatus(t.access_token), 200);
      const connections = await http("/api/oauth/connections", {
        headers: { Authorization: `Bearer ${a.token}` },
      });
      assert.ok(
        connections.body.connections.some((c) => c.id === row.grant_id),
      );
      assert.equal(
        (await post("/api/oauth/revoke", { grant_id: row.grant_id }, a.token))
          .status,
        200,
      );
      assert.equal(await mcpStatus(t.access_token), 401);
      assert.equal((await refresh(t.refresh_token)).status, 400);
      const t2 = await mint();
      assert.equal(
        (
          await post("/oauth/revoke", {
            client_id: ACTIVE_CLIENT,
            token: t2.refresh_token,
          })
        ).status,
        200,
      );
      assert.equal(await mcpStatus(t2.access_token), 401);
      assert.equal((await refresh(t2.refresh_token)).status, 400);
    },
  );
  await check(
    "foreign grant reads only foreign athlete; no Supabase credential accepted by MCP",
    async () => {
      const t = await mint(b);
      const c = await sdk(t.access_token);
      const r = (
        await c.callTool({
          name: "get_exercise_progress_v1",
          arguments: { canonical_code: "high_pull_up", period: "all" },
        })
      ).structuredContent;
      assert.equal(r.ok, true);
      assert.equal(r.data.observations, 0);
      assert.equal(await mcpStatus(a.token), 401);
      assert.equal(await mcpStatus(process.env.SERVICE_ROLE_KEY), 401);
    },
  );
  await check(
    "banned/deleted accounts invalidate resolution and refresh without user bearer/admin calls",
    async () => {
      const t = await mint(b);
      await sql.query(
        "update auth.users set banned_until=now()+interval '1 hour' where id=$1",
        [b.user.id],
      );
      assert.equal(await mcpStatus(t.access_token), 401);
      assert.equal((await refresh(t.refresh_token)).status, 400);
      await sql.query("update auth.users set banned_until=null where id=$1", [
        b.user.id,
      ]);
      await b.dispose();
      fixtures.pop();
      assert.equal(await mcpStatus(t.access_token), 401);
      assert.equal((await refresh(t.refresh_token)).status, 400);
      assert.equal(
        (
          await sql.query(
            "select count(*)::int n from mcp_private.grants where user_id=$1",
            [b.user.id],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check(
    "cross-client separation: ChatGPT and Claude codes, refresh, revocation and grants never mix",
    async () => {
      const mine = await mint(a, undefined, ACTIVE_CLIENT);
      const other = await mint(a, undefined, OTHER_CLIENT);
      // A code issued to one client cannot be redeemed by the other.
      const c = await decide(await authorize(undefined, {}, ACTIVE_CLIENT));
      assert.equal(
        (
          await exchange(c, {
            client_id: OTHER_CLIENT,
            redirect_uri: docs[OTHER_CLIENT].redirect_uris[0],
          })
        ).status,
        400,
      );
      assert.equal((await exchange(c)).status, 200);
      // Cross-client refresh fails without consuming; RFC 7009 from the wrong
      // client revokes nothing.
      assert.equal(
        (await refresh(mine.refresh_token, {}, OTHER_CLIENT)).status,
        400,
      );
      assert.equal(
        (
          await post("/oauth/revoke", {
            client_id: OTHER_CLIENT,
            token: mine.refresh_token,
          })
        ).status,
        200,
      );
      assert.equal(await mcpStatus(mine.access_token), 200);
      const connections = (
        await http("/api/oauth/connections", {
          headers: { Authorization: `Bearer ${a.token}` },
        })
      ).body.connections;
      for (const client of [ACTIVE_CLIENT, OTHER_CLIENT])
        assert.ok(connections.some((g) => g.client_id === client), client);
      // Revoking one client's grant leaves the other client's grant working.
      assert.equal(
        (
          await post("/oauth/revoke", {
            client_id: ACTIVE_CLIENT,
            token: mine.refresh_token,
          })
        ).status,
        200,
      );
      assert.equal(await mcpStatus(mine.access_token), 401);
      assert.equal(await mcpStatus(other.access_token), 200);
      const rotated = await refresh(other.refresh_token, {}, OTHER_CLIENT);
      assert.equal(rotated.status, 200);
      const tools = (await (await sdk(rotated.body.access_token)).listTools())
        .tools;
      assert.equal(tools.length, 27);
      assert.ok(tools.every((t) => !t.name.startsWith("apply_")));
    },
  );
  await check(
    "only hashes persisted; no first-party/data secrets in token responses/MCP/telemetry",
    async () => {
      const stored = await sql.query(
        "select jsonb_agg(t) v from mcp_private.tokens t",
      );
      assert.ok(!JSON.stringify(stored.rows).includes(golden.access_token));
      assert.ok(!JSON.stringify(stored.rows).includes(golden.refresh_token));
      const serialized = JSON.stringify({ wire, events });
      for (const secret of [a.token, config.dataKey])
        assert.ok(!serialized.includes(secret));
      assert.doesNotMatch(
        JSON.stringify(events),
        /enq_mcp_|token_hash|access_hash|user_id|email|password|Authorization/,
      );
      assert.ok(
        events.every((e) =>
          Object.keys(e).every((k) =>
            [
              "request_id",
              "endpoint",
              "grant_type",
              "client_classification",
              "status",
              "error_code",
              "duration_ms",
              "tool_id",
              "tool_version",
              "transport",
            ].includes(k),
          ),
        ),
      );
    },
  );
  console.log(
    `Opaque OAuth real Supabase acceptance PASS (${clientName}): ${passes} groups; credential separation, atomic races, rotation, revocation and account lifecycle verified.`,
  );
} finally {
  for (const c of clients) await c.close().catch(() => {});
  if (server) {
    server.closeAllConnections();
    server.close();
  }
  for (const f of fixtures.reverse()) await f.dispose();
  await sql.query("alter role enqidu_mcp_oauth nologin password null");
  await sql.end();
}
