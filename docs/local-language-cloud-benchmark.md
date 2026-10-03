# ENQIDU Vercel AI Gateway language benchmark

This benchmark is isolated from production Coach behavior. It tests whether a hosted model can map free language to ENQIDU's closed `intent + slots` contract.

## First candidate

`amazon/nova-micro`

Nova Micro is deliberately pinned as the first stable low-cost candidate. The previous `inclusionai/ling-3.0-tiny-free` idea was dropped after verifying that its Vercel free promotion had already expired. The harness records token usage and estimates cost from the pinned catalog rates ($0.04/M input, $0.14/M output).

The preview-only benchmark endpoint has a hard expiry and never falls through to another model.

## Safety

- the model is a parser, not a coach;
- no training decision is accepted from the model;
- no plan write is performed;
- production Coach remains deterministic;
- strict output validation rejects extra keys, invented weekday/date combinations, invalid enums and malformed JSON.

## Evaluation

Smoke mode uses 30 cases: every ENQIDU intent once in Spanish and once in English. Full mode uses the canonical 222-case dataset.

Quality gates:
- structured-valid >= 99%
- intent >= 95%
- action intents >= 99%
- exact slots >= 92%

The endpoint exists only on Vercel Preview deployments and expires at `2026-10-05T00:00:00Z`.


## Invocation

A preview deployment accepts `GET /api/local-language-cloud-benchmark` for the fixed 30-case smoke run. Full 222-case evaluation requires an explicit POST body `{"mode":"full"}`. GET can never trigger the full run.
