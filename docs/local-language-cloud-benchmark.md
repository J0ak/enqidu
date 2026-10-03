# ENQIDU Vercel AI Gateway language benchmark

This benchmark is isolated from production Coach behavior. It tests whether a hosted model can map free language to ENQIDU's closed `intent + slots` contract.

## First candidate

`openai/gpt-4.1-nano`

The first production-relevant hypothesis is OpenAI behind Vercel AI Gateway, so the benchmark starts with OpenAI's low-cost nano model rather than a different provider. The previous free-model idea was dropped after verifying that its Vercel promotion had expired.

The request uses strict JSON Schema structured output. The harness records token usage and estimates cost from the pinned Gateway catalog rates ($0.10/M input, $0.40/M output).

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
