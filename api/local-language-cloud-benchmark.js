import { buildLocalLanguageEvalDataset } from "../src/localLanguage/evalDataset.js";
import {
  CLOUD_BENCHMARK_EXPIRES_AT,
  CLOUD_BENCHMARK_MODEL,
  buildCloudLanguagePrompt,
  parseCloudLanguagePayload,
  selectCloudBenchmarkCases,
  summarizeCloudBenchmark,
} from "../src/localLanguage/cloudBenchmark.js";

export const maxDuration = 300;

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const SYSTEM_PROMPT = buildCloudLanguagePrompt();

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

async function runCase(item, credential) {
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
    error: null,
  };

  const started = performance.now();
  try {
    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLOUD_BENCHMARK_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: item.text },
        ],
        temperature: 0,
        max_tokens: 180,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    record.latencyMs = performance.now() - started;

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      record.error = `gateway_${response.status}: ${payload?.error?.message || "request_failed"}`;
      return record;
    }

    record.raw = payload?.choices?.[0]?.message?.content ?? "";
    record.inputTokens = Number(payload?.usage?.prompt_tokens || 0);
    record.outputTokens = Number(payload?.usage?.completion_tokens || 0);

    const parsed = parseCloudLanguagePayload(record.raw);
    record.jsonValid = parsed.jsonValid;
    record.structuredValid = parsed.structuredValid;
    record.actual = parsed.value;
    if (parsed.error) record.error = parsed.error;
    return record;
  } catch (error) {
    record.latencyMs = performance.now() - started;
    record.error = String(error?.message || error);
    return record;
  }
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
  if (Date.now() >= Date.parse(CLOUD_BENCHMARK_EXPIRES_AT)) {
    return send(res, 410, { error: "benchmark_expired", expires_at: CLOUD_BENCHMARK_EXPIRES_AT });
  }

  const credential = process.env.VERCEL_OIDC_TOKEN;
  if (!credential) return send(res, 503, { error: "vercel_oidc_unavailable" });

  const body = isGetSmoke ? {} : await parseBody(req);
  const mode = !isGetSmoke && body.mode === "full" ? "full" : "smoke";
  const dataset = buildLocalLanguageEvalDataset();
  const sample = selectCloudBenchmarkCases(dataset, mode);
  const records = await mapConcurrent(sample, mode === "full" ? 4 : 2, (item) => runCase(item, credential));

  const inputTokens = records.reduce((sum, record) => sum + record.inputTokens, 0);
  const outputTokens = records.reduce((sum, record) => sum + record.outputTokens, 0);
  const summary = summarizeCloudBenchmark({
    records,
    datasetSize: dataset.length,
    mode,
    inputTokens,
    outputTokens,
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
