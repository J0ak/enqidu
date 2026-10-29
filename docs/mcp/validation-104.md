# #104 validation — ENQIDU opaque OAuth

Validated locally on 2026-10-23, on the existing PR branch based on `90dfd15f497abb26eb0953c5b934b8c01e21d3ac`, with Node 22.23.3 and pinned MCP SDK 2.3.1. The PR was DRAFT at validation time and was later merged into `main` as `49c719c` (2026-10-24); this record is pre-merge local evidence, not production evidence (see [Rollout status](remote-mcp.md#rollout-status)). No production migration, deployment, OAuth enablement, client registration, hook, signing change or grant was performed.

The rejected Supabase OAuth design is documented in [rejected-supabase-oauth.md](rejected-supabase-oauth.md). Its account-mutation bypass is addressed by replacing the credential delivered to ChatGPT with an opaque ENQIDU token. Supabase remains the first-party identity provider only. The global client_id policies, PostgREST pre-request hook and ten Edge compensation guards have been removed; Edge entrypoints match the base branch.

## Completed local checks

| Command | Result |
|---|---|
| `npm test` | 890 passed |
| `npm run test:mcp` | 45 passed |
| `npm run test:mcp:remote` | 12 passed |
| `npm run test:mcp:oauth` | 8 passed |
| `npm run test:semantic-read` | 5 passed |
| `npm run test:tools` | 100 passed |
| `npm run test:coach-evals` | 30 passed |
| `npm run test:transactional-actions` | 37 passed |
| `node scripts/test-reconciliation-postgres.mjs` | 43 passed |
| `node scripts/test-semantics-postgres.mjs` | 9 passed |
| `node scripts/test-mcp-oauth-supabase.mjs` | 14 real local acceptance groups passed |
| `npm run test:e2e -- --workers=1` | 46 passed, including consent at 390 px and connection revocation |
| `npm run build` | Passed; existing large-chunk warning, approximately 610 kB JS |
| `git diff --check` | Passed |
| `supabase --workdir e2e-local db advisors --local --type security --level warn` | No issues found |

The obsolete Supabase OAuth acceptance scripts are replaced by the opaque-token acceptance suite. Their historical reproduction remains linked from the rejected-design report. Tests use disposable local Supabase Auth v2.197.0, PostgreSQL 17, PostgREST 16.4 and Edge runtime 1.77.1. PostgreSQL/HTTP acceptance requires the explicit `ENQIDU_TRANSACTION_LOCAL=1` guard and a local-only environment file. No hosted credentials or paid services are used. The existing managed-environment dependency bundler/proxy is local test setup only.

## Critical same-token golden

The real acceptance script:

1. Creates disposable users A/B and logs A in through first-party Supabase Auth.
2. Runs the ENQIDU authorize endpoint against a snapshot of the official ChatGPT CIMD, approves with A's first-party session, and exchanges the single-use code with PKCE S256 and the exact MCP resource.
3. Receives an `enq_mcp_at_...` token, connects the actual MCP SDK over HTTP and calls `get_exercise_progress_v1(high_pull_up)` through the real Supabase canonical read plane. The result identifies “Dominada alta”, classification `skill`, one observation, available reps and canonical timezone Europe/Madrid. Discovery contains exactly 27 tools.
4. Sends **that exact same opaque token** to local Supabase Auth GET/PUT, REST, RPC and the existing enqidu-tools, coach-plan-action and manual-health-import Edge endpoints. Every probe is rejected with 400/401/403. A subsequent first-party user read confirms the metadata probe did not persist. Normal first-party Auth and REST still return 200.
5. Revokes the grant: MCP rejects subsequent access and refresh returns `invalid_grant`. All disposable users and temporary database-login credentials are removed afterwards.

These are real HTTP/PostgreSQL acceptance checks, not protocol mocks. The official public CIMD was also fetched read-only and checked against the fixture. Local acceptance deliberately does not depend on a live third-party document or register a real OAuth client.

## OAuth and storage invariants

The 14 acceptance groups additionally cover private ACLs (four tables, eleven private functions, only nine executable by the runtime role), wrong/missing PKCE, plain rejection, exact redirects/resources, unknown clients/scopes, code expiry and single use, concurrent exchanges, deny with state/iss, decision ownership and single use, request expiry, access expiry, refresh rotation, expired refresh, offline_access gating, concurrent refresh and committed family revocation after replay. First-party revocation checks ownership; RFC 7009 invalidates the whole grant. Account bans reject access/refresh and account deletion cascades grants. Stored values are hashes, never codes/tokens or first-party sessions.

Unit tests exercise bounded CIMD metadata, exact allowlisting, SSRF/DNS and redirect rejection, malformed/oversized bodies, duplicate parameters, public metadata and sanitized errors. Metadata advertises ENQIDU and no DCR/OIDC endpoints. All success/error callback redirects include the exact issuer. Token responses are no-store/no-cache. Scope metadata is present at the tool root and in `_meta` on the actual HTTP wire; SDK 2.3.1's client parser preserves `_meta` but strips the additional root property. Read-only grants discover all 27 tools but cannot execute previews without `enqidu.preview`.

## Shared domain, isolation and browser evidence

Actual MCP SDK 2.3.1 transport tests negotiate 2026-07-28 and legacy 2025-11-25, construct a fresh server per request and exercise independent requests. App, Coach, local MCP and remote MCP share the registry/runtime/domain; all 27 results match apart from channel traceability and the existing semantic-preview fingerprint. Every apply name is absent/denied, even with write environment flags and malicious arguments. Generic SQL/RPC tools do not exist.

The adversarial data fixture applies **no automatic RLS** and sees both athletes. Every one of the 27 tools matches A-only data with foreign parents/children present. Foreign session IDs fail closed. The real privileged REST-backed golden also exercises semantic, Health and Closed Loop reads. The first-party tenant/RLS/browser regressions remain green. Opaque credentials, Supabase sessions, server data secrets, SQL connection strings and hashes do not appear in tool output, errors or allowlisted telemetry.

[Consent at 390 px](evidence/oauth-consent-390.png) was captured from the updated browser suite. Tests cover login continuation, approve/deny, stored redirect authority, error states, inert hostile text, no horizontal overflow and first-party connection revocation. The semantic conversation fixtures retain RDL/Spanish exact resolution, HSPU/high pull-up skills, separate pike identities, unresolved Unknown, structured sets/reps/load, missing versus zero, skipped execution and bounded overview. No SQL tool or LLM is used.

## Read-only production audit and limits

SELECT-only metadata inspection confirmed the expected Auth id/deleted_at/banned_until columns, absence of the new private schema/role, and **zero Storage buckets**. No production rows were changed. The previous audit recorded no pre-request hook. Ordinary existing RLS still protects application access, including RLS-mediated Realtime paths; the removed OAuth-specific policies are unnecessary because ENQIDU MCP credentials are not Supabase JWTs.

Storage and Realtime were not running in the local acceptance stack, so this report does not claim live HTTP/WebSocket acceptance for those services. Their deployed configuration, future buckets/policies and public exposure must be audited before rollout. Vercel rewrites/TLS/pooler connectivity and an eligible real ChatGPT connection also remain manual acceptance gates. The service data credential bypasses RLS: the closed read facade and explicit ownership filters remain mandatory. Refresh replay revokes the whole family, including a concurrently successful response, and may require reconnecting. The durable authorize cap is not comprehensive DoS protection. See the [runbook](oauth-production-runbook.md) for review, free-quota checks and manual rollout prerequisites.

Incremental spend: **€0.00**. Local success does not authorize merge, deploy or production configuration.
