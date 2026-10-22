# #104 — ENQIDU Remote MCP & Semantic Read API V1

Base: `90dfd15f497abb26eb0953c5b934b8c01e21d3ac`. One registry, one runtime, two transports. No migration, production write, OAuth configuration change, deployment or paid service is part of this PR.

See [validation and captured product evidence](validation-104.md), [the exact tool manifest](remote-mcp.md#exact-remote-discovery), and [manual rollout prerequisites](oauth-production-runbook.md).

```text
ChatGPT / future agent ── HTTPS /api/mcp ── OAuth resource boundary
                                              │
Local client ── stdio ─────────────────────────┤
                                              ▼
                                  createEnqiduMcpServer
                                              │
App / internal Coach ─────────────── ENQIDU_TOOLS + schemas
                                              │
                                  createEnqiduToolRuntime
                                  getUser + profiles.timezone
                                              │
                                  createEnqiduReadDomain
                                              │
                         Progress / catalog / normalization domains
                                              │
                          request-scoped user bearer Supabase client
                                              │
                                     Supabase + RLS

OAuth client ── Supabase Auth authorization code + PKCE
                           │
                  /oauth/consent (ENQIDU)
                  getAuthorizationDetails
                  approveAuthorization / denyAuthorization
                           │
                Supabase-returned redirect_url only
```

## Deployment topology and lifecycle

The existing Vercel Node.js infrastructure serves `api/mcp.js`; a small metadata entry point and a rewrite serve RFC 9728. `/oauth/consent` uses the existing Vite frontend. No Node daemon, shared RAM, sticky session, additional database, event bus service or proxy is required. The branch is explicitly disabled in `vercel.json` to prevent Git-triggered previews.

`@modelcontextprotocol/server`, client and core remain pinned at **2.3.1**. The installed SDK's `createMcpHandler` constructs a new shared ENQIDU server for every HTTP request. Modern `2026-07-28` exchanges use the per-request envelope; the SDK's `legacy: 'stateless'` path supports its 2025 initialization lifecycle without session IDs. Legacy GET/DELETE session operations are unavailable (405). No subscriptions, sampling, resources, persistence or server-initiated exchanges are advertised. The handler consumes the bounded response before closing its request resources. Local stdio remains unchanged.

## Authentication and authorization

The boundary calls Supabase `auth.getUser()` for each request, using only a public/publishable key and the caller's bearer. Only after Auth has verified that token are its signed claims used for policy: matching `sub`, issuer, authenticated role, valid `exp`/`nbf`, nonempty OAuth `client_id`, nonnil UUID `session_id`, and exact MCP resource audience. Runtime discovery/calls authenticate again and load profile timezone. No identity, timezone, capabilities or credential can enter through tool arguments or metadata.

Supabase's documented default OAuth audience is `authenticated`, which alone is insufficient for MCP resource binding. The rollout must issue `aud: ["authenticated", "https://<ENQIDU-host>/api/mcp"]` for the approved MCP OAuth clients. Keeping `authenticated` first is necessary for Supabase Auth `UserGet`'s audience check. The resource server deliberately rejects default, unbound OAuth tokens. See the [production runbook](oauth-production-runbook.md): an audience hook requires a separately reviewed production configuration/code step if native resource binding is unavailable. This PR does not install it.

`session_id` is mandatory so Auth can check the backing session. Revocation is delegated to online Auth checks, with no local positive authentication cache. The real local Supabase Auth test verifies audience-array acceptance and rejection after session revocation. Actual production OAuth grant/session revocation must be verified during rollout; a fixture returning 401 is not evidence of a live issuer's revocation latency.

Remote writes are hardcoded false. Neither an environment variable nor a client declaration can enable them. No `adminDb`, service credential or audit writer is passed. Every guessed apply is denied by the runtime. RLS remains an additional defense; this boundary does **not** change database policies or claim that OAuth tokens cannot access other Supabase APIs under existing RLS.

## Semantic read API

The five tools in [remote-mcp.md](remote-mcp.md) project the canonical catalog, materialization quality and Progress domain. `loadProgressDomain` extracts the existing complete load/aggregation phase from `loadProgress`; the App's existing compact projection remains unchanged. There is no alternate progress calculator.

Exercise best metrics and trends are returned at the top level only for a single compatible variant. Multiple execution/unit/side/tempo groups remain explicit `variants`; incompatible groups are never combined into a best metric. Records and evidence are complete within bounds or fail with `output_limit_exceeded`. History has a 366-day range and a maximum of 50 observations, default 20. Overflow requires narrower dates; no silent partial history. The overview deliberately declares sampled detail while its aggregate counts use all rows. Notes are bounded with `notes_truncated`.

App, Coach, local MCP and remote MCP share tools, schemas and domain. Sporting outputs are identical. Traceability differs by channel; semantic-preview fingerprints are intentionally different because each MCP server has an ephemeral inspection-only signing key. Such a preview cannot authorize an App write; the App must prepare its own preview. Tests compare all other semantic fields.

## Threat model

| Threat | Boundary / evidence |
|---|---|
| Cross-athlete session/history/progress | Verified bearer; owned parent queries before children; explicit ownership filters; RLS; two-athlete tests |
| Frontend token reused as MCP credential | Mandatory signed OAuth `client_id`, session and MCP audience; frontend tokens rejected |
| Forged claim / expired / revoked bearer | Online `getUser`, signature-verifying HTTP Auth fixture, claim tampering and per-request revocation tests |
| Escalation to writes | Literal `writesEnabled: false`, no privileged dependency, discovery excludes every apply; guessed applies denied |
| SQL or arbitrary RPC | Closed registry and additionalProperties=false; fixed domain queries; no database tool |
| Stored prompt injection | Notes/titles/reported names remain structured data; never descriptions, instructions, schemas or query code |
| Resource abuse | 32 KiB HTTP body, 8 KiB tool arguments, 128 KiB result envelope, domain row/cardinality bounds, 60s function limit |
| DNS rebinding / browser origin | SDK Host validation against configured resource hostname; exact same-origin browser policy; no wildcard CORS or credentials |
| Secret leakage | Sanitized auth/domain errors; server-owned URLs; no incoming bearer/args/results/identity in logs |
| OAuth redirect tampering | Only official Supabase API response redirect; reject credentials and unsafe schemes; ignore query redirect_uri |

Telemetry contains only request_id, tool_id, tool_version, status, duration_ms, error_code and `transport=remote_mcp`. Unknown tool names are normalized to `unknown`. The Vercel entry point logs only this allowlist.

Incremental spend for this work: **€0.00**. Local fixtures run in the provided execution environment. Future rollout must remain within existing Vercel/Supabase free allowances; no unlimited-traffic cost guarantee is implied. No paid branch, model, hosting or database has been requested.
