# Auth account mutation — BLOCKER for #104

**Not ready to merge or enable remote OAuth.** The existing Data API/RPC/Edge protections remain valid, but a Supabase OAuth-shaped user bearer can modify the account through Auth. A READ/PREVIEW tool registry is not a global read-only boundary for that credential. No broker, alternative issuer, production setting or runtime authentication workaround is implemented here.

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

Reproduce with the same local-only environment guard as other acceptance scripts:

```sh
ENQIDU_TRANSACTION_LOCAL=1 ENQIDU_TRANSACTION_ENV_FILE=/path/to/local.env \
  node scripts/test-auth-account-boundary-supabase.mjs
```

The default CI invocation **asserts the observed vulnerable behavior** and prints `BLOCKED_AUTH_ACCOUNT_MUTATION`. A green reproduction means the evidence is reproducible, not that account isolation passes. The explicit release gate exits nonzero:

```sh
ENQIDU_REQUIRE_AUTH_ACCOUNT_ISOLATION=1 \
ENQIDU_TRANSACTION_LOCAL=1 ENQIDU_TRANSACTION_ENV_FILE=/path/to/local.env \
  node scripts/test-auth-account-boundary-supabase.mjs
```

If a future Auth release changes this behavior, the reproduction assertions must be reviewed and replaced with rejection-and-unchanged-state acceptance before lifting the blocker. No known security failure is silently skipped.

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

## Decision, options and impact

| Option | Assessment |
|---|---|
| Switch to UserInfo + resource-only audience | **Rejected as a fix:** identity and MCP work, but metadata/email/password writes still succeed. No production auth refactor justified. |
| Supabase-supported Auth authorization separating OAuth clients from account mutation | Preferred direction if the provider supplies a documented, tested guarantee for **all** account mutation routes. No such supported project configuration was verified in this release. Re-test exact hosted behavior under an approved rollout before lifting the gate. |
| Separately reviewed standard OAuth issuer/broker that never gives clients a Supabase user bearer | Potential architectural option, requiring identity binding, token issuance/verification, audience, refresh/revocation, consent, persistence and threat-model review. Not implemented or selected here; cost/operations must be demonstrated within €0 before approval. |
| Keep remote OAuth disabled | **Current recommendation.** Preserve the completed transport/read/data-plane work, keep #104 blocked for merge/rollout, and obtain a reviewed Auth isolation solution. App/Coach/local MCP remain unchanged. |

Changing ENQIDU's proxy, RLS, Edge guards or metadata cannot authorize/deny requests sent directly to Supabase Auth. No unsupported token manipulation, custom account claim, DIY OAuth server or secret pasted into ChatGPT is proposed as a fix.

## Storage and Realtime

The independent production audit reports **0 Storage buckets**; the earlier SELECT-only policy audit found no Storage policies. No Storage infrastructure was created. The automated catalog audit now conservatively flags **any new bucket** or Storage policy applying to `authenticated`/`public` for explicit OAuth isolation review, even if a bucket is marked private. Negative tests create only transaction-local metadata/policies and roll back. This prevents assuming that new Storage exposure inherits public-table protection.

Public-table restrictive RLS requiring `client_id IS NULL` is evaluated for RLS-based reads outside PostgREST, including Realtime table authorization. `pgrst.db_pre_request` is an additional Data API-only defense, not the sole protection. No new Realtime channels/configuration or claimed Realtime end-to-end acceptance is introduced.

Incremental cost: **€0.00**. No production writes, migration apply, OAuth enablement, hook installation, signing rotation, real client registration, deployment or merge.
