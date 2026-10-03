export const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";

const definedEntries = (value) => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== undefined),
);

export function extractOpenAiResponseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const parts = Array.isArray(payload?.output)
    ? payload.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    : [];
  return parts
    .map((part) => part?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function buildOpenAiResponsesBody({
  model,
  instructions,
  input,
  reasoning,
  text,
  maxOutputTokens,
  store,
} = {}) {
  if (!model || typeof model !== "string") throw new Error("openai_model_required");
  if (input == null) throw new Error("openai_input_required");

  return definedEntries({
    model,
    instructions,
    input,
    reasoning,
    text,
    max_output_tokens: maxOutputTokens,
    store,
  });
}

export function normalizeOpenAiUsage(payload, latencyMs = null) {
  const usage = payload?.usage || {};
  return {
    response_id: payload?.id || null,
    latency_ms: Number.isFinite(latencyMs) ? Math.round(latencyMs) : null,
    prompt_tokens: usage.input_tokens ?? null,
    completion_tokens: usage.output_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
    reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? null,
    cached_input_tokens: usage.input_tokens_details?.cached_tokens ?? null,
  };
}

export async function requestOpenAiResponses({
  apiKey,
  model,
  instructions,
  input,
  reasoning,
  text,
  maxOutputTokens,
  store,
  timeoutMs = 20_000,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  if (!apiKey || typeof apiKey !== "string") {
    return { ok: false, error: "openai_api_key_missing", status: null };
  }
  if (typeof fetchImpl !== "function") {
    return { ok: false, error: "openai_fetch_unavailable", status: null };
  }

  let body;
  try {
    body = buildOpenAiResponsesBody({
      model,
      instructions,
      input,
      reasoning,
      text,
      maxOutputTokens,
      store,
    });
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      status: null,
    };
  }

  const started = now();
  let timeoutId = null;
  let controller = null;
  let signal;
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      signal = AbortSignal.timeout(timeoutMs);
    } else if (typeof AbortController !== "undefined") {
      controller = new AbortController();
      signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }
  }

  try {
    const response = await fetchImpl(OPENAI_RESPONSES_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    const latencyMs = now() - started;
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload?.error?.message || response.statusText || "openai_request_failed",
        payload,
        latency_ms: latencyMs,
      };
    }

    return {
      ok: true,
      status: response.status,
      payload,
      text: extractOpenAiResponseText(payload),
      usage: normalizeOpenAiUsage(payload, latencyMs),
      raw_usage: payload?.usage || {},
      latency_ms: latencyMs,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "openai_timeout"
        : String(error?.message || error),
      latency_ms: now() - started,
    };
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}
