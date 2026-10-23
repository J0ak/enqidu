# Connecting ChatGPT to ENQIDU

**SECURITY BLOCKER — not ready to merge or enable OAuth:** real Supabase Auth accepts account mutations with both the current and resource-only bearer. See [Auth account gate and evidence](auth-account-security-gate.md). Existing Data API/Edge isolation does not solve this.

This is a standard remote MCP server, independent of any particular ChatGPT UI. Connection is available only when the account/product/plan and workspace policy permit custom MCP servers. #104 neither purchases a plan nor connects a production account.

Before connection, an operator must complete the [production runbook](oauth-production-runbook.md). Use the existing ENQIDU host's **HTTPS** endpoint `https://<host>/api/mcp` with **OAuth**. Never paste a JWT, API key, refresh token or Supabase service credential into ChatGPT or a tool argument.

The [current official OpenAI connection guide](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt), reviewed 2026-10-21/22, describes ChatGPT Plugins → plus button → **Add custom MCP server**, a name/description, the public endpoint under Connection, authentication configuration, then **Create as a plugin** and review discovered tools. Install/select the resulting plugin in a new conversation (the guide currently uses `@`). Labels and eligibility can change; follow the equivalent account/workspace flow shown in the current product. If the option is unavailable, the workspace administrator must establish eligibility; this PR does not change that policy. No paid tunnel or additional hosting is required.

OAuth redirects to Supabase and ENQIDU `/oauth/consent`. Sign in to ENQIDU and review the client and identity scopes. The screen says that MCP can read sporting/health data and prepare previews, and cannot persist changes. Approve or deny there; Supabase creates the code and returns the redirect. ChatGPT owns the resulting OAuth tokens, not ENQIDU's consent component.

Verify discovery against the [exact 27-tool manifest](remote-mcp.md#exact-remote-discovery). All annotations should be read-only; no `apply_*`, SQL, table or RPC tool should appear. Useful checks without requiring a paid LLM in development:

1. Resolve “Dominada alta”, then read `get_exercise_progress_v1` for `high_pull_up`.
2. Read recent activities for a date, then `get_training_session_detail_v2` for the returned ID.
3. Read `get_training_overview_v1` with `period="4"`.
4. Resolve HSPU and inspect `missing_metrics`; unavailable reps must not appear as zero.

If discovery fails, check the RFC 9728 response and 401 challenge, issuer discovery, resource audience, consent configuration, and account policy. Do not bypass authentication by sending a frontend session token. Debug with MCP Inspector/SDK locally before a production smoke test; never share raw authenticated traffic containing health data or credentials.

To revoke, disconnect/remove the custom server in ChatGPT, then revoke its grant in Supabase using the athlete's OAuth grant management APIs (`auth.oauth.listGrants()` / `auth.oauth.revokeGrant({ clientId })`) or the operator's supported OAuth administration workflow. Verify that a new MCP request is rejected and that refresh cannot regain access. Client-side removal alone is not proof of server-side token revocation. Follow the runbook's live revocation check and issuer expiry semantics.
