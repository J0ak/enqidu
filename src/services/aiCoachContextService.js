import { supabase } from "@/integrations/supabase/client";

export async function requestCoachReply({ message, mode = "today_coach", date, sessionId } = {}) {
  if (!supabase) {
    return { ok: false, error: "supabase_unavailable" };
  }

  const payload = {
    message,
    mode,
    date: date || new Date().toISOString().slice(0, 10),
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
    answer: data.answer,
    usage: data.usage,
    contextVersion: data.context_version,
  };
}
