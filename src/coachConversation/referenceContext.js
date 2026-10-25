import { matchesSchema } from "../enqiduTools/schema.js";
import { FOCUS_SCHEMA, MAX_REFERENCE_TURNS, emptyFocus } from "./contract.js";

/** Untrusted references only. Never accept facts, tool names, permissions or query fragments. */
export function normalizeConversationFocus(value) {
  if (!matchesSchema(value, FOCUS_SCHEMA)) return emptyFocus();
  if (
    value.period &&
    (value.period.from > value.period.to ||
      (Date.parse(value.period.to) - Date.parse(value.period.from)) /
        86400000 >=
        366)
  )
    return emptyFocus();
  return structuredClone(value);
}
export function focusFromMessages(messages) {
  if (!Array.isArray(messages)) return emptyFocus();
  for (const message of messages.slice(-MAX_REFERENCE_TURNS).reverse()) {
    if (
      message.role === "assistant" &&
      Object.hasOwn(message, "conversation_focus")
    )
      return normalizeConversationFocus(message.conversation_focus);
  }
  return emptyFocus();
}
