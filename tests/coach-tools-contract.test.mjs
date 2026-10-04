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
    assert.equal(openai[index].strict, true);
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
  const openai = toOpenAIResponsesTools().find((item) => item.name === "move_planned_session");
  const mcp = toMcpToolDescriptors().find((item) => item.name === "move_planned_session");
  assert.ok(openai);
  assert.ok(mcp);
  assert.deepEqual(openai.parameters, mcp.inputSchema);
  assert.equal(openai.parameters.additionalProperties, false);
  assert.deepEqual(openai.parameters.required, ["source_date", "target_weekday"]);
});



test("ENQIDU TOOLS: unavailability action projects identically to OpenAI and future MCP", () => {
  const openai = toOpenAIResponsesTools().find((item) => item.name === "set_training_unavailability");
  const mcp = toMcpToolDescriptors().find((item) => item.name === "set_training_unavailability");
  assert.ok(openai);
  assert.ok(mcp);
  assert.deepEqual(openai.parameters, mcp.inputSchema);
  assert.deepEqual(openai.parameters.required, ["date_reference"]);
  assert.deepEqual(openai.parameters.properties.date_reference.enum, ["today", "tomorrow"]);
  assert.equal(openai.parameters.additionalProperties, false);
});


test("ENQIDU TOOLS: environment adaptation is enabled for App/OpenAI and future MCP projections", () => {
  const openai = toOpenAIResponsesTools().find((item) => item.name === "adapt_session_environment");
  const mcp = toMcpToolDescriptors().find((item) => item.name === "adapt_session_environment");
  assert.ok(openai);
  assert.ok(mcp);
  assert.deepEqual(openai.parameters, mcp.inputSchema);
  assert.equal(openai.parameters.additionalProperties, false);
  assert.deepEqual(openai.parameters.required, ["source_date", "environment"]);
});
