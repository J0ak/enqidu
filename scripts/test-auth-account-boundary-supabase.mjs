import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import pg from "pg";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createRemoteMcpHandler } from "../src/mcp/remote.js";
import { createToolsFixture } from "../e2e/tools-fixture.js";

// Reproduction, NOT a passing security gate. Only disposable local users/issuer.
// ENQIDU_REQUIRE_AUTH_ACCOUNT_ISOLATION=1 makes the known blocker fail release review.
if (process.env.ENQIDU_TRANSACTION_ENV_FILE)
  loadEnvFile(process.env.ENQIDU_TRANSACTION_ENV_FILE);
assert.equal(process.env.ENQIDU_TRANSACTION_LOCAL, "1");
for (const value of [process.env.API_URL, process.env.DB_URL]) {
  const u = new URL(value);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
      u.port &&
      !u.search &&
      !u.hash,
  );
}
process.env.VITE_SUPABASE_URL = process.env.API_URL;
process.env.VITE_SUPABASE_ANON_KEY = process.env.ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
const sql = new pg.Client({ connectionString: process.env.DB_URL });
await sql.connect();
const results = [];
try {
  for (const audience of ["current-array", "resource-only"]) {
    const f = await createToolsFixture(`auth-account-${audience}`, {
      health: false,
      plans: false,
    });
    let config, client;
    const server = createServer(async (req, res) => {
      const r = await createRemoteMcpHandler({ config })(
        new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method,
          headers: req.headers,
          ...(["GET", "HEAD"].includes(req.method)
            ? {}
            : { body: req, duplex: "half" }),
        }),
      );
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    });
    try {
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const resource = `http://127.0.0.1:${server.address().port}/api/mcp`;
      const claims = JSON.parse(
        Buffer.from(f.token.split(".")[1], "base64url"),
      );
      config = {
        resource,
        issuer: claims.iss,
        supabaseUrl: f.url,
        key: f.anonKey,
        dataKey: process.env.SERVICE_ROLE_KEY,
      };
      const payload = {
        ...claims,
        client_id: randomUUID(),
        aud:
          audience === "current-array" ? ["authenticated", resource] : resource,
      };
      const encoded = [{ alg: "HS256", typ: "JWT" }, payload]
        .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
        .join(".");
      const token = `${encoded}.${createHmac("sha256", process.env.JWT_SECRET).update(encoded).digest("base64url")}`;
      const headers = { ...f.headers, Authorization: `Bearer ${token}` };
      const auth = async (path, body) => {
        const r = await fetch(`${f.url}/auth/v1/${path}`, {
          headers,
          method: body ? "PUT" : "GET",
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: r.status, body: await r.json() };
      };
      const persisted = async () => {
        const r = await f.adminDb.auth.admin.getUserById(f.user.id);
        assert.equal(r.error, null);
        const {
          rows: [row],
        } = await sql.query(
          "select email,email_change,encrypted_password from auth.users where id=$1",
          [f.user.id],
        );
        return { user: r.data.user, ...row };
      };
      const get = await auth("user"),
        userinfo = await auth("oauth/userinfo");
      assert.equal(get.status, 200);
      assert.equal(get.body.id, f.user.id);
      assert.equal(
        userinfo.status,
        200,
        "Enable OAuth ONLY in e2e-local/config for the real UserInfo test",
      );
      assert.equal(userinfo.body.sub, f.user.id);
      client = new Client(
        { name: "auth-account-boundary-probe", version: "1" },
        { versionNegotiation: { mode: "legacy" } },
      );
      await client.connect(
        new StreamableHTTPClientTransport(new URL(resource), {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }),
      );
      assert.equal((await client.listTools()).tools.length, 27);
      assert.equal(
        (await client.callTool({ name: "get_recent_training", arguments: {} }))
          .structuredContent.ok,
        true,
      );
      const rest = await fetch(
        `${f.url}/rest/v1/training_sessions?select=id&limit=1`,
        { headers },
      );
      assert.equal(rest.status, 403);
      const before = await persisted();
      assert.equal(before.user.user_metadata.mcp_forbidden_probe, undefined);
      const metadata = await auth("user", {
        data: { mcp_forbidden_probe: "must-not-change" },
      });
      const afterMetadata = await persisted();
      // Assert the actual unsafe behavior of the tested release; never mislabel HTTP 200 as isolation.
      assert.equal(metadata.status, 200);
      assert.equal(
        metadata.body.user_metadata.mcp_forbidden_probe,
        "must-not-change",
      );
      const metadataChanged =
        afterMetadata.user.user_metadata.mcp_forbidden_probe ===
        "must-not-change";
      assert.equal(metadataChanged, true);
      const nextEmail = `auth-probe-changed-${randomUUID()}@example.test`;
      const email = await auth("user", { email: nextEmail });
      const afterEmail = await persisted();
      assert.equal(email.status, 200);
      assert.equal(email.body.id, f.user.id);
      const emailChangeRecorded =
        afterEmail.email === nextEmail || afterEmail.email_change === nextEmail;
      assert.equal(emailChangeRecorded, true);
      const password = await auth("user", {
        password: `Disposable-only-${randomUUID()}`,
      });
      const afterPassword = await persisted();
      assert.equal(password.status, 200);
      assert.equal(password.body.id, f.user.id);
      const passwordHashChanged =
        before.encrypted_password !== afterPassword.encrypted_password;
      assert.equal(passwordHashChanged, true);
      assert.equal(
        (await f.adminDb.auth.admin.signOut(f.token, "global")).error,
        null,
      );
      const revokedInfo = await auth("oauth/userinfo"),
        revokedGet = await auth("user");
      const revokedPut = await auth("user", {
        data: { mcp_forbidden_probe: "revoked-must-not-change" },
      });
      for (const r of [revokedInfo, revokedGet, revokedPut]) {
        assert.equal(r.status, 403);
        assert.equal(r.body.error_code, "session_not_found");
      }
      assert.equal(
        (await persisted()).user.user_metadata.mcp_forbidden_probe,
        "must-not-change",
      );
      const revokedMcp = await fetch(resource, {
        method: "POST",
        headers,
        body: "{}",
      });
      assert.equal(revokedMcp.status, 401);
      results.push({
        audience,
        get_user: get.status,
        userinfo: userinfo.status,
        put_metadata: metadata.status,
        metadata_changed: metadataChanged,
        put_email: email.status,
        email_change_recorded: emailChangeRecorded,
        email_confirmation_required: afterEmail.email !== nextEmail,
        put_password: password.status,
        password_hash_changed: passwordHashChanged,
        mcp_read: "ok",
        direct_data_api: rest.status,
        revoked_userinfo: revokedInfo.status,
        revoked_user_get: revokedGet.status,
        revoked_user_put: revokedPut.status,
        revoked_mcp: revokedMcp.status,
      });
    } finally {
      await client?.close();
      server.closeAllConnections();
      server.close();
      await f.dispose();
      assert.equal(
        (await sql.query("select id from auth.users where id=$1", [f.user.id]))
          .rowCount,
        0,
      );
    }
  }
} finally {
  await sql.end();
}
// Safe operational evidence only: never print response bodies, identities, emails, hashes or tokens.
console.log(
  JSON.stringify(
    { security_gate: "BLOCKED_AUTH_ACCOUNT_MUTATION", results },
    null,
    2,
  ),
);
if (process.env.ENQIDU_REQUIRE_AUTH_ACCOUNT_ISOLATION === "1")
  throw Error(
    "AUTH ACCOUNT ISOLATION BLOCKER: OAuth bearer mutates the account; resource-only audience does not fix it.",
  );
