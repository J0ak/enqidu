# AI structured output contract

The AI must not persist chaotic free text directly. The expected flow is:

```text
User dictation or AI plan
  JSON structured as EnqiduTrainingSessionV1
  runtime validation
  exercise alias normalization
  metric and missing-field calculation
  database persistence
  two-level smart card
```

The JavaScript/JSON Schema contract is `EnqiduTrainingSessionV1` in [src/training/schema.js](../src/training/schema.js). This repo is currently a Vite/React app, so the implementation uses JSON Schema-shaped definitions and runtime validation without forcing a Python backend or adding Zod prematurely.

Required top-level fields:

- `schema_version`
- `session`
- `blocks`
- `missing_fields`
- `summary_metrics`

The model supports `planned`, `performed` and `interpreted` as separate layers. Validation and normalization are covered by `npm test`.

