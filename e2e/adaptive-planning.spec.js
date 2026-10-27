import { test, expect } from "@playwright/test";
import { createToolsFixture, TOOLS_PASSWORD } from "./tools-fixture.js";

async function login(page, f) {
  await page.goto("/#/profile");
  await page.getByRole("button", { name: "Perfil" }).click();
  await page.getByPlaceholder("email").fill(f.email);
  await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
  await page.getByRole("button", { name: "Conectar" }).click();
  await expect(page.getByText("Sesión iniciada.")).toBeVisible();
  await page.locator('button.railButton[aria-label="Coach"]').click();
}
async function ask(page, message) {
  const response = page.waitForResponse((r) => r.url().includes("/functions/v1/coach-reply") && r.request().method() === "POST");
  await page.getByPlaceholder("Escribe o dicta tu actualización").fill(message);
  await page.getByRole("button", { name: "Enviar" }).click();
  const result = await response; expect(result.status()).toBe(200); return result.json();
}
for (const [message, intent] of [["Hoy sólo tengo 30 minutos", "duration"], ["He dormido mal, ¿qué hago?", "poor_sleep"], ["No puedo entrenar hoy", "unavailable"], ["Hoy estoy en casa", "home"], ["He hecho mucha más carga de la prevista", "overload"]]) {
  test(`AP2 real Coach: ${message} has no write and no LLM`, async ({ page }) => {
    const f = await createToolsFixture(`adaptive-${intent}`);
    try {
      const before = await f.snapshot();
      await login(page, f);
      const writes = [];
      page.on("request", (r) => { if (r.url().includes("/functions/v1/enqidu-tools") && r.postDataJSON()?.tool?.startsWith("apply_")) writes.push(r.url()); });
      const response = await ask(page, message);
      expect(response).toMatchObject({ llm_used: false, usage: null, response_mode: "deterministic", calendar_timezone: "Europe/Madrid", request_date: f.date(), adaptive_assessment: { schema_version: "adaptive_assessment_v2", request: intent } });
      expect(response.answer).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}|fingerprint|schema_version/);
      expect(writes).toHaveLength(0); expect(await f.snapshot()).toEqual(before);
    } finally { await f.dispose(); }
  });
}

test("AP2 browser selects a persisted session without prior chat cards", async ({ page }) => {
  const f = await createToolsFixture("adaptive-selection", { health: false });
  try {
    const [second] = await f.insert("planned_training_sessions", { user_id: f.user.id, planned_date: f.date(), title: "Aeróbico de tarde", session_type: "running", source: "enkidu_coach", status: "planned", planned_duration_min: 50, planned_duration_max: 50, location_type: "home" });
    await f.insert("planned_session_blocks", { planned_session_id: second.id, block_order: 1, block_type: "aerobic", title: "Aeróbico por tiempo", planned_duration_seconds: 3000 });
    const before = await f.snapshot(); await login(page, f);
    const ambiguous = await ask(page, "Hoy sólo tengo 30 minutos");
    expect(ambiguous.adaptive_assessment.status).toBe("requires_choice");
    const selection = page.waitForResponse((r) => r.url().includes("/functions/v1/enqidu-tools") && r.request().postDataJSON()?.tool === "get_adaptive_assessment_v2");
    await page.getByRole("button", { name: /REVISAR Aeróbico de tarde/ }).click();
    const response = await (await selection).json();
    expect(response.data.preview.before[0].id).toBe(second.id);
    await expect(page.getByRole("heading", { name: "Antes", exact: true })).toBeVisible();
    expect(await f.snapshot()).toEqual(before);
    const apply = page.waitForResponse((r) => r.url().includes("/functions/v1/enqidu-tools") && r.request().postDataJSON()?.tool === "apply_adapt_duration");
    await page.getByRole("button", { name: "APLICAR", exact: true }).click();
    expect((await (await apply).json()).data.persistence_verified).toBe(true);
    const after = await f.snapshot();
    expect(after.plans.find((p) => p.id === second.id).planned_duration_min).toBe(30);
    expect(after.plans.filter((p) => p.id !== second.id)).toEqual(before.plans.filter((p) => p.id !== second.id));
    await expect(page.getByRole("button", { name: "APLICAR", exact: true })).toHaveCount(0);
    expect(after.executions).toEqual(before.executions);
  } finally { await f.dispose(); }
});

test("AP2 browser refuses to shorten a strength prescription and explains the limitation", async ({ page }) => {
  const f = await createToolsFixture("adaptive-strength", { health: false });
  try {
    const edit = await f.adminDb.from("planned_session_blocks").update({ block_type: "strength", planned_rounds: 3, planned_exercises: [{ name: "Sentadilla", sets: 3, reps: 8 }] }).eq("planned_session_id", f.identities.todayPlan.id);
    expect(edit.error).toBeNull(); const before = await f.snapshot(); await login(page, f);
    const response = await ask(page, "Hoy sólo tengo 30 minutos");
    expect(response.adaptive_assessment.status).toBe("insufficient_information");
    await expect(page.getByText(/La estructura no permite ajustar esa duración/)).toBeVisible();
    await expect(page.getByRole("button", { name: "APLICAR", exact: true })).toHaveCount(0);
    expect(await f.snapshot()).toEqual(before);
  } finally { await f.dispose(); }
});
