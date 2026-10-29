import { isApprovedCallback } from "./clients.js";
export function authorizationId(search) {
  const p = new URLSearchParams(search),
    id = p.get("request_id");
  return p.getAll("request_id").length === 1 &&
    /^enq_mcp_req_[A-Za-z0-9_-]{43}$/.test(id || "")
    ? id
    : null;
}
export function officialRedirect(data) {
  // Defense in depth. Only ENQIDU API output enters here, never query/client metadata.
  // The destination must be the exact callback of an approved client.
  const u = new URL(data?.redirect_url);
  if (!isApprovedCallback(u.href) || !u.searchParams.get("iss"))
    throw Error("invalid_redirect");
  return data.redirect_url;
}
export async function consentApi(db, path, body, fetcher = fetch) {
  const { data, error } = await db.auth.getSession();
  if (error || !data?.session?.access_token)
    throw Error("authentication_required");
  const r = await fetcher(path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    redirect: "error",
  });
  if (!r.ok) throw Error("consent_unavailable");
  return r.json();
}
export async function decideConsent(db, id, decision, expectedUserId, fetcher) {
  if (!id || !["approve", "deny"].includes(decision))
    throw Error("invalid_request");
  const auth = await db.auth.getUser();
  if (
    auth.error ||
    !auth.data?.user?.id ||
    auth.data.user.id !== expectedUserId
  )
    throw Error("authentication_required");
  return officialRedirect(
    await consentApi(
      db,
      "/api/oauth/decision",
      { authorization_request_id: id, decision },
      fetcher,
    ),
  );
}
