# ENQIDU Local Language Layer V0

Status: isolated spike. It is not wired into production Coach routing and cannot change a sports decision or persist an action.

## Goal

Test whether a small LLM running in the browser can replace brittle phrase enumeration for the language-understanding step only:

`free language -> intent + slots -> deterministic ENQIDU engine`

The model is never the source of truth for training, recovery, health, Garmin/FIT, planning state, equipment ownership or calendar state.

## Contract

The parser returns only:

- `intent` from a closed ENQIDU vocabulary;
- explicit semantic slots (`environment`, maximum duration, intensity preference, relative date / weekday);
- input language;
- confidence.

Structured output is validated before ENQIDU can consume it. Unknown intent, invalid JSON/schema, low confidence, timeout, missing WebGPU or a local-model error all fail closed to the deterministic router.

The initial confidence gate is `0.72`. This is an engineering threshold for the spike, not a sports or product decision, and must be recalibrated from measured evals before production use.

## Intent surface

V0 covers current Coach semantics plus the next explicit Coach actions already in scope:

- current: greeting, today recommendation, current-week plan, training trend, recovery query, equipment query, session lookup;
- next actions: save recommendation, move plan, unavailability, adapt environment, adapt duration, cancel plan, adapt rest of week;
- unknown.

Classification of a future action does **not** execute it. Each write still needs its own narrow server-validated action boundary.

## Dataset

`buildLocalLanguageEvalDataset()` generates the initial bilingual eval set from semantic templates and orthogonal slot values instead of hand-authoring hundreds of paraphrases. It includes:

- Spanish and basic English;
- environment × duration × intensity combinations;
- current intents;
- upcoming action intents;
- weekday variants;
- boundary/contrast cases such as next-week wording, yesterday, half-hour and one-hour expressions.

The generator is intended to grow toward pairwise/combinatorial state coverage rather than a list of phrases.

## Browser benchmark

Open `/labs/local-language-v0/` on a Vercel preview/production build. The page is deliberately separate from the ENQIDU UI.

It uses WebLLM `0.2.85` through its documented ESM CDN path and constrained `json_object` schema output. WebLLM runs inference in-browser over WebGPU; the spike makes zero cloud LLM API calls.

Measured per device/model:

- WebGPU availability and adapter information where exposed;
- `deviceMemory` where exposed;
- first/cached initialization time;
- approximate browser storage delta before/after model load (cache footprint proxy);
- documented WebLLM VRAM requirement;
- JSON-valid rate;
- intent accuracy;
- exact slot accuracy;
- model confidence;
- p50/p95/mean warm inference latency;
- failures with expected vs actual parse.

The storage delta is an approximation, not a model artifact byte count. Browser storage APIs and pre-existing caches can affect it.

## Candidate matrix

| Model | WebLLM ID | Params | WebLLM VRAM | Language / license reason |
| --- | --- | ---: | ---: | --- |
| Llama 3.2 1B Instruct | `Llama-3.2-1B-Instruct-q4f16_1-MLC` | 1B | 879.04 MB | Spanish is officially supported; Llama 3.2 Community License |
| Qwen2.5 1.5B Instruct | `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | 1.5B | 1629.75 MB | Multilingual including Spanish; Apache-2.0 |
| SmolLM2 1.7B Instruct | `SmolLM2-1.7B-Instruct-q4f16_1-MLC` | 1.7B | 1774.19 MB | Apache-2.0, but upstream describes it as primarily English; useful negative/control candidate for Spanish |
| Qwen2.5 3B Instruct | `Qwen2.5-3B-Instruct-q4f16_1-MLC` | 3B | 2504.76 MB | Multilingual; Apache-2.0; likely desktop/upper-tier candidate |
| Qwen2.5 0.5B Instruct | `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | 0.5B | 944.62 MB | Below target size, retained only as lower-bound latency/quality baseline |

Current sources:

- WebLLM package/API/model configuration: https://github.com/mlc-ai/web-llm
- Qwen2.5 model family: https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct
- Llama 3.2 1B model card/license: https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct
- SmolLM2 1.7B model card/license: https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct

## V0 technical gates

A model is not eligible for production routing unless it passes all safety gates and is acceptable on the target device class.

Safety/quality gates:

- JSON/schema validity >= 99%;
- intent accuracy >= 95% overall;
- explicit write/action intents >= 99% intent accuracy in their dedicated eval slice;
- exact slot accuracy >= 92% overall;
- no invalid output may bypass validation;
- missing WebGPU/model failure/timeout/low confidence must deterministically fall back;
- zero sports decisions originate in the model.

Initial UX targets for an Android mid-range device (to be measured, not assumed):

- warm parse p50 <= 1.5 s;
- warm parse p95 <= 3.0 s;
- cached model reload should be tolerable enough for normal Coach use;
- no tab/process crash or persistent UI stall.

A larger model is selected only if its measured semantic quality materially improves on the smallest candidate that clears the gates.

## Decision rule after benchmark

1. Prefer an Apache-2.0 candidate if quality/latency is comparable.
2. Prefer the smallest model that clears the quality and Android gates.
3. If no local model clears them, keep the deterministic router as the production path; do not add a cloud-token dependency just to rescue V0.
4. If desktop passes but mid-range Android fails, local LLM remains an optional capability tier, never a correctness dependency.

## Explicit non-goals

- no production `coach-reply` integration yet;
- no database/migration/RLS change;
- no change to deterministic sports rules;
- no automatic plan write;
- no replacement for canonical profile timezone;
- no Garmin/FIT changes.
