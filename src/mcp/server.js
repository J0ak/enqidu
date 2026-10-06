import { ProtocolError, Server } from "@modelcontextprotocol/server";
import { ENQIDU_TOOLS_VERSION, TOOL_VERSION, listEnqiduTools } from "../enqiduTools/registry.js";
import { MAX_TOOL_OUTPUT_BYTES, createEnqiduToolRuntime } from "../enqiduTools/runtime.js";

export const ENQIDU_MCP_VERSION = "1.0.0";
export const MCP_MAX_ARGUMENT_BYTES = 8192;
export const MCP_MAX_RESULT_BYTES = MAX_TOOL_OUTPUT_BYTES;

// Only trusted server configuration can enable this. Tool arguments and MCP
// request metadata never participate in capability or identity selection.
export function mcpWritesEnabled(environment = {}) {
  return environment.ENQIDU_MCP_WRITES_ENABLED === "true";
}

export function listEnqiduMcpTools({ writesEnabled = false } = {}) {
  return listEnqiduTools({ includeWrites: writesEnabled === true }).map((tool) => ({
    name: tool.id,
    description: tool.description,
    inputSchema: tool.input_schema,
    outputSchema: tool.output_schema,
    annotations: {
      readOnlyHint: tool.access !== "write",
      destructiveHint: tool.access === "write",
      idempotentHint: tool.access !== "write",
      openWorldHint: false,
    },
    _meta: {
      "enqidu/tool_version": tool.version,
      "enqidu/access": tool.access,
      "enqidu/authentication": tool.authentication,
    },
  }));
}

function failure(tool, context, code, safeMessage) {
  return {
    tool: tool?.id || "unknown",
    tool_version: TOOL_VERSION,
    ok: false,
    data: null,
    warnings: [],
    evidence: [],
    traceability: {
      request_id: context.request_id,
      source: "mcp",
      registry_version: ENQIDU_TOOLS_VERSION,
      domain_handler: tool?.domain_handler || "unknown",
    },
    generated_at: context.generated_at,
    calendar_date: context.request_calendar_date,
    timezone: context.profile_timezone,
    error: { code, safe_message: safeMessage },
  };
}

function transportResult(result) {
  const encoded = JSON.stringify(result);
  return {
    content: [{ type: "text", text: encoded }],
    structuredContent: result,
    isError: result.ok !== true,
  };
}

/**
 * Authenticated, transport-only MCP adapter. db must be a request-scoped ENQIDU
 * bearer client. The domain runtime validates db.auth.getUser on every request.
 * adminDb is optional trusted SERVER dependency, never a remote argument; the
 * shipped local executable deliberately provides none.
 */
export function createEnqiduMcpServer({
  db,
  adminDb,
  writesEnabled = false,
  now,
  observe,
} = {}) {
  const writes = writesEnabled === true;
  const manifest = new Map(listEnqiduTools().map((tool) => [tool.id, tool]));
  const runtime = () => createEnqiduToolRuntime({
    db,
    adminDb,
    source: "mcp",
    capabilities: { writes },
    ...(now == null ? {} : { now }),
    ...(observe == null ? {} : { observe }),
  });

  const server = new Server({ name: "enqidu", version: ENQIDU_MCP_VERSION }, {
    capabilities: { tools: {} },
    instructions: "ENQIDU is authoritative for training state. Preview tools do not mutate. "
      + "Show before/after and obtain explicit athlete acceptance before any apply. "
      + "The athlete profile determines calendar dates and timezone. "
      + "Health outputs are bounded canonical evidence, never raw provider data.",
  });

  server.setRequestHandler("tools/list", async () => {
    try {
      // Discovery is also authenticated. Do not reuse a previous auth result
      // after token expiry, revocation, or a changed underlying bearer client.
      await runtime();
      return { tools: listEnqiduMcpTools({ writesEnabled: writes }) };
    } catch {
      throw new ProtocolError(-32001, "ENQIDU authentication required.");
    }
  });

  server.setRequestHandler("tools/call", async (request) => {
    const tool = manifest.get(request.params.name);
    let execution;
    try {
      execution = await runtime();
    } catch {
      throw new ProtocolError(-32001, "ENQIDU authentication required.");
    }
    let result;
    try {
      // The closed runtime handles unknown names, schemas, argument/output
      // bounds, denied calls and telemetry. Its MCP write capability is locked
      // above to trusted configuration, never request fields or annotations.
      // Preserve the runtime's bounded acknowledged-write receipt; a transport
      // must not convert a committed success into a misleading size failure.
      result = await execution.execute(request.params.name, request.params.arguments ?? {});
    } catch {
      // Never serialize exceptions: SDK/database/auth errors can contain keys,
      // request URLs, SQL, provider payloads or stack traces.
      result = failure(tool, execution.context, "tool_unavailable", "The authenticated ENQIDU request could not be completed.");
    }
    return transportResult(result);
  });

  return server;
}
