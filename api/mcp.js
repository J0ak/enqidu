import { createRemoteMcpHandler } from "../src/mcp/remote.js";
import { remoteConfiguration } from "../src/mcp/remoteAuth.js";

// Vercel Node.js Web handler; the SDK reads the original bounded stream.
export async function POST(request) {
  return serve(request);
}
export async function GET(request) {
  return serve(request);
}
export async function DELETE(request) {
  return serve(request);
}
export async function PUT(request) {
  return serve(request);
}
export async function PATCH(request) {
  return serve(request);
}
export async function OPTIONS(request) {
  return serve(request);
}
export async function HEAD(request) {
  return serve(request);
}
async function serve(request) {
  try {
    return await createRemoteMcpHandler({
      config: remoteConfiguration(),
      observe: (event) => console.info(JSON.stringify(event)),
    })(request);
  } catch {
    return Response.json(
      { error: "server_configuration_error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
