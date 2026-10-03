import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { findLatestRecommendationSaveAction } from "../src/coachContext/coachCardsView.js";
import { detectEnqiduFastPathCommand } from "../src/coachTools/fastPath.js";

test("COACH FAST PATH: explicit save phrases resolve to the narrow ENQIDU write tool", () => {
  for (const phrase of [
    "Apúntamelo",
    "Sí, guárdalo en mi plan",
    "Mételo en mi plan.",
    "Save it to my plan",
    "Put it in my plan",
  ]) {
    const result = detectEnqiduFastPathCommand(phrase);
    assert.equal(result?.tool, "save_recommendation_today", phrase);
    assert.equal(result?.explicit_user_command, true, phrase);
    assert.equal(result?.source, "deterministic_fast_path", phrase);
  }
});

test("COACH FAST PATH: negative or unrelated text never triggers a write", () => {
  for (const phrase of [
    "No lo guardes",
    "¿Qué entreno hoy?",
    "Guarda esto para luego, pero no en mi plan",
    "¿Puedes enseñarme mi plan?",
  ]) {
    assert.equal(detectEnqiduFastPathCommand(phrase), null, phrase);
  }
});

test("COACH FAST PATH: latest actionable recommendation supplies only date and location", () => {
  const action = findLatestRecommendationSaveAction([
    {
      role: "assistant",
      content: "Anterior",
      cards: [{
        id: "recommended_training_today",
        actions: [{ type: "save_recommendation_to_plan", date: "2026-10-02", location: "trail" }],
      }],
    },
    {
      role: "assistant",
      content: "Actual",
      cards: [{
        id: "recommended_training_today",
        actions: [{
          type: "save_recommendation_to_plan",
          date: "2026-10-03",
          location: "home",
          title: "tampered",
        }],
      }],
    },
  ]);

  assert.deepEqual(action, {
    type: "save_recommendation_to_plan",
    date: "2026-10-03",
    location: "home",
  });
});

test("COACH FAST PATH: expired recommendation card is not actionable", () => {
  assert.equal(findLatestRecommendationSaveAction([{
    role: "assistant",
    content: "Caducada",
    cards: [{ id: "recommended_training_today", actions: [] }],
  }]), null);
});

test("COACH FAST PATH: chat save executes before the ordinary Coach request", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const fastPathIndex = source.indexOf("detectEnqiduFastPathCommand(text)");
  const saveIndex = source.indexOf("await handleCardAction(pendingSave)");
  const replyIndex = source.indexOf("const result = await requestCoachReply({", fastPathIndex);

  assert.ok(fastPathIndex >= 0);
  assert.ok(saveIndex > fastPathIndex);
  assert.ok(replyIndex > saveIndex);
  assert.match(source.slice(fastPathIndex, replyIndex), /return;/);
});
