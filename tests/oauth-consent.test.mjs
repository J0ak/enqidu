import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizationId,
  officialRedirect,
  decideConsent,
  consentApi,
} from "../src/oauth/consent.js";
const id = "enq_mcp_req_" + "a".repeat(43);
test("ENQIDU consent handle, server-only redirect and identity change", async () => {
  for (const q of [
    "",
    "?request_id=../../foo",
    `?request_id=${id}&request_id=${id}`,
    "?authorization_id=legacy",
  ])
    assert.equal(authorizationId(q), null);
  assert.equal(
    authorizationId(`?request_id=${id}&redirect_uri=https://evil.test`),
    id,
  );
  for (const u of [
    "javascript:alert(1)",
    "http://evil.test",
    "https://user:pass@chatgpt.com/connector_platform_oauth_redirect?iss=https://enqidu.test",
    "https://chatgpt.com/evil?iss=x",
  ])
    assert.throws(() => officialRedirect({ redirect_url: u }));
  await assert.rejects(
    () =>
      decideConsent(
        {
          auth: { getUser: async () => ({ data: { user: { id: "other" } } }) },
        },
        id,
        "approve",
        "owner",
      ),
    /authentication_required/,
  );
  let captured;
  const db = {
    auth: {
      getUser: async () => ({ data: { user: { id: "owner" } } }),
      getSession: async () => ({
        data: { session: { access_token: "FIRST_PARTY_BROWSER_ONLY" } },
      }),
    },
  };
  const url =
    "https://chatgpt.com/connector_platform_oauth_redirect?code=opaque&iss=https%3A%2F%2Fenqidu.test";
  assert.equal(
    await decideConsent(db, id, "approve", "owner", async (path, options) => {
      captured = { path, options };
      return Response.json({ redirect_url: url });
    }),
    url,
  );
  assert.equal(captured.path, "/api/oauth/decision");
  assert.deepEqual(JSON.parse(captured.options.body), {
    authorization_request_id: id,
    decision: "approve",
  });
  assert.equal(
    captured.options.headers.Authorization,
    "Bearer FIRST_PARTY_BROWSER_ONLY",
  );
  await assert.rejects(
    () =>
      consentApi(
        db,
        "/api/oauth/details",
        {},
        async () => new Response("", { status: 401 }),
      ),
    /consent_unavailable/,
  );
});
