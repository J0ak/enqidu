# OAuth rollout — CODE READY versus MANUAL PRODUCTION CONFIGURATION

## CODE READY in #104

Shared MCP server/registry/runtime, stateless `/api/mcp`, path-aware protected-resource metadata and Bearer challenge, request-scoped public-key Supabase client, mandatory signed OAuth client/session/resource identity, read/preview-only boundary, consent UI, semantic reads, local acceptance tests and documentation. No migration or production setting is applied. The PR branch has Git deployments disabled.

## Read-only audit

On 2026-10-21 the existing Enqidu project's public JWKS returned an **ES256** key. This proves an asymmetric key is published; it does not prove which key signs every active token or that HS256 has been retired. Its RFC 8414 discovery returned **404**. OAuth availability is therefore unverified/blocked for rollout; do not claim the server is enabled based on this audit. No management setting or signing key was changed. A SELECT-only information_schema audit confirmed the canonical columns used by the new reads.

## MANUAL PRODUCTION CONFIGURATION — after merge, under operator control

1. **Check budget and signing state.** Use existing Vercel/Supabase resources only. Supabase's MCP documentation says OAuth MCP authentication has no separate charge; distinct-user MAUs and ordinary project quotas still apply. Stop if the dashboard requests an upgrade or paid resource. Verify active asymmetric signing and JWKS. ES256/RS256 is recommended for OAuth and required for OIDC ID tokens (`openid`). Do not rotate keys as an incidental setup action; any required signing migration needs its own reviewed rollout.
2. **Enable the Supabase OAuth 2.1 server** only through its supported configuration. Verify the canonical Site URL is the existing HTTPS ENQIDU origin. Set the authorization path to `/oauth/consent`. Use the existing user authentication setup; the UI preserves `authorization_id` during login. Do not confuse OAuth client callback registration with first-party sign-in redirect allowlists.
3. **Verify discovery**, including issuer `${SUPABASE_URL}/auth/v1`, authorization/token endpoints, code + S256 PKCE support, supported identity scopes, refresh_token grant, and dynamic client registration if the chosen MCP client needs it. Read the published RFC 8414 document at `${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`; do not invent root `.well-known` routes. DCR is optional, not a grant of data authority. Register exact callback URLs, no wildcards. Do not create custom `enqidu:*` scopes.
4. **Establish resource audience binding before enabling traffic.** Supabase documents default `aud="authenticated"` and OAuth `client_id`; #104 intentionally rejects that default for remote MCP. The required token contract is:

   ```json
   {
     "sub": "<authenticated athlete UUID>",
     "role": "authenticated",
     "iss": "https://<project-ref>.supabase.co/auth/v1",
     "client_id": "<registered OAuth client>",
     "session_id": "<backing Auth session UUID>",
     "aud": ["authenticated", "https://<existing-host>/api/mcp"],
     "exp": 1234567890
   }
   ```

   Keep `authenticated` first: current Supabase Auth `UserGet` checks the first audience against its request audience. MCP verifies membership of its exact configured URL. First verify whether the deployed issuer supports native RFC 8707 resource binding with this compatible audience. If not, configure a **separately reviewed Custom Access Token Hook** using Supabase's documented `client_id` input: only an explicitly approved MCP OAuth client may receive the additional MCP audience. Preserve sub/role/session/expiry and all required claims. Ordinary frontend sessions and unrelated OAuth clients must retain their normal audience. Do not derive authority from user_metadata, request query fields, client-provided capabilities, or a name prefix.

   The hook is **not installed or deployed by #104**. It is an additional rollout prerequisite, potentially a narrow production code/configuration change, not just an environment variable. Approve/register a client before adding it to that server-controlled mapping; DCR registration by itself must not populate the mapping. The required array audience and backing-session revocation are verified against real local Supabase Auth in `scripts/test-remote-auth-supabase.mjs` (synthetic local signing, not OAuth code issuance). If the chosen issuer/hook cannot issue a compatible array audience, keep rollout blocked rather than weakening resource validation. Verify `getUser`, REST/RLS and refresh issuance with a real OAuth token. No real token belongs in Git, logs, screenshots or ChatGPT text.
5. **Review RLS under OAuth credentials.** MCP is read/preview-only, but a Supabase-issued bearer may also access the project's direct Data API under existing grants. Ensure that exposure is acceptable for registered OAuth clients before granting real access. If OAuth-specific RLS restrictions are required, handle them as a separate reviewed least-privilege change. This PR neither widens nor silently rewrites existing policies.
6. **Configure Vercel server environment:** `SUPABASE_URL`, public `SUPABASE_PUBLISHABLE_KEY` (or legacy anon key) and exact `ENQIDU_MCP_RESOURCE_URL=https://<existing-host>/api/mcp`. No service_role, secret API key, static access token or write flag is needed. Preserve existing frontend public configuration. Deployment is a later explicit operator action, not part of this PR.
7. **Verify public routing:** GET the path-aware RFC 9728 metadata; it must return the exact resource and correct issuer, without secrets. POST without Authorization must return 401 and a matching `WWW-Authenticate: Bearer ... resource_metadata="..."`. Metadata should not be rewritten to the SPA. `/oauth/consent?authorization_id=...` should render the consent UI, including at 390 px.
8. **Exercise a real authorization-code flow:** approved client → issuer authorize with PKCE → ENQIDU login/consent → approve/deny through the official SDK → exact Supabase-returned redirect → client code exchange. Verify the signed client_id/aud/session claims privately. Confirm frontend tokens, wrong audiences, invalid/expired tokens and foreign-user access fail. Test refresh rotation and verify refreshed tokens keep the required audience.
9. **Discover/call tools with an eligible MCP client.** Verify exactly 27 read/preview tools; all seven applies and guessed SQL names must fail. Exercise the high_pull_up golden, RDL alias equivalence, missing HSPU metrics, one owned session detail and a second independent request. Confirm canonical timezone and no mutation.
10. **Verify revocation against the actual issuer.** Revoke the OAuth grant and backing session through supported Auth APIs; a subsequent MCP HTTP request must return 401 and refresh must fail. The online `getUser()` check must observe session removal. Document the deployed issuer's behavior/latency rather than assuming immediate JWT invalidation. Keep access-token lifetimes bounded. If the real revoked session remains accepted, stop rollout and resolve the Auth contract; fixture revocation is not a substitute.
11. **Observe only allowlisted metadata.** No request bodies, Authorization, JWTs, identities, emails, health values, results or notes in application telemetry. Verify existing platform logging configuration does not add sensitive capture. No new paid monitoring service is required.

## Rollback / disable

Disable the MCP route/configuration and revoke the client grants/sessions using the approved operator workflow. The route fails closed with 503 when required configuration is absent. No new table, historical rewrite or materialization backfill needs reversal. Local stdio and existing App/Coach tools remain independent of OAuth enablement.

## Sources

[Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows), [MCP authentication and cost](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication), [token security/custom hooks](https://supabase.com/docs/guides/auth/oauth-server/token-security), [UserGet audience check](https://github.com/supabase/auth/blob/master/internal/api/user.go), [session validation](https://github.com/supabase/auth/blob/master/internal/api/auth.go), [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization).
