import { supabase } from "@/integrations/supabase/client";

/** Browser transport only. Identity, calendar and domain validation belong to the server. */
export async function requestEnqiduTool({ tool, arguments: args = {} } = {}) {
  if (!supabase) return { ok: false, error: { code: "supabase_unavailable", safe_message: "No hay conexión con ENQIDU." } };
  try {
    const { data, error } = await supabase.functions.invoke("enqidu-tools", { body: { tool, arguments: args } });
    if (data?.ok === true || data?.error?.safe_message) return data;
    // FunctionsHttpError keeps the safe response in its Response context.
    if (error?.context?.json) {
      try {
        const result = await error.context.json();
        if (result?.ok === false && result?.error?.safe_message) return result;
      } catch { /* A transport failure must not expose backend details. */ }
    }
  } catch { /* Do not display raw transport/database errors. */ }
  return { ok: false, error: { code: "tool_unavailable", safe_message: "No se pudo consultar ENQIDU. Vuelve a intentarlo." } };
}
