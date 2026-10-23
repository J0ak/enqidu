import { createOAuthStore } from "./store.js";
export function oauthStore(env = process.env) {
  const u = new URL(env.ENQIDU_OAUTH_DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    decodeURIComponent(u.username).split(".")[0] !== "enqidu_mcp_oauth" ||
    !u.password ||
    u.search ||
    u.hash
  )
    throw Error("server_configuration_error");
  return createOAuthStore({ connectionString: u.href });
}
