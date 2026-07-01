import { supabase } from "@/integrations/supabase/client";

const CAPTURE_TYPE = "coach_memory_conversation";

function buildPayload(payload, mode) {
  return {
    mode,
    capture_type: CAPTURE_TYPE,
    local_date: payload?.local_date || new Date().toISOString().slice(0, 10),
    message: {
      source: payload?.message?.source || "coach_chat",
      language: payload?.message?.language || "es",
      text: payload?.message?.text || "",
    },
    extracted: {
      profile: payload?.extracted?.profile || {},
      goals: payload?.extracted?.goals || [],
      constraints: payload?.extracted?.constraints || [],
      equipment: payload?.extracted?.equipment || [],
      preferences: payload?.extracted?.preferences || [],
      notes: payload?.extracted?.notes || [],
    },
  };
}

async function invokeCoachMemory(payload, mode) {
  if (!supabase) {
    return { ok: false, error: "supabase_unavailable" };
  }

  const { data, error } = await supabase.functions.invoke("coach-context-memory", {
    body: buildPayload(payload, mode),
  });

  if (error) {
    return { ok: false, error: error.message || "coach_context_memory_failed" };
  }

  if (!data?.ok) {
    return { ok: false, error: data?.error || "coach_context_memory_failed" };
  }

  return data;
}

export function previewCoachMemory(payload) {
  return invokeCoachMemory(payload, "preview");
}

export function applyCoachMemory(payload) {
  return invokeCoachMemory(payload, "apply");
}
