import { createClient } from "npm:@supabase/supabase-js@2";
import { firstPartyBoundary } from "../../../src/auth/firstParty.js";

export function firstPartyEndpoint(
  handler: (req: Request) => Response | Promise<Response>,
  options = {},
) {
  return firstPartyBoundary(
    handler,
    (authorization: string) =>
      createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          global: { headers: { Authorization: authorization } },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      ),
    options,
  );
}
