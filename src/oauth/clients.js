// Closed OAuth client allowlist shared by the server and the consent UI. Pure data:
// no Node or browser dependencies. Adding a client is a reviewed code change, never
// configuration, Dynamic Client Registration or an arbitrary CIMD URL.
export const CHATGPT_CLIENT_ID = "https://chatgpt.com/oauth/client.json";
export const CLAUDE_CLIENT_ID =
  "https://claude.ai/oauth/mcp-oauth-client-metadata";
export const OAUTH_CLIENTS = Object.freeze({
  [CHATGPT_CLIENT_ID]: Object.freeze({
    name: "ChatGPT",
    redirects: Object.freeze([
      "https://chatgpt.com/connector_platform_oauth_redirect",
    ]),
  }),
  // Hosted Claude apps (claude.ai, Desktop, mobile). Claude Code's loopback
  // client is intentionally not approved.
  [CLAUDE_CLIENT_ID]: Object.freeze({
    name: "Claude",
    redirects: Object.freeze(["https://claude.ai/api/mcp/auth_callback"]),
  }),
});
export const OAUTH_CLIENT_IDS = Object.freeze(Object.keys(OAUTH_CLIENTS));
export const oauthClientName = (id) =>
  Object.hasOwn(OAUTH_CLIENTS, id) ? OAUTH_CLIENTS[id].name : null;
// Exact registered callback (origin + path, no credentials/fragment); the query
// carries only the OAuth response parameters.
export function isApprovedCallback(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  return (
    !u.username &&
    !u.password &&
    !u.hash &&
    OAUTH_CLIENT_IDS.some((id) =>
      OAUTH_CLIENTS[id].redirects.includes(u.origin + u.pathname),
    )
  );
}
