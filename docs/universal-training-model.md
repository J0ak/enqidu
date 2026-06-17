# Universal training model

ENQIDU uses its own canonical training model. Garmin, FIT, Jotason, Strava and Apple Health are external sources or destinations, not the shape of the product.

The canonical hierarchy is:

```text
training_session
  session_block
    block_item
      item_exercise
        performed_set / performed_metric
```

`block_item` is the flexible node. A block can contain direct exercises, stations, round tasks, EMOM minutes, AMRAP tasks, intervals, laps, rests, transitions, breathing tasks, mobility tasks and skill tasks. This lets the same model represent strength, hypertrophy, CrossFit-style work, running, trail, swimming, cycling, mobility, technique, rehab and mixed sessions.

The model keeps three layers separate:

- `planned`: what the AI, coach or template prescribed.
- `performed`: what actually happened.
- `interpreted`: later analysis and coaching interpretation.

No user-specific names, injuries, routes or preferences are hardcoded into the model. Personalization belongs in user profile, goals, equipment, environments, injuries, preferences, history, connected sources and performance markers.

The first implementation lives in:

- [src/training/schema.js](../src/training/schema.js)
- [src/training/metrics.js](../src/training/metrics.js)
- [scripts/sql/2026-06-17_universal_training_model.sql](../scripts/sql/2026-06-17_universal_training_model.sql)

