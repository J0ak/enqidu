import { createClient } from "@supabase/supabase-js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function validPublicKey(key) {
  if (typeof key !== "string" || !key || key.length > 4096) return false;
  if (key.startsWith("sb_publishable_")) return true;
  // This is only a deny-by-default public-key configuration check, NOT JWT
  // verification. Supabase Auth, through getUser, authenticates the athlete.
  try {
    return JSON.parse(Buffer.from(key.split(".")[1] || "", "base64url").toString()).role === "anon";
  } catch {
    return false;
  }
}

export function readLocalMcpConfiguration(environment = {}) {
  let url;
  try {
    url = new URL(environment.SUPABASE_URL || "");
  } catch {
    throw new Error("MCP local requires a loopback SUPABASE_URL.");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)
    || !["http:", "https:"].includes(url.protocol)
    || url.username || url.password || url.search || url.hash
    || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("MCP local requires a loopback SUPABASE_URL.");
  }
  const anonKey = environment.SUPABASE_ANON_KEY;
  if (!validPublicKey(anonKey)) {
    throw new Error("MCP local requires a public Supabase anon or publishable key.");
  }
  const accessToken = environment.ENQIDU_MCP_ACCESS_TOKEN;
  if (typeof accessToken !== "string" || !accessToken || accessToken.length > 16_384
    || /\s/.test(accessToken)) {
    throw new Error("MCP local requires an ENQIDU athlete access token.");
  }
  return { url: url.origin, anonKey, accessToken };
}

export async function createLocalMcpAuthClient(configuration) {
  // Recheck even for callers importing this function directly. Credentials are
  // process configuration and never MCP tool arguments or discovery metadata.
  const { url, anonKey, accessToken } = readLocalMcpConfiguration({
    SUPABASE_URL: configuration?.url,
    SUPABASE_ANON_KEY: configuration?.anonKey,
    ENQIDU_MCP_ACCESS_TOKEN: configuration?.accessToken,
  });
  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const { data, error } = await db.auth.getUser();
    if (error || !data?.user?.id) throw new Error("authentication_required");
  } catch {
    throw new Error("MCP local requires a valid authenticated ENQIDU athlete.");
  }
  return db;
}
