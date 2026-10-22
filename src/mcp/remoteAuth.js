import { createClient } from "@supabase/supabase-js";
import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";

const invalid = () =>
  new OAuthError(
    OAuthErrorCode.InvalidToken,
    "ENQIDU authentication required.",
  );
const decode = (token) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
/** Claims are policy inputs ONLY AFTER Auth verifies this exact token through getUser. */
export async function authenticateRemoteToken(
  token,
  config,
  clientFactory = createClient,
) {
  try {
    if (
      typeof token !== "string" ||
      token.length > 16384 ||
      token.split(".").length !== 3
    )
      throw invalid();
    const db = clientFactory(config.supabaseUrl, config.key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await db.auth.getUser();
    if (error || !data?.user?.id) throw invalid();
    const claims = decode(token);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        claims.session_id || "",
      ) ||
      claims.session_id === "00000000-0000-0000-0000-000000000000" ||
      claims.sub !== data.user.id ||
      claims.role !== "authenticated" ||
      claims.iss !== config.issuer ||
      typeof claims.client_id !== "string" ||
      !claims.client_id.trim() ||
      claims.client_id.length > 200 ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Date.now() / 1000 ||
      (claims.nbf != null &&
        (!Number.isFinite(claims.nbf) || claims.nbf > Date.now() / 1000)) ||
      !(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(
        config.resource,
      )
    )
      throw invalid();
    return {
      authDb: db,
      userId: data.user.id,
      authInfo: {
        token,
        clientId: claims.client_id,
        scopes: [],
        expiresAt: claims.exp,
        resource: config.resource,
      },
    };
  } catch {
    throw invalid();
  }
}
