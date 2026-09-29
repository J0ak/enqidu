# SEC-01 — Privileged RPC audit (2026-09-29)

## Result

Supabase Security Advisor initially reported 14 `SECURITY DEFINER` functions executable by the `authenticated` role.

The current frontend runtime was scanned across `src/`. Of those 14 RPCs, only `persist_conversation_enrichment` is called by the application.

That function remains available to `authenticated` because the conversational enrichment flow still uses it and its database body contains an explicit `auth.uid()` ownership check.

The other 13 functions are legacy/manual `chatgpt_pilot_*` bridge RPCs or manual temporal/metric tooling. No current frontend source calls them.

## Hardening applied

Production migration: `20260929205608_harden_privileged_rpc_authenticated_access`.

For the 13 non-runtime privileged RPCs:

- `PUBLIC` execute revoked;
- `anon` execute revoked;
- `authenticated` execute revoked;
- `service_role` execute preserved.

This preserves admin/legacy and internal definer-to-definer execution while removing the signed-in Data API surface.

## Verification

After the migration:

- the 13 hardened RPCs are not executable by `anon`;
- the 13 hardened RPCs are not executable by `authenticated`;
- the 13 hardened RPCs remain executable by `service_role`;
- `persist_conversation_enrichment` remains authenticated + service_role;
- Supabase Security Advisor warnings for authenticated SECURITY DEFINER functions dropped from 14 to 1.

## Remaining security work

1. Review whether `persist_conversation_enrichment` can safely move to a private schema or an invoker-based design without breaking its multi-table write flow.
2. Keep its explicit `auth.uid()` ownership boundary before changing its execution model.
3. Enable Supabase Auth leaked-password protection.
4. Retire/delete legacy `chatgpt_pilot_*` functions only after confirming no external/manual workflow still depends on them.

Do not re-grant `authenticated` execution to the 13 hardened functions without a documented runtime need and an ownership/security review.
