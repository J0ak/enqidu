import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import { CLIENT_IDS, hash, validOpaque } from "../../server/oauth/protocol.js";
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
    // The private resolver is bound to one client per call. Probe only the closed
    // allowlist; a token belongs to exactly one grant, hence one client.
    const resolve = async (client_id) => {
      const r = await store.call("resolve_access_token_v1", {
        token_hash: hash(token),
        resource: config.resource,
        client_id,
      });
      if (!r) return null;
      if (
        !r.user_id ||
        r.resource !== config.resource ||
        r.client_id !== client_id ||
        !Array.isArray(r.scopes) ||
        !r.scopes.includes("enqidu.read") ||
        !(Number(r.expires_at) > Date.now() / 1000)
      )
        throw invalid();
      return r;
    };
    let record = null;
    for (const client_id of CLIENT_IDS) {
      record = await resolve(client_id);
      if (record) break;
    }
    if (!record) throw invalid();
    const authDb = Object.freeze({
      auth: Object.freeze({
        async getUser() {
          try {
            const r = await resolve(record.client_id);
            if (!r || r.user_id !== record.user_id) throw invalid();
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
