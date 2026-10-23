# Connecting ChatGPT to ENQIDU

PR #104 is DRAFT and not deployed. After review and the separately authorized [production runbook](oauth-production-runbook.md), the endpoint is `https://enqidu.vercel.app/api/mcp`, using ENQIDU OAuth authorization code + PKCE. Availability depends on the ChatGPT product/plan/workspace; this PR buys nothing and registers no real client.

Follow the [official custom MCP connection guide](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) for the account's current interface: add a custom MCP server/plugin, enter the HTTPS resource URL, select OAuth, then review/install its discovered tools. Labels and eligibility can change. If unavailable, the workspace administrator must establish eligibility; do not use a paid workaround.

[OpenAI's current auth documentation](https://developers.openai.com/plugins/build/auth) supports stable `https://chatgpt.com/oauth/client.json` when RFC 9207 issuer identification is implemented. ENQIDU advertises CIMD and `none`; no client secret, DCR registration or pasted token is needed. The server fetches that exact approved document and validates the published callback. Other arbitrary CIMD URLs are rejected.

The browser visits ENQIDU's consent page. Sign in using your existing ENQIDU account, review `enqidu.read`, optional `enqidu.preview` and `offline_access`, then approve or deny. ENQIDU issues the opaque code/token; ChatGPT never receives your Supabase session. No OIDC identity scopes, UserInfo or ID token are involved. The connection permits sporting reads and requested previews, never writes or account changes.

Verify the [exact 27 tools](remote-mcp.md#exact-remote-discovery): no `apply_*`, SQL or generic RPC. Resolve “Dominada alta”, then get `high_pull_up` progress; use recent activities plus session detail for a recorded workout; use overview for broad questions. Missing data must remain missing.

To revoke server-side access, while logged into ENQIDU open `/oauth/connections` and choose **Revocar acceso** for ChatGPT. This invalidates access and refresh credentials. Also remove/disconnect the custom server in ChatGPT as desired; client-side removal alone is not proof of revocation. A connection expires after 90 days at most and then needs fresh consent.

If linking fails, check discovery, exact issuer/resource, CIMD availability, `iss` callbacks, PKCE and workspace eligibility. Never paste Supabase JWTs, access/refresh tokens or service keys into ChatGPT. Use the SDK/local acceptance for diagnostics without logging authenticated traffic.
