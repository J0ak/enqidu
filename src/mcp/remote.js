import {
  createMcpHandler,
  verifyBearerToken,
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidationResponse,
} from "@modelcontextprotocol/server";
import { createEnqiduMcpServer } from "./server.js";
import { authenticateRemoteToken } from "./remoteAuth.js";

export const MAX_REMOTE_BODY_BYTES = 32768;
const json = (status, error, headers = {}) =>
  Response.json({ error }, { status, headers });
export const protectedResourceMetadata = (config) => ({
  resource: config.resource,
  authorization_servers: [config.issuer],
  bearer_methods_supported: ["header"],
  resource_name: "ENQIDU READ + PREVIEW",
});
const secure = (response) => {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
};
/** No cross-request server, bearer client, identity, MCP session or subscription state. */
export function createRemoteMcpHandler({
  config,
  clientFactory,
  now,
  observe = () => {},
}) {
  const resource = new URL(config.resource);
  const metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
  return async (request) => {
    const rejected = hostHeaderValidationResponse(request, [resource.hostname]);
    if (rejected) return secure(rejected);
    // No cross-origin browser access in V1. Non-browser MCP clients omit Origin.
    const origin = request.headers.get("origin");
    if (origin && origin !== resource.origin)
      return secure(json(403, "origin_not_allowed"));
    const path = new URL(request.url).pathname;
    if (
      path === new URL(metadataUrl).pathname ||
      path === "/api/mcp-metadata"
    ) {
      return secure(
        request.method === "GET"
          ? Response.json(protectedResourceMetadata(config))
          : json(405, "method_not_allowed", { Allow: "GET" }),
      );
    }
    if (path !== resource.pathname) return secure(json(404, "not_found"));
    let db;
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
            db = authenticated.db;
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
    // The SDK owns parsing, content type, bounded body, protocol negotiation and lifecycle.
    const handler = createMcpHandler(
      () =>
        createEnqiduMcpServer({
          db,
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
