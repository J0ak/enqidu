import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.107.0";
import { createManualHealthImportHandler } from "../_shared/manualHealthImportHandler.js";

Deno.serve(createManualHealthImportHandler({
  createReadDb: (authorization: string) => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  }),
  createServiceDb: () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }),
  signingSecret: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
}));
