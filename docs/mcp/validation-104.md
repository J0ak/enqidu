# #104 validation

Validated locally on 2026-10-22 against base `90dfd15f497abb26eb0953c5b934b8c01e21d3ac`, using Node 22.23.3 and the locked dependencies. Security follow-up to `67b574e5207c9111c5aecac23b7356e463181691`. No SDK upgrade, production write, deployment or OAuth configuration change. The reviewed boundary migration was applied only to the disposable local stack.

| Command | Result |
|---|---|
| `npm test` | 885 passed, 0 failed/skipped |
| `npm run test:mcp` | 44 passed, including actual stdio executable and remote SDK transport |
| `npm run test:mcp:remote` | 11 passed |
| `npm run test:semantic-read` | 5 passed |
| `npm run test:tools` | 100 passed |
| `npm run test:coach-evals` | 30 passed |
| `npm run test:transactional-actions` | 37 passed against disposable local Supabase/PostgreSQL |
| `node scripts/test-reconciliation-postgres.mjs` | 43 passed against real PostgreSQL |
| `node scripts/test-semantics-postgres.mjs` | 9 passed against real PostgreSQL |
| `node scripts/test-remote-auth-supabase.mjs` | Passed against real local Supabase Auth |
| `node scripts/test-oauth-boundary-postgres.mjs` | Passed: all exposed local relations audited; negative future-coverage tests; first-party CRUD / OAuth denial |
| `node scripts/test-oauth-boundary-supabase.mjs` | Passed: real REST/RPC/Edge rejection + real SDK MCP golden, no RLS reliance for server client |
| `npm run test:e2e -- --workers=1` | 45 passed, 0 failed (5.0 minutes), including #102/#103 goldens |
| `npm run build` | Passed; existing large-chunk warning (608 kB JS) |
| `git diff --check` | Passed |

The PostgreSQL/Auth commands use the repository's explicit `ENQIDU_TRANSACTION_LOCAL=1` guard and a local-only environment file. No hosted credentials are used. Browser tests use the existing disposable `e2e-local` Supabase project, the repository bootstraps, Chromium, and `OPENAI_COACH_ENABLED=false`. The managed environment required the existing local Edge dependency bundler/proxy helper and a flattened filesystem of the verified official PostgreSQL image to fit the Docker storage driver. These are local test setup details, not deployed changes or paid resources.

The browser runs found the existing all-tools test needed valid inputs for the five new reads; that test now includes every read. The weekly A→B→A browser test also navigated/reloaded before login finished; it now waits for the existing login-success message before navigating. Its isolation assertions remain intact. One transient Daily Coach 400 did not reproduce in the direct domain, local Edge, focused browser rerun or subsequent full run. No assertion was relaxed to ignore the 400. The final whole-suite result is recorded above.

## Transport and security acceptance

- Actual SDK client/server 2.3.1 over loopback HTTP, with modern 2026-07-28 and legacy 2025-11-25 negotiation, discovery and calls. Fresh server and user client per HTTP request; two independent clients have identical sporting results.
- All 27 shared READ/PREVIEW tools succeed and match App runtime, Coach runtime and local MCP. The only exclusions are channel traceability and the existing per-server semantic-preview fingerprint. Fixture tables remain unchanged.
- Missing/invalid/expired/forged/revoked tokens, invalid users, frontend tokens, missing OAuth client/session, wrong issuer/audience/role and future nbf fail with sanitized 401 challenges. Metadata is path-aware RFC 9728 using the official SDK helper; cross-origin public GET/OPTIONS succeeds without credentialed CORS, while data Origin validation remains strict.
- Actual local Auth verifies the audience array and signature and rejects a revoked backing session. The local test synthesizes OAuth-shaped claims with its disposable issuer key; it does **not** claim to test Supabase authorization-code/PKCE issuance.
- All seven existing apply tools are absent from discovery and denied when guessed, even with the write environment flag and malicious metadata. Invented apply/SQL/RPC names are unknown. Client identity, timezone, JWT and capability arguments are rejected.
- Two athletes cannot cross-read sessions, exercise observations or history. All 27 tools match clean A-only results with adversarial foreign parents/children and a privileged fixture that applies no automatic RLS. Real service-role REST-backed semantic/Health/Closed Loop reads also pass, while direct OAuth table and Edge access fails. The first-party JWT/RLS browser tests remain green.
- Wrong methods, media type, malformed JSON, oversized bodies, hostile Host/Origin, unexpected Auth failures, stored prompt injection and allowlisted telemetry are covered.

The security regression also preserves the frontend secret-source guard (now checking both secret-key environment names); environment access lives under `server/`. An existing isolation assertion was corrected to inspect sporting data instead of matching `999` in a random request UUID. Numeric foreign/skipped evidence assertions remain enforced.

## Product evidence

[Golden HTTP result](evidence/golden-high-pull-up.json) was captured from an actual SDK HTTP call through the request bearer boundary and fixture Supabase REST/Auth. It contains synthetic data only: `high_pull_up`, “Dominada alta”, skill, one recorded observation, three reps, null load, complete reps quality, insufficient trend evidence and Europe/Madrid. Skipped and other-athlete observations are excluded.

[Consent at 390 px](evidence/oauth-consent-390.png) was inspected after the browser test. The deliberately hostile client name renders as inert text. Login continuation, previous consent, approve/deny, official-response-only redirects, errors and mobile overflow are tested.

Conversational sequences cover exact RDL/Spanish-name equivalence, HSPU and high pull-up skills, separate pike identities, ambiguous/Unknown references, canonical exercise progress/history, a session with bench 40 kg `[10,10,9]` and RDL 45 kg `[8,8,8]`, overview, missing metrics, zero values and skipped execution. No SQL tool or LLM is involved.

## Limits of this evidence

Production OAuth discovery was 404 in the read-only audit. Public JWKS advertised ES256, but active signing configuration was not changed or proven. Real OAuth issuance, the resource-audience mapping/hook if needed, refresh, grant/session revocation, Vercel routing and eligible ChatGPT connection remain the manual rollout checks in the [runbook](oauth-production-runbook.md). The reviewed restrictive-RLS/Data API migration and all ten Edge guards must be applied/deployed and verified before enabling OAuth. The underlying server data credential bypasses RLS; ownership filters and the closed facade remain mandatory. See the [complete boundary audit](oauth-data-plane-boundary.md). Local success does not authorize deployment.

Incremental spend: **€0.00**.
