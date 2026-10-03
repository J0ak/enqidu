import { localLanguageJsonSchema } from "../src/localLanguage/contract.js";
import { requestOpenAiResponses } from "../src/llm/openAiResponsesProvider.js";
import { buildLocalLanguageEvalDataset } from "../src/localLanguage/evalDataset.js";
import {
  OPENAI_LANGUAGE_BENCHMARK_EXPIRES_AT,
  OPENAI_LANGUAGE_BENCHMARK_MODEL,
  buildOpenAiLanguageInstructions,
  parseOpenAiLanguageOutput,
  selectOpenAiBenchmarkCases,
  summarizeOpenAiBenchmark,
} from "../src/localLanguage/openAiBenchmark.js";

export const maxDuration = 300;

const SYSTEM_INSTRUCTIONS = buildOpenAiLanguageInstructions();

function send(res, status, body) {
  res.status(status);
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json(body);
}

async function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

async function runCase(item, apiKey) {
  const record = {
    id: item.id,
    text: item.text,
    kind: item.kind,
    language: item.language,
    expected: item.expected,
    actual: null,
    raw: null,
    jsonValid: false,
    structuredValid: false,
    latencyMs: null,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    error: null,
  };

  const result = await requestOpenAiResponses({
    apiKey,
    model: OPENAI_LANGUAGE_BENCHMARK_MODEL,
    reasoning: { effort: "none" },
    instructions: SYSTEM_INSTRUCTIONS,
    input: item.text,
    text: {
      format: {
        type: "json_schema",
        name: "enqidu_local_language_v0",
        strict: true,
        schema: localLanguageJsonSchema,
      },
    },
    maxOutputTokens: 220,
    store: false,
    timeoutMs: 20_000,
  });

  record.latencyMs = result.latency_ms ?? null;
  if (!result.ok) {
    const status = result.status == null ? "transport" : result.status;
    record.error = `openai_${status}: ${result.error || "request_failed"}`;
    return record;
  }

  const usage = result.raw_usage || {};
  record.raw = result.text || "";
  record.inputTokens = Number(usage.input_tokens || 0);
  record.outputTokens = Number(usage.output_tokens || 0);
  record.reasoningTokens = Number(usage.output_tokens_details?.reasoning_tokens || 0);

  const parsed = parseOpenAiLanguageOutput(record.raw);
  record.jsonValid = parsed.jsonValid;
  record.structuredValid = parsed.structuredValid;
  record.actual = parsed.value;
  if (parsed.error) record.error = parsed.error;
  return record;
}
async function mapConcurrent(items, concurrency, worker) {
  const output = new Array(items.length);
  let next = 0;

  async function consume() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return output;
}

export default async function handler(req, res) {
  const isGetSmoke = req.method === "GET";
  if (!isGetSmoke && req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  if (process.env.VERCEL_ENV !== "preview") return send(res, 404, { error: "preview_only" });
  if (Date.now() >= Date.parse(OPENAI_LANGUAGE_BENCHMARK_EXPIRES_AT)) {
    return send(res, 410, { error: "benchmark_expired", expires_at: OPENAI_LANGUAGE_BENCHMARK_EXPIRES_AT });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return send(res, 503, { error: "openai_api_key_missing" });

  const body = isGetSmoke ? {} : await parseBody(req);
  const mode = !isGetSmoke && body.mode === "full" ? "full" : "smoke";
  const dataset = buildLocalLanguageEvalDataset();
  const sample = selectOpenAiBenchmarkCases(dataset, mode);
  const records = await mapConcurrent(sample, mode === "full" ? 4 : 2, (item) => runCase(item, apiKey));

  const summary = summarizeOpenAiBenchmark({
    records,
    datasetSize: dataset.length,
    mode,
    inputTokens: records.reduce((sum, record) => sum + record.inputTokens, 0),
    outputTokens: records.reduce((sum, record) => sum + record.outputTokens, 0),
    reasoningTokens: records.reduce((sum, record) => sum + record.reasoningTokens, 0),
  });

  const failures = records.filter((record) =>
    record.error
    || !record.structuredValid
    || record.actual?.intent !== record.expected?.intent
    || JSON.stringify(record.actual?.slots) !== JSON.stringify(record.expected?.slots)
  ).map((record) => ({
    id: record.id,
    text: record.text,
    kind: record.kind,
    language: record.language,
    expected: record.expected,
    actual: record.actual,
    raw: record.raw,
    latency_ms: record.latencyMs == null ? null : Math.round(record.latencyMs),
    error: record.error,
  }));

  return send(res, 200, { summary, failures });
}
