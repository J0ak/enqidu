# Remote MCP V1

ENQIDU OAuth issues opaque credentials for MCP. The rejected Supabase-issuer design is documented in [rejected-supabase-oauth.md](rejected-supabase-oauth.md). The #104 code is merged into `main`; production configuration and operational acceptance are **not verified** (see [Rollout status](#rollout-status)).

## Rollout status

Last reviewed 2026-10-29. Merged code is not evidence that the integration works in production.

| Item | State |
|---|---|
| #104 code (OAuth server, private-SQL store, remote MCP, consent and connections UI) | **Merged** into `main` as `49c719c` (2026-10-24) |
| Claude as second approved client | Added by PR #107 (merge pending when written) |
| Whether the current production deployment serves this code | Not verified |
| Migration `20261023150630_mcp_private_oauth_v1.sql` applied in production | Not verified; treat as pending |
| LOGIN/password for `enqidu_mcp_oauth` via Supavisor | Not verified; treat as pending |
| Server env (`ENQIDU_OAUTH_ISSUER`, `ENQIDU_MCP_RESOURCE_URL`, `ENQIDU_OAUTH_DATABASE_URL`, Supabase URL/keys) | Not verified; treat as pending |
| Hosted discovery (`/.well-known/*`, 401 challenge on `/api/mcp`) | Not verified |
| Real ChatGPT OAuth acceptance | Not performed |
| Real Claude OAuth acceptance | Not performed |
| Real local Supabase acceptance (`scripts/test-mcp-oauth-supabase.mjs`) | Passed for ChatGPT on 2026-10-23 (pre-merge); Claude mode added in #107, not yet executed |

Each pending item requires separate authorization through the [production runbook](oauth-production-runbook.md). Until all rows are verified, the remote MCP must be described as not operational.

Approved OAuth clients (closed allowlist in `src/oauth/clients.js`, no DCR): ChatGPT (`https://chatgpt.com/oauth/client.json`) and hosted Claude (`https://claude.ai/oauth/mcp-oauth-client-metadata`). See [Connecting ChatGPT](chatgpt-connection.md) and [Connecting Claude](claude-connection.md). Both receive the identical 27-tool READ/PREVIEW surface.

## Endpoints and configuration

- MCP: `https://enqidu.vercel.app/api/mcp` (Streamable HTTP POST).
- RFC 9728: `/.well-known/oauth-protected-resource/api/mcp` with authorization_servers containing **the ENQIDU issuer**, plus `enqidu.read`, `enqidu.preview`, `offline_access`.
- RFC 8414: `/.well-known/oauth-authorization-server`.
- Authorization / token / revocation: `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`.
- Human consent / connections: `/oauth/consent`, `/oauth/connections`.
- First-party APIs: `/api/oauth/details`, `/api/oauth/decision`, `/api/oauth/connections`, `/api/oauth/revoke`.

Server-only configuration: `ENQIDU_OAUTH_ISSUER`, `ENQIDU_MCP_RESOURCE_URL`, `ENQIDU_OAUTH_DATABASE_URL` (dedicated private-function role via existing Supavisor), `SUPABASE_URL`, public `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`, and existing server `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` for the read facade. Never VITE-prefix a server credential. No client secret, JWT signing key, Supabase OAuth setting or Auth hook is needed.

Each request carries `Authorization: Bearer enq_mcp_at_<256-bit random>`. Tokens are resolved online from private hashes/grants with exact resource/client/scope/expiry/revocation/user checks. No positive auth cache. The runtime reloads the profile timezone. The bearer is never forwarded to Supabase Auth or REST. Standard frontend Supabase JWTs are rejected by MCP.

`enqidu.read` permits reads; preview additionally requires `enqidu.preview`. All 27 descriptors remain discoverable and declare their OAuth scopes. Remote writes are unconditionally disabled. RFC 9728 metadata uses the SDK helper with public noncredentialed CORS; `/api/mcp` keeps strict Origin/Host validation. Authentication failures receive sanitized SDK Bearer challenges.

## SDK and protocol compatibility

No SDK upgrade. The installed 2.3.1 API is used directly: `createMcpHandler`, `verifyBearerToken`, `bearerAuthChallengeResponse`, `hostHeaderValidationResponse`, `getOAuthProtectedResourceMetadataUrl`, `oauthMetadataResponse`.

Real SDK tests cover modern **2026-07-28** via explicit version negotiation and legacy **2025-11-25** initialize/list/call. The installed legacy transport declares 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05 and 2024-10-07. Older revision names are SDK compatibility declarations, not a promise to serve deprecated standalone HTTP+SSE transports. Only Streamable HTTP is exposed. GET/DELETE cannot open/delete an in-memory MCP session (405). Unsupported methods are 405. POST parsing, content type and protocol errors belong to the SDK; wrong JSON media type is 415, malformed JSON 400, oversized bodies 413. There is no protocol reimplementation.

## Conversation tools

| Tool | Use / semantics |
|---|---|
| `resolve_exercise_reference_v1` | Exact code/name/explicit alias with trim/case/whitespace/accent normalization. `resolved`, `ambiguous`, `unresolved`; bounded candidates never establish identity. |
| `get_exercise_progress_v1` | Canonical code; period week/4/12/all. Existing Progress metrics, compatible variants, records, quality, missing metrics, evidence and profile timezone. More activity is not improvement. |
| `get_exercise_history_v1` | Canonical code, from/to up to 366 days, limit 1–50 (default 20). Executed observations only; overflow explicitly fails. |
| `get_training_session_detail_v2` | One owned recorded/completed activity with blocks, canonical exercise identities, sets/reps/load/unit/rounds/side/tempo, bounded notes, metrics and source type. V1 unchanged. |
| `get_training_overview_v1` | Compact activity/modalities/skills/endurance/strength/records/plan summary, period week/4/12. Counts use full evidence; sampled detail is declared. |

`4` and `12` retain Progress's completed-week boundaries; `week` is the current profile-calendar week; `all` includes history through the canonical current day. Null is unavailable, zero is observed. Unlinked plans are unknown, not noncompliance; no activity is not proof of rest. Reported names preserve provenance. Plans and skipped exercises never become observed exercise progress.

## Exact remote discovery

27 tools (READ + PREVIEW):

- `interpret_training_correction_v1` (preview)
- `get_training_semantics_v1` (read)
- `preview_training_semantics_v1` (preview)
- `resolve_exercise_reference_v1` (read)
- `get_exercise_progress_v1` (read)
- `get_exercise_history_v1` (read)
- `get_training_session_detail_v2` (read)
- `get_training_overview_v1` (read)
- `get_progress_performance_v1` (read)
- `get_daily_coach_operating_brief` (read)
- `get_morning_coach_brief` (read)
- `get_health_ingestion_status` (read)
- `get_athlete_context` (read)
- `get_today_plan` (read)
- `get_week_plan` (read)
- `get_recent_training` (read)
- `get_training_session` (read)
- `get_health_status` (read)
- `get_readiness` (read)
- `get_closed_loop_assessment` (read)
- `get_adaptation_proposal` (read)
- `preview_move_session` (preview)
- `preview_adapt_duration` (preview)
- `preview_adapt_environment` (preview)
- `preview_cancel_session` (preview)
- `preview_adapt_remaining_week` (preview)
- `preview_closed_loop_proposal` (preview)

The seven existing writes `apply_move_session`, `apply_adapt_duration`, `apply_adapt_environment`, `apply_cancel_session`, `apply_adapt_remaining_week`, `apply_closed_loop_proposal`, `apply_training_semantics_v1` are absent and denied even if guessed. `ENQIDU_MCP_WRITES_ENABLED=true` has no effect remotely. Local stdio retains its existing configuration gate and does not gain any new writes.

## Local acceptance

`npm run test:mcp:oauth` covers protocol validation, official ChatGPT and Claude CIMD snapshots, per-client code/refresh/revocation binding on the unchanged private SQL migration (in-process PostgreSQL), SSRF/size/time guards, metadata, errors and request binding. `npm run test:mcp:remote` uses the real MCP SDK over HTTP, fixture private token resolution and privileged REST data; it covers all-27 parity/isolation and both protocol lifecycles.

The principal real acceptance is:

```sh
ENQIDU_TRANSACTION_LOCAL=1 ENQIDU_TRANSACTION_ENV_FILE=/path/to/local.env \
  node scripts/test-mcp-oauth-supabase.mjs
# Same suite with Claude as the client under test:
ENQIDU_TRANSACTION_LOCAL=1 ENQIDU_TRANSACTION_ENV_FILE=/path/to/local.env \
  ENQIDU_OAUTH_ACCEPTANCE_CLIENT=claude node scripts/test-mcp-oauth-supabase.mjs
```

`ENQIDU_OAUTH_ACCEPTANCE_CLIENT` selects the approved client (`chatgpt`, the default, or `claude`) for every existing group, using the bounded CIMD snapshots in `tests/fixtures/oauth/`. A cross-client group always runs with both clients: codes, refresh tokens and RFC 7009 revocation never cross clients, and revoking one client's grant leaves the other working. The script keeps its loopback-only guards; it never targets hosted Supabase or production.

It performs real first-party login, ENQIDU authorization/decision/code exchange, private PostgreSQL token operations, then real SDK `high_pull_up` progress. The **same opaque token** is rejected by real local Supabase Auth GET/PUT, REST, RPC and first-party Edge writers. Account metadata is re-read to verify no change. Codes/refresh races, replay revocation, grant ownership, expiry, deletion/ban, scopes and secret absence are tested. Supabase OAuth is disabled and the compensating migration is absent. CIMD uses the bounded official snapshot in deterministic CI; hosted OpenAI connectivity remains a rollout check.

## Current official references (2026-10-23)

- [OpenAI MCP authentication / CIMD / tool schemes](https://developers.openai.com/plugins/build/auth)
- [Published ChatGPT CIMD](https://chatgpt.com/oauth/client.json)
- [Claude connector authentication](https://claude.com/docs/connectors/building/authentication), [published Claude CIMD](https://claude.ai/oauth/mcp-oauth-client-metadata)
- [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization)
- [SDK v2 HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http)
- [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414.html), [PKCE RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html), [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728.html), [issuer identification RFC 9207](https://www.rfc-editor.org/rfc/rfc9207.html), [revocation RFC 7009](https://www.rfc-editor.org/rfc/rfc7009.html), [resource indicators RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html).
- [Supabase connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres), [functions/security](https://supabase.com/docs/guides/database/functions), [changelog](https://supabase.com/changelog).
- [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js).
