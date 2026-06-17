# Training smart card UX

The visible UX has exactly two levels:

- Level 1: session summary by blocks.
- Level 2: selected block detail.

The smart card answers five questions quickly:

- What was done.
- How much was done.
- How it was measured.
- Which catalog exercise it maps to.
- Which fields are missing for better comparison.

The main card does not use source metadata as header content. Source, provider, Garmin, FIT, confidence, JSON and debug data can exist in technical views, but the operational card focuses on blocks, exercises, stations, sets, reps, load, time, distance, rounds, score, volume, missing fields and completion.

The testable view-model is [src/training/smartCardView.js](../src/training/smartCardView.js). It exposes only `session_summary` and `block_detail`, and the test suite asserts that no deeper visible navigation is required.

Quick edit is intentionally scoped to missing measurements: reps, reps per side, load, distance, duration, RPE and similar fields. If a value is absent, the card shows it as pending instead of inventing it.

