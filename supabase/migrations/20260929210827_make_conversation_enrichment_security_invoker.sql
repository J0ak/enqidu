-- SEC-01 final hardening: execute conversational enrichment with the caller's
-- privileges so authenticated writes are constrained by table grants and RLS.

alter function public.persist_conversation_enrichment(uuid, jsonb, jsonb)
security invoker;
