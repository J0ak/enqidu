# Canonical training semantics V1

One physical activity keeps one `training_sessions.id`. The plan remains intention;
FIT remains physiological evidence; confirmed manual/Coach data supplies execution
semantics. Nothing in this feature creates a training session, rematches activities,
changes a FIT source, or backfills history.

## Shared Tools contract

| Tool | Input | Result |
| --- | --- | --- |
| `get_training_semantics_v1` | canonical `session_id` | bounded exercise state and revision |
| `interpret_training_correction_v1` | Spanish `text`, optional explicit `session_id` / `exercise_target` | clarification choices or the same semantic preview |
| `preview_training_semantics_v1` | `session_id`, typed `operations` | before/after, expected revision, signed fingerprint, five-minute expiry |
| `apply_training_semantics_v1` | original command, channel, revision, fingerprint, expiry, `confirmation: true` | durable receipt and separately verified readback |

All schemas are closed and versioned in `src/training/semantics/contract.js`.
Limits: 8 KiB request, 30 operations, 200 exercises, 100 blocks, 100 reps entries,
600 characters of parser input. Ownership comes only from server-verified Auth.
No input accepts `user_id`, SQL, table names, arbitrary columns, or JSON patches.
Every semantic result declares `llm_used=false` and `usage=null`.

Operations address an exercise UUID: `add_exercise`, `rename_exercise`, `set_reps`,
`set_last_reps`, `set_sets`, `set_load`, `set_rounds`, `set_side`, `set_tempo`,
`append_note`, `set_technical_note`, `set_omitted`. Unspecified fields remain intact.
An addition creates one supporting block for that command; existing exercises and
blocks are never rebuilt. `set_sets` rejects a contradiction with explicit reps.
Omission preserves the row as `execution_type=skipped`; Progress and Weekly exclude
it from executed observations. Notes never produce numeric volume.

Names use trim, case, whitespace, accents and explicit catalog aliases only. The SQL
UUID catalog is seeded from the existing frontend catalog because production's
catalog was empty. An unmatched name remains `reported_name`, with no invented
identity. No historical `Unknown` is automatically identified. Load `0` is observed;
`kg_each` is not multiplied by two. The existing #101 calculation remains authoritative.

## Authentication, transaction and races

The HTTP boundary uses the bearer user for reads and a backend-only service client
for the narrowly scoped INVOKER RPC. It rechecks identity at apply. HMAC-SHA256 binds
the authenticated owner, session, operations, channel, revision and expiry; its key
is the existing backend service credential, never returned to the browser. The
`sha256:` wire prefix identifies this opaque signature, not an unsigned client hash.
Key rotation invalidates outstanding previews; the user prepares a new preview.

PostgreSQL acquires #100's athlete advisory lock, then the canonical session, blocks
and exercises in stable order. It compares the revision under lock and executes
only static, allowlisted statements. The revision covers the full session, exercise
rows plus their MVCC versions, blocks and source links. A changed state returns
`preview_stale`. A durable prior receipt is checked before expiry/state so an exact
retry returns the original event without another block, source or event. Any error,
including the final ledger insert, rolls back the entire transaction.

Readback is a separate authenticated read after commit. A successful apply stays
successful if readback fails or a later change has already occurred:
`applied=true`, `persistence_verified=false`, and a warning. The UI offers a reload,
not another confirmation of a known committed write.

MCP can inspect state and prepare previews using a per-server ephemeral signing
key, without any service credential. Those inspection previews cannot authorize an
App apply: the athlete must review an App-issued preview. Semantic apply is never
advertised by MCP and is rejected even if the old generic write configuration is
enabled. The shipped MCP write configuration remains disabled.

## Provenance and permissions

Each command appends one `training_sources` manual entry, one nonprimary
`session_source_links` supporting link, and one `enkidu_conversation_enrichments`
`semantic_correction_v1` event. Evidence records actor, channel, creation time,
operations, expected revision, before/after and durable receipt. Later corrections
append new events, preserving earlier values. Technical notes use a namespaced
`equipment_snapshot.semantic_technical_note` field without replacing other metadata.

New semantic evidence and links are immutable, including through pre-existing
authenticated CRUD grants. Existing administrative account-erasure cascades remain
possible. Supporting source JSON deliberately omits `session_date`, so #100's source
arrival trigger cannot start a new reconciliation.

Migration `20261018143400_canonical_training_semantics_v1.sql` adds no tables or RLS
policy exceptions. All new functions are SECURITY INVOKER with empty search_path.
Writer execution is service-only; grants cover the specific semantic columns and
evidence inserts. Parent `UPDATE(id)` is required by PostgreSQL row locking, but the
writer never updates a parent. Authenticated exercise UPDATE/DELETE and the old
capture RPC execution are revoked; ingestion INSERT remains available. Existing
temporal reconciliation and FIT ingestion are unchanged. SET ROLE tests exercise
the real privileges. This migration has only been run locally, never in production.

The old `session-correction-apply` returns an authenticated 410 retirement response.
Its preview remains read-only for historical compatibility. The unused conversation
capture service fails closed. The experimental quick editor and its direct writer
are removed: their target tables are absent in production. Historical correction
events remain untouched. There is one supported correction writer for both UIs.

## Athlete experience

Coach intercepts the bounded correction intent before any optional model path.
It shows an inline summary, then **Revisar cambio**, **ANTES / DESPUÉS**, and explicit
**Confirmar / Cancelar**. Ambiguous dates present session buttons (including Fuerza
and Pilates); repeated exercise names present an exercise selector. Unsupported
language offers clarification or the structured editor. Text never auto-applies.
The message stream continues below the card; confirmed receipts survive reload in
the existing per-user conversation storage. Existing weekly cards refresh after apply.

Activity detail exposes **Completar / corregir entrenamiento**, using the same
component and Tools contract. It supports identity/catalog, sets, per-set reps,
load/unit, side, rounds, tempo/pause, execution and technical notes, omission and
addition. It changes only entered fields. Unblocked canonical exercises are shown
in a display-only group; no synthetic block is persisted for a rename.

Both surfaces implement parsing, clarification, preview, stale, applying, applied,
readback warning and error states. Controls remain usable at 390 px with no page
overflow. Confirmation is protected against double clicks and stale previews.

## Deliberate V1 limits

- The grammar is bounded; compound/ambiguous language requires explicit editing.
- A named exercise absent from the activity is proposed as an addition. The user
  must explicitly select/rename an Unknown row to identify that existing evidence.
- No automatic historical reconstruction, physiological correction, new volume
  formula, 1RM estimate, model calls or new reconciliation is included.
- Oversized canonical sessions fail closed; they are not silently truncated.
- Existing ingestion INSERT and unrelated historical table grants are outside this
  focused change. No new generic mutation interface is introduced.
- Production rollout needs a separately authorized migration and Edge/frontend
  release. This PR does not perform that rollout or alter production.

Incremental cost: **€0.00**. Dependencies are unchanged; tests use disposable local
PostgreSQL/Supabase and Chromium. No paid model or infrastructure was provisioned.

## Historical exercise identity continuity (review blocker)

Progress resolves identity at read time, without changing historical rows. The
authenticated loader reads `exercise_catalog` (`id`, `code`, `name`, `metadata`,
`is_active`) in pages of 250 with a hard ceiling of 2,000 rows. A read error or
overflow fails explicitly; a partial catalog must not produce confident matches.
The existing #102 SELECT grant and the catalog's existing authenticated SELECT
policy suffice. This follow-up adds no migration or grants.

One exact index enriches current and historical exercises with
`canonical_exercise_code` before the 52-week identity filter and aggregation:

- A persisted exercise UUID resolves only through that catalog ID.
- Without a UUID, code/name/explicit aliases resolve only when exactly one catalog
  row matches after trim/case/space/accent normalization. No fuzzy or substring lookup.
- Unresolved or ambiguous rows retain the normalized reported-name identity;
  Unknown/desconocido placeholders remain unidentified. Catalog and unresolved-name
  keys use separate namespaces, preventing an ambiguous name from accidentally
  equalling a canonical code.
- Inactive catalog entries remain usable for historical identity. Deactivation
  restricts capture; it must not erase a past exercise's identity.
- Execution type, side, tempo/pause and load unit remain compatibility dimensions.

Progress, Weekly, highlights, 4/12-week trends and the 52-week comparison use the
same enriched rows and `exerciseIdentity`; Weekly has no separate resolver. An old
null-ID “Peso muerto rumano” at 45 kg `[8,8,8]` and a corrected UUID “RDL” at 45 kg
`[10,10,10]` now produce an observed **8 → 10 reps at the same load** record.

Unresolved UUIDs and missing/ambiguous aliases deliberately cannot establish a
canonical equivalence. Catalog codes and historical aliases must remain maintained
as identity data. No production backfill, reconciliation or write is required.
