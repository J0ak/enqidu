import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { FitnessAiGarminSource } from "../src/health/fitnessAiGarminSource.js";
import { runAutonomousMorning } from "../supabase/functions/_shared/autonomousMorningFlow.js";
import { createEnqiduToolRuntime } from "../src/enqiduTools/runtime.js";
import { createToolsFixture, TOOLS_PASSWORD } from "./tools-fixture.js";

const history = ({ executions, fit, sources, metrics, executionBlocks, exercises }) => ({ executions, fit, sources, metrics, executionBlocks, exercises });
test("live-shaped transport → actual RPC → Health → Readiness → Morning → preview → explicit apply preserves FIT", async ({ request, page }) => {
  test.setTimeout(120000);
  const fixture = await createToolsFixture("garmin-morning", { health: false });
  const { db, adminDb, now, date } = fixture;
  try {
    const raw = JSON.parse(await readFile(new URL("../tests/fixtures/fitness-ai-garmin/live-shape.json", import.meta.url)));
    // Rebase the sanitized observed shape to this disposable athlete's current calendar.
    // This is test evidence, never a production transport or a claim about today's Garmin data.
    const original = "2026-10-04";
    const delta = Date.parse(`${date()}T12:00:00Z`) - Date.parse(`${original}T12:00:00Z`);
    const rebase = (value) => typeof value === "string" && /^2026-10-0[34]T/.test(value) ? new Date(Date.parse(value) + delta).toISOString()
      : value === original ? date() : Array.isArray(value) ? value.map(rebase)
        : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rebase(entry)])) : value;
    let payload = rebase(raw), retrieved = new Date(now).toISOString();
    payload.data.sleep.duration_hours = 4; payload.data.sleep.sleep_score = 35;
    const source = new FitnessAiGarminSource({ clock: () => new Date(retrieved), transport: { getHealthSummary: async (input) => input.from_date === date() ? structuredClone(payload) : { data_status: "no_data" } } });
    const before = await fixture.snapshot();
    const flow = () => runAutonomousMorning({ readDb: db, serviceDb: adminDb, now, sourceForUser: async (id) => { expect(id).toBe(fixture.user.id); return source; } });
    const first = await flow();
    expect(first.ingestion.inserted).toBe(8); expect(first.ingestion.failed).toBe(0);
    expect(first.brief.health_status).toBe("fresh"); expect(first.brief.readiness.score).not.toBeNull();
    expect(first.brief.recommendation).toMatch(/REDUCE|RECOVERY_BIAS/);
    const repeated = await flow(); expect(repeated.ingestion.unchanged).toBe(8);
    retrieved = new Date(Date.parse(retrieved) + 1000).toISOString(); payload.data.daily.steps = 0;
    expect((await flow()).ingestion.updated).toBe(1);
    const count = await adminDb.from("wearable_health_imports").select("id", { count: "exact", head: true }).eq("user_id", fixture.user.id);
    expect(count.count).toBe(8);
    expect(await fixture.snapshot()).toEqual(before);
    await page.goto("/#/profile");
    await page.getByRole("button", { name: "Perfil" }).click();
    await page.getByPlaceholder("email").fill(fixture.email);
    await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
    await page.getByRole("button", { name: "Conectar" }).click();
    await expect(page.getByText("Sesión iniciada.")).toBeVisible();
    await page.locator('button.railButton[aria-label="Coach"]').click();
    const morningResponse = page.waitForResponse((response) => response.url().includes("/functions/v1/coach-reply") && response.request().method() === "POST");
    await page.getByPlaceholder("Escribe o dicta tu actualización").fill("Buenos días");
    await page.getByRole("button", { name: "Enviar" }).click();
    expect((await morningResponse).ok()).toBe(true);
    const reviewed = page.waitForResponse((response) => response.url().includes("/functions/v1/enqidu-tools") && response.request().postDataJSON()?.tool?.startsWith("preview_"));
    await page.getByRole("button", { name: "REVISAR CAMBIO", exact: true }).click();
    expect((await reviewed).ok()).toBe(true);
    expect(await fixture.snapshot()).toEqual(before);
    const runtime = await createEnqiduToolRuntime({ db, adminDb, now, source: "app" });
    const status = await runtime.execute("get_health_ingestion_status");
    expect(status.ok, JSON.stringify(status.error)).toBe(true);
    expect(status.data.latest_calendar_date_seen).toBe(date());
    expect(status.data.families_present).toHaveLength(8);
    expect(status.data.attempt_history_available).toBe(false);
    const disabled = await request.post(`${fixture.url}/functions/v1/garmin-daily-sync`, { headers: fixture.headers, data: {} });
    expect(disabled.status()).toBe(503);
    expect((await disabled.json()).error).toBe("connector_runtime_unavailable");
    const injection = await request.post(`${fixture.url}/functions/v1/garmin-daily-sync`, { headers: fixture.headers, data: { user_id: "another-athlete" } });
    expect(injection.status()).toBe(400);
    const action = first.brief.review_action; expect(action).not.toBeNull();
    const preview = await runtime.execute(action.tool, action.arguments);
    expect(preview.ok, JSON.stringify(preview.error)).toBe(true);
    expect(await fixture.snapshot()).toEqual(before);
    const apply = await runtime.execute(action.tool.replace("preview_", "apply_"), { ...action.arguments, confirmation: true, fingerprint: preview.data.fingerprint, expires_at: preview.data.expires_at });
    expect(apply.ok, JSON.stringify(apply.error)).toBe(true);
    const after = await fixture.snapshot(); expect(after.plans).not.toEqual(before.plans); expect(history(after)).toEqual(history(before));
    const response = await request.post(`${fixture.url}/functions/v1/coach-reply`, { headers: fixture.headers, data: { message: "Buenos días" } });
    expect(response.ok()).toBe(true); const reply = await response.json(); expect(reply.llm_used).toBe(false); expect(reply.response_mode).toBe("deterministic");
  } finally { await fixture.dispose(); }
});
