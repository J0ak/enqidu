import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CLIENTS, fail } from "./protocol.js";
export function publicIPv4(ip) {
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return (
    a > 0 &&
    a < 224 &&
    a !== 10 &&
    a !== 127 &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 168 || b === 0)) &&
    !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 198 && (b === 18 || b === 19 || b === 51)) &&
    !(a === 203 && b === 0)
  );
}
// HTTPS with pinned, validated DNS result: no redirects, cookies, bearer or recursive JWKS fetch.
export async function fetchCimd(
  url,
  { resolve = lookup, get = https.get, timeoutMs = 4000 } = {},
) {
  if (!Object.hasOwn(CLIENTS, url)) fail("invalid_client");
  const signal = AbortSignal.timeout(timeoutMs);
  const addresses = await Promise.race([
    resolve(new URL(url).hostname, { all: true, family: 4 }),
    new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(Error("timeout")), {
        once: true,
      }),
    ),
  ]);
  if (!addresses.length || addresses.some((a) => !publicIPv4(a.address)))
    fail("invalid_client");
  return new Promise((resolve, reject) => {
    const req = get(
      url,
      {
        signal,
        headers: { Accept: "application/json" },
        lookup: (host, options, cb) =>
          cb(null, options.all ? [addresses[0]] : addresses[0].address, 4),
      },
      (res) => {
        if (
          res.statusCode !== 200 ||
          !/^application\/json(?:;|$)/i.test(
            res.headers["content-type"] || "",
          ) ||
          Number(res.headers["content-length"]) > 16384
        ) {
          res.destroy();
          reject(Error("metadata"));
          return;
        }
        let size = 0;
        const chunks = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 16384) {
            res.destroy();
            reject(Error("metadata"));
          } else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(Error("metadata"));
          }
        });
      },
    );
    req.on("error", reject);
  });
}
export async function clientMetadata(id, fetchDocument = fetchCimd) {
  const approved = Object.hasOwn(CLIENTS, id) && CLIENTS[id];
  if (!approved) fail("invalid_client");
  try {
    const doc = await fetchDocument(id);
    if (
      !doc ||
      JSON.stringify(doc).length > 16384 ||
      doc.client_id !== id ||
      typeof doc.client_name !== "string" ||
      doc.client_name.length > 200 ||
      !Array.isArray(doc.redirect_uris) ||
      doc.redirect_uris.length < 1 ||
      doc.redirect_uris.length > 5 ||
      doc.redirect_uris.some((u) => !approved.redirects.includes(u)) ||
      !Array.isArray(doc.grant_types) ||
      !doc.grant_types.includes("authorization_code") ||
      !doc.grant_types.includes("refresh_token") ||
      !Array.isArray(doc.response_types) ||
      !doc.response_types.includes("code")
    )
      fail("invalid_client");
    const methods = doc.token_endpoint_auth_methods_supported ?? [
      doc.token_endpoint_auth_method,
    ];
    if (
      !Array.isArray(methods) ||
      methods.length > 10 ||
      !methods.includes("none")
    )
      fail("invalid_client");
    return { client_id: id, name: approved.name, redirects: doc.redirect_uris };
  } catch {
    fail("invalid_client");
  }
}
