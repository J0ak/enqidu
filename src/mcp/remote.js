import {
  createMcpHandler,
  verifyBearerToken,
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidationResponse,
  oauthMetadataResponse,
} from "@modelcontextprotocol/server";
import { createEnqiduMcpServer } from "./server.js";
import { authenticateRemoteToken } from "./remoteAuth.js";
import { createRemoteDataPlane } from "./dataPlane.js";

export const MAX_REMOTE_BODY_BYTES = 32768;
const json = (status, error, headers = {}) =>
  Response.json({ error }, { status, headers });
const secure = (response) => {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
};
/** No cross-request server, bearer client, identity, MCP session or subscription state. */
export function createRemoteMcpHandler({
  config,
  clientFactory,
  dataClientFactory,
  now,
  observe = () => {},
}) {
  const resource = new URL(config.resource);
  const metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
  return async (request) => {
    const rejected = hostHeaderValidationResponse(request, [resource.hostname]);
    if (rejected) return secure(rejected);
    const path = new URL(request.url).pathname;
    if (
      path === new URL(metadataUrl).pathname ||
      path === "/api/mcp-metadata"
    ) {
      // Public discovery uses the SDK's metadata CORS/preflight. Only this RFC 9728
      // route is served: do not synthesize an AS discovery document on this host.
      const discovery = new Request(metadataUrl, request);
      return secure(
        oauthMetadataResponse(discovery, {
          oauthMetadata: { issuer: config.issuer },
          resourceServerUrl: resource,
          resourceName: "ENQIDU READ + PREVIEW",
        }),
      );
    }
    // Data transport retains strict Origin and Host validation.
    const origin = request.headers.get("origin");
    if (origin && origin !== resource.origin)
      return secure(json(403, "origin_not_allowed"));
    if (path !== resource.pathname) return secure(json(404, "not_found"));
    let authDb, userId;
    try {
      await verifyBearerToken(request.headers.get("authorization"), {
        expectedResource: config.resource,
        resourceMetadataUrl: metadataUrl,
        verifier: {
          async verifyAccessToken(token) {
            const authenticated = await authenticateRemoteToken(
              token,
              config,
              clientFactory,
            );
            authDb = authenticated.authDb;
            userId = authenticated.userId;
            return authenticated.authInfo;
          },
        },
      });
    } catch (error) {
      return secure(
        bearerAuthChallengeResponse(error, {
          resourceMetadataUrl: metadataUrl,
        }),
      );
    }
    if (request.method !== "POST")
      return secure(json(405, "method_not_allowed", { Allow: "POST" }));
    let db;
    try {
      db = createRemoteDataPlane(config, userId, dataClientFactory);
    } catch {
      return secure(json(500, "request_unavailable"));
    }
    // The SDK owns parsing, content type, bounded body, protocol negotiation and lifecycle.
    const handler = createMcpHandler(
      () =>
        createEnqiduMcpServer({
          db,
          authDb,
          writesEnabled: false,
          now,
          observe: ({
            request_id,
            tool_id,
            tool_version,
            status,
            duration_ms,
            error_code,
          }) =>
            observe({
              request_id,
              tool_id,
              tool_version,
              status,
              duration_ms,
              error_code,
              transport: "remote_mcp",
            }),
        }),
      {
        legacy: "stateless",
        responseMode: "auto",
        maxRequestBodySize: MAX_REMOTE_BODY_BYTES,
        maxSubscriptions: 0,
        keepAliveMs: 0,
        onerror: () => {},
      },
    );
    try {
      const response = await handler.fetch(request);
      // Consume before disposal: legacy responses may be SSE even though modern responses are JSON.
      const body = await response.arrayBuffer();
      return secure(
        new Response(body.byteLength ? body : null, {
          status: response.status,
          headers: response.headers,
        }),
      );
    } catch {
      return secure(json(500, "request_unavailable"));
    } finally {
      await handler.close();
    }
  };
}
