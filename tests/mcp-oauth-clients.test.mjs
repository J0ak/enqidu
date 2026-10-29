import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { clientMetadata } from "../server/oauth/cimd.js";
import {
  CLIENT_ID,
  CLAUDE_CLIENT_ID,
  CLIENT_IDS,
  SCOPES,
  scopes,
} from "../server/oauth/protocol.js";
import { createOAuthHandler } from "../server/oauth/handler.js";
import { authenticateRemoteToken } from "../src/mcp/remoteAuth.js";
import { officialRedirect } from "../src/oauth/consent.js";
import { isApprovedCallback, oauthClientName } from "../src/oauth/clients.js";
import { oauthSql } from "./support/oauthSql.mjs";

const read = (name) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/oauth/${name}`, import.meta.url)),
  );
const docs = {
  [CLIENT_ID]: read("chatgpt-client.json"),
  [CLAUDE_CLIENT_ID]: read("claude-client.json"),
};
const CHATGPT_CALLBACK = docs[CLIENT_ID].redirect_uris[0];
const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const CLAUDE_CODE_ID = "https://claude.ai/oauth/claude-code-client-metadata";
const config = {
  issuer: "https://enqidu.example",
  resource: "https://enqidu.example/api/mcp",
  supabaseUrl: "https://fixture.supabase.test",
  key: "public",
};

test("closed allowlist: exactly ChatGPT and hosted Claude with exact callbacks", () => {
  assert.deepEqual(CLIENT_IDS, [CLIENT_ID, CLAUDE_CLIENT_ID]);
  assert.equal(CLAUDE_CLIENT_ID, docs[CLAUDE_CLIENT_ID].client_id);
  assert.deepEqual(docs[CLAUDE_CLIENT_ID].redirect_uris, [CLAUDE_CALLBACK]);
  assert.equal(oauthClientName(CLIENT_ID), "ChatGPT");
  assert.equal(oauthClientName(CLAUDE_CLIENT_ID), "Claude");
  for (const id of [CLAUDE_CODE_ID, "https://evil.test", "", null, "__proto__"])
    assert.equal(oauthClientName(id), null);
});

test("official Claude CIMD snapshot is accepted; variants and lookalikes are rejected", async () => {
  const doc = docs[CLAUDE_CLIENT_ID];
  assert.deepEqual(await clientMetadata(CLAUDE_CLIENT_ID, async () => doc), {
    client_id: CLAUDE_CLIENT_ID,
    name: "Claude",
    redirects: [CLAUDE_CALLBACK],
  });
  for (const id of [
    CLAUDE_CODE_ID,
    "http://claude.ai/oauth/mcp-oauth-client-metadata",
    "https://claude.ai.evil.test/oauth/mcp-oauth-client-metadata",
    "https://claude.ai/oauth/mcp-oauth-client-metadata/",
    "https://claude.ai/oauth/mcp-oauth-client-metadata?x=1",
    "https://claude.com/oauth/mcp-oauth-client-metadata",
  ])
    await assert.rejects(
      () => clientMetadata(id, () => assert.fail("must not fetch")),
      /invalid_client/,
    );
  for (const patch of [
    { client_id: CLIENT_ID },
    { redirect_uris: ["http://localhost/callback"] },
    { redirect_uris: [CLAUDE_CALLBACK, "http://127.0.0.1/callback"] },
    { redirect_uris: [CHATGPT_CALLBACK] },
    { redirect_uris: [CLAUDE_CALLBACK + "?x=1"] },
    { token_endpoint_auth_method: "client_secret_basic" },
    { grant_types: ["authorization_code"] },
    { response_types: ["token"] },
  ])
    await assert.rejects(
      () =>
        clientMetadata(CLAUDE_CLIENT_ID, async () => ({ ...doc, ...patch })),
      /invalid_client/,
    );
  // A document served for one approved client never authenticates the other.
  await assert.rejects(
    () => clientMetadata(CLAUDE_CLIENT_ID, async () => docs[CLIENT_ID]),
    /invalid_client/,
  );
  await assert.rejects(
    () => clientMetadata(CLIENT_ID, async () => doc),
    /invalid_client/,
  );
});

test("scope parsing tolerates exact repeats only and stays canonical", () => {
  assert.deepEqual(
    scopes("enqidu.read enqidu.preview offline_access offline_access"),
    SCOPES,
  );
  assert.deepEqual(scopes("offline_access enqidu.read enqidu.read"), [
    "enqidu.read",
    "offline_access",
  ]);
  for (const value of [
    "enqidu.read  offline_access",
    " enqidu.read",
    "enqidu.read enqidu.write",
    "offline_access",
    "enqidu.read openid",
    "",
  ])
    assert.throws(() => scopes(value), /invalid_scope/, value);
});

test("consent UI redirects only to an approved client's exact callback", () => {
  for (const url of [
    `${CHATGPT_CALLBACK}?code=c&state=s&iss=https%3A%2F%2Fenqidu.example`,
    `${CLAUDE_CALLBACK}?code=c&state=s&iss=https%3A%2F%2Fenqidu.example`,
    `${CLAUDE_CALLBACK}?error=access_denied&state=s&iss=https%3A%2F%2Fenqidu.example`,
  ])
    assert.equal(officialRedirect({ redirect_url: url }), url);
  for (const url of [
    `${CLAUDE_CALLBACK}?code=c`,
    `https://claude.ai/api/mcp/other?iss=x`,
    `https://claude.ai/api/mcp/auth_callback/?iss=x`,
    `${CLAUDE_CALLBACK}?iss=x#fragment`,
    `https://user:pass@claude.ai/api/mcp/auth_callback?iss=x`,
    `http://claude.ai/api/mcp/auth_callback?iss=x`,
    `https://claude.com/api/mcp/auth_callback?iss=x`,
    `http://localhost:3118/callback?iss=x`,
    `http://127.0.0.1/callback?iss=x`,
  ])
    assert.throws(() => officialRedirect({ redirect_url: url }), url);
  assert.equal(isApprovedCallback("not a url"), false);
});

// Fake first-party Supabase session tokens: the client factory plays Supabase's
// online verification and maps each bearer to exactly one user.
function session(sub) {
  const part = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${part({ alg: "none" })}.${part({ sub, role: "authenticated" })}.sig`;
}

async function oauthWorld() {
  const { db, store } = await oauthSql();
  const users = { a: randomUUID(), b: randomUUID() };
  for (const id of Object.values(users))
    await db.query("insert into auth.users(id) values($1)", [id]);
  const tokens = { a: session(users.a), b: session(users.b) };
  const events = [];
  const handler = createOAuthHandler({
    config,
    store,
    fetchDocument: async (id) => docs[id],
    clientFactory: (_url, _key, options) => ({
      auth: {
        async getUser() {
          const bearer = options.global.headers.Authorization.slice(
            "Bearer ".length,
          );
          const user = Object.entries(tokens).find(([, t]) => t === bearer);
          return user
            ? { data: { user: { id: users[user[0]] } }, error: null }
            : { data: { user: null }, error: { message: "invalid" } };
        },
      },
    }),
    observe: (e) => events.push(e),
  });
  const call = async (path, options = {}) => {
    const r = await handler(new Request(config.issuer + path, options));
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {}
    return { status: r.status, headers: r.headers, body };
  };
  const form = (path, p) =>
    call(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(p),
    });
  const firstParty = (path, who, p) =>
    call(path, {
      method: p === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${tokens[who]}`,
        ...(p === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(p === undefined ? {} : { body: JSON.stringify(p) }),
    });
  const callbackOf = (client) => docs[client].redirect_uris[0];
  async function authorize(client, patch = {}) {
    const verifier = randomBytes(32).toString("base64url");
    const p = {
      response_type: "code",
      client_id: client,
      redirect_uri: callbackOf(client),
      resource: config.resource,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      state: `state-${randomUUID()}`,
      scope: SCOPES.join(" "),
      ...patch,
    };
    const r = await call("/oauth/authorize?" + new URLSearchParams(p));
    return { r, p, verifier };
  }
  async function approve(client, who = "a", patch = {}, decision = "approve") {
    const auth = await authorize(client, patch);
    assert.equal(auth.r.status, 302);
    const handle = new URL(auth.r.headers.get("location")).searchParams.get(
      "request_id",
    );
    const details = await firstParty("/api/oauth/details", who, {
      authorization_request_id: handle,
    });
    assert.equal(details.status, 200);
    const decided = await firstParty("/api/oauth/decision", who, {
      authorization_request_id: handle,
      decision,
    });
    assert.equal(decided.status, 200);
    const callback = new URL(decided.body.redirect_url);
    return { ...auth, details: details.body, callback, handle };
  }
  const exchange = (client, flow, patch = {}) =>
    form("/oauth/token", {
      grant_type: "authorization_code",
      client_id: client,
      resource: config.resource,
      redirect_uri: callbackOf(client),
      code: flow.callback.searchParams.get("code"),
      code_verifier: flow.verifier,
      ...patch,
    });
  async function connect(client, who = "a", scope) {
    const flow = await approve(
      client,
      who,
      scope === undefined ? {} : { scope },
    );
    const r = await exchange(client, flow);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  }
  const refresh = (client, token, patch = {}) =>
    form("/oauth/token", {
      grant_type: "refresh_token",
      client_id: client,
      resource: config.resource,
      refresh_token: token,
      ...patch,
    });
  const identify = (token) => authenticateRemoteToken(token, config, store);
  return {
    db,
    store,
    users,
    events,
    call,
    form,
    firstParty,
    authorize,
    approve,
    exchange,
    connect,
    refresh,
    identify,
  };
}

test("Claude authorization code + PKCE end to end on the real private SQL; ChatGPT unchanged", async () => {
  const w = await oauthWorld();
  for (const [client, callback, name] of [
    [CLAUDE_CLIENT_ID, CLAUDE_CALLBACK, "Claude"],
    [CLIENT_ID, CHATGPT_CALLBACK, "ChatGPT"],
  ]) {
    const flow = await w.approve(client);
    assert.deepEqual(flow.details, {
      client: { name },
      scope: SCOPES.join(" "),
      redirect_uri: callback,
    });
    assert.equal(
      flow.callback.origin + flow.callback.pathname,
      callback,
      "callback is the client's exact registered URI",
    );
    assert.equal(flow.callback.searchParams.get("iss"), config.issuer);
    assert.equal(flow.callback.searchParams.get("state"), flow.p.state);
    assert.equal(
      officialRedirect({ redirect_url: flow.callback.href }),
      flow.callback.href,
    );
    const r = await w.exchange(client, flow);
    assert.equal(r.status, 200);
    assert.match(r.body.access_token, /^enq_mcp_at_[A-Za-z0-9_-]{43}$/);
    assert.match(r.body.refresh_token, /^enq_mcp_rt_[A-Za-z0-9_-]{43}$/);
    assert.equal(r.body.scope, SCOPES.join(" "));
    assert.equal(r.body.token_type, "Bearer");
    assert.ok(r.body.expires_in > 3500 && r.body.expires_in <= 3600);
    const who = await w.identify(r.body.access_token);
    assert.equal(who.userId, w.users.a);
    assert.equal(who.authInfo.clientId, client);
    assert.deepEqual(who.authInfo.scopes, SCOPES);
    // Code replay fails after a successful exchange.
    assert.deepEqual((await w.exchange(client, flow)).body, {
      error: "invalid_grant",
    });
  }
  // Repeated offline_access from a client is canonicalized, not rejected.
  const dup = await w.connect(
    CLAUDE_CLIENT_ID,
    "a",
    "enqidu.read enqidu.preview offline_access offline_access",
  );
  assert.equal(dup.scope, SCOPES.join(" "));
  // Denial returns access_denied to Claude's callback with iss and state.
  const denied = await w.approve(CLAUDE_CLIENT_ID, "a", {}, "deny");
  assert.equal(
    denied.callback.origin + denied.callback.pathname,
    CLAUDE_CALLBACK,
  );
  assert.equal(denied.callback.searchParams.get("error"), "access_denied");
  assert.equal(denied.callback.searchParams.get("code"), null);
  assert.equal(denied.callback.searchParams.get("iss"), config.issuer);
  assert.doesNotMatch(
    JSON.stringify(w.events),
    /enq_mcp_|state-|code_verifier|user_id/,
  );
});

test("authorize rejects cross-client callbacks, Claude Code and unknown clients without redirecting", async () => {
  const w = await oauthWorld();
  for (const patch of [
    { client_id: CLAUDE_CLIENT_ID, redirect_uri: CHATGPT_CALLBACK },
    { client_id: CLIENT_ID, redirect_uri: CLAUDE_CALLBACK },
    { client_id: CLAUDE_CLIENT_ID, redirect_uri: "http://localhost/callback" },
    { client_id: CLAUDE_CLIENT_ID, redirect_uri: CLAUDE_CALLBACK + "/" },
    { client_id: CLAUDE_CODE_ID, redirect_uri: "http://127.0.0.1/callback" },
    { client_id: "https://evil.test/client.json" },
  ]) {
    const { r } = await w.authorize(CLAUDE_CLIENT_ID, patch);
    assert.equal(r.status, 400, JSON.stringify(patch));
    assert.equal(r.headers.get("location"), null);
  }
  // Verified client but bad parameters: error goes back to Claude with iss.
  for (const patch of [
    { code_challenge_method: "plain" },
    { resource: "https://other.test/api/mcp" },
    { scope: "enqidu.write" },
  ]) {
    const { r } = await w.authorize(CLAUDE_CLIENT_ID, patch);
    assert.equal(r.status, 302);
    const u = new URL(r.headers.get("location"));
    assert.equal(u.origin + u.pathname, CLAUDE_CALLBACK);
    assert.ok(u.searchParams.get("error"));
    assert.equal(u.searchParams.get("iss"), config.issuer);
  }
  assert.deepEqual(w.store.calls, []);
});

test("codes are bound to client, redirect, resource and PKCE verifier", async () => {
  const w = await oauthWorld();
  const flow = await w.approve(CLAUDE_CLIENT_ID);
  for (const patch of [
    { client_id: CLIENT_ID, redirect_uri: CHATGPT_CALLBACK },
    { client_id: CLIENT_ID, redirect_uri: CLAUDE_CALLBACK },
    { redirect_uri: CHATGPT_CALLBACK },
    { code_verifier: randomBytes(32).toString("base64url") },
    { code_verifier: "short" },
    { resource: "https://other.test/api/mcp" },
  ]) {
    const r = await w.exchange(CLAUDE_CLIENT_ID, flow, patch);
    assert.equal(r.status, 400, JSON.stringify(patch));
    assert.ok(["invalid_grant", "invalid_request"].includes(r.body.error));
  }
  // Mismatches above never consumed the code; the legitimate exchange still works once.
  assert.equal((await w.exchange(CLAUDE_CLIENT_ID, flow)).status, 200);
  // A ChatGPT code cannot be redeemed by Claude either.
  const chatgpt = await w.approve(CLIENT_ID);
  const cross = await w.exchange(CLAUDE_CLIENT_ID, chatgpt);
  assert.deepEqual(cross.body, { error: "invalid_grant" });
  assert.equal((await w.exchange(CLIENT_ID, chatgpt)).status, 200);
});

test("refresh rotation, replay revocation and cross-client refresh isolation", async () => {
  const w = await oauthWorld();
  const claude = await w.connect(CLAUDE_CLIENT_ID);
  const chatgpt = await w.connect(CLIENT_ID);
  // Using Claude's refresh token as ChatGPT fails and does not burn it.
  assert.deepEqual((await w.refresh(CLIENT_ID, claude.refresh_token)).body, {
    error: "invalid_grant",
  });
  assert.deepEqual(
    (
      await w.refresh(CLAUDE_CLIENT_ID, claude.refresh_token, {
        resource: "https://other.test/api/mcp",
      })
    ).body,
    { error: "invalid_request" },
  );
  assert.deepEqual(
    (
      await w.refresh(CLAUDE_CLIENT_ID, claude.refresh_token, {
        scope: "enqidu.read",
      })
    ).body,
    { error: "invalid_scope" },
  );
  const rotated = await w.refresh(CLAUDE_CLIENT_ID, claude.refresh_token);
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.body.refresh_token, claude.refresh_token);
  assert.equal(
    (await w.identify(rotated.body.access_token)).authInfo.clientId,
    CLAUDE_CLIENT_ID,
  );
  // The original access token stays valid until expiry; replaying the consumed
  // refresh token revokes the whole Claude grant.
  assert.equal(
    (await w.refresh(CLAUDE_CLIENT_ID, claude.refresh_token)).body.error,
    "invalid_grant",
  );
  for (const token of [claude.access_token, rotated.body.access_token])
    await assert.rejects(() => w.identify(token), /authentication required/);
  assert.equal(
    (await w.refresh(CLAUDE_CLIENT_ID, rotated.body.refresh_token)).body.error,
    "invalid_grant",
  );
  // The ChatGPT grant of the same athlete is unaffected.
  assert.equal((await w.identify(chatgpt.access_token)).userId, w.users.a);
  assert.equal((await w.refresh(CLIENT_ID, chatgpt.refresh_token)).status, 200);
});

test("revocation is per grant and per client; athletes revoke only their own grants", async () => {
  const w = await oauthWorld();
  const claudeA = await w.connect(CLAUDE_CLIENT_ID, "a");
  const chatgptA = await w.connect(CLIENT_ID, "a");
  const claudeB = await w.connect(CLAUDE_CLIENT_ID, "b");
  const revoke = (client, token) =>
    w.form("/oauth/revoke", { client_id: client, token });
  // RFC 7009 from the wrong client answers 200 but revokes nothing.
  assert.equal((await revoke(CLIENT_ID, claudeA.access_token)).status, 200);
  assert.equal((await w.identify(claudeA.access_token)).userId, w.users.a);
  assert.equal(
    (await revoke(CLAUDE_CLIENT_ID, claudeA.refresh_token)).status,
    200,
  );
  await assert.rejects(() => w.identify(claudeA.access_token));
  assert.equal(
    (await w.refresh(CLAUDE_CLIENT_ID, claudeA.refresh_token)).body.error,
    "invalid_grant",
  );
  assert.equal((await w.identify(chatgptA.access_token)).userId, w.users.a);
  assert.equal((await w.identify(claudeB.access_token)).userId, w.users.b);

  // First-party connections list names each client; B cannot revoke A's grant.
  const listA = (await w.firstParty("/api/oauth/connections", "a")).body
    .connections;
  assert.deepEqual(
    listA.map((c) => oauthClientName(c.client_id)),
    ["ChatGPT"],
  );
  const listB = (await w.firstParty("/api/oauth/connections", "b")).body
    .connections;
  assert.deepEqual(
    listB.map((c) => c.client_id),
    [CLAUDE_CLIENT_ID],
  );
  assert.equal(
    (await w.firstParty("/api/oauth/revoke", "b", { grant_id: listA[0].id }))
      .status,
    200,
  );
  assert.equal((await w.identify(chatgptA.access_token)).userId, w.users.a);
  assert.equal(
    (await w.firstParty("/api/oauth/revoke", "b", { grant_id: listB[0].id }))
      .status,
    200,
  );
  await assert.rejects(() => w.identify(claudeB.access_token));
});

test("consent requests are bound to the first athlete who opens them", async () => {
  const w = await oauthWorld();
  const { r } = await w.authorize(CLAUDE_CLIENT_ID);
  const handle = new URL(r.headers.get("location")).searchParams.get(
    "request_id",
  );
  assert.equal(
    (
      await w.firstParty("/api/oauth/details", "a", {
        authorization_request_id: handle,
      })
    ).status,
    200,
  );
  for (const [path, body] of [
    ["/api/oauth/details", { authorization_request_id: handle }],
    [
      "/api/oauth/decision",
      { authorization_request_id: handle, decision: "approve" },
    ],
  ])
    assert.deepEqual((await w.firstParty(path, "b", body)).body, {
      error: "invalid_grant",
    });
});

test("token resolution: scope, ban, deletion and unknown stored clients fail closed", async () => {
  const w = await oauthWorld();
  const readOnly = await w.connect(CLAUDE_CLIENT_ID, "a", "enqidu.read");
  assert.equal(readOnly.refresh_token, undefined);
  assert.deepEqual((await w.identify(readOnly.access_token)).authInfo.scopes, [
    "enqidu.read",
  ]);
  const b = await w.connect(CLAUDE_CLIENT_ID, "b");
  await w.db.query(
    "update auth.users set banned_until=now()+interval '1 day' where id=$1",
    [w.users.b],
  );
  await assert.rejects(() => w.identify(b.access_token));
  const deleted = await w.connect(CLIENT_ID, "a");
  await w.db.query("delete from auth.users where id=$1", [w.users.a]);
  await assert.rejects(() => w.identify(deleted.access_token));
  await w.db.query("insert into auth.users(id) values($1)", [w.users.a]);
  // A grant whose client left the allowlist (or never was on it) cannot authenticate.
  const a = await w.connect(CLAUDE_CLIENT_ID, "a");
  await w.db.query(
    "update mcp_private.grants set client_id=$1 where user_id=$2",
    [CLAUDE_CODE_ID, w.users.a],
  );
  await assert.rejects(() => w.identify(a.access_token));
  await assert.rejects(() => w.identify("enq_mcp_at_" + "A".repeat(43)));
});
