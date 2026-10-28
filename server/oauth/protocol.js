import { randomBytes, createHash } from "node:crypto";
import {
  CHATGPT_CLIENT_ID,
  CLAUDE_CLIENT_ID,
  OAUTH_CLIENTS,
  OAUTH_CLIENT_IDS,
} from "../../src/oauth/clients.js";
// CLIENT_ID remains the ChatGPT identifier for existing callers and tests.
export const CLIENT_ID = CHATGPT_CLIENT_ID;
export { CLAUDE_CLIENT_ID };
export const CLIENTS = OAUTH_CLIENTS;
export const CLIENT_IDS = OAUTH_CLIENT_IDS;
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
  // Exact repeats of an approved scope grant nothing extra (some clients append
  // offline_access to advertised scopes); unknown or empty entries still fail.
  if (
    !result.includes("enqidu.read") ||
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
