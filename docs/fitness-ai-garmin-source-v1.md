# Fitness AI Garmin Source V1

## Boundary and status

`FitnessAiGarminSource` is a provisional, server-only Garmin transport adapter. It implements the stable `GarminSource.getHealthRecords({ from_date, to_date, timezone, cursor })` contract and emits the same internal DTOs consumed by `GarminAdapter` and the Health Foundation persistence path.

```text
injected Fitness AI transport
        ↓
FitnessAiGarminSource
        ↓
GarminSource DTOs
        ↓
GarminAdapter
        ↓
wearable_* canonical persistence
```

Fitness AI does **not** create a second health domain. A future `OfficialGarminSource` replaces only the first two boxes and retains the adapter, identity, persistence, and read model. The bridge does not alter FIT/activity ingestion.

There is no callable Fitness AI server API, SDK, endpoint, or credential in this repository. Consequently V1 deliberately requires an injected object implementing `transport.getHealthSummary(request)`. Production activation remains blocked until an approved server-side connector transport can supply this method. The source fails at construction when that boundary is missing; it does not pretend the ChatGPT connector is callable from ENQIDU. No connector secret, Supabase service key, or runtime wiring is included.

## Capability matrix

“Observed live” means the family/shape was observed through the connected Garmin account described in the implementation handoff. Fixtures contain synthetic structure and values only; tool-schema presence alone is not treated as observation.

| Capability | Status | V1 behavior |
| --- | --- | --- |
| Connection and Garmin permissions | **OBSERVED LIVE / not managed here** | Transport owns connection consent. The source receives health evidence only and stores no connector credentials. |
| Daily health (steps, distance, active time, HR summary, stress, Body Battery charge/drain, floors, intensity duration, calories, goals) | **OBSERVED LIVE / supported in part** | Maps all listed fields supported by the canonical DTO. Floors have no Health Foundation field and remain raw evidence. Moderate/vigorous values remain seconds. Weekly intensity goal is kept separate from daily duration. |
| Sleep aggregate, UTC bounds, stage aggregate, score, respiration, optional SpO2/HRV | **OBSERVED LIVE / supported** | Maps available canonical fields. Score/sub-score qualifiers remain evidence because the current DTO has no safe corresponding field. No score is calculated. |
| Explicit sleep-stage intervals | **SUPPORTED BUT NOT YET OBSERVED as exact interval semantics** | Mapped only when points contain explicit `offset_s` and positive `duration_s`; intervals are never inferred from neighboring points. |
| HRV nightly summary and optional series | **OBSERVED LIVE / supported** | Milliseconds only. Never derived from heart rate. |
| Stress, Body Battery, respiration, SpO2, heart-rate series | **OBSERVED LIVE / supported** | Every series is independent. Empty/missing points remain empty/missing. Reported zero is retained where physiologically valid; null remains null. |
| Sleep respiration and sleep SpO2 series | **OBSERVED LIVE / supported** | Stored in the matching canonical sample family with `context="sleep"`. |
| Series basis/resolution/coarsening | **OBSERVED LIVE / supported** | `recorded_at = t0_utc + offset_s`. Basis, timezone offset, applied interval, point counts, and coarsening remain in raw evidence and page metadata. |
| `available`, `partial`, `no_data` | **OBSERVED LIVE / supported** | `no_data` is a successful empty page; `partial` maps only present families. |
| Connector history/window limitations and opaque cursor | **SUPPORTED** | Limitations are returned as `source_metadata`; no history is fabricated. Cursor passes only through the injected transport. |
| Body composition | **NOT AVAILABLE in validated health-summary shape** | Deliberately not mapped. It can be added only after its connector response shape is observed. |
| VO2max, Fitness Age, other vendor insights | **NOT AVAILABLE in validated health-summary shape** | Deliberately not mapped. If later validated, they must remain `vendor_insight`, not objective biometrics. |
| Activity summaries / FIT availability | **OBSERVED LIVE / OUT OF SCOPE** | Not requested, mapped, or persisted. Existing FIT/activity identity and reconciliation remain untouched. |
| Readiness, recovery, training adaptation, health UI, MCP, OpenAI | **OUT OF SCOPE** | No calculation, Coach behavior, UI, or model call is added. |
| Official Garmin API | **FUTURE TRANSPORT** | Future `OfficialGarminSource` must use the same internal DTOs and foundation persistence. |

## Injected transport response contract

The injected transport returns the live Fitness AI Connector health-summary shape. V1 now accepts that observed structure directly and normalizes it before the stable GarminSource DTO layer:

- top-level `data_status` and `latest_available_date`;
- a single-day `data` object whose observed families include `daily`, `sleep`, `stress`, `hrv`, and `spo2`;
- top-level `series` where numeric series are arrays of `[offset_s, value]` pairs;
- `sleep_stages` as explicit `{ stage, start_utc, end_utc }` intervals;
- top-level `series_meta` keyed directly by series name, carrying basis, applied resolution, point counts, and coarsening metadata.

The bridge converts the observed units and field names into the internal canonical DTO envelope: kilometres to metres, minutes/hours to seconds, nightly HRV to milliseconds, and direct tuple offsets to explicit UTC timestamps using `series_meta.<type>.basis.t0_utc`. Missing families and empty series remain absence. Numeric connector offsets are timestamp evidence only and never replace the athlete profile IANA timezone for calendar semantics.

For backwards-compatible tests and transport isolation, the source also accepts the earlier internal normalized envelope used by the synthetic fixtures. Production transport code should prefer the live connector shape above; no runtime connector endpoint, SDK, or credential is invented here.

A live single-day response must expose a consistent `calendar_date` across the returned health families. When only series are present without any family date, the source requires a single-day request so calendar identity cannot be guessed across a range. The transport may still expose an opaque `next_cursor`/limitations metadata if it implements pagination outside the connector's current single-day surface.

## Provenance, timezone, evidence, and security

Every emitted DTO sets exactly:

- `provider="garmin"`;
- `provider_mode="aggregator"`;
- `ingestion_channel="fitness_ai_connector"`.

An upstream connector label such as `health_api` never becomes ENQIDU's ingestion channel. Source identifiers are optional and never fabricated. The connector date remains the canonical calendar date, while the request's athlete profile IANA timezone is authoritative; connector numeric offsets are timestamp evidence only. This prevents browser, process, UTC-date, or connector-offset calendar derivation, including near midnight and DST.

The source retains the family summary, series points, series basis/resolution, and safe response metadata as provider evidence. Credential-shaped keys (`authorization`, cookies, tokens, API keys, client secrets, credentials, and unrelated ChatGPT conversation content) are removed before persistence. Raw evidence is returned only to the established persistence adapter; ingestion results expose safe status/metadata rather than raw health payloads.

The bridge adds no migration or grants. It uses the existing server-resolved user, service-only narrow RPC, channel-independent Garmin natural identity, RLS, and projection version ordering. Therefore exact retries are no-ops, newer corrections update the same datum, stale revisions are ignored, correction-to-null removes the old projection, reported zero remains zero, users/dates cannot collide, and a future transport-channel change does not create a parallel Garmin fact.

## Runtime hookup remaining

Provide a reviewed server-only `FitnessAiGarminTransport` implementation whose `getHealthSummary` calls an approved runtime-callable connector surface and returns the documented envelope. Authentication must remain inside that transport and must not be logged or returned as evidence. Until such a surface and credential exist, do not instantiate this source in production. This is the single external hookup remaining; no paid resource is assumed or provisioned by this change.
