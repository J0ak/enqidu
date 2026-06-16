# Garmin/FIT relational backfill

PR #5 added the existing Garmin/FIT relational tables. This runner backfills an already-imported FIT session from `fit_message_payloads` into those existing tables without creating schema.

## Required environment

Set these locally before running the script:

```powershell
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

The service role key is read from the environment only. The runner never prints it and no secrets should be committed.

## Command

The default target session is `eedf9854-3176-4d82-b8df-c2bdf1ab1df3`:

```powershell
npm run backfill:garmin
```

To run a different session:

```powershell
npm run backfill:garmin -- <session-id>
```

## What it does

- Checks current counts for `fit_message_payloads`, `session_laps`, `session_garmin_sets`, and `session_blocks`.
- Prints `fit_message_payloads` counts grouped by `message_type`.
- Inserts `session_laps` only when the session currently has zero lap rows.
- Uses only `lap`, `laps`, `split`, `splits`, `split_summary`, or `split_summaries` messages for `session_laps`.
- Inserts `session_garmin_sets` only when the session currently has zero Garmin set rows.
- Uses only `set`, `sets`, `workout_step`, or `workout_steps` messages for `session_garmin_sets`.
- Prints final counts after the run.

## What it does not do

- Does not create tables or migrations.
- Does not delete data.
- Does not update `training_sessions`.
- Does not create duplicate sessions.
- Does not touch `session_blocks`.
- Does not insert split/lap rows into `session_garmin_sets`.
- Does not insert set/workout-step rows into `session_laps`.

## Expected target result

For `eedf9854-3176-4d82-b8df-c2bdf1ab1df3`, the existing FIT payload contains Garmin `splits`, not real Garmin strength sets. After running locally against the configured Supabase project:

- `session_laps` should become `3`.
- `session_garmin_sets` may remain `0`.
- `session_blocks` must remain `4`.
