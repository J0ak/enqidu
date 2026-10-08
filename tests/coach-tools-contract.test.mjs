import assert from "node:assert/strict";
import test from "node:test";

import {
  ENQIDU_PLANNED_TOOL_NAMES,
  ENQIDU_TOOL_CATALOG,
  enqiduToolPolicy,
  getEnqiduTool,
  listEnqiduTools,
  toMcpToolDescriptors,
  toOpenAIResponsesTools,
  validateEnqiduToolRequest,
} from "../src/coachTools/catalog.js";

test("ENQIDU TOOLS: enabled catalog has unique strict schemas", () => {
  const names = ENQIDU_TOOL_CATALOG.map((item) => item.name);
  assert.equal(new Set(names).size, names.length);

  for (const item of ENQIDU_TOOL_CATALOG) {
    assert.equal(item.enabled, true);
    assert.equal(item.server_validated, true);
    assert.equal(item.parameters?.type, "object");
    assert.equal(item.parameters?.additionalProperties, false);
  }
});

test("ENQIDU TOOLS: OpenAI and MCP are projections of the same contract", () => {
  const openai = toOpenAIResponsesTools();
  const mcp = toMcpToolDescriptors();

  assert.deepEqual(openai.map((item) => item.name), mcp.map((item) => item.name));
  for (let index = 0; index < openai.length; index += 1) {
    assert.deepEqual(openai[index].parameters, mcp[index].inputSchema);
    assert.equal(openai[index].strict, false);
  }
});

test("ENQIDU TOOLS: writes are explicit and server validated", () => {
  const save = getEnqiduTool("save_recommendation_today");
  assert.equal(save.access, "write");
  assert.equal(save.explicit_user_command, true);
  assert.equal(save.server_validated, true);

  assert.deepEqual(
    validateEnqiduToolRequest({
      name: "save_recommendation_today",
      arguments: { date: null, environment: null },
    }),
    { ok: false, error: "explicit_user_command_required" },
  );

  assert.equal(
    validateEnqiduToolRequest({
      name: "save_recommendation_today",
      arguments: { date: null, environment: null },
      explicitUserCommand: true,
    }).ok,
    true,
  );
});

test("ENQIDU TOOLS: unknown and extra arguments fail closed", () => {
  assert.deepEqual(
    validateEnqiduToolRequest({ name: "drop_database", arguments: {} }),
    { ok: false, error: "unsupported_tool" },
  );
  assert.deepEqual(
    validateEnqiduToolRequest({
      name: "get_today_plan",
      arguments: { user_id: "someone-else" },
      explicitUserCommand: true,
    }),
    { ok: false, error: "unexpected_argument" },
  );
});

test("ENQIDU TOOLS: model-visible contract excludes unimplemented roadmap actions", () => {
  const enabled = new Set(listEnqiduTools().map((item) => item.name));
  for (const name of ENQIDU_PLANNED_TOOL_NAMES) {
    assert.equal(enabled.has(name), false, name);
  }
  assert.equal(enqiduToolPolicy.llm_role, "understand_select_explain");
  assert.equal(enqiduToolPolicy.engine_role, "validate_decide_execute_persist");
});

test("ENQIDU TOOLS: read-only projection removes all write tools", () => {
  const names = toOpenAIResponsesTools({ includeWrites: false }).map((item) => item.name);
  assert.equal(names.includes("save_recommendation_today"), false);
  assert.equal(names.includes("get_today_plan"), true);
});

test("ENQIDU TOOLS: move action is enabled for both App/OpenAI and future MCP projections", () => {
  const openai = toOpenAIResponsesTools().find((item) => item.name === "preview_move_session");
  const mcp = toMcpToolDescriptors().find((item) => item.name === "preview_move_session");
  assert.ok(openai);
  assert.ok(mcp);
  assert.deepEqual(openai.parameters, mcp.inputSchema);
  assert.equal(openai.parameters.additionalProperties, false);
  assert.deepEqual(openai.parameters.required, ["source_date", "target_date"]);
});



test("ENQIDU TOOLS: legacy availability/save intents are not remote capabilities", () => {
  for (const name of ["set_training_unavailability", "save_recommendation_today", "move_planned_session", "adapt_session_duration", "cancel_planned_session"]) {
    assert.equal(toOpenAIResponsesTools().some((item) => item.name === name), false);
    assert.equal(toMcpToolDescriptors().some((item) => item.name === name), false);
  }
  assert.ok(getEnqiduTool("set_training_unavailability"));
});


test("ENQIDU TOOLS: environment adaptation is enabled for App/OpenAI and future MCP projections", () => {
  const openai = toOpenAIResponsesTools().find((item) => item.name === "preview_adapt_environment");
  const mcp = toMcpToolDescriptors().find((item) => item.name === "preview_adapt_environment");
  assert.ok(openai);
  assert.ok(mcp);
  assert.deepEqual(openai.parameters, mcp.inputSchema);
  assert.equal(openai.parameters.additionalProperties, false);
  assert.deepEqual(openai.parameters.required, ["source_date", "environment"]);
});


test("ENQIDU TOOLS: duration adaptation is enabled for App/OpenAI and future MCP projections", () => {
  const openai = toOpenAIResponsesTools().find((item) => item.name === "preview_adapt_duration");
  const mcp = toMcpToolDescriptors().find((item) => item.name === "preview_adapt_duration");
  assert.ok(openai);
  assert.ok(mcp);
  assert.deepEqual(openai.parameters, mcp.inputSchema);
  assert.equal(openai.parameters.additionalProperties, false);
  assert.deepEqual(openai.parameters.required, ["source_date", "duration_minutes"]);
});


test("ENQIDU TOOLS: cancellation is enabled for App/OpenAI and future MCP projections", () => {
  const openai = toOpenAIResponsesTools().find((item) => item.name === "preview_cancel_session");
  const mcp = toMcpToolDescriptors().find((item) => item.name === "preview_cancel_session");
  assert.ok(openai);
  assert.ok(mcp);
  assert.deepEqual(openai.parameters, mcp.inputSchema);
  assert.equal(openai.parameters.additionalProperties, false);
  assert.deepEqual(openai.parameters.required, ["source_date"]);
  assert.equal(getEnqiduTool("cancel_planned_session")?.explicit_user_command, true);
});


test("ENQIDU TOOLS: transport projections default to read and preview only", () => {
  const names = toMcpToolDescriptors().map((item) => item.name);
  assert.equal(names.length, 15);
  assert.equal(names.some((name) => name.startsWith("apply_")), false);
  assert.equal(toMcpToolDescriptors({ includeWrites: true }).filter((item) => item.name.startsWith("apply_")).length, 6);
});
