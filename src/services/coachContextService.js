import { supabase } from "@/integrations/supabase/client";

const DIAGNOSTIC_FIXTURE_USER = "jotason";

export async function fetchCoachContextStatus({ fixtureDiagnostic = true } = {}) {
  if (!supabase) {
    return {
      ok: false,
      status: "empty",
      error: "supabase_unavailable",
    };
  }

  const payload = fixtureDiagnostic
    ? { mode: "fixture_diagnostic", fixture_user: DIAGNOSTIC_FIXTURE_USER }
    : { mode: "user" };

  const { data, error } = await supabase.functions.invoke("coach-context", {
    body: payload,
  });

  if (error) {
    return {
      ok: false,
      status: "error",
      error: error.message || "coach_context_failed",
    };
  }

  if (!data?.ok) {
    return {
      ok: false,
      status: data?.status || "error",
      error: data?.error || "coach_context_failed",
      detail: data?.detail,
    };
  }

  return {
    ok: true,
    ...(data.context || {}),
  };
}
