import { createEnqiduToolRuntime } from "./runtime.js";
import { safeToolError, toolError } from "./errors.js";
import { matchesSchema, objectSchema } from "./schema.js";

export const ENQIDU_TOOL_HTTP_HEADERS = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json", "Cache-Control": "no-store",
});
const requestSchema = objectSchema({ tool: { type: "string", minLength: 1, maxLength: 100 }, arguments: { type: "object", maxProperties: 8 } });
async function boundedJson(request) {
  if (!request.body) throw toolError("invalid_request");
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 16384) { await reader.cancel(); throw toolError("request_too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw toolError("invalid_request"); }
}

/** Dependency injection is server-only. Request bodies cannot select clients or identity. */
export function createEnqiduToolsHttpHandler({ createClients, observe, now } = {}) {
  return async (request) => {
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: ENQIDU_TOOL_HTTP_HEADERS });
    if (request.method === "OPTIONS") return new Response("ok", { headers: ENQIDU_TOOL_HTTP_HEADERS });
    if (request.method !== "POST") return reply({ ok: false, error: safeToolError("method_not_allowed") }, 405);
    try {
      const authorization = request.headers.get("Authorization");
      if (!/^Bearer\s+\S+$/i.test(authorization || "")) throw toolError("auth_required");
      const body = await boundedJson(request);
      if (!matchesSchema(body, requestSchema)) throw toolError("invalid_request");
      const { db, adminDb } = await createClients({ authorization, needsWriter: body.tool.startsWith("apply_") });
      const runtime = await createEnqiduToolRuntime({ db, adminDb, source: "app", now, observe });
      const result = await runtime.execute(body.tool, body.arguments);
      return reply(result, result.ok ? 200 : result.error.code === "preview_stale" ? 409 : 400);
    } catch (error) {
      const safe = safeToolError(error);
      return reply({ ok: false, error: safe }, ["auth_required", "invalid_user"].includes(safe.code) ? 401 : safe.code === "request_too_large" ? 413 : 400);
    }
  };
}
