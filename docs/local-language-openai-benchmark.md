# Direct OpenAI language benchmark

This spike evaluates OpenAI as ENQIDU's language layer without changing production Coach behavior.

## Candidate

- model: `gpt-6-luna`
- Responses API
- reasoning effort: `none`
- strict JSON Schema output
- canonical dataset: 222 ES/EN cases

The workload is classification + explicit slot extraction. The LLM is not asked to make sports decisions.

## Invocation

Preview deployment only:

- `GET /api/local-language-openai-benchmark` -> fixed 30-case smoke run
- `POST /api/local-language-openai-benchmark` with `{"mode":"full"}` -> 222-case run

The route expires on `2026-10-07T00:00:00Z` and returns 404 in production.

## Required secret

`OPENAI_API_KEY` must exist only in the server environment. Never expose it to the browser.

## Gates

- structured valid >= 99%
- intent >= 95%
- action intent >= 99%
- exact slots >= 92%

The artifact records provider errors separately from model-quality failures, plus latency, input/output/reasoning tokens and estimated model cost.

No database writes, Garmin/FIT mutations or production LLM routing are part of this spike.
