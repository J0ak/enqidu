# Remote MCP V1

**SECURITY BLOCKER — not ready to merge or enable OAuth:** real Supabase Auth accepts account mutations with both the current and resource-only bearer. See [Auth account gate and evidence](auth-account-security-gate.md). Existing Data API/Edge isolation does not solve this.

**Transport code ready is not security approval or production enablement.** Resolve the Auth account gate before merge, then complete the separately authorized [OAuth production runbook](oauth-production-runbook.md) before connecting real athletes. No deployment or production configuration was performed by #104.

## Endpoints and configuration

- Resource: `https://<existing-ENQIDU-host>/api/mcp`.
- RFC 9728 metadata: `https://<existing-ENQIDU-host>/.well-known/oauth-protected-resource/api/mcp` (path-aware URL generated with the SDK helper).
- Metadata `authorization_servers`: `https://<project-ref>.supabase.co/auth/v1` (issuer, not its discovery URL).
- Supabase RFC 8414 discovery: `https://<project-ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`.
- Supabase OIDC discovery: `https://<project-ref>.supabase.co/auth/v1/.well-known/openid-configuration`.
- Consent: `https://<existing-ENQIDU-host>/oauth/consent`.

Server-only environment: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or legacy public `SUPABASE_ANON_KEY`), `ENQIDU_MCP_RESOURCE_URL`, and existing backend `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`). Frontend uses its existing public Supabase environment. No athlete access token or OAuth client secret is configured. The backend data credential is never prefixed `VITE_` or sent to the browser; [the security revision](oauth-data-plane-boundary.md) documents the explicitly authorized service-role fallback. Production configuration requires HTTPS and a root Supabase URL. Host and metadata derive from trusted configuration, never forwarded headers.

Every MCP request requires `Authorization: Bearer <OAuth access token>`. Discovery metadata is public GET/OPTIONS with official SDK CORS, independent of the strict Origin policy on `/api/mcp`. Authentication failures return 401 with the SDK's Bearer challenge including `resource_metadata`; no user-facing token-pasting workflow is supported. The issuer must supply OAuth client identity, a backing session, and an MCP-specific audience. Custom scopes such as `enqidu:read` are neither defined nor advertised. The closed read/preview registry and verified user identity authorize server-side domain access. OAuth direct Data API access is denied by the pending migration; first-party Edge transport access is also denied.

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

## Local acceptance and golden

```sh
npm ci
npm run test:mcp:remote
npm run test:semantic-read
npm run test:mcp
npm run test:tools
```

`tests/support/remoteMcp.mjs` starts loopback HTTP servers for the real SDK transport and a fixture Supabase API. It signs ES256 access tokens and verifies signatures/expiry/revocation at the Auth fixture. The production `@supabase/supabase-js` request-scoped client performs actual HTTP Auth and REST calls. Each HTTP invocation constructs a fresh ENQIDU server. This is not a mock MCP protocol and requires no credentials, hosted resources or LLM.

Golden: SDK Client → HTTP `/api/mcp` → signed OAuth-like bearer → online fixture Auth → Streamable HTTP → shared registry/runtime → canonical Progress → fixture REST → `high_pull_up` / “Dominada alta” / skill / actual observations / available reps / missing metrics / evidence / Europe/Madrid. Foreign-user reps and skipped reps never enter the result. The same test verifies a second independent client/request and modern/legacy lifecycles. The opt-in `scripts/test-remote-auth-supabase.mjs` additionally verifies the required audience array against real local Supabase Auth, including signature rejection, normal frontend-token rejection, and rejection after backing-session revocation. It uses a disposable local user and a synthetic local signature for OAuth-shaped claims, not an authorization-code exchange. Run it with `ENQIDU_TRANSACTION_LOCAL=1 ENQIDU_TRANSACTION_ENV_FILE=/path/to/local-supabase.env node scripts/test-remote-auth-supabase.mjs`. These tests are not a production OAuth authorization-code rollout test.

## Official sources checked

Reviewed 2026-10-21/22 together with the installed package declarations/source (2.3.1):

- [TypeScript SDK v2 HTTP serving](https://ts.sdk.modelcontextprotocol.io/v2/serving/http)
- [MCP transports](https://modelcontextprotocol.io/specification/latest/basic/transports)
- [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization)
- [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728.html)
- [Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)
- [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [OAuth token security](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [Supabase Auth UserGet](https://github.com/supabase/auth/blob/master/internal/api/user.go) and [session validation](https://github.com/supabase/auth/blob/master/internal/api/auth.go)
- [Vercel Node runtime / Web handlers](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration): the Node API routes use the `vercel.json` functions configuration for the 60-second limit.
- [Supabase changelog](https://supabase.com/changelog): relevant announced TLS cipher retirement on 2026-11-10; retain normal TLS verification and supported Node 22.
