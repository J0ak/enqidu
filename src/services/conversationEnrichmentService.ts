import { supabase } from "@/integrations/supabase/client";
import { reconcileSessionTemporalBlocks } from "@/services/temporalReconciliationService";

export async function persistConversationEnrichment(params: {
  sessionId: string;
  payload: unknown;
  aiUsage: unknown;
}) {
  const { sessionId, payload, aiUsage } = params;

  if (!supabase) {
    throw new Error("Supabase client is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  const { data, error } = await supabase.rpc("persist_conversation_enrichment", {
    p_session_id: sessionId,
    p_payload: payload,
    p_ai_usage: aiUsage,
  });

  if (error) {
    console.error("[persistConversationEnrichment] RPC error", error);
    throw error;
  }

  try {
    await reconcileSessionTemporalBlocks(sessionId);
  } catch (reconciliationError) {
    console.warn("[persistConversationEnrichment] temporal reconciliation skipped", reconciliationError);
  }

  return data;
}
