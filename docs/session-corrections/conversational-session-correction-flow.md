# Conversational Session Correction Flow

Status: PR #22 design and implementation.

This flow adds an explicit preview/apply path for correcting the coach/manual structure of an existing training session after the user clarifies the real block order or grouping.

## Functions

- `session-correction-preview`
- `session-correction-apply`

Both functions require JWT and are declared in `supabase/config.toml` with `verify_jwt = true`.

Deploy commands, when Supabase CLI and credentials are available:

```bash
supabase functions deploy session-correction-preview --project-ref rdduqsziboqxlgeqouxq
supabase functions deploy session-correction-apply --project-ref rdduqsziboqxlgeqouxq
```

## What It Does

- Receives an existing `session_id`.
- Receives `local_date`, `correction_type`, `reason`, `source`, and `corrected_structure`.
- Preview reads the current session state and returns before/after counts.
- Apply replaces only coach/manual blocks whose `prescription.source` is `chatgpt_manual_pilot` or `chatgpt_session_correction`.
- Apply records traceability in `enkidu_conversation_enrichments` with `enrichment_type = session_correction`.
- Apply inserts corrected `session_blocks`, `session_exercises`, and correction-scoped `session_metrics`.
- Re-applying the same correction key is idempotent at the session structure level because prior correction/manual blocks are replaced before inserting the corrected structure.

## What It Does Not Do

- No crea una sesion nueva.
- No toca Garmin/FIT.
- No writes to `session_samples`.
- No writes to `session_laps`.
- No writes to `fit_message_payloads`.
- No writes to raw wearable payload tables.
- No updates `has_fit` or source metadata.
- No seed remoto.
- No secrets.
- No fixture Jotason.

## Preview Contract

Expected shape:

```json
{
  "ok": true,
  "action": "replace_coach_blocks",
  "dry_run": true,
  "session_id": "...",
  "preserves": {
    "garmin_fit": true,
    "activity_metrics": true
  },
  "before": {
    "coach_blocks": 7,
    "coach_exercises": 16,
    "protected_blocks": 0
  },
  "after": {
    "coach_blocks": 6,
    "coach_exercises": 18
  },
  "warnings": []
}
```

Preview does not call insert, upsert, update, or delete.

## Apply Contract

Expected shape:

```json
{
  "ok": true,
  "action": "replace_coach_blocks",
  "dry_run": false,
  "session_id": "...",
  "correction_id": "...",
  "correction_key": "...",
  "replaced": {
    "blocks": 7,
    "exercises": 16
  },
  "inserted": {
    "blocks": 6,
    "exercises": 18,
    "metrics": 2
  },
  "preserved": {
    "garmin_fit": true
  },
  "warnings": []
}
```

Apply does not declare success unless `ok` is true.

## Safety Notes

The replacement set is intentionally narrow:

- `chatgpt_manual_pilot`
- `chatgpt_session_correction`

Any other existing block source is preserved and reported through `protected_non_coach_blocks_preserved`.

The correction payload is kept in `enkidu_conversation_enrichments.payload`, including a compact `before` summary and the corrected structure. This keeps traceability without storing Garmin/FIT raw data.

## Pending

- UI entry point can be added later from session detail.
- Automatic extraction from natural language remains outside this PR.
- `coach-reply` integration remains outside this PR.
