import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeStoredCoachMessages } from "./coachCardsView.js";
const initial = [
  { role: "assistant", content: "Cuéntame cómo estás o qué has hecho hoy." },
];
export const coachMessagesKey = (userId) => `enqidu.messages.v2:${userId}`;

/** Legacy unowned history is left untouched, but cannot safely be attributed to a user. */
export function useCoachMessages(userId) {
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const [state, setState] = useState({ userId: null, messages: initial });
  useEffect(() => {
    let messages = initial;
    if (userId) {
      try {
        const saved = localStorage.getItem(coachMessagesKey(userId));
        if (saved) messages = normalizeStoredCoachMessages(JSON.parse(saved));
      } catch {
        /* Local storage may be unavailable. */
      }
    }
    setState({ userId, messages });
  }, [userId]);
  useEffect(() => {
    if (userId && state.userId === userId) {
      try {
        localStorage.setItem(
          coachMessagesKey(userId),
          JSON.stringify(state.messages),
        );
      } catch {
        /* Keep the current conversation usable in memory. */
      }
    }
  }, [userId, state]);
  const setMessages = useCallback(
    (update) => {
      // A late response from a previous account must never populate the next account.
      if (currentUser.current !== userId) return;
      setState((previous) => {
        if (currentUser.current !== userId) return previous;
        const messages =
          previous.userId === userId ? previous.messages : initial;
        return {
          userId,
          messages: typeof update === "function" ? update(messages) : update,
        };
      });
    },
    [userId],
  );
  return [state.userId === userId ? state.messages : initial, setMessages];
}
