# Claude Chat client — validation

Validated locally on 2026-10-28 on branch `claude/enqidu-mcp-claude-chat-q65f3k`, based on
`main` at `05b093a`, Node 22.22.0, MCP SDK 2.3.1. **Not deployed, not operational.** No
production migration, deployment, Supabase/Vercel change, client registration or grant
was performed. OpenAI/Anthropic APIs are not used.

## Change summary

- `src/oauth/clients.js`: closed allowlist shared by server and consent UI — ChatGPT and
  hosted Claude, each with one exact callback. Claude Code is not approved.
- `server/oauth/protocol.js`: uses the shared allowlist; exact repeated scopes are
  canonicalized (Claude appends `offline_access`); unknown/empty scopes still fail.
- `server/oauth/handler.js`: consent details/decision accept any allowlisted client
  stored in the request instead of ChatGPT only.
- `src/mcp/remoteAuth.js`: resolves the opaque token against each allowlisted client
  (ChatGPT first); re-validation during the request is pinned to the resolved client.
- `src/oauth/consent.js`: browser redirect only to an approved client's exact callback.
- `src/oauth/OAuthConnections.jsx`: each connection shows its client name.

No migration, environment variable, dependency or tool change. `mcp_private` already
binds requests, grants, codes and tokens to `client_id`.

## Local results

| Command | Result |
|---|---|
| `npm run test:coach-evals` | 165 passed |
| `npm test` | 1065 passed |
| `npm run test:mcp` | 46 passed |
| `npm run test:mcp:remote` | 13 passed |
| `npm run test:mcp:oauth` | 19 passed (8 existing + 11 new) |
| `npx playwright test e2e/oauth-consent.spec.js` | 2 passed (ChatGPT and Claude consent; named revocation) |
| `npm run build` | Passed; existing large-chunk warning |
| `git diff --check` | Passed |

New coverage (`tests/mcp-oauth-clients.test.mjs`) runs the **unchanged** private OAuth
migration on in-process PostgreSQL (PGlite) and executes every store call as the
`enqidu_mcp_oauth` role, so function ACLs are exercised:

- Claude and ChatGPT authorization code + PKCE S256 end to end: consent names the
  client, exact callback, `iss` + `state`, opaque tokens, code replay rejected.
- Authorize rejects cross-client callbacks, Claude Code, loopback and unknown clients
  without redirecting; verified-client parameter errors return to the client with `iss`.
- Codes are bound to client, redirect, resource and verifier; mismatches do not consume
  the code; cross-client redemption fails both ways.
- Refresh rotation, cross-client refresh rejection, scope-change rejection, replay
  revoking only the affected grant; the other client's grant keeps working.
- RFC 7009 revocation is per client; first-party revocation only of the athlete's own
  grants; consent requests bound to the first athlete who opens them.
- Read-only grants, ban, deletion and grants of non-allowlisted clients fail closed.

`tests/enqidu-mcp-remote.test.mjs` adds Claude tokens over the real MCP SDK/HTTP: an
identical 27-tool discovery and identical results for every tool versus ChatGPT, guessed
writes denied, athlete B isolated from A, read-only scope cannot preview, Claude Code /
unknown-client grants rejected, and revoking Claude leaves ChatGPT working. The
adversarial foreign-data test (data client bypassing RLS) now runs for both clients.

Mutation check: reverting either the token resolver or the consent client check to
ChatGPT-only, or loosening the callback match to a prefix, makes the new suite fail.

## Not executed here

- `scripts/test-mcp-oauth-supabase.mjs` (real local Supabase Auth/REST/Edge): no Docker
  daemon or Supabase CLI in the review environment. Since the Codex follow-up it supports
  `ENQIDU_OAUTH_ACCEPTANCE_CLIENT=chatgpt|claude` plus an always-on cross-client group
  (see [Remote MCP V1](remote-mcp.md#local-acceptance)). Only `node --check` was run here;
  execute it locally for both values before rollout. Its loopback-only guards are
  unchanged.
- Any hosted check: `enqidu.vercel.app` is not reachable from the review environment.
- A real Claude Chat OAuth connection. Required before declaring the integration
  operational — see [acceptance criteria](claude-connection.md#acceptance-criteria).

## Codex audit follow-up (2026-10-29)

Codex audited commit `b699ddbf948b0ab6b6c1b0ee754a67ff04641f90`: PASS WITH CONDITIONS, no
BLOCKER/HIGH findings. Follow-up changes, with no runtime code change:

1. **Vercel Git deployments**: `vercel.json` `git.deploymentEnabled` now explicitly sets
   `claude/enqidu-mcp-claude-chat-q65f3k` to `false`, like earlier MCP branches. Evidence
   for the already-pushed `b699ddbf`: GitHub reported no Vercel commit status or check on
   it (only `test-build`, `e2e`, skipped `Supabase Preview`). The Vercel API was not
   readable from the review session (team-scope 403), so absence of a preview deployment
   is inferred from GitHub, not confirmed in Vercel.
2. **#104 documentation**: code merged into `main` as `49c719c`; production configuration
   and operational acceptance listed as not verified in
   [rollout status](remote-mcp.md#rollout-status). Updated `remote-mcp.md`,
   `epic-104-architecture.md`, `oauth-production-runbook.md`, `validation-104.md`,
   `chatgpt-connection.md` and `docs/enqidu-mcp-v1.md`.
3. **Initial Claude scopes**: `enqidu.read` and `enqidu.preview` are required at first
   consent; the temporary workaround for a missing preview scope is a manual reconnect
   ([required initial scopes](claude-connection.md#required-initial-scopes)). The HTTP
   challenge protocol is unchanged.
4. **Real acceptance script**: `scripts/test-mcp-oauth-supabase.mjs` supports both clients
   (`ENQIDU_OAUTH_ACCEPTANCE_CLIENT`) and a cross-client group. Not executed here.
5. **CI and validated SHA**: the follow-up commit cannot contain its own SHA; the exact
   validated SHA and its CI result are recorded in the PR #107 description.
