// Server entrypoint configuration only. Never import from the frontend graph.
const decode = (token) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
function publicKey(key) {
  if (typeof key !== "string" || key.length > 4096) return false;
  if (key.startsWith("sb_publishable_")) return true;
  try {
    return decode(key).role === "anon";
  } catch {
    return false;
  }
}
export function remoteConfiguration(env = process.env) {
  const issuer = new URL(env.ENQIDU_OAUTH_ISSUER);
  if (issuer.protocol !== "https:" || issuer.origin !== env.ENQIDU_OAUTH_ISSUER)
    throw Error("server_configuration_error");
  const resource = new URL(env.ENQIDU_MCP_RESOURCE_URL);
  const supabase = new URL(env.SUPABASE_URL);
  for (const url of [resource, supabase]) {
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw Error("server_configuration_error");
  }
  if (
    resource.pathname !== "/api/mcp" ||
    resource.href !== env.ENQIDU_MCP_RESOURCE_URL ||
    resource.origin !== issuer.origin ||
    supabase.pathname !== "/"
  )
    throw Error("server_configuration_error");
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  if (!publicKey(key)) throw Error("server_configuration_error");
  const dataKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  let serverKey =
    typeof dataKey === "string" && dataKey.startsWith("sb_secret_");
  try {
    serverKey ||= decode(dataKey).role === "service_role";
  } catch {
    /* fail closed */
  }
  if (!serverKey) throw Error("server_configuration_error");
  return {
    dataKey,
    resource: resource.href,
    supabaseUrl: supabase.origin,
    key,
    issuer: issuer.origin,
  };
}
