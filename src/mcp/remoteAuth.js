import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import { CLIENT_ID, hash, validOpaque } from "../../server/oauth/protocol.js";
const invalid = () =>
  new OAuthError(
    OAuthErrorCode.InvalidToken,
    "ENQIDU authentication required.",
  );
/** ENQIDU credentials never enter Supabase Auth. Only the private grant resolver
 * can supply identity; the runtime revalidates it through this narrow adapter. */
export async function authenticateRemoteToken(token, config, store) {
  try {
    if (!validOpaque(token, "at")) throw invalid();
    const resolve = async () => {
      const r = await store.call("resolve_access_token_v1", {
        token_hash: hash(token),
        resource: config.resource,
        client_id: CLIENT_ID,
      });
      if (
        !r ||
        !r.user_id ||
        r.resource !== config.resource ||
        r.client_id !== CLIENT_ID ||
        !Array.isArray(r.scopes) ||
        !r.scopes.includes("enqidu.read") ||
        !(Number(r.expires_at) > Date.now() / 1000)
      )
        throw invalid();
      return r;
    };
    const record = await resolve();
    const authDb = Object.freeze({
      auth: Object.freeze({
        async getUser() {
          try {
            const r = await resolve();
            if (r.user_id !== record.user_id) throw invalid();
            return { data: { user: { id: r.user_id } }, error: null };
          } catch {
            return { data: { user: null }, error: { code: "auth_required" } };
          }
        },
      }),
    });
    return {
      authDb,
      userId: record.user_id,
      authInfo: {
        token,
        clientId: record.client_id,
        scopes: record.scopes,
        expiresAt: Number(record.expires_at),
        resource: record.resource,
      },
    };
  } catch {
    throw invalid();
  }
}
