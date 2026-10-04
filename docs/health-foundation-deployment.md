# Health Foundation V1: verification and rollout

This block prepares ingestion; it does not connect to Fitness AI or deploy a new
public endpoint. Production Supabase was inspected read-only on 2026-10-04.
The versioned migration is reviewed and tested in this PR, not applied to the
production project as part of preparing the PR.

## Verify the PR

```sh
npm ci
node --test tests/garmin-health-*.test.mjs tests/health-foundation-*.test.mjs
npm run test:coach-evals
npm test
npm run build
git diff --check
```

The health SQL tests execute the migration and RPC in isolated PostgreSQL via
PGlite, with an inspected subset of the existing production schema, ownership
policies and client/backend roles. They exercise real constraints, transactions,
privilege checks and RLS. They are not a full reconstruction of production
Supabase, its Auth service, PostgREST or its migration history.

There is no changed browser flow requiring a new Playwright scenario. Existing
GitHub CI still runs its full test/build and isolated Playwright jobs. No Vercel
preview, OpenAI benchmark or paid API is needed.

## Apply after review

1. Review [the schema audit](health-foundation-audit.md), including the existing
   data and channel-dependent identities. The repository does not contain the
   full early production wearable migration history; do not reset production or
   infer that a clean `supabase db reset` recreates its full wearable schema.
2. Apply only `20261004134444_health_foundation_v1.sql` through the established
   deployment process after merge. Recheck ambiguous natural-key groups against
   the current database first. Never fix ambiguity by deleting athlete data.
3. Verify the RPC is `SECURITY INVOKER`, has a fixed search path, and only
   `service_role` can execute it. Verify selected health tables retain RLS and
   owner SELECT policies, with no client DML or TRUNCATE privileges. Re-run
   Supabase security advisors after applying the migration.
   [The read-only verification queries](../supabase/verification/health_foundation_v1.sql)
   report these checks without exposing biometric payloads.
4. Before enabling any source, run two identical ingestions for a consented
   user's known source record. Confirm unchanged canonical row counts and one
   evidence revision. Send a newer correction, including a metric cleared to
   null; confirm the same canonical identity and both evidence revisions. Then
   re-send the older revision and confirm it cannot overwrite the newer state.
5. Repeat using another date and user, and then the official-channel equivalent
   of the same record. Canonical identity must remain independent of delivery
   channel; provenance must identify each real delivery route.

The next source implementation must derive the user identity from a verified
server-side connection/consent, never from a provider payload or model argument.
Transport credentials, tokens and unrelated account data must not be placed in
raw health evidence. The source may call only the reviewed ingestion boundary;
it cannot select arbitrary tables, SQL or write operations.

FIT files, parsing, imported activities and completed training sessions stay in
their existing pipeline. Health ingestion does not write readiness or change
Coach behavior.
