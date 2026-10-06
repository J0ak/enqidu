import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createEnqiduMcpServer } from "../../src/mcp/server.js";

/** Real SDK wire transport, sharing the production domain adapter. No LLM. */
export async function connectEnqiduMcp(options) {
  const server = createEnqiduMcpServer(options);
  const client = new Client({ name: "enqidu-local-contract-tests", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client, async close() { await client.close(); await server.close(); } };
}
