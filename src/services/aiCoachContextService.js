import { supabase } from "@/integrations/supabase/client";

export function getLocalCalendarDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function requestCoachReply({ message, mode = "today_coach", date, sessionId } = {}) {
  if (!supabase) {
    return { ok: false, error: "supabase_unavailable" };
  }

  const payload = {
    message,
    mode,
    date: date || getLocalCalendarDate(),
    session_id: sessionId || null,
  };

  const { data, error } = await supabase.functions.invoke("coach-reply", {
    body: payload,
  });

  if (error) {
    return { ok: false, error: error.message || "coach_reply_failed" };
  }

  if (!data?.ok) {
    return { ok: false, error: data?.error || "coach_reply_failed", detail: data?.detail };
  }

  return {
    ok: true,
    answer: data.answer || null,
    cards: Array.isArray(data.cards) ? data.cards : [],
    usage: data.usage || null,
    contextVersion: data.context_version,
    degraded: Boolean(data.degraded),
    error: data.error || null,
    responseMode: data.response_mode || null,
    llmUsed: Boolean(data.llm_used),
  };
}
