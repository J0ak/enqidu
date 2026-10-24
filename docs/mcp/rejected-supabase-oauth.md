# Rejected architecture: Supabase OAuth issuer

**Rejected by architectural decision.** Supabase Auth remains the first-party identity provider, but is not the issuer of client MCP credentials. The replacement is [ENQIDU opaque OAuth](epic-104-architecture.md). The following is historical evidence from commit `1ab07cd45ff8a532ff24935f62787588019b630b`, not the current transport or rollout plan.

## Real local evidence (2026-10-23)

Tested Supabase Auth **v2.197.0**, also the latest official release returned by GitHub during this review. The disposable local project enables OAuth/UserInfo using the documented `[auth.oauth_server]` configuration, with DCR disabled. Production OAuth configuration is unchanged.

`scripts/test-auth-account-boundary-supabase.mjs` creates disposable users and real password-login sessions, then signs the same OAuth-shaped claim contract as the existing real Supabase acceptance. Both tokens have `role=authenticated`, `client_id`, a real `session_id`, valid issuer/expiry/signature and the athlete's `sub`. The two audiences are the current `["authenticated", MCP_RESOURCE]` array and the exclusive `MCP_RESOURCE` string. This substitutes local signing for issuance; it is **not** an authorization-code/PKCE, OAuth grant or refresh-token acceptance test. It does test what the current MCP accepts against real Auth middleware and persisted user state.

| Operation | Current array | Resource-only audience | State/body verification |
|---|---:|---:|---|
| GET `/auth/v1/user` | 200 | 200 | Returned id equals disposable athlete |
| GET `/auth/v1/oauth/userinfo` | 200 | 200 | Returned sub equals disposable athlete |
| PUT `/auth/v1/user` metadata only | 200 | 200 | Response contains marker; independent admin reread confirms metadata changed |
| PUT `/auth/v1/user` email | 200 | 200 | Persisted `email_change` contains requested address; confirmation still required |
| PUT `/auth/v1/user` password | 200 | 200 | Persisted `encrypted_password` changes |
| Actual SDK MCP discovery/read | success | success | 27 tools; shared canonical read succeeds |
| Direct REST table read | 403 | 403 | Existing Data API protection still works |
| After global backing-session revocation: GET user / UserInfo / PUT user | 403 | 403 | `session_not_found`; attempted metadata change does not persist |
| After revocation: MCP request | 401 | 401 | Rejected at bearer boundary |

The metadata request is exactly `{"data":{"mcp_forbidden_probe":"must-not-change"}}`. Email/password probes affect only disposable local users; every user is deleted in `finally` and absence is checked. SMTP remains the local test sink. Phone was not tested; the demonstrated metadata/password writes already fail the required boundary. Response bodies are inspected in memory, never logged. The [sanitized evidence](evidence/auth-account-gate.json) contains statuses and booleans, no identities, addresses, tokens, hashes or secrets.

Historical reproduction: [the exact script at the rejected-design commit](https://github.com/J0ak/enqidu/blob/1ab07cd45ff8a532ff24935f62787588019b630b/scripts/test-auth-account-boundary-supabase.mjs). It required enabling OAuth only in that disposable checkout. It is intentionally removed from current CI and local configuration: the replacement neither requires nor enables Supabase OAuth. The sanitized historical JSON is retained.

## Technical cause and official API review

Official [OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows) and [token security](https://supabase.com/docs/guides/auth/oauth-server/token-security) state that scopes control ID token/UserInfo disclosure, not database or API permissions. `client_id` supports application authorization policies; it does not impose account-read-only behavior in Auth.

The tested release's source explains the results:

- [`api.go`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/api.go): UserGet and UserUpdate use the same `requireAuthentication`; UserInfo also uses it when OAuth is enabled.
- [`auth.go`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/auth.go): JWT parsing verifies signature and registered time claims; it does not configure a fixed required audience. `maybeLoadUserOrSession` loads the user by `sub` and the backing session by `session_id`; it does not reject OAuth clients for UserUpdate.
- [`helpers.go`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/helpers.go): `requestAud` reads an explicit audience header first, otherwise the token's first audience, otherwise the configured default. Therefore UserGet's comparison against `requestAud` is **not** proof that only `authenticated` audiences work. No special audience header was sent by the probes.
- [`user.go`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/user.go): UserUpdate permits metadata updates and, subject to ordinary account checks, email/password changes. It has no OAuth `client_id` deny rule or MCP audience restriction. MFA/reauthentication checks on particular sensitive fields cannot provide the required metadata/account boundary.
- [`OAuthUserInfo`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/oauthserver/handlers.go): returns `sub`, plus disclosure selected by session scopes. This is useful for identity minimization, but does not prevent the same token from reaching UserUpdate.

[Custom Access Token Hooks](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) can customize audience while preserving required claims. The tested exclusive audience still mutates the account, so a hook alone does not fix this. PKCE secures code exchange, not later access-token permissions. Revocation limits validity after session removal; it does not remove write capability while the session is valid. Real OAuth refresh/grant revocation remains unverified and cannot be used to claim this blocker solved.

This corrects the earlier #104 inference that putting `authenticated` first was necessary for UserGet: real local Auth accepts the resource-only token too. The HTTP fixture has been corrected accordingly. ENQIDU's exact MCP resource-audience validation is unchanged; no default-audience fallback was added.

## Decision

Supabase-issued client tokens were rejected, including the UserInfo/resource-only alternative. More RLS, Edge guards or audience hooks cannot prohibit direct Auth account mutations. The prior compensating public-table policies/pre-request/Edge guards are removed from #104. The privileged read facade and its ownership protections remain.

The authorized replacement is an ENQIDU OAuth server using private persistent grants, PKCE and opaque tokens. The critical new acceptance sends the same opaque token successfully to MCP and unsuccessfully to real local Supabase Auth/REST/Edge, then confirms account metadata unchanged. No Supabase access token is given to ChatGPT.

Production audit at the time reported 0 Storage buckets. No production OAuth configuration, hook, signing rotation, client registration, write, deployment or merge was performed. Incremental spend: €0.00.
