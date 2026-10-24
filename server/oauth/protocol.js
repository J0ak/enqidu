import { randomBytes, createHash } from "node:crypto";
export const CLIENT_ID = "https://chatgpt.com/oauth/client.json";
export const CLIENTS = Object.freeze({
  [CLIENT_ID]: Object.freeze({
    name: "ChatGPT",
    origin: "https://chatgpt.com",
    redirects: Object.freeze([
      "https://chatgpt.com/connector_platform_oauth_redirect",
    ]),
  }),
});
export const SCOPES = Object.freeze([
  "enqidu.read",
  "enqidu.preview",
  "offline_access",
]);
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const opaque = (kind) =>
  `enq_mcp_${kind}_${randomBytes(32).toString("base64url")}`;
export const validOpaque = (value, kind) =>
  typeof value === "string" &&
  new RegExp(`^enq_mcp_${kind}_[A-Za-z0-9_-]{43}$`).test(value);
export class OAuthFailure extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export const fail = (code = "invalid_request", status = 400) => {
  throw new OAuthFailure(code, status);
};
export function scopes(value) {
  if (typeof value !== "string" || value.length > 100) fail("invalid_scope");
  const result = value.split(" ");
  if (
    !result.includes("enqidu.read") ||
    new Set(result).size !== result.length ||
    result.some((s) => !SCOPES.includes(s))
  )
    fail("invalid_scope");
  return SCOPES.filter((s) => result.includes(s));
}
export function params(input, allowed) {
  const out = {};
  for (const [k, v] of input) {
    if (!allowed.includes(k) || k in out || v.length > 2048) fail();
    out[k] = v;
  }
  return out;
}
export async function boundedBody(request, max = 8192) {
  if (Number(request.headers.get("content-length")) > max)
    fail("invalid_request", 413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        fail("invalid_request", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function metadata(config) {
  return {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/oauth/authorize`,
    token_endpoint: `${config.issuer}/oauth/token`,
    revocation_endpoint: `${config.issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SCOPES,
    authorization_response_iss_parameter_supported: true,
  };
}
export function callback(uri, config, state, result) {
  const url = new URL(uri);
  for (const [k, v] of Object.entries({ ...result, state, iss: config.issuer }))
    url.searchParams.set(k, v);
  return url.href;
}
