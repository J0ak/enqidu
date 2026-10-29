# #104 — ENQIDU Remote MCP & Semantic Read API V1

ENQIDU now owns the OAuth authorization server. **ChatGPT receives only opaque ENQIDU tokens, never a Supabase access token.** The code is merged into `main` (`49c719c`); production configuration and operational acceptance are not verified — see [Rollout status](remote-mcp.md#rollout-status). [Supabase OAuth issuance was rejected](rejected-supabase-oauth.md) after real account-mutation evidence.

```text
ChatGPT
  ↓ OAuth authorization code + PKCE S256 + approved CIMD
ENQIDU Authorization Server (existing Vercel Node functions)
  ↓ opaque token → SHA-256 lookup in mcp_private (existing Supabase DB)
ENQIDU Remote MCP (/api/mcp, SDK Streamable HTTP stateless)
  ↓ verified grant user_id
server-only restricted read facade
  ↓ ENQIDU_TOOLS / createEnqiduToolRuntime / createEnqiduReadDomain
canonical Progress / catalog / normalization domains
  ↓ explicit owned-parent traversal and athlete filters
Supabase

Browser → existing Supabase first-party session → ENQIDU Consent UI
  ↓ Authorization bearer to ENQIDU decision API, online auth.getUser()
ENQIDU Authorization Server → stored request → grant/code

Local client → stdio → same createEnqiduMcpServer / registry / runtime
App / Coach → same runtime and canonical domain
```

## Identity, credentials and scopes

The athlete has one existing Supabase identity. First-party authentication remains unchanged. Consent APIs validate the normal browser session online; the browser session is never stored in a grant, code, redirect or MCP credential. The remote runtime's auth adapter resolves the private grant on each authentication, including discovery/calls. It supplies only the verified user id. `profiles.timezone` remains authoritative. Arguments cannot change identity, resource, capabilities or credentials.

The server-configured issuer is `ENQIDU_OAUTH_ISSUER` (planned `https://enqidu.vercel.app`), with exact resource `ENQIDU_MCP_RESOURCE_URL` (planned `https://enqidu.vercel.app/api/mcp`). No Host-derived issuer. `resource` is required at authorize, code exchange and refresh, stored in the grant, and checked at every MCP request. Opaque records use this binding instead of a JWT audience.

`enqidu.read` is mandatory. Preview tools additionally require `enqidu.preview`; discovery remains exactly 27 tools. `offline_access` governs refresh issuance. No write scope, OIDC, UserInfo, ID token, DCR, client secret or private_key_jwt. Tool OAuth schemes are declared in descriptors and `_meta.securitySchemes`; insufficient preview permission carries `_meta["mcp/www_authenticate"]`.

## Authorization server and persistence

`server/oauth/handler.js` implements a deliberately closed public-client profile, using the official published ChatGPT CIMD. Client configuration has one exact entry: `https://chatgpt.com/oauth/client.json`. Metadata's plural methods include `none`; the legacy singular `private_key_jwt` preference is not a prohibition on `none`. The redirect must equal the published and locally approved `https://chatgpt.com/connector_platform_oauth_redirect` byte-for-byte. All successful/error callback responses include the exact issuer (`iss`, RFC 9207). Invalid client/redirect requests fail locally without redirection.

CIMD fetch permits only this HTTPS URL: no credentials, query, nonstandard port, arbitrary hosts or redirects. It resolves and pins public IPv4 addresses, rejects private/reserved addresses, validates TLS, times out in 4 seconds, and limits JSON to 16 KiB. It never recursively follows JWKS or logos. Metadata is re-fetched for authorization; subsequent token operations use the stored/approved binding. CIMD identifies a public client; it is **not cryptographic proof that any caller is ChatGPT**. Exact callback binding and PKCE prevent an untrusted caller from obtaining another authorization's code/token. Sender-constrained credentials are outside V1.

The new migration creates four tables in **unexposed `mcp_private`**, with RLS enabled and no table grants to anon/authenticated/service_role/runtime. Requests live 10 minutes and bind to the online-verified human when details are read. Codes live 5 minutes. Codes/access/refresh secrets contain 256 random bits and persist only SHA-256 hashes. Tokens reference a grant containing user/client/resource/scopes; identity is not duplicated across token records. `auth.users(id) ON DELETE CASCADE` invalidates grants/codes/tokens on account deletion. The resolver also checks `deleted_at` and `banned_until` in SQL, without Auth admin HTTP calls per tool.

Access TTL is 60 minutes. Rotated refresh TTL is 30 days, capped by a 90-day grant lifetime; reconnect after that absolute lifetime. Authorization-code consumption is one SQL transaction with locks. Refresh operations lock the grant, consume the old refresh and insert replacement hashes atomically. Replay returns `invalid_grant` **and commits grant revocation**; raising a transaction exception would wrongly undo that revocation. Concurrent refresh has one successful exchange but the confirmed replay invalidates its family too: clients must serialize refresh and reconnect after a lost response/replay. Old access tokens remain valid until their normal expiry unless the grant is revoked.

The dedicated `enqidu_mcp_oauth` role is created NOLOGIN with no password. Operators later provision its login for Supavisor transaction pooling. It receives schema usage and EXECUTE only on nine closed private functions. Internal helpers are not executable by it. SECURITY DEFINER is narrowly justified to keep direct table/Auth access out of the runtime credential while implementing atomic service operations; all functions have empty `search_path`, fixed SQL, explicit revokes and no dynamic SQL. Ordinary PostgreSQL PUBLIC privileges still exist; no application-table or Auth-table grants are added to this role. `pg` 8.16.3 moves from dev to runtime dependencies without a version change. Connections are short, TLS verified in production, with timeouts and no named prepared statements or RAM sessions.

Durable authorization admission is capped at 120 requests/minute globally; bounded opportunistic cleanup removes expired requests and grants. This is not complete distributed DoS mitigation: review Vercel quotas/rate controls before rollout. Expired token history is retained until grant expiry to detect refresh replay.

## Shared read plane and compatibility

`src/mcp/dataPlane.js` remains a closed capability facade over the existing server data credential. No Auth admin client, mutation or arbitrary RPC reaches the tools. Parent ownership is verified before child traversal; all 27 tools pass adversarial A/B parity using a data fixture without RLS. Only the small service-only semantic read adapter and canonical context JWT-role compatibility fix remain from the prior migration.

The five semantic reads still reuse Progress/catalog/materialization. Exact-only exercise resolution; incompatible metrics are kept separate; missing is not zero; skipped/planned is not execution. Bounds fail explicitly or declare sampling. App/Coach/local MCP sporting outputs match remote output apart from channel traceability and per-server preview fingerprints.

SDK server/client/core stay pinned at 2.3.1. Real HTTP tests cover modern 2026-07-28 and legacy 2025-11-25 via the SDK's stateless mode. No protocol reimplementation, sessions in RAM, sticky routing, persistent Node process or subscriptions. Local `npm run mcp:local` retains stdio and its current auth. Remote `writesEnabled:false` is unconditional; seven applies are absent/denied.

## Threat model

| Threat | Boundary |
|---|---|
| MCP token used against Supabase | Opaque non-JWT; no Supabase credential is delivered. Real Auth GET/PUT, REST, RPC and Edge rejection acceptance |
| Code interception or replay | S256 only, exact callback/client/resource, short TTL, atomic single use |
| Refresh theft/replay | Rotation, grant serialization, committed family revocation |
| Cross-athlete access | Grant-only identity, explicit data facade/domain ownership, all-27 privileged A/B suite |
| Consent tampering/CSRF | Stored request handle, online first-party Auth, same-origin/header auth, bound human, strict POST schema, no POST redirect authority |
| Deleted/banned athlete | FK cascade and current Auth-row checks on token resolution/refresh |
| SSRF/redirect attacks | Single exact CIMD/redirect allowlist, public DNS pinning, HTTPS, no redirects, size/time bounds |
| Secret leakage | Hash-only persistence, no-store/no-cache token responses, no body/token/identity logging, sanitized errors |
| SQL/writes/prompt injection | Closed tools and read facade, structured untrusted notes, strict schemas/bounds, no write capability |

OAuth telemetry is limited to request_id, known endpoint, bounded grant_type/client classification, status/error_code and duration_ms. MCP retains its existing allowlist. Public metadata permits credential-free CORS; data/consent endpoints retain Origin/Host restrictions. Storage production audit reported **0 buckets**; no Storage or Realtime changes. Before rollout, audit new public/bucket/channel policies: an opaque bearer cannot authenticate to Supabase, but it cannot make anonymously public data private.

Removed from the PR: global `client_id` RLS policies, PostgREST pre-request hook, the Garmin consent OAuth guard and all ten Edge OAuth guards. Existing first-party authorization remains intact. The new design does not need to alter 90 application tables to compensate for credential passthrough.

Incremental spend **€0.00**. Existing Vercel and Supabase only, no new DB/service/LLM. Manual configuration and hosted interoperability are still rollout prerequisites; see [runbook](oauth-production-runbook.md).
