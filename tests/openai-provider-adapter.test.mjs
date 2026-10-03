import assert from "node:assert/strict";
import test from "node:test";

import {
  OPENAI_RESPONSES_API_URL,
  buildOpenAiResponsesBody,
  extractOpenAiResponseText,
  normalizeOpenAiUsage,
  requestOpenAiResponses,
} from "../src/llm/openAiResponsesProvider.js";

test("OPENAI PROVIDER: builds Responses payload without provider secrets", () => {
  const body = buildOpenAiResponsesBody({
    model: "gpt-test",
    instructions: "parse only",
    input: "hola",
    reasoning: { effort: "none" },
    text: { format: { type: "json_schema", name: "x", strict: true, schema: { type: "object" } } },
    maxOutputTokens: 200,
    store: false,
  });

  assert.deepEqual(body, {
    model: "gpt-test",
    instructions: "parse only",
    input: "hola",
    reasoning: { effort: "none" },
    text: { format: { type: "json_schema", name: "x", strict: true, schema: { type: "object" } } },
    max_output_tokens: 200,
    store: false,
  });
  assert.doesNotMatch(JSON.stringify(body), /api[_-]?key|bearer/i);
});

test("OPENAI PROVIDER: extracts text and normalizes usage", () => {
  const payload = {
    id: "resp_1",
    output: [{ content: [{ type: "output_text", text: "uno" }, { type: "output_text", text: "dos" }] }],
    usage: {
      input_tokens: 10,
      output_tokens: 4,
      total_tokens: 14,
      input_tokens_details: { cached_tokens: 3 },
      output_tokens_details: { reasoning_tokens: 1 },
    },
  };
  assert.equal(extractOpenAiResponseText(payload), "uno\ndos");
  assert.deepEqual(normalizeOpenAiUsage(payload, 123.6), {
    response_id: "resp_1",
    latency_ms: 124,
    prompt_tokens: 10,
    completion_tokens: 4,
    total_tokens: 14,
    reasoning_tokens: 1,
    cached_input_tokens: 3,
  });
});

test("OPENAI PROVIDER: successful request returns text and usage through one adapter", async () => {
  let observed;
  const result = await requestOpenAiResponses({
    apiKey: "sk-test-not-real",
    model: "gpt-test",
    instructions: "test",
    input: "hola",
    store: false,
    now: (() => {
      const values = [1000, 1125];
      return () => values.shift() ?? 1125;
    })(),
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          id: "resp_test",
          output_text: "respuesta",
          usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
        }),
      };
    },
  });

  assert.equal(observed.url, OPENAI_RESPONSES_API_URL);
  assert.equal(observed.options.method, "POST");
  assert.equal(observed.options.headers.Authorization, "Bearer sk-test-not-real");
  assert.equal(JSON.parse(observed.options.body).store, false);
  assert.equal(result.ok, true);
  assert.equal(result.text, "respuesta");
  assert.equal(result.usage.latency_ms, 125);
  assert.equal(result.usage.prompt_tokens, 12);
  assert.equal(result.usage.completion_tokens, 3);
});

test("OPENAI PROVIDER: missing key and provider errors fail closed without retry/fallback spend", async () => {
  let calls = 0;
  const missing = await requestOpenAiResponses({
    apiKey: "",
    model: "gpt-test",
    input: "hola",
    fetchImpl: async () => { calls += 1; },
  });
  assert.deepEqual(missing, { ok: false, error: "openai_api_key_missing", status: null });
  assert.equal(calls, 0);

  const failed = await requestOpenAiResponses({
    apiKey: "sk-test-not-real",
    model: "gpt-test",
    input: "hola",
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: async () => ({ error: { message: "rate_limited" } }),
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 429);
  assert.equal(failed.error, "rate_limited");
});

test("OPENAI PROVIDER: invalid request never reaches the network", async () => {
  let calls = 0;
  const result = await requestOpenAiResponses({
    apiKey: "sk-test-not-real",
    model: "",
    input: "hola",
    fetchImpl: async () => { calls += 1; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "openai_model_required");
  assert.equal(calls, 0);
});
