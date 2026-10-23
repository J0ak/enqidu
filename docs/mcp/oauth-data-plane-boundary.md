# OAuth identity plane and canonical data plane

The final #104 architecture uses **ENQIDU opaque tokens**. Supabase user tokens are first-party browser credentials only. See [architecture](epic-104-architecture.md) and [rejected Supabase OAuth evidence](rejected-supabase-oauth.md).

`src/mcp/remoteAuth.js` resolves the hash through closed private SQL, checks the exact approved client/resource/read scope/expiry and provides only grant user_id to the runtime. Its auth adapter re-resolves during discovery and execution; no Supabase Auth request or positive cache is involved. The SQL resolver verifies the current user is neither deleted nor banned.

`src/mcp/dataPlane.js` retains the server-only capability facade over the existing server data key, explicitly authorized by the earlier review. It permits only canonical read tables and two closed RPC paths; directly owned tables get the verified user filter, and child data is reached only after canonical owned-parent traversal. It exposes no Auth admin, mutations, generic SQL or raw client. The shared domain repeats ownership checks. All 27 tools are compared with A-only baselines while the privileged fixture can see A and B and does not apply RLS.

The pending private OAuth migration retains `read_training_semantics_for_mcp_v1` (service-only invoker adapter to unchanged canonical semantic state) and the canonical context role-reader compatibility fix. It does **not** alter application-table RLS, PostgREST pre-request configuration or Garmin mutation authorization.

Removed from the PR: `20261022133734_oauth_mcp_boundary_v1.sql`, the global `client_id IS NULL` policies, `enqidu_data_api_guard`, `enqidu_assert_first_party`, the extra guard inside `set_garmin_sync_consent`, and `firstPartyEndpoint` wrappers on all ten Edge entrypoints. Their original first-party authentication remains unchanged. The current golden proves opaque-token rejection on the original transports without these compensating controls.

The private token service uses a separate dedicated SQL role/connection from the canonical read plane. A compromise of either server credential remains serious: opaque credentials isolate clients, not compromised backend code. Keep secrets server-only, review least privilege, and preserve both private-function ACL tests and privileged-read tenant tests.
