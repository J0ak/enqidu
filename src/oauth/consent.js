export function authorizationId(search) {
  const params = new URLSearchParams(search);
  const id = params.get("authorization_id");
  return params.getAll("authorization_id").length === 1 &&
    /^[a-zA-Z0-9_-]{1,200}$/.test(id || "")
    ? id
    : null;
}
export function officialRedirect(data) {
  // This function only receives API responses, never search parameters or client metadata.
  const url = new URL(data?.redirect_url);
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw Error("invalid_redirect");
  return data.redirect_url;
}
export async function decideConsent(db, id, decision, expectedUserId) {
  if (!id || !["approve", "deny"].includes(decision))
    throw Error("invalid_request");
  const auth = await db.auth.getUser();
  if (
    auth.error ||
    !auth.data?.user?.id ||
    auth.data.user.id !== expectedUserId
  )
    throw Error("authentication_required");
  const result = await db.auth.oauth[
    decision === "approve" ? "approveAuthorization" : "denyAuthorization"
  ](id, { skipBrowserRedirect: true });
  if (result.error) throw Error("consent_unavailable");
  return officialRedirect(result.data);
}
