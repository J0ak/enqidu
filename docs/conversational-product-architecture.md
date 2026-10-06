# ENQIDU conversational product architecture

## Product decision

ENQIDU is a first-party athlete application and, later, an MCP-accessible backend. The app is **conversation-first, not chat-only**: it owns rich cards, charts, calendar, planned-session detail, executed-session detail and training editing/feedback surfaces.

The same ENQIDU domain capabilities must be reusable from both channels:

```text
App ENQIDU
  -> OpenAI API
      -> ENQIDU tool boundary
          -> ENQIDU policies / planner / state
              -> Supabase / Garmin / FIT

ChatGPT
  -> ENQIDU MCP
      -> same ENQIDU tool boundary
          -> same policies / planner / state
```

OpenAI is initially used directly for the single-provider pilot. Vercel AI Gateway is a later infrastructure option when multi-provider routing, fallback or consolidated observability creates measurable value. Business/domain code must not depend on either transport.

## Responsibility split

### LLM / ChatGPT

May:
- understand free language;
- select an allowed ENQIDU tool;
- extract explicit arguments;
- explain a result in natural language;
- propose alternatives that ENQIDU can validate.

Must not:
- write directly to Supabase;
- invent Garmin/FIT/recovery data;
- decide that an unsaved recommendation is a persisted plan;
- bypass athlete timezone, ownership, conflict or safety checks;
- create capabilities that are not in the enabled tool catalog.

### ENQIDU

Owns:
- canonical athlete state;
- persisted plan and planned-vs-executed history;
- timezone/date semantics;
- deterministic calculations and invariants;
- authorization and narrow write boundaries;
- Garmin/FIT matching and provenance;
- rich product cards/charts/calendar/session views;
- auditability of state changes.

## Deterministic role

The target is hybrid, not "LLM versus deterministic".

Deterministic code remains the authority for:
- state;
- calculations;
- policy/invariants;
- validation;
- writes;
- fail-closed behavior.

Simple, high-confidence language commands may keep deterministic fast paths when that improves cost/latency/reliability. OpenAI is used where free-language interpretation adds value.

The current Phase-1 deterministic Coach remains valid while the OpenAI pilot is evaluated. Enabling an LLM must not silently change today's-plan authority rules.

## Shared tool contract

`src/enqiduTools/registry.js` is the executable, provider-independent contract. App/Coach and local MCP share its authenticated runtime, canonical read domain and preview/apply actions. `src/coachTools/catalog.js` retains compatibility language-intent names; its transport exports project the official registry. See [ENQIDU Tools V1](enqidu-tools-v1.md), [Action Preview V1](enqidu-action-preview-v1.md) and [MCP V1](enqidu-mcp-v1.md). Strict transactional preview consistency remains an explicit write-rollout blocker under the no-migration constraint.

Only implemented capabilities are model-visible. Roadmap tool names are documented but excluded until a validated executor exists.

The first narrow write is `save_recommendation_today`, which maps to the existing server action. It requires an explicit user command and the server must recalculate/revalidate before persistence.

## Product surfaces

The first-party app should preserve and extend:
- conversational Coach;
- smart cards;
- plan/week calendar;
- session detail;
- planned vs executed comparison;
- progress/trend charts;
- exercise/series/tempo/load/RIR feedback;
- Garmin workout preparation/sync where supported.

The MCP channel is an additional interface for users who prefer ChatGPT. It is not a second business-logic implementation.

## Delivery order

1. Shared ENQIDU tool contracts.
2. Natural-language save recommendation over the existing narrow action boundary.
3. OpenAI direct language/tool pilot with strict evals and deterministic fallback.
4. Move / unavailability / environment / duration / cancel / adapt-week actions.
5. Planned -> executed -> Garmin/FIT matching -> adaptation loop.
6. MCP server exposing the same stable ENQIDU tools.
7. Compare native-app and ChatGPT+MCP usage, retention, cost and UX before changing packaging.

## Cost discipline

Keep prompts/context narrow. The LLM should request ENQIDU data through tools instead of receiving large raw histories by default. Record model, input/output tokens, latency and feature code for every paid call. Model choice is an eval/cost decision, not a hard-coded product identity.
