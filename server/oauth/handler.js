import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import {
  CLIENTS,
  SCOPES,
  OAuthFailure,
  fail,
  hash,
  opaque,
  validOpaque,
  scopes,
  params,
  boundedBody,
  metadata,
  callback,
} from "./protocol.js";
import { clientMetadata } from "./cimd.js";
const headers = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const json = (body, status = 200, extra = {}) =>
  Response.json(body, { status, headers: { ...headers, ...extra } });
const redirect = (url) =>
  new Response(null, { status: 302, headers: { ...headers, Location: url } });
async function firstParty(request, config, clientFactory) {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!bearer || bearer.length > 16384 || bearer.split(".").length !== 3)
    fail("access_denied", 401);
  const db = clientFactory(config.supabaseUrl, config.key, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await db.auth.getUser();
  if (error || !data?.user?.id || data.user.is_anonymous)
    fail("access_denied", 401);
  // Policy only after online signature/session verification. No user_metadata.
  let claims;
  try {
    claims = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url"));
  } catch {
    fail("access_denied", 401);
  }
  if (
    claims.client_id != null ||
    claims.role !== "authenticated" ||
    claims.sub !== data.user.id
  )
    fail("access_denied", 401);
  return data.user.id;
}
export function createOAuthHandler({
  config,
  store,
  fetchDocument,
  clientFactory = createClient,
  observe = () => {},
}) {
  return async (request) => {
    const started = Date.now(),
      request_id = randomUUID();
    let endpoint = "unknown",
      grant_type,
      status = 500,
      error_code;
    try {
      const url = new URL(request.url),
        origin = new URL(config.issuer).origin;
      if (
        url.origin !== origin ||
        (request.headers.get("host") &&
          request.headers.get("host") !== new URL(config.issuer).host)
      )
        fail("invalid_request", 403);
      endpoint = url.pathname;
      if (
        endpoint === "/.well-known/oauth-authorization-server" ||
        endpoint === "/api/oauth/metadata"
      ) {
        status = request.method === "OPTIONS" ? 204 : 200;
        if (!["GET", "OPTIONS"].includes(request.method))
          fail("invalid_request", 405);
        return request.method === "OPTIONS"
          ? new Response(null, {
              status,
              headers: {
                ...headers,
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
              },
            })
          : json(metadata(config), 200, { "Access-Control-Allow-Origin": "*" });
      }
      if (
        request.headers.get("origin") &&
        request.headers.get("origin") !== origin
      )
        fail("access_denied", 403);
      const call = async (op, input) => {
        const r = await store.call(op, input);
        if (r?.error)
          fail(r.error, r.error === "temporarily_unavailable" ? 429 : 400);
        return r;
      };
      if (endpoint === "/oauth/authorize") {
        if (request.method !== "GET") fail("invalid_request", 405);
        if (url.search.length > 8192) fail();
        // Never redirect until client and exact redirect have been established.
        const raw = url.searchParams;
        if (
          raw.getAll("client_id").length !== 1 ||
          raw.getAll("redirect_uri").length !== 1
        )
          fail();
        const client = await clientMetadata(
          raw.get("client_id"),
          fetchDocument,
        );
        if (!client.redirects.includes(raw.get("redirect_uri"))) fail();
        let p;
        try {
          p = params(raw, [
            "response_type",
            "client_id",
            "redirect_uri",
            "resource",
            "code_challenge",
            "code_challenge_method",
            "state",
            "scope",
          ]);
          if (p.response_type !== "code") fail("unsupported_response_type");
          if (
            p.resource !== config.resource ||
            p.code_challenge_method !== "S256" ||
            !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge || "") ||
            !p.state ||
            p.state.length > 1024 ||
            /[\x00-\x1f\x7f]/.test(p.state)
          )
            fail();
          const requested = scopes(p.scope),
            handle = opaque("req");
          await call("create_request_v1", {
            request_hash: hash(handle),
            client_id: p.client_id,
            redirect_uri: p.redirect_uri,
            resource: p.resource,
            challenge: p.code_challenge,
            state: p.state,
            scopes: requested,
          });
          status = 302;
          return redirect(
            `${config.issuer}/oauth/consent?request_id=${handle}`,
          );
        } catch (e) {
          if (!(e instanceof OAuthFailure)) throw e;
          status = 302;
          error_code = e.code;
          const state =
            raw.getAll("state").length === 1 && raw.get("state").length <= 1024
              ? raw.get("state")
              : "";
          return redirect(
            callback(raw.get("redirect_uri"), config, state, { error: e.code }),
          );
        }
      }
      if (["/oauth/token", "/oauth/revoke"].includes(endpoint)) {
        if (request.method !== "POST") fail("invalid_request", 405);
        if (request.headers.has("authorization")) fail("invalid_client");
        if (
          !/^application\/x-www-form-urlencoded(?:;|$)/i.test(
            request.headers.get("content-type") || "",
          )
        )
          fail("invalid_request", 415);
        const p = params(
          new URLSearchParams(await boundedBody(request)),
          endpoint === "/oauth/token"
            ? [
                "grant_type",
                "code",
                "client_id",
                "redirect_uri",
                "code_verifier",
                "resource",
                "refresh_token",
                "scope",
              ]
            : ["token", "token_type_hint", "client_id"],
        );
        if (!Object.hasOwn(CLIENTS, p.client_id)) fail("invalid_client");
        if (endpoint === "/oauth/revoke") {
          if (!p.token || p.token.length > 200) fail();
          if (validOpaque(p.token, "at") || validOpaque(p.token, "rt"))
            await call("revoke_token_v1", {
              token_hash: hash(p.token),
              client_id: p.client_id,
            });
          status = 200;
          return new Response(null, { status, headers });
        }
        if (p.resource !== config.resource) fail();
        grant_type = ["authorization_code", "refresh_token"].includes(
          p.grant_type,
        )
          ? p.grant_type
          : "unsupported";
        const access = opaque("at"),
          refresh = opaque("rt");
        let result;
        const common = {
          client_id: p.client_id,
          resource: p.resource,
          access_hash: hash(access),
          refresh_hash: hash(refresh),
        };
        if (p.grant_type === "authorization_code") {
          if (
            !validOpaque(p.code, "code") ||
            !/^[A-Za-z0-9._~-]{43,128}$/.test(p.code_verifier || "") ||
            !CLIENTS[p.client_id].redirects.includes(p.redirect_uri)
          )
            fail("invalid_grant");
          result = await call("consume_authorization_code_v1", {
            ...common,
            code_hash: hash(p.code),
            redirect_uri: p.redirect_uri,
            challenge: createHash("sha256")
              .update(p.code_verifier)
              .digest("base64url"),
          });
        } else if (p.grant_type === "refresh_token") {
          if (!validOpaque(p.refresh_token, "rt")) fail("invalid_grant");
          result = await call("rotate_refresh_token_v1", {
            ...common,
            refresh_hash_old: hash(p.refresh_token),
            ...(p.scope === undefined
              ? {}
              : { scope: scopes(p.scope).join(" ") }),
          });
        } else fail("unsupported_grant_type");
        status = 200;
        return json({
          access_token: access,
          token_type: "Bearer",
          expires_in: result.expires_in,
          scope: result.scope,
          ...(result.refresh ? { refresh_token: refresh } : {}),
        });
      }
      if (
        ![
          "/api/oauth/details",
          "/api/oauth/decision",
          "/api/oauth/connections",
          "/api/oauth/revoke",
        ].includes(endpoint)
      )
        fail("invalid_request", 404);
      const user_id = await firstParty(request, config, clientFactory);
      if (endpoint === "/api/oauth/connections") {
        if (request.method !== "GET") fail("invalid_request", 405);
        const connections = await call("connections_v1", { user_id });
        status = 200;
        return json({ connections });
      }
      if (request.method !== "POST") fail("invalid_request", 405);
      if (
        !/^application\/json(?:;|$)/i.test(
          request.headers.get("content-type") || "",
        )
      )
        fail("invalid_request", 415);
      let p;
      try {
        p = JSON.parse(await boundedBody(request));
      } catch (e) {
        if (e instanceof OAuthFailure) throw e;
        fail();
      }
      const allowed =
        endpoint === "/api/oauth/revoke"
          ? ["grant_id"]
          : endpoint === "/api/oauth/details"
            ? ["authorization_request_id"]
            : ["authorization_request_id", "decision"];
      if (
        !p ||
        Array.isArray(p) ||
        Object.keys(p).some((k) => !allowed.includes(k))
      )
        fail();
      if (endpoint === "/api/oauth/revoke") {
        if (!/^[a-f0-9-]{36}$/i.test(p.grant_id || "")) fail();
        await call("revoke_grant_v1", { user_id, grant_id: p.grant_id });
        status = 200;
        return json({ revoked: true });
      }
      if (!validOpaque(p.authorization_request_id, "req")) fail();
      const request_hash = hash(p.authorization_request_id);
      const details = await call("request_details_v1", {
        request_hash,
        user_id,
      });
      if (
        details.resource !== config.resource ||
        !Object.hasOwn(CLIENTS, details.client_id)
      )
        fail("invalid_grant");
      if (endpoint === "/api/oauth/details") {
        status = 200;
        return json({
          client: { name: CLIENTS[details.client_id].name },
          scope: details.scopes.join(" "),
          redirect_uri: details.redirect_uri,
        });
      }
      if (!["approve", "deny"].includes(p.decision)) fail();
      const code = opaque("code");
      const result = await call("decide_request_v1", {
        request_hash,
        user_id,
        decision: p.decision,
        resource: config.resource,
        client_id: details.client_id,
        code_hash: hash(code),
      });
      status = 200;
      return json({
        redirect_url: callback(
          result.redirect_uri,
          config,
          result.state,
          p.decision === "approve" ? { code } : { error: "access_denied" },
        ),
      });
    } catch (e) {
      error_code = e instanceof OAuthFailure ? e.code : "server_error";
      status = e instanceof OAuthFailure ? e.status : 503;
      return json({ error: error_code }, status);
    } finally {
      observe({
        request_id,
        endpoint: [
          "/oauth/authorize",
          "/oauth/token",
          "/oauth/revoke",
          "/api/oauth/details",
          "/api/oauth/decision",
          "/api/oauth/connections",
          "/api/oauth/revoke",
          "/.well-known/oauth-authorization-server",
          "/api/oauth/metadata",
        ].includes(endpoint)
          ? endpoint
          : "unknown",
        ...(grant_type ? { grant_type } : {}),
        client_classification: "approved_public_client",
        status,
        ...(error_code ? { error_code } : {}),
        duration_ms: Math.max(0, Date.now() - started),
      });
    }
  };
}
