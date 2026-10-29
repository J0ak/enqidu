import { semanticState } from "./semanticRemoteState.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { opaque, hash, CLIENT_ID } from "../../server/oauth/protocol.js";
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
  const revoked = new Set(),
    authRequests = [],
    dataRequests = [],
    records = new Map();
  const dataKey = "sb_secret_SYNTHETIC_REMOTE_DATA_PLANE_ONLY";
  let config;
  const tokenStore = {
    async call(op, p) {
      assert.equal(op, "resolve_access_token_v1");
      authRequests.push(p.token_hash);
      const r = records.get(p.token_hash);
      if (
        !r ||
        revoked.has(r.token) ||
        r.exp <= Date.now() / 1000 ||
        ![TOOL_USER_A, TOOL_USER_B].includes(r.sub) ||
        r.client_id !== p.client_id ||
        r.resource !== p.resource ||
        r.revoked ||
        r.banned
      )
        return null;
      return {
        user_id: r.sub,
        client_id: r.client_id,
        resource: r.resource,
        scopes: r.scopes,
        expires_at: r.exp,
      };
    },
  };
  const supabaseServer = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const privileged = token === dataKey;
    if (!privileged) {
      res.writeHead(401);
      res.end('{"message":"invalid token"}');
      return;
    }
    const url = new URL(req.url, "http://fixture");
    if (url.pathname.startsWith("/auth/"))
      throw Error("MCP must never send a token to Auth");
    dataRequests.push({ privileged, path: url.pathname, method: req.method });
    try {
      const table = url.pathname.split("/").at(-1);
      if (req.method === "POST" && url.pathname.includes("/rpc/")) {
        let body = "";
        for await (const chunk of req) body += chunk;
        const args = JSON.parse(body);
        if (table === "read_training_semantics_for_mcp_v1") {
          const session = fixture.tables.training_sessions.find(
            (s) => s.id === args.p_session_id && s.user_id === args.p_user_id,
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
    const response = await createRemoteMcpHandler({
      config,
      tokenStore,
      now,
      observe,
    })(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const resource = `http://127.0.0.1:${httpServer.address().port}/api/mcp`;
  config = {
    resource,
    supabaseUrl,
    issuer: new URL(resource).origin,
    key: "sb_publishable_fixture",
    dataKey,
  };
  function token(patch = {}) {
    const value = opaque("at");
    records.set(hash(value), {
      token: value,
      sub: TOOL_USER_A,
      client_id: CLIENT_ID,
      resource,
      scopes: ["enqidu.read", "enqidu.preview", "offline_access"],
      exp: Date.now() / 1000 + 3600,
      ...patch,
    });
    return value;
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
    tokenStore,
    token,
    connect,
    revoked,
    authRequests,
    dataRequests,
    get remoteRequests() {
      return remoteRequests;
    },
  };
}
