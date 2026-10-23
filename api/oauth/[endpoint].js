import { remoteConfiguration } from "../../server/mcpConfiguration.js";
import { oauthStore } from "../../server/oauth/configuration.js";
import { createOAuthHandler } from "../../server/oauth/handler.js";
async function serve(request) {
  try {
    const config = remoteConfiguration();
    const url = new URL(request.url);
    // Internal rewrite destinations, never a client-supplied endpoint/query authority.
    const paths = {
      "/api/oauth/authorize": "/oauth/authorize",
      "/api/oauth/token": "/oauth/token",
      "/api/oauth/revocation": "/oauth/revoke",
    };
    if (paths[url.pathname]) {
      url.pathname = paths[url.pathname];
      request = new Request(url, request);
    }
    return await createOAuthHandler({
      config,
      store: oauthStore(),
      observe: (event) => console.info(JSON.stringify(event)),
    })(request);
  } catch {
    return Response.json(
      { error: "temporarily_unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
      },
    );
  }
}
export const GET = serve,
  POST = serve,
  PUT = serve,
  DELETE = serve,
  PATCH = serve,
  HEAD = serve,
  OPTIONS = serve;
