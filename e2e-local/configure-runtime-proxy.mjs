import http from "node:http";

// Docker's configured proxy defaults can append duplicate Env entries after the
// CLI's .env file. Recreate only this disposable project's Edge container through
// the local Engine API, preserving its config and all existing proxy credentials.
const name = "supabase_edge_runtime_enqidu-e2e";
function engine(method, path, data, binaryResponse = false) {
  return new Promise((resolve, reject) => {
    const body = data === undefined ? null : Buffer.isBuffer(data) ? data : JSON.stringify(data);
    const request = http.request({ socketPath: "/var/run/docker.sock", method, path,
      headers: body ? { "Content-Type": Buffer.isBuffer(data) ? "application/x-tar" : "application/json", "Content-Length": Buffer.byteLength(body) } : {},
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const bytes = Buffer.concat(chunks);
        const text = binaryResponse ? null : bytes.toString("utf8");
        resolve({ status: response.statusCode, data: binaryResponse ? bytes : text ? JSON.parse(text) : null });
      });
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}
const inspected = await engine("GET", `/containers/${name}/json`);
if (inspected.status !== 200 || !inspected.data?.State?.Running) throw new Error("Start the disposable local Edge runtime before configuring its proxy.");
const current = inspected.data;
if (current.Name !== `/${name}` || !current.Config.Image.includes("supabase/edge-runtime")) throw new Error("Unexpected local runtime; refusing to change it.");
const mounts = current.HostConfig.Binds || [];
if (!mounts.some((mount) => mount.includes("/enqidu/e2e-local/supabase/functions:"))) throw new Error("Runtime must mount the disposable enqidu E2E functions.");
const values = new Map((current.Config.Env || []).map((entry) => {
  const separator = entry.indexOf("=");
  return [entry.slice(0, separator), entry.slice(separator + 1)];
}));
const bypass = new Set([...(values.get("NO_PROXY") || "").split(","), ...(values.get("no_proxy") || "").split(","),
  "localhost", "127.0.0.1", "::1", "kong", "auth", "rest", "db"]);
const localBypass = [...bypass].filter(Boolean).join(",");
values.set("NO_PROXY", localBypass);
values.set("no_proxy", localBypass);
values.set("OPENAI_COACH_ENABLED", "false");
const config = { ...current.Config, Env: [...values].map(([key, value]) => `${key}=${value}`), HostConfig: current.HostConfig,
  NetworkingConfig: { EndpointsConfig: Object.fromEntries(Object.entries(current.NetworkSettings.Networks).map(([network, endpoint]) => [network,
    { Aliases: endpoint.Aliases, Links: endpoint.Links, DriverOpts: endpoint.DriverOpts, IPAMConfig: endpoint.IPAMConfig }])) },
};
// The CLI streams its main service into the writable container layer rather
// than mounting it. Preserve that unchanged file too, without writing config or
// credentials to disk. The declared user function bundles remain read-only binds.
const main = await engine("GET", `/containers/${current.Id}/archive?path=%2Froot%2Findex.ts`, undefined, true);
if (main.status !== 200 || main.data.length > 4 * 1024 * 1024) throw new Error("Cannot preserve the local CLI main service.");
await engine("POST", `/containers/${current.Id}/stop?t=2`);
// The serve supervisor owns its old container. Let it finish removal before
// recreating the same local name so it cannot remove the replacement by name.
let removed = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  if ((await engine("GET", `/containers/${current.Id}/json`)).status === 404) { removed = true; break; }
}
if (!removed) throw new Error("Stop the functions-serve supervisor before recreating the disposable runtime.");
const created = await engine("POST", `/containers/create?name=${name}`, config);
if (created.status !== 201) throw new Error(`Local runtime recreation failed (Docker HTTP ${created.status}).`);
const copied = await engine("PUT", `/containers/${created.data.Id}/archive?path=%2Froot`, main.data);
if (copied.status !== 200) throw new Error(`Local CLI main preservation failed (Docker HTTP ${copied.status}).`);
const started = await engine("POST", `/containers/${created.data.Id}/start`);
if (started.status !== 204) throw new Error(`Local runtime startup failed (Docker HTTP ${started.status}).`);
console.log("Disposable local Edge runtime uses unique Env entries and local-service NO_PROXY; existing proxy configuration preserved, OpenAI disabled.");
