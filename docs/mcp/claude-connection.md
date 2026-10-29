# Connecting Claude to ENQIDU

Status: **code ready for review, not operational.** The #104 remote MCP code is merged
into `main`, but its production configuration and acceptance are not verified (see
[rollout status](remote-mcp.md#rollout-status)). Nothing in this change deploys,
migrates, registers a client or changes Supabase/Vercel. The integration must not be
declared operational until a real OAuth connection from Claude Chat has completed
against the deployed endpoint (see [acceptance](#acceptance-criteria)).

Claude Chat (claude.ai web, Desktop and mobile) connects to the same remote MCP
endpoint and the same 27 READ/PREVIEW tools as ChatGPT. Claude's subscription is the
language interface; ENQIDU remains the authoritative domain and data source. No
OpenAI or Anthropic API key, model call or paid service is involved on the ENQIDU side.

## How Claude authenticates

| Item | Value |
|---|---|
| MCP URL entered in Claude | `https://enqidu.vercel.app/api/mcp` |
| Client registration | Client ID Metadata Document (CIMD), no DCR, no client secret |
| Approved `client_id` | `https://claude.ai/oauth/mcp-oauth-client-metadata` |
| Approved callback | `https://claude.ai/api/mcp/auth_callback` (exact) |
| Grant | authorization code + PKCE S256, public client (`none`), RFC 8707 `resource`, RFC 9207 `iss` |
| Scopes | `enqidu.read` (required), `enqidu.preview`, `offline_access` |
| Credentials | ENQIDU opaque `enq_mcp_at_`/`enq_mcp_rt_`; Claude never receives a Supabase session |

Claude selects CIMD because ENQIDU's RFC 8414 metadata advertises
`client_id_metadata_document_supported: true` and `none` in
`token_endpoint_auth_methods_supported`. ENQIDU exposes no `registration_endpoint`,
so Claude cannot fall back to Dynamic Client Registration.

The allowlist is closed and lives in code (`src/oauth/clients.js`): exactly ChatGPT and
hosted Claude. Claude Code's loopback client
(`https://claude.ai/oauth/claude-code-client-metadata`, `http://localhost/callback`) is
**not** approved. Any other `client_id` or callback is rejected before any redirect.

Claude appends `offline_access` to the scopes it discovers. Exact repeats of an approved
scope are canonicalized instead of rejected; unknown, empty or write scopes still fail.

## Separation between clients and athletes

- Authorization requests, grants, codes and tokens are bound to one `client_id` in
  `mcp_private`. A code or refresh token issued to Claude cannot be redeemed by ChatGPT
  (or vice versa); RFC 7009 revocation from the wrong client revokes nothing.
- Each grant belongs to one athlete. The remote MCP resolves the token online on every
  request, probing only the closed allowlist, and takes identity exclusively from the
  grant. Tool arguments cannot select a user, timezone, client or capability.
- Revoking Claude does not affect ChatGPT. `/oauth/connections` names each connection
  ("Claude", "ChatGPT") so the athlete revokes the intended one.
- Remote writes stay unconditionally disabled; all `apply_*` tools are absent from
  discovery and denied if guessed.

## Connect from Claude (after deployment is authorized)

1. In Claude open **Customize → Connectors → Add custom connector**. The Free plan
   allows one custom connector; Pro allows more.
2. Enter `https://enqidu.vercel.app/api/mcp`. If asked for the OAuth client, choose
   **Use Claude's published identity**. Leave client ID/secret empty.
3. Claude opens ENQIDU's consent page. Sign in with the ENQIDU account, check that it
   says **Claude**, shows the destination `https://claude.ai/api/mcp/auth_callback` and
   that **Permisos solicitados** includes both `enqidu.read` and `enqidu.preview`
   (normally also `offline_access`), then approve. See
   [required initial scopes](#required-initial-scopes).
4. In a conversation, enable the connector from **+ → Connectors**. Keep per-tool
   approval on until the connector has been validated; do not use "Always allow" for
   preview tools at first.

### Required initial scopes

The initial Claude consent **must include `enqidu.read` and `enqidu.preview`**. Claude
requests the scopes advertised by ENQIDU's protected-resource metadata, so a normal
connection asks for `enqidu.read enqidu.preview offline_access`. ENQIDU's consent page
approves or denies the requested set as a whole; it does not drop scopes.

If a connection was granted without `enqidu.preview`, the 19 read tools work but the 8
preview-access tools (`interpret_training_correction_v1` and the `preview_*` tools)
return `insufficient_scope`. ENQIDU reports this as a tool error
(HTTP 200), and Claude only starts re-authorization on an HTTP 401/403 challenge, so it
will **not** prompt to add the scope by itself. Temporary workaround, manual:

1. Revoke the Claude connection at `/oauth/connections` → **Revocar acceso**.
2. Remove the connector in Claude (**Customize → Connectors**) and add it again.
3. Reconnect and confirm the consent page lists `enqidu.preview` before approving.

Changing the HTTP challenge behaviour for step-up authorization is deliberately out of
scope for this change.

Revoke server-side at `/oauth/connections` → **Revocar acceso** on the Claude entry.
Removing the connector in Claude alone is not proof of server revocation.

Privacy: tool results (training, plans, health summaries) are sent to Anthropic as
conversation content. Review Claude's privacy settings (model-improvement / training
use of chats) before connecting real health data. This is the athlete's decision.

## Deployment requirements

Claude adds **no** new environment variable, secret, migration or paid resource. It
depends entirely on the #104 production configuration. The #104 code is merged into
`main`; whether production runs it and is configured is not verified.

### Pending configuration (known not done; separate authorization required)

Per the [production runbook](oauth-production-runbook.md):

- Supabase: apply `20261023150630_mcp_private_oauth_v1.sql`; enable LOGIN with a strong
  password only for `enqidu_mcp_oauth` through the existing Supavisor transaction
  pooler. Supabase OAuth Server must remain disabled.
- Vercel (server-only, never `VITE_`): `ENQIDU_OAUTH_ISSUER=https://enqidu.vercel.app`,
  `ENQIDU_MCP_RESOURCE_URL=https://enqidu.vercel.app/api/mcp`,
  `ENQIDU_OAUTH_DATABASE_URL`, `SUPABASE_URL`, public key and server data key.
- Deploy the reviewed code.

### Not verified (must be checked after deployment, before declaring it operational)

- Current production state of `enqidu.vercel.app` discovery/OAuth endpoints (not
  reachable from the review environment).
- That Vercel can fetch Claude's CIMD: `claude.ai` is behind Cloudflare. The document
  answered 200 to a plain HTTPS GET on 2026-10-28, but a bot challenge from Vercel IPs
  would make `/oauth/authorize` fail closed with `invalid_client`. No silent fallback.
- That Claude sends `resource` on the token and refresh requests and accepts the
  `iss` callback parameter (required by ENQIDU; documented by MCP 2025-06-18+).
- That Claude's server-to-server MCP and token requests carry no foreign `Origin`
  header (ENQIDU rejects foreign origins on `/api/mcp` and `/oauth/token`).
- That Claude accepts the ~470 KB `tools/list` response (dominated by output schemas).
- Refresh behaviour over more than one hour, and that Claude never retries a consumed
  refresh token (a replay revokes the grant by design and forces reconnection).

Anthropic's connector traffic originates from `160.79.104.0/21`; ENQIDU has no firewall
or allowlist to change.

## Acceptance criteria

The integration is operational only when all of these pass with a real Claude Chat
account against the deployed endpoint:

1. Adding the connector completes OAuth; the consent page shows "Claude", the
   `claude.ai` callback and both `enqidu.read` and `enqidu.preview`; approve returns to
   Claude with `code`, `state` and `iss`.
2. Claude lists exactly the 27 READ/PREVIEW tools; no `apply_*`.
3. "¿Qué toca hoy?" and an exercise progress question return the athlete's real data,
   using the profile timezone; missing data stays missing.
4. Deny returns `access_denied` to Claude and creates no grant.
5. After the access token expires (60 min) Claude refreshes transparently.
6. Revoking the Claude connection in `/oauth/connections` makes the next tool call fail
   and Claude asks to reconnect; an existing ChatGPT connection keeps working.
7. The Claude access token is rejected by Supabase Auth, REST, RPC and Edge (runbook
   step 10 repeated with the Claude token).

## References (checked 2026-10-28)

- [Claude: Authentication for connectors](https://claude.com/docs/connectors/building/authentication)
- [Claude: Build an MCP server for Claude (limits)](https://claude.com/docs/connectors/building/index)
- [Claude: Add a connector that isn't in the directory (plans)](https://claude.com/docs/connectors/custom/add-unlisted)
- [Published Claude CIMD](https://claude.ai/oauth/mcp-oauth-client-metadata), snapshot in
  `tests/fixtures/oauth/claude-client.json`
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
