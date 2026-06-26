# Coach Context Loader v1

The loader v1 prepares a small application/backend boundary for reading Coach
Context data from `coach_*` tables.

## Files

- `src/coachContext/coachContextTypes.js`
- `src/coachContext/coachContextRepository.js`
- `src/coachContext/coachContextLoader.js`

## Contract

- The repository receives a Supabase-like client as a dependency.
- The loader can return a stable empty DTO when no scope or no rows exist.
- User rows and fixture rows are separate scopes.
- Fixture reads are blocked by default unless explicitly allowed by backend
  code.
- Returned rows keep `source_key`, `source_traceability`, and `data_quality`.
- The loader does not read Garmin/FIT tables.
- The loader does not require secrets in frontend code.

## UI Status

No UI is wired in this PR. The app can wire a minimal Coach Context status panel
in a later PR after deciding whether fixture reads happen only through backend
code or through a dedicated Coach Context endpoint.
