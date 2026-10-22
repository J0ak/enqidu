import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  authenticateFirstParty,
  firstPartyBoundary,
} from "../src/auth/firstParty.js";
import { readOnlyDataPlane } from "../src/mcp/dataPlane.js";
const token = (claims) =>
  [
    "header",
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");
const db = {
  auth: { getUser: async () => ({ data: { user: { id: "athlete-a" } } }) },
};
test("first-party boundary rejects verified OAuth claims before handler or body, preserves normal sessions", async () => {
  let calls = 0;
  const handler = firstPartyBoundary(
    () => {
      calls++;
      return new Response("normal");
    },
    () => db,
  );
  for (const client_id of ["oauth-client", ""]) {
    const r = await handler(
      new Request("http://local.test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token({ sub: "athlete-a", client_id })}`,
        },
        body: "malformed body",
      }),
    );
    assert.equal(r.status, 403);
    assert.deepEqual(await r.json(), {
      ok: false,
      error: "oauth_transport_forbidden",
    });
  }
  assert.equal(calls, 0);
  for (const claims of [
    { sub: "athlete-a" },
    { sub: "athlete-a", user_metadata: { client_id: "not-authoritative" } },
  ])
    assert.equal(
      (
        await handler(
          new Request("http://local.test", {
            headers: { Authorization: `Bearer ${token(claims)}` },
          }),
        )
      ).status,
      200,
    );
  assert.equal(calls, 2);
  assert.equal(
    (await authenticateFirstParty(db, `Bearer ${token({ sub: "athlete-b" })}`))
      .status,
    401,
  );
  assert.equal(
    (
      await authenticateFirstParty(
        { auth: { getUser: async () => ({ error: { message: "private" } }) } },
        `Bearer ${token({ sub: "athlete-a" })}`,
      )
    ).status,
    401,
  );
});
test("every first-party Edge entrypoint uses the boundary, including future additions", () => {
  const root = new URL("../supabase/functions/", import.meta.url);
  for (const entry of readdirSync(root, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && !e.name.startsWith("_"),
  )) {
    const code = readFileSync(new URL(`${entry.name}/index.ts`, root), "utf8");
    assert.match(
      code,
      /import \{ firstPartyEndpoint \} from "\.\.\/_shared\/firstPartyEndpoint\.ts"/,
      entry.name,
    );
    assert.equal((code.match(/Deno\.serve\(/g) || []).length, 1, entry.name);
    assert.match(code, /Deno\.serve\(firstPartyEndpoint\(/, entry.name);
    if (entry.name !== "garmin-daily-sync")
      assert.doesNotMatch(code, /scheduler:\s*true/, entry.name);
  }
});
test("scheduler exception only delegates to existing independent authentication without a bearer", async () => {
  let calls = 0;
  const handler = firstPartyBoundary(
    () => {
      calls++;
      return new Response("independent scheduler check");
    },
    () => db,
    { scheduler: true },
  );
  assert.equal(
    (
      await handler(
        new Request("http://local.test", {
          headers: { "X-ENQIDU-Scheduler-Secret": "test" },
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await handler(
        new Request("http://local.test", {
          headers: {
            "X-ENQIDU-Scheduler-Secret": "test",
            Authorization: `Bearer ${token({ sub: "athlete-a", client_id: "oauth" })}`,
          },
        }),
      )
    ).status,
    403,
  );
  assert.equal(calls, 1);
});
test("server data capability exposes neither writes, secret-bearing properties nor arbitrary RPC", async () => {
  const raw = {
    secret: "server-secret",
    auth: { admin: {} },
    from: () => ({
      select: () => ({
        then: () => {},
        eq() {
          return this;
        },
      }),
    }),
    rpc() {
      throw Error("must not reach");
    },
  };
  const data = readOnlyDataPlane(raw, "athlete-a");
  assert.deepEqual(Object.keys(data), ["from", "rpc"]);
  assert.equal(data.from("training_sessions").insert, undefined);
  assert.equal(data.from("training_sessions").select("*").update, undefined);
  assert.throws(() => data.from("fit_message_payloads"));
  assert.throws(() => data.from("conversations"));
  await assert.rejects(data.rpc("apply_cancel_session", {}));
  await assert.rejects(
    data.rpc("get_ai_coach_context", { p_user_id: "athlete-b" }),
  );
  assert.doesNotMatch(JSON.stringify(data), /server-secret/);
});
