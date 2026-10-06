# ENQIDU MCP V1

MCP is a transport over ENQIDU Tools V1. It has no SQL, provider access, training
algorithm, planning rule or mutation implementation of its own. The MCP tool
name is the domain registry ID; `tools/call` creates an authenticated runtime
and delegates to `runtime.execute(id, arguments)`.

Related contracts: [ENQIDU Tools V1](./enqidu-tools-v1.md) and
[action preview/apply](./enqidu-action-preview-v1.md).

```text
MCP client → official SDK → authenticated adapter → ENQIDU Tools registry/runtime
                                                  ↓
                                      existing ENQIDU domain/Coach Actions
```

The implemented executable is **local stdio only**. No HTTP listener, hosted MCP
service, OAuth issuer, production endpoint, paid API or OpenAI call is added.
The included executable refuses non-loopback Supabase URLs.

## SDK and compatibility

The npm metadata and official README were inspected on 2026-10-05. The current
stable official SDK is `@modelcontextprotocol/server@2.3.1` (Node >=20), compatible
with ENQIDU Node 22. It implements MCP 2026-07-28 and supports legacy clients via
the official `serveStdio` negotiation entrypoint. The older monolithic
`@modelcontextprotocol/sdk@1.32.1` is the maintenance line and was deliberately
not selected. The server package needs only Zod and the shared core package;
no Express, external hosting or framework adapter is needed. Exact versions and
the lockfile are committed. The official client and core schemas are test-only
dependencies for actual protocol and schema validation.

References: [official server package](https://www.npmjs.com/package/@modelcontextprotocol/server),
[SDK v2 documentation](https://ts.sdk.modelcontextprotocol.io/v2/),
[Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

## Tool surface

The manifest is projected by `listEnqiduMcpTools`; it cannot discover or execute
arbitrary JavaScript functions. Every tool declares its actual domain input and
output schema. Input objects reject additional fields, including `user_id`, SQL,
table/RPC names, timezone overrides and arbitrary mutation data.

| Classification | Tool names |
| --- | --- |
| Read | `get_athlete_context`, `get_today_plan`, `get_week_plan`, `get_recent_training`, `get_training_session`, `get_health_status`, `get_readiness`, `get_closed_loop_assessment`, `get_adaptation_proposal` |
| Preview | `preview_move_session`, `preview_adapt_duration`, `preview_adapt_environment`, `preview_cancel_session`, `preview_adapt_remaining_week`, `preview_closed_loop_proposal` |
| Apply, gated | `apply_move_session`, `apply_adapt_duration`, `apply_adapt_environment`, `apply_cancel_session`, `apply_adapt_remaining_week`, `apply_closed_loop_proposal` |

The default discovery response has 15 tools. The six apply tools are omitted
when the gate is off, and guessed direct calls are also rejected. Returning an
annotation is never an authorization decision.

| Annotation | Read/preview | Apply |
| --- | --- | --- |
| `readOnlyHint` | `true` | `false` |
| `destructiveHint` | `false` | `true` (existing state is changed) |
| `idempotentHint` | `true` | `false` (a replay must revalidate/stale-fail) |
| `openWorldHint` | `false` | `false` |

MCP returns the identical domain envelope in `structuredContent` and serialized
in text content for compatible clients. Domain failures set `isError: true`.
Transport failures have fixed safe error codes/messages; exception messages,
stack traces and underlying SQL are never serialized. The adapter caps arguments
at 8 KiB and the shared runtime bounds a domain result at 128 KiB; the local transport caps inbound buffered
data at 32 KiB. Domain-specific array/date limits apply first. Oversized results
fail closed instead of truncating evidence into misleading success. An action
already acknowledged by the existing writer retains a bounded successful receipt
and warning if its result details cannot be returned; no transport size check
can turn an acknowledged commit into a misleading failure.

## Authentication boundary

Credentials are supplied by the local process owner, outside the tool arguments:

```text
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<local public anon/publishable key>
ENQIDU_MCP_ACCESS_TOKEN=<access token of an existing local ENQIDU athlete>
ENQIDU_MCP_WRITES_ENABLED=false
```

Set these variables in the local MCP client's environment or an untracked local
environment file. Do not commit tokens or paste them into tool arguments. Launch
the server directly with `node scripts/mcp-local.mjs`; `npm run mcp:local` is a
convenience terminal command, but clients using stdio should invoke Node directly
to avoid npm's script banner on stdout. The process logs safe metadata to stderr.

The client uses only the public key and the athlete Bearer token. Supabase
`auth.getUser()` performs server verification, initially and through each domain
runtime request. A decoded JWT is never an identity authority. The small legacy
key-role check only refuses privileged **configuration** keys; it is not a JWT
verification mechanism. No service key, password, admin client, token refresh,
session persistence or provider credential is read by the executable.

The authenticated user is loaded by the shared runtime, as is the profile
timezone and its canonical calendar day. The caller's device/ChatGPT timezone
cannot override them. Discovery requires authentication as well. Runtime
instances are request scoped; one athlete's context is never cached globally or
reused for another request.

The embeddable `createEnqiduMcpServer` accepts a trusted bearer-scoped `db` client
and optional server-owned action capability. These are backend dependencies, not
MCP parameters. A future remote adapter must create the correct bearer client
after validating every request; sharing a privileged or different user's client
is forbidden.

## Apply gate and explicit acceptance

`ENQIDU_MCP_WRITES_ENABLED=false` is the default. Only the exact trusted environment
string `true` enables local discovery of apply; strings such as `1`, `TRUE` or
`yes` do not. Both the MCP adapter and shared runtime enforce the write gate.
Tool arguments and MCP `_meta` cannot enable it.

Enabling the gate does **not** grant database write authority. The shipped local
executable has no admin action client, so an apply still fails safely when the
existing privileged Coach Action dependency is unavailable. Trusted backend
embedding may provide that existing dependency; it must not expose it to clients.
The domain still requires explicit confirmation, fresh state validation and a
matching preview fingerprint. The fingerprint is consistency evidence, never an
authentication or authorization token. `expires_at` is unsigned client-returned
metadata, not proof that the server issued a preview or that a human reviewed it.
Preview never writes.

**Strict atomic TOCTOU protection remains a write-rollout blocker.** Rebuilding
the preview and comparing fingerprints catches state changed before the final
preflight read, but existing writer RPCs do not compare a revision/fingerprint
inside the same transaction. A concurrent edit between that read and the RPC can
still win the race; duration/environment RPCs also lack a cancelled-state guard.
This epic does not change their schema or claim atomic compare-and-swap. Before
enabling any new write surface, review and resolve these existing RPC limitations
in a separately authorized database change, then add concurrent transaction tests.
The transport feature gate must remain off until that blocker is resolved.

For current local use: inspect reads/previews through MCP, then review and apply
through ENQIDU's authenticated explicit acceptance flow. No unattended mutation
is enabled by this epic.

## Remote deployment is blocked

This repository does not yet provide the remote MCP authorization/discovery
infrastructure required for connecting ChatGPT. A local Supabase JWT is useful
for local tests; it is not an invented OAuth authorization server.

Before any later remote rollout, separately implement and review the real MCP
authorization mechanism, issuer/audience/resource validation, per-request token
validation, discovery metadata, origin/host protections and the client consent
flow using the deployment's actual infrastructure. Then verify read/preview
parity in staging with writes still disabled. Remote hosting and any mutation
enablement are separate product/security decisions. Nothing here deploys an Edge
Function, changes production variables or purchases hosting.

## Observability, tests and limitations

Domain observations include request ID, tool/version, timestamp, status, optional
duration and safe error code. The local script allow-lists those fields before
stderr output. It never logs arguments, JWTs, full biometric results or provider
payloads. No persistent audit database or paid observability service is created.

Run `npm run test:mcp` for official SDK in-memory integration contracts: discovery,
JSON schemas, malformed/unknown calls, identity injection, gate enforcement,
safe errors, bounded responses, deterministic domain results, App/MCP parity and
authenticated isolation. These tests do not use an OpenAI key or paid service.
The full repository suite, Coach evals, build and local E2E remain required.
The actual stdio executable is also tested with the official SDK client against
a loopback auth fixture: every invocation sends the athlete Bearer token to the
auth boundary, revocation is rechecked, and operational events stay on stderr.

Limitations: local tokens expire and require the developer to supply a new token;
the executable does not refresh or store sessions. MCP does not persist invocation
history. Remote OAuth/hosting is intentionally unimplemented. SDK upgrades must
repeat protocol compatibility and safe-envelope tests. Existing domain atomicity
constraints remain authoritative; the transport never bypasses them.
