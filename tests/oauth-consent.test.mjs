import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizationId,
  officialRedirect,
  decideConsent,
} from "../src/oauth/consent.js";
test("consent rejects malformed IDs, arbitrary redirects and changed identity before API approval", async () => {
  for (const query of [
    "",
    "?authorization_id=../../foo",
    "?authorization_id=a&authorization_id=b",
  ])
    assert.equal(authorizationId(query), null);
  assert.equal(
    authorizationId("?authorization_id=safe-id&redirect_uri=https://evil.test"),
    "safe-id",
  );
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://evil.test",
    "https://user:pass@client.example",
  ])
    assert.throws(() => officialRedirect({ redirect_url: url }));
  const db = {
    auth: {
      getUser: async () => ({ data: { user: { id: "other" } } }),
      oauth: {
        approveAuthorization() {
          throw Error("must not be called");
        },
      },
    },
  };
  await assert.rejects(
    () => decideConsent(db, "id", "approve", "owner"),
    /authentication_required/,
  );
});
