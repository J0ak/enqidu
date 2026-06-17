# External adapters strategy

ENQIDU's canonical model is not Garmin-shaped. External systems are adapters:

- Garmin/FIT provides reliable device metrics when they exist.
- Jotason can act as bridge/import format.
- Strava and Apple Health can enrich or receive partial exports.

Adapters link into canonical sessions with `source_links` or existing source-link tables. They may enrich duration, heart rate, calories, training effect, laps, power, cadence and distance, but they do not decide what a training session can represent.

This keeps the product able to model strength, stations, circuits, AMRAP, EMOM, intervals, swimming sets, mobility flows and rehab sessions even when a wearable cannot express them cleanly.

Existing FIT import and Garmin relational backfill code remains untouched. New canonical tables are additive.

