# Exercise catalog

The exercise catalog is what turns dictated text into training data. Without a catalog, the app stores phrases. With a catalog, aliases resolve to canonical exercises and measurements become comparable.

Each catalog entry includes:

- `canonical_slug`
- Spanish and English display names
- aliases
- category and movement pattern
- primary and secondary muscles
- required and optional equipment
- allowed and default measurements
- difficulty and skill levels
- risk tags, contraindications, progressions, regressions and substitutions
- external mappings

Example: `pres palof`, `press palof`, `anti-rotacion con goma` and `Pallof` all normalize to `pallof_press`.

Runtime catalog code lives in [src/training/exerciseCatalog.js](../src/training/exerciseCatalog.js). Database support is in [scripts/sql/2026-06-17_universal_training_model.sql](../scripts/sql/2026-06-17_universal_training_model.sql).

To add an exercise, add a catalog row with a stable `canonical_slug`, useful aliases, allowed measurements and sensible substitutions. Then add measurement requirements in `exercise_measurement_schema` if the default schema is not enough.

