import { semanticState } from "./semanticRemoteState.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createRemoteMcpHandler } from "../../src/mcp/remote.js";
import {
  createToolsDb,
  toolId,
  TOOL_USER_A,
  TOOL_USER_B,
  TOOL_NOW,
} from "./enqiduToolsDb.mjs";
import { catalogSeed } from "../../src/training/catalogSeed.js";

export function semanticFixture() {
  const f = createToolsDb();
  f.tables.exercise_catalog = catalogSeed.map((r, i) => ({
    ...r,
    id: toolId(1000 + i),
    is_active: true,
  }));
  const add = (code, n, patch = {}) => ({
    id: toolId(n),
    session_id: toolId(20),
    block_id: toolId(22),
    exercise_order: n,
    exercise_id:
      f.tables.exercise_catalog.find((e) => e.code === code)?.id ?? null,
    reported_name: code,
    execution_type: "performed",
    sets_completed: 3,
    reps_per_set: [8, 8, 8],
    load_value: 45,
    load_unit: "kg",
    data_confidence: "reported",
    ...patch,
  });
  f.tables.session_exercises = [
    add("bench_press", 60, {
      reported_name: "Press banca",
      load_value: 40,
      reps_per_set: [10, 10, 9],
    }),
    add("romanian_deadlift", 61, { reported_name: "RDL" }),
    add("high_pull_up", 62, {
      load_value: null,
      load_unit: "bodyweight",
      reps_per_set: [3, 3, 2],
    }),
    add("handstand_push_up", 63, {
      reps_per_set: null,
      load_value: null,
      load_unit: "bodyweight",
    }),
    add("unknown", 64, {
      reported_name: "Unknown",
      reps_per_set: null,
      load_value: null,
    }),
    add("high_pull_up", 65, {
      execution_type: "skipped",
      reps_per_set: [999],
      load_value: 999,
    }),
    add("high_pull_up", 66, {
      session_id: toolId(21),
      notes: "FOREIGN_SECRET",
      reps_per_set: [777],
    }),
  ];
  const originalRpc = f.db.rpc;
  f.db.rpc = async (name, args) => {
    if (name === "read_training_semantics_v1") {
      const session = f.tables.training_sessions.find(
        (s) => s.id === args.p_session_id && s.user_id === TOOL_USER_A,
      );
      return { data: session ? semanticState(f, session) : null, error: null };
    }
    return originalRpc(name, args);
  };
  return f;
}
export async function remoteFixture(
  t,
  { fixture = semanticFixture(), observe, now = TOOL_NOW } = {},
) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const revoked = new Set(),
    authRequests = [];
  let config;
  function claimsFor(token) {
    try {
      const [h, p, s] = token.split(".");
      if (
        !verify(
          "sha256",
          Buffer.from(`${h}.${p}`),
          { key: publicKey, dsaEncoding: "ieee-p1363" },
          Buffer.from(s, "base64url"),
        )
      )
        return null;
      const c = JSON.parse(Buffer.from(p, "base64url"));
      return c.exp > Date.now() / 1000 && !revoked.has(token) ? c : null;
    } catch {
      return null;
    }
  }
  const supabaseServer = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const claims = claimsFor(token || "");
    if (
      !claims ||
      ![TOOL_USER_A, TOOL_USER_B].includes(claims.sub) ||
      (Array.isArray(claims.aud) ? claims.aud[0] : claims.aud) !==
        "authenticated"
    ) {
      res.writeHead(401);
      res.end('{"message":"invalid token"}');
      return;
    }
    const url = new URL(req.url, "http://fixture");
    if (url.pathname === "/auth/v1/user") {
      authRequests.push(claims.sub);
      res.end(JSON.stringify({ id: claims.sub, role: claims.role }));
      return;
    }
    try {
      const table = url.pathname.split("/").at(-1);
      if (req.method === "POST" && url.pathname.includes("/rpc/")) {
        let body = "";
        for await (const chunk of req) body += chunk;
        const args = JSON.parse(body);
        if (table === "read_training_semantics_v1") {
          const session = fixture.tables.training_sessions.find(
            (s) => s.id === args.p_session_id && s.user_id === claims.sub,
          );
          if (!session) {
            res.writeHead(400);
            res.end('{"message":"session_not_found"}');
            return;
          }
          // Semantic RPC has its own PostgreSQL regression suite; read parity here uses its bounded fixture contract.
          const { semanticState } = await import("./semanticRemoteState.mjs");
          res.end(JSON.stringify(semanticState(fixture, session)));
          return;
        }
        const result = await fixture.db.rpc(table, args);
        res.end(JSON.stringify(result.data));
        return;
      }
      assert.ok(["GET", "HEAD"].includes(req.method));
      const query = fixture.db
        .from(table)
        .select(url.searchParams.get("select"));
      if (fixture.tables[table]?.some((r) => Object.hasOwn(r, "user_id")))
        query.eq("user_id", claims.sub);
      for (const [field, condition] of url.searchParams) {
        if (["select", "order", "limit", "offset"].includes(field)) continue;
        const dot = condition.indexOf("."),
          op = condition.slice(0, dot),
          value = condition.slice(dot + 1);
        if (op === "in")
          query.in(
            field,
            value
              .slice(1, -1)
              .split(",")
              .map((s) => s.replaceAll('"', "")),
          );
        else
          query[op](
            field,
            value === "true"
              ? true
              : value === "false"
                ? false
                : ["hrv_ms"].includes(field)
                  ? Number(value)
                  : value,
          );
      }
      for (const order of (url.searchParams.get("order") || "")
        .split(",")
        .filter(Boolean)) {
        const [field, dir] = order.split(".");
        query.order(field, { ascending: dir !== "desc" });
      }
      if (url.searchParams.has("limit"))
        query.limit(Number(url.searchParams.get("limit")));
      const result = await query;
      if (req.method === "HEAD") {
        res.setHeader("Content-Range", `*/${result.data.length}`);
        res.end();
      } else res.end(JSON.stringify(result.data));
    } catch {
      res.writeHead(500);
      res.end('{"message":"fixture failed"}');
    }
  });
  supabaseServer.listen(0, "127.0.0.1");
  await once(supabaseServer, "listening");
  const supabaseUrl = `http://127.0.0.1:${supabaseServer.address().port}`;
  let remoteRequests = 0;
  const httpServer = createServer(async (req, res) => {
    remoteRequests++;
    // Reconstruct the entire handler on EVERY request, as on independent serverless invocations.
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      ...(["GET", "HEAD"].includes(req.method)
        ? {}
        : { body: req, duplex: "half" }),
    });
    const response = await createRemoteMcpHandler({ config, now, observe })(
      request,
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const resource = `http://127.0.0.1:${httpServer.address().port}/api/mcp`;
  config = {
    resource,
    supabaseUrl,
    issuer: `${supabaseUrl}/auth/v1`,
    key: "sb_publishable_fixture",
  };
  function token(patch = {}) {
    const claims = {
      sub: TOOL_USER_A,
      role: "authenticated",
      client_id: "mcp-client",
      session_id: toolId(999),
      aud: ["authenticated", resource],
      iss: config.issuer,
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...patch,
    };
    const encoded = [{ alg: "ES256", typ: "JWT" }, claims]
      .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
      .join(".");
    return `${encoded}.${sign("sha256", Buffer.from(encoded), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  }
  async function connect({ accessToken = token(), mode = "legacy" } = {}) {
    const client = new Client(
      { name: "enqidu-remote-tests", version: "1" },
      { versionNegotiation: { mode } },
    );
    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    await client.connect(transport);
    t.after(() => client.close());
    return client;
  }
  t.after(() => {
    for (const s of [httpServer, supabaseServer]) {
      s.closeAllConnections();
      s.close();
    }
  });
  return {
    ...fixture,
    config,
    token,
    connect,
    revoked,
    authRequests,
    get remoteRequests() {
      return remoteRequests;
    },
  };
}
