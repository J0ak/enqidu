import { firstPartyEndpoint } from "../_shared/firstPartyEndpoint.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleSessionCorrection } from "../_shared/sessionCorrection.ts";

Deno.serve(firstPartyEndpoint((req: Request) => handleSessionCorrection(req, "preview")));
