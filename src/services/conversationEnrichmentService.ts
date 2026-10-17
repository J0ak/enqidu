import { supabase } from "@/integrations/supabase/client";

export async function persistConversationEnrichment(params: {
  sessionId: string;
  payload: unknown;
  aiUsage: unknown;
}) {
  const { sessionId, payload } = params;

  if (!supabase) {
    throw new Error("Supabase client is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  const { data, error } = await supabase.rpc("capture_training_semantics_v1", {
    p_session_id: sessionId,
    p_payload: payload,
  });

  if (error) {
    console.error("[persistConversationEnrichment] RPC error", error);
    throw error;
  }

  if (!data?.reconciled) throw new Error("Descripción conservada; necesita revisión antes de incorporarla al entrenamiento.");

  return data;
}
