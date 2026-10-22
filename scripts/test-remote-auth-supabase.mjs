import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { authenticateRemoteToken } from "../src/mcp/remoteAuth.js";

// Opt-in disposable LOCAL issuer only. Never use a project's hosted credentials.
if (process.env.ENQIDU_TRANSACTION_ENV_FILE)
  loadEnvFile(process.env.ENQIDU_TRANSACTION_ENV_FILE);
assert.equal(process.env.ENQIDU_TRANSACTION_LOCAL, "1");
const url = new URL(process.env.API_URL);
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    url.protocol === "http:" &&
    url.port &&
    !url.search &&
    !url.username,
);
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const admin = createClient(url.origin, process.env.SERVICE_ROLE_KEY, options);
const userClient = createClient(url.origin, process.env.ANON_KEY, options);
const email = `remote-auth-${randomUUID()}@example.test`,
  password = `local-only-${randomUUID()}`;
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
assert.equal(error, null);
try {
  const login = await userClient.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null);
  const frontend = login.data.session.access_token;
  const claims = JSON.parse(Buffer.from(frontend.split(".")[1], "base64url"));
  const config = {
    resource: "http://127.0.0.1:54545/api/mcp",
    issuer: claims.iss,
    supabaseUrl: url.origin,
    key: process.env.ANON_KEY,
  };
  await assert.rejects(() => authenticateRemoteToken(frontend, config));
  // Verify the documented OAuth claim shape against REAL getUser. This synthetic
  // local signer substitutes only for issuance, not Auth verification/session lookup.
  // It is not an authorization-code/PKCE acceptance test or a production hook.
  const payload = {
    ...claims,
    client_id: randomUUID(),
    aud: ["authenticated", config.resource],
  };
  const encoded = [{ alg: "HS256", typ: "JWT" }, payload]
    .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
    .join(".");
  const token = `${encoded}.${createHmac("sha256", process.env.JWT_SECRET).update(encoded).digest("base64url")}`;
  const accepted = await authenticateRemoteToken(token, config);
  assert.ok(accepted.db);
  await assert.rejects(() =>
    authenticateRemoteToken(token.slice(0, -8) + "tampered", config),
  );
  assert.equal(
    (await userClient.auth.signOut({ scope: "global" })).error,
    null,
  );
  await assert.rejects(() => authenticateRemoteToken(token, config));
  console.log(
    "Real local Supabase Auth: frontend rejected; resource audience array + client_id accepted; forged signature and revoked backing session rejected. No tokens logged.",
  );
} finally {
  assert.equal((await admin.auth.admin.deleteUser(data.user.id)).error, null);
}
