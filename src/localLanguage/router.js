import { normalizeLocalLanguageParse } from "./contract.js";
import { buildDeterministicLanguageParse } from "./deterministicFallback.js";

export const DEFAULT_LOCAL_LANGUAGE_CONFIDENCE = 0.72;
export const DEFAULT_LOCAL_LANGUAGE_TIMEOUT_MS = 5000;

function timeoutPromise(timeoutMs) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error("local_language_timeout")), timeoutMs);
    timer.unref?.();
  });
}

export async function routeLocalLanguage({
  message,
  localParser = null,
  minConfidence = DEFAULT_LOCAL_LANGUAGE_CONFIDENCE,
  timeoutMs = DEFAULT_LOCAL_LANGUAGE_TIMEOUT_MS,
} = {}) {
  const fallback = () => ({
    source: "deterministic_fallback",
    parse: buildDeterministicLanguageParse(message),
  });

  if (typeof localParser !== "function") {
    return { ...fallback(), fallback_reason: "local_parser_unavailable" };
  }

  try {
    const raw = await Promise.race([
      Promise.resolve(localParser(message)),
      timeoutPromise(timeoutMs),
    ]);
    const parse = normalizeLocalLanguageParse(raw);
    if (!parse) return { ...fallback(), fallback_reason: "invalid_structured_output" };
    if (parse.intent === "unknown") return { ...fallback(), fallback_reason: "unknown_intent" };
    if (parse.confidence < minConfidence) return { ...fallback(), fallback_reason: "low_confidence" };

    return {
      source: "local_model",
      parse,
      fallback_reason: null,
    };
  } catch (error) {
    return {
      ...fallback(),
      fallback_reason: error?.message === "local_language_timeout"
        ? "local_language_timeout"
        : "local_parser_error",
    };
  }
}
