import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientMetadata, publicIPv4 } from "../server/oauth/cimd.js";
import {
  CLIENT_ID,
  SCOPES,
  opaque,
  hash,
  validOpaque,
} from "../server/oauth/protocol.js";
import { createOAuthHandler } from "../server/oauth/handler.js";
const doc = JSON.parse(
  readFileSync(
    new URL("./fixtures/oauth/chatgpt-client.json", import.meta.url),
  ),
);
const config = {
  issuer: "https://enqidu.example",
  resource: "https://enqidu.example/api/mcp",
  supabaseUrl: "https://fixture.supabase.test",
  key: "public",
};
const base = {
  response_type: "code",
  client_id: CLIENT_ID,
  redirect_uri: doc.redirect_uris[0],
  resource: config.resource,
  code_challenge: "a".repeat(43),
  code_challenge_method: "S256",
  state: "opaque-state",
  scope: SCOPES.join(" "),
};
const request = (path, options) => new Request(config.issuer + path, options);
function fixture() {
  const calls = [],
    events = [];
  const store = {
    call: async (op, p) => {
      calls.push({ op, p });
      if (op === "request_details_v1")
        return {
          client_id: CLIENT_ID,
          resource: config.resource,
          scopes: SCOPES,
          redirect_uri: doc.redirect_uris[0],
        };
      return {};
    },
  };
  return {
    calls,
    events,
    store,
    handler: createOAuthHandler({
      config,
      store,
      fetchDocument: async () => doc,
      observe: (e) => events.push(e),
    }),
  };
}
test("official CIMD accepts plural none despite legacy private_key_jwt preference", async () => {
  assert.equal(
    (await clientMetadata(CLIENT_ID, async () => doc)).name,
    "ChatGPT",
  );
  for (const id of [
    "http://chatgpt.com/oauth/client.json",
    "https://chatgpt.com.evil.test/oauth/client.json",
    "https://user:pass@chatgpt.com/oauth/client.json",
    "https://chatgpt.com:444/oauth/client.json",
    "https://127.0.0.1/client.json",
    "https://10.1.2.3/client.json",
    "https://chatgpt.com/oauth/other/client.json",
  ])
    await assert.rejects(
      () => clientMetadata(id, () => assert.fail("must not fetch")),
      /invalid_client/,
    );
  for (const patch of [
    { client_id: "https://evil.test" },
    { redirect_uris: ["https://evil.test/callback"] },
    { redirect_uris: ["https://chatgpt.com/evil"] },
    {
      redirect_uris: [
        "https://chatgpt.com/connector_platform_oauth_redirect?extra=1",
      ],
    },
    { redirect_uris: ["https://chatgpt.com/*"] },
    { token_endpoint_auth_methods_supported: ["private_key_jwt"] },
    { client_name: "a".repeat(20000) },
    { grant_types: ["client_credentials"] },
  ])
    await assert.rejects(
      () => clientMetadata(CLIENT_ID, async () => ({ ...doc, ...patch })),
      /invalid_client/,
    );
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "0.0.0.0",
    "224.0.0.1",
  ])
    assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4("104.18.1.2"), true);
});
test("RFC8414 metadata and public CORS advertise no DCR/OIDC, RFC9207 and S256", async () => {
  const { handler } = fixture();
  const r = await handler(
    request("/.well-known/oauth-authorization-server", {
      headers: { Origin: "https://other.test" },
    }),
  );
  const m = await r.json();
  assert.equal(r.status, 200);
  assert.equal(m.issuer, config.issuer);
  assert.equal(m.registration_endpoint, undefined);
  assert.equal(m.authorization_response_iss_parameter_supported, true);
  assert.equal(m.client_id_metadata_document_supported, true);
  assert.deepEqual(m.scopes_supported, SCOPES);
  assert.deepEqual(m.token_endpoint_auth_methods_supported, ["none"]);
  assert.deepEqual(m.code_challenge_methods_supported, ["S256"]);
  assert.equal(
    (
      await handler(
        request("/.well-known/oauth-authorization-server", {
          method: "OPTIONS",
        }),
      )
    ).status,
    204,
  );
});
test("authorize stores validated request and browser receives only opaque handle", async () => {
  const { handler, calls, events } = fixture();
  const r = await handler(
    request("/oauth/authorize?" + new URLSearchParams(base)),
  );
  assert.equal(r.status, 302);
  const u = new URL(r.headers.get("location"));
  assert.equal(u.pathname, "/oauth/consent");
  assert.deepEqual([...u.searchParams.keys()], ["request_id"]);
  assert.ok(validOpaque(u.searchParams.get("request_id"), "req"));
  assert.equal(calls[0].p.request_hash, hash(u.searchParams.get("request_id")));
  assert.equal(calls[0].p.resource, config.resource);
  assert.doesNotMatch(
    JSON.stringify(events),
    /opaque-state|challenge|code_hash|token|user_id/,
  );
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
});
test("strict resource/PKCE/scope/response/state validation errors include issuer and state only on verified callback", async () => {
  for (const patch of [
    { resource: "" },
    { resource: "https://other.test/api/mcp" },
    { code_challenge_method: "plain" },
    { code_challenge: "" },
    { scope: "enqidu.write" },
    { scope: "openid" },
    { response_type: "token" },
    { state: "" },
    { state: "x".repeat(1025) },
  ]) {
    const { handler, calls } = fixture();
    const r = await handler(
      request("/oauth/authorize?" + new URLSearchParams({ ...base, ...patch })),
    );
    assert.equal(r.status, 302);
    const u = new URL(r.headers.get("location"));
    assert.ok(u.searchParams.has("error"));
    assert.equal(u.searchParams.get("iss"), config.issuer);
    assert.equal(calls.length, 0);
  }
  for (const patch of [
    { redirect_uri: "https://evil.test/callback" },
    { redirect_uri: doc.redirect_uris[0] + "?a=1" },
    { client_id: "https://evil.test/client.json" },
  ]) {
    const { handler } = fixture();
    const r = await handler(
      request("/oauth/authorize?" + new URLSearchParams({ ...base, ...patch })),
    );
    assert.equal(r.status, 400);
    assert.equal(r.headers.get("location"), null);
  }
});
test("malformed methods/content/duplicates/bounds, secrets and sanitized errors", async () => {
  const { handler } = fixture();
  for (const [path, options, status] of [
    ["/oauth/token", { method: "GET" }, 405],
    ["/oauth/token", { method: "POST", body: "x" }, 415],
    [
      "/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "a".repeat(9000),
      },
      413,
    ],
    [
      "/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          resource: config.resource,
          grant_type: "client_credentials",
        }),
      },
      400,
    ],
    [
      "/oauth/authorize?" +
        new URLSearchParams(base) +
        "&client_id=" +
        encodeURIComponent(CLIENT_ID),
      {},
      400,
    ],
  ]) {
    const r = await handler(request(path, options));
    assert.equal(r.status, status);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  const failing = createOAuthHandler({
    config,
    store: {
      call() {
        throw Error("SQL password TOKEN HASH user_id stack");
      },
    },
    fetchDocument: async () => doc,
  });
  const r = await failing(
    request("/oauth/authorize?" + new URLSearchParams(base)),
  );
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: "server_error" });
});
test("decision rejects Supabase OAuth and opaque credentials, extra redirect/user fields and wrong Origin", async () => {
  const { handler } = fixture();
  for (const bearer of [opaque("at"), "invalid"]) {
    const r = await handler(
      request("/api/oauth/decision", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + bearer,
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.equal(r.status, 401);
  }
  const r = await handler(
    request("/api/oauth/decision", {
      method: "POST",
      headers: { Origin: "https://evil.test" },
      body: "{}",
    }),
  );
  assert.equal(r.status, 403);
  const token =
    Buffer.from("{}").toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({ sub: "owner", role: "authenticated" }),
    ).toString("base64url") +
    ".sig";
  const h = createOAuthHandler({
    config,
    store: {
      call() {
        assert.fail("must not reach store");
      },
    },
    clientFactory: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    }),
  });
  for (const extra of [
    { redirect_uri: "https://evil.test" },
    { user_id: "other" },
    { scopes: ["enqidu.write"] },
  ])
    assert.equal(
      (
        await h(
          request("/api/oauth/decision", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              authorization_request_id: opaque("req"),
              decision: "approve",
              ...extra,
            }),
          }),
        )
      ).status,
      400,
    );
});
test("RFC7009 unknown tokens return 200, client secret and nonallowlisted client rejected", async () => {
  const { handler, calls } = fixture();
  const r = await handler(
    request("/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID, token: "unknown" }),
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0);
  for (const patch of [
    { client_secret: "forbidden" },
    { client_id: "https://evil.test" },
  ]) {
    const r = await handler(
      request("/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          resource: config.resource,
          grant_type: "authorization_code",
          ...patch,
        }),
      }),
    );
    assert.equal(r.status, 400);
  }
});

test("CIMD fetch rejects redirects, wrong media type, oversized declared/streamed bodies, private DNS and timeout", async () => {
  const { EventEmitter } = await import("node:events");
  const { fetchCimd } = await import("../server/oauth/cimd.js");
  const resolve = async () => [{ address: "104.18.1.2", family: 4 }];
  const transport = (statusCode, headers, body) => (url, options, done) => {
    const req = new EventEmitter(),
      res = new EventEmitter();
    Object.assign(res, { statusCode, headers, destroy() {} });
    queueMicrotask(() => {
      done(res);
      res.emit("data", Buffer.from(body));
      res.emit("end");
    });
    return req;
  };
  for (const [status, headers, body] of [
    [302, { "content-type": "application/json" }, "{}"],
    [200, { "content-type": "text/html" }, "{}"],
    [
      200,
      { "content-type": "application/json", "content-length": "20000" },
      "{}",
    ],
    [200, { "content-type": "application/json" }, "x".repeat(16385)],
  ])
    await assert.rejects(() =>
      fetchCimd(CLIENT_ID, { resolve, get: transport(status, headers, body) }),
    );
  await assert.rejects(() =>
    fetchCimd(CLIENT_ID, {
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
      get: () => assert.fail("no connection"),
    }),
  );
  // Keep one ordinary timer alive because AbortSignal.timeout uses an unref timer.
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(
      () =>
        fetchCimd(CLIENT_ID, {
          resolve: () => new Promise(() => {}),
          timeoutMs: 10,
        }),
      /timeout/,
    );
  } finally {
    clearTimeout(keepAlive);
  }
  assert.deepEqual(
    await fetchCimd(CLIENT_ID, {
      resolve,
      get: transport(
        200,
        { "content-type": "application/json" },
        JSON.stringify(doc),
      ),
    }),
    doc,
  );
});
