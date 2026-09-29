# SEC-01 — Privileged RPC audit (2026-09-29)

## Result

Supabase Security Advisor initially reported 14 `SECURITY DEFINER` functions executable by the `authenticated` role.

The current frontend runtime was scanned across `src/`. Of those 14 RPCs, only `persist_conversation_enrichment` is called by the application.

That function remains available to `authenticated` because the conversational enrichment flow still uses it. Its execution mode has now been changed to `SECURITY INVOKER`, so its reads/writes run under the caller's table grants and RLS. The function also retains its explicit `auth.uid()` ownership check as defense in depth.

The other 13 functions are legacy/manual `chatgpt_pilot_*` bridge RPCs or manual temporal/metric tooling. No current frontend source calls them.

## Hardening applied

Production migration: `20260929205608_harden_privileged_rpc_authenticated_access`.

For the 13 non-runtime privileged RPCs:

- `PUBLIC` execute revoked;
- `anon` execute revoked;
- `authenticated` execute revoked;
- `service_role` execute preserved.

This preserves admin/legacy and internal definer-to-definer execution while removing the signed-in Data API surface.

## Final hardening

Production migration: `20260929210827_make_conversation_enrichment_security_invoker`.

Before applying it, the full RPC was exercised inside a transaction after temporarily switching the function to `SECURITY INVOKER`, setting the caller role to `authenticated`, and using a real owned training session. The call succeeded under RLS and the transaction was rolled back.

The migration was then applied persistently and the authenticated dry-run was repeated successfully.

## Verification

After both migrations:

- the 13 legacy/manual privileged RPCs are not executable by `anon` or `authenticated`;
- those 13 remain executable by `service_role`;
- `persist_conversation_enrichment` remains callable by `authenticated`, but is now `SECURITY INVOKER`;
- its multi-table writes succeed under authenticated grants/RLS;
- its explicit `auth.uid()` ownership check remains present;
- Supabase Security Advisor warnings for authenticated `SECURITY DEFINER` functions dropped from 14 to **0**.

## Remaining security work

1. Enable Supabase Auth leaked-password protection (separate Auth configuration warning).
2. Retire/delete legacy `chatgpt_pilot_*` functions only after confirming no external/manual workflow still depends on them.

Do not re-grant `authenticated` execution to the 13 hardened functions without a documented runtime need and an ownership/security review.
