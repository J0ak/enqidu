# Garmin, FIT and Jotason adapter

Garmin/FIT remains an external adapter. The current import path stores FIT payloads, samples, laps, Garmin sets and session metrics. The universal model adds canonical training structure beside that data.

Adapter rule:

```text
Canonical coach model defines sport structure.
Garmin/FIT contributes measured data when available.
Jotason can bridge imported or exported structured sessions.
```

Garmin/FIT metrics that can enrich canonical sessions:

- duration
- heart rate
- calories
- training effect
- laps and splits
- power and cadence
- distance

The smart card should not lead with Garmin/FIT source metadata. The source can appear in technical/debug views, while the main UX stays focused on blocks, catalog exercises, measurements, missing fields and completion.

The existing Garmin/FIT backfill documentation remains in [docs/garmin-backfill.md](./garmin-backfill.md).
