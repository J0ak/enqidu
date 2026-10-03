import { supabase } from "@/integrations/supabase/client";

export function getLocalCalendarDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getClientCalendarTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export async function requestCoachReply({ message, mode = "today_coach", date, sessionId } = {}) {
  if (!supabase) {
    return { ok: false, error: "supabase_unavailable" };
  }

  const payload = {
    message,
    mode,
    date: date || null,
    date_source: date ? "explicit" : "profile_timezone",
    client_timezone: getClientCalendarTimezone(),
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


export async function saveCoachRecommendationToPlan({ date, location } = {}) {
  if (!supabase) {
    return { ok: false, error: "supabase_unavailable" };
  }

  const payload = {
    action: "save_recommendation_today",
    date: date || null,
    client_timezone: getClientCalendarTimezone(),
    location: location || null,
  };

  const { data, error } = await supabase.functions.invoke("coach-plan-action", {
    body: payload,
  });

  if (error) {
    return {
      ok: false,
      error: data?.error || error.message || "coach_plan_action_failed",
      message: data?.message || null,
    };
  }

  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error || "coach_plan_action_failed",
      message: data?.message || null,
    };
  }

  return {
    ok: true,
    saved: Boolean(data.saved),
    plannedSession: data.planned_session || null,
    responseMode: data.response_mode || null,
    llmUsed: Boolean(data.llm_used),
    usage: data.usage || null,
  };
}


export async function moveCoachPlannedSession({ sourceDate, targetWeekday } = {}) {
  if (!supabase) {
    return { ok: false, error: "supabase_unavailable" };
  }

  const payload = {
    action: "move_planned_session",
    source_date: sourceDate || null,
    target_weekday: targetWeekday || null,
    client_timezone: getClientCalendarTimezone(),
  };

  const { data, error } = await supabase.functions.invoke("coach-plan-action", {
    body: payload,
  });

  if (error) {
    return {
      ok: false,
      error: data?.error || error.message || "coach_plan_action_failed",
      message: data?.message || null,
    };
  }

  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error || "coach_plan_action_failed",
      message: data?.message || null,
      sourceDate: data?.source_date || null,
      targetDate: data?.target_date || null,
    };
  }

  return {
    ok: true,
    moved: Boolean(data.moved),
    plannedSessionId: data.planned_session_id || null,
    title: data.title || null,
    sourceDate: data.source_date || null,
    targetDate: data.target_date || null,
    responseMode: data.response_mode || null,
    llmUsed: Boolean(data.llm_used),
    usage: data.usage || null,
  };
}
