# Fitness AI runtime, ownership and scheduling audit — 2026-10-13

Base: `origin/main` `9fde708d2613ce2e34cfe9c17b92400a5f86664d` (PR #95).
Official public documentation and production **schema/configuration only** were inspected. No Garmin biometrics, ChatGPT credentials, private traffic or undocumented endpoints were accessed.

## Decision

**There is an official developer offering. There is no verified offering usable by ENQIDU under the zero-cost and multiuser constraints.** The prior blanket statement that no transport is documented must not be read as a claim about today's provider capabilities.

Fitness AI publicly documents Developer Option: Basic **$3/month + $10/month**, excluding tax, individually approved, one personal OAuth client. The provider explicitly excludes applications used by other people. ENQIDU must obtain a separate official partner agreement, documented authentication/ownership contract and verified €0 entitlement before implementation/activation. No application was submitted and no subscription was purchased.

`FitnessAiServerTransportUnavailable` performs no I/O and throws `connector_runtime_unavailable`. Production `sourceForUser` is now concrete server-owned binding resolution, but `runtimeAvailable=false` and `schedulerEnabled=false` remain fixed in code. No environment flag enables an invented integration. ENQIDU does not use an open chat, ChatGPT automations, interactive connector permission or a ChatGPT session as its production runtime.

## Exact official evidence

Fetched on 2026-10-13:

| Source | Evidence | Consequence |
| --- | --- | --- |
| [Pricing](https://fmp.it.com/en/fitness-ai/#pricing) | Basic `$3 /mo`; Developer Option `+$10 /mo`; “For your own use only; applications are reviewed individually.” | Violates €0; existing paid ChatGPT access does not confer developer access. |
| [Developer Option](https://fmp.it.com/en/fitness-ai/setup/developer-option/) | “Public client + PKCE”; “Client ID only”; “There is no client secret to store”. | Official delegated OAuth exists, not a service account or client-credentials grant. |
| Same setup page | “Detailed setup instructions (endpoints, parameters, examples) are sent to you by email when your application is approved.” | No usable approved client, callback contract or token lifecycle configuration is available here. Do not guess them. |
| Same setup page, What is not covered | “Apps or services used by other people, including friends, clients or a team”. | Cannot repurpose a personal client as ENQIDU multiuser infrastructure. |
| Same setup page | “after that your program refreshes its access on its own.” | Approved personal OAuth can run autonomously; autonomy is not itself impossible. Entitlement and multiuser permission are the blockers. |
| [Terms §4.7 and §5](https://fmp.it.com/en/fitness-ai/terms/) | §4.7 identifies Developer Option as the only permitted connection for software other than listed AI assistants; forbids allowing another account to sign in through it. | Public knowledge of an MCP URL is not authorization to call it with ENQIDU or reuse assistant credentials. |
| [Claude setup](https://fmp.it.com/en/fitness-ai/setup/claude/) | Publishes `https://garmin-mcp-nuqd.onrender.com/mcp` for the Claude connector and says its OAuth fields may be left alone. | An official MCP endpoint exists. It was **not invoked/probed** as ENQIDU. Client-specific documentation/permission is still required. |
| [FAQ](https://fmp.it.com/en/fitness-ai/faq/) | Free data range is two days; Garmin account export **import** requires Basic. | A two-day health entitlement in a supported assistant is not free access for ENQIDU's server. Import UI is not an export API. |

The connected `get_help(language="en")` tool was used only to locate official help. Its account diagnosis was not used to create a binding. No health-reading tool was used to manufacture runtime evidence.

### Requested transport classification

1. **Server-to-server API:** no standalone official machine-to-machine API contract found in reviewed public pages. Self-hosted personal programs are documented under paid delegated OAuth.
2. **OAuth / developer access:** yes, approved paid personal public-client PKCE; incompatible with this task's constraints.
3. **Webhook:** no documented outbound customer webhook located. Garmin delivering data to Fitness AI is not a webhook available to ENQIDU.
4. **MCP:** yes, published for supported assistants; personal custom-client access is approval-gated and paid.
5. **Export endpoint:** no autonomous daily health export endpoint documented for ENQIDU. FIT downloads and the account import UI are not such a contract.
6. **Service account / application credential:** personal OAuth Client ID documented; no service account/client-secret/client-credentials contract found.
7. **None:** inaccurate as a blanket answer. The correct answer is **official options exist, none verified usable at €0 for ENQIDU multiuser**.

Absence here means not found in the named evidence, not proof that a private partner offering does not exist. Only the provider can establish that offering's terms. No support message has been sent.

## Production contract inspection

Read-only Supabase inspection established:

- Project `Enqidu`, Postgres 17; organization subscription `free` / `tier_free`.
- Existing `user_wearable_connections`: unique `(user_id, provider)`, connection lifecycle fields, external reference, metadata; no consent or server-verification fields.
- Existing policy allowed owner `ALL` and authenticated table grants included INSERT/UPDATE/DELETE/TRUNCATE. Therefore historic `connected` / external reference values are **not trusted ownership evidence**.
- Existing `profiles.preferences` is text and coach profile traceability is user-writable JSON. Neither is a suitable authoritative binding/auditable consent store.
- Existing `ingest_garmin_health_record(p_user_id uuid,p_record jsonb)` remains the canonical writer.
- Existing `get_ai_coach_context` uses `ai_context_assert_user`; that assertion allows service-role server contexts and otherwise enforces `auth.uid() = p_user_id`.
- `pg_cron` and `pg_net` are available but **not installed**; `supabase_vault` 0.3.1 is installed. No extension/job was enabled.

## Scheduler investigation

| Option, in preference order | Incremental cost and limits verified | Authentication / endpoint compatibility | Operational decision |
| --- | --- | --- | --- |
| Supabase Cron + pg_net + Vault | [Cron](https://supabase.com/docs/guides/cron): native Postgres extension; recommend ≤8 concurrent jobs and ≤10 min/job. [Free pricing](https://supabase.com/pricing): $0, 500 MB database, 5 GB egress, 500,000 Edge invocations. [Edge limits](https://supabase.com/docs/guides/functions/limits): 150 s wall time, 2 s CPU, 256 MB. Actual organization Free confirmed; remaining quotas not measured. | `pg_net` POST `{}` to `garmin-daily-sync`; dedicated random ≥32-character secret in Vault and Edge secret `GARMIN_SCHEDULER_SECRET`, header `X-ENQIDU-Scheduler-Secret`. No human JWT. Handler authenticates both entry paths explicitly; gateway JWT verification disabled for this function only. | Preferred after runtime/entitlement/capacity verification. Not installed or scheduled. Within Free allocations no incremental bill; do not claim production capacity until measured. Free project inactivity pauses and DB/egress exhaustion remain risks. |
| Vercel Hobby Cron | [Usage/pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing): included, 100 jobs/project, once daily, ±59 min precision; Functions limits apply. Actual team plan was not returned by available read tools, so Hobby account entitlement is not asserted. | [Cron auth](https://vercel.com/docs/cron-jobs/manage-cron-jobs): `Authorization: Bearer CRON_SECRET`. Vercel invokes a Vercel GET route; repo currently Vite without a cron relay. A fixed relay would authenticate Vercel secret then POST to Supabase with a separate scheduler secret. | Second choice, not activated. Extra relay/secret/config, schedule jitter and account plan/usage must be verified; unsuitable if commercial use conflicts with Hobby terms. |
| GitHub Actions schedule | [Billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions): standard hosted runners free for public repos. `gh repo view J0ak/enqidu --json visibility` returned `PUBLIC`. Private Free allowance 2,000 min/month; larger runners not free. | Repository Actions secret holding the dedicated scheduler secret; fixed URL, POST `{}`, no user JWT or service-role database key. Daily standard Ubuntu job without artifacts/caches would need no additional paid service. | Third choice, not activated. [Schedule docs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): min 5 min, default-branch execution, delays/dropped jobs under load, auto-disable after 60 days inactivity for public repos. |
| Existing repo scheduler / other free service | `vercel.json`: no cron. `.github/workflows/ci.yml`: PR/push/manual CI only. No committed native job found; pg_cron absent in production confirms no native pg_cron job. | No existing scheduler identity to reuse. | No external SaaS, account, paid worker or new cloud service added. |

Daily candidate: `17 6 * * *` UTC, today/yesterday calculated **per profile timezone**, never cron payload. This is a daily ingestion cadence, not a guarantee of each user's local morning. Five owners maximum per run; verify ≤5 eligible users for a once-daily job or explicitly review higher-frequency/capacity changes. Claims advance due time one day: errors or interrupted claims retry next scheduled day; no hidden catch-up loop. Manual sync remains available once operational. Cron history needs bounded retention using the same approved job after activation; do not let `cron.job_run_details` grow without limit.

The actual blocker is upstream runtime/permission, not scheduler availability. **No schedule, secret, paid subscription or production mutation was activated. Delivered incremental service cost: €0.**

Supabase changelog was fetched; the current TLS CBC cipher deprecation affects legacy clients, not the modern pinned supabase-js/Edge runtime used here. Pricing and terms may change; recheck before activation.
