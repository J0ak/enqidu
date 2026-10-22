/** Decode ONLY after online getUser verifies this exact bearer. Never use user_metadata. */
export async function authenticateFirstParty(db, authorization) {
  try {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization || "")?.[1];
    if (!token || token.length > 16384)
      return { error: "auth_required", status: 401 };
    const { data, error } = await db.auth.getUser();
    if (error || !data?.user?.id) return { error: "invalid_user", status: 401 };
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(part), (c) => c.charCodeAt(0)),
      ),
    );
    if (claims.sub !== data.user.id)
      return { error: "invalid_user", status: 401 };
    if (claims.client_id != null)
      return { error: "oauth_transport_forbidden", status: 403 };
    return { user: data.user };
  } catch {
    return { error: "invalid_user", status: 401 };
  }
}

/** Runs before the endpoint can construct any privileged client or inspect the body. */
export function firstPartyBoundary(
  handler,
  createAuthClient,
  { scheduler = false } = {},
) {
  return async (request) => {
    if (request.method === "OPTIONS") return handler(request);
    const authorization = request.headers.get("Authorization");
    // Only the existing Garmin scheduler may proceed to its own independent secret check.
    if (
      scheduler &&
      !authorization &&
      request.headers.has("X-ENQIDU-Scheduler-Secret")
    )
      return handler(request);
    let result;
    try {
      result = await authenticateFirstParty(
        createAuthClient(authorization),
        authorization,
      );
    } catch {
      result = { error: "invalid_user", status: 401 };
    }
    if (result.error)
      return Response.json(
        { ok: false, error: result.error },
        {
          status: result.status,
          headers: {
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    return handler(request);
  };
}
