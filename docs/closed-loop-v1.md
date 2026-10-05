# Closed Loop Core V1

`closed_loop_assessment_v1` compares an existing planned-session identity with its linked canonical execution, structured blocks, explicit user feedback and optional pre/post health evidence. FIT remains immutable objective evidence; this module neither reparses nor rewrites it and does not create another session identity.

Algorithm `enqidu.closed-loop.v1.0.0` deterministically reports completion (`completed`, `partial`, or `unknown`), duration delta, omitted named blocks, evidence used, and missing plan/execution facts. A past plan without linked execution remains `unknown`, never “missed” or “failed”. Subsequent readiness can be reported as lower than pre-session evidence; causality is never claimed.

The adaptation proposal supports `keep`, `reduce`, `recovery_bias`, and `no_change` in V1, with confidence, reasons and affected future sessions. It is always returned with `applied=false`. Applying any future change must go through existing explicit, authenticated Coach Actions; this core has no database dependency or write path. That separation lets the app and future MCP tools reuse exactly the same assessment contract.

V1 does not yet perform fuzzy exercise matching, calculate load when canonical load is absent, or automatically choose affected future sessions. Those remain absent rather than inferred.
