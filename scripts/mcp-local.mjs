import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createLocalMcpAuthClient, readLocalMcpConfiguration } from "../src/mcp/localAuth.js";
import { createEnqiduMcpServer, mcpWritesEnabled } from "../src/mcp/server.js";

try {
  const configuration = readLocalMcpConfiguration(process.env);
  const db = await createLocalMcpAuthClient(configuration);
  const handle = serveStdio(() => createEnqiduMcpServer({
    db,
    writesEnabled: mcpWritesEnabled(process.env),
    observe(event) {
      // stdout belongs exclusively to the MCP protocol. Allow-list operational
      // metadata before writing stderr; never log arguments, results or JWTs.
      process.stderr.write(`${JSON.stringify({
        request_id: event.request_id,
        tool_id: event.tool_id,
        tool_version: event.tool_version,
        timestamp: event.timestamp,
        status: event.status,
        duration_ms: event.duration_ms,
        error_code: event.error_code,
      })}\n`);
    },
  }), {
    transport: new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 32_768 }),
    onerror() { process.stderr.write("ENQIDU MCP protocol error.\n"); },
  });
  process.once("SIGINT", () => { void handle.close(); });
  process.once("SIGTERM", () => { void handle.close(); });
} catch {
  process.stderr.write("ENQIDU MCP startup failed. Check local URL, public key and authenticated athlete token.\n");
  process.exitCode = 1;
}
