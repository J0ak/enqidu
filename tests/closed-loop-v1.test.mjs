import test from "node:test";
import assert from "node:assert/strict";
import { assessClosedLoop, CLOSED_LOOP_ALGORITHM_VERSION } from "../src/closedLoop/closedLoopAssessment.js";

test("closed loop reports exact linked completion and never applies its proposal", () => {
  const result = assessClosedLoop({ plannedSession: { id: "p1", duration_seconds: 3600, blocks: [{ title: "Run" }] }, executedSession: { id: "e1", planned_session_id: "p1", duration_seconds: 3600, source: "fit", blocks: [{ title: "Run" }] } });
  assert.equal(result.completion, "completed");
  assert.equal(result.adaptation_proposal.action, "keep");
  assert.equal(result.applied, false);
  assert.equal(result.algorithm_version, CLOSED_LOOP_ALGORITHM_VERSION);
  assert.equal(result.executed_session.linked_planned_session_id, "p1");
});

test("closed loop detects partial execution, duration delta, omitted blocks and feedback", () => {
  const result = assessClosedLoop({ plannedSession: { duration_seconds: 3600, blocks: [{ title: "Warmup" }, { title: "Intervals" }] }, executedSession: { duration_seconds: 1800, blocks: [{ title: "Warmup" }] }, userFeedback: { rpe: 9 } });
  assert.equal(result.completion, "partial");
  assert.equal(result.duration_delta.seconds, -1800);
  assert.deepEqual(result.omitted_blocks, ["intervals"]);
  assert.equal(result.adaptation_proposal.action, "reduce");
});

test("missing execution remains unknown rather than missed or failed", () => {
  const result = assessClosedLoop({ plannedSession: { id: "p1" } });
  assert.equal(result.completion, "unknown");
  assert.ok(result.evidence_used.includes("execution_missing"));
  assert.doesNotMatch(JSON.stringify(result), /missed|failed/);
});

test("health comparison states association only and discomfort biases recovery", () => {
  const result = assessClosedLoop({ plannedSession: {}, executedSession: {}, userFeedback: { discomfort: true }, healthBefore: { readiness: { score: 80 } }, healthAfter: { readiness: { score: 60 } } });
  assert.ok(result.evidence_used.includes("subsequent_readiness_lower_than_pre_session"));
  assert.equal(result.adaptation_proposal.action, "recovery_bias");
  assert.doesNotMatch(JSON.stringify(result), /caused|causo|causó/i);
});
