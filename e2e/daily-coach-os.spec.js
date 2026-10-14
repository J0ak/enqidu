import { test, expect } from "@playwright/test";
import { createToolsFixture, TOOLS_PASSWORD } from "./tools-fixture.js";

test("Daily OS: real authenticated brief → preview → explicit apply → owned history; mobile states", async ({ request, page }) => {
  test.setTimeout(180000);
  const a = await createToolsFixture("daily-os-a");
  const b = await createToolsFixture("daily-os-b", { health: false, plans: false });
  const invoke = async (tool, args = {}) => {
    const response = await request.post(`${a.url}/functions/v1/enqidu-tools`, { headers: a.headers, data: { tool, arguments: args } });
    const result = await response.json(); expect(result.ok, JSON.stringify(result)).toBe(true); return result;
  };
  try {
    const before = await a.snapshot();
    const brief = await invoke("get_daily_coach_operating_brief");
    expect(brief.data.timezone).toBe("Europe/Madrid"); expect(brief.data.date).toBe(a.date());
    expect(brief.data.trend.points).toHaveLength(7); expect(brief.data.llm_used).toBe(false);
    expect(brief.data.health_today.evidence.stress.average).toBe(0);
    expect(await a.snapshot()).toEqual(before);
    const ownedHistory = await a.db.from("daily_coach_events").select("user_id,event_type");
    expect(ownedHistory.error).toBeNull(); expect(ownedHistory.data.every((r) => r.user_id === a.user.id)).toBe(true);
    expect(ownedHistory.data.some((r) => r.event_type === "decision")).toBe(true);
    const foreign = await b.db.from("daily_coach_events").select("id").eq("user_id", a.user.id);
    expect(foreign.error).toBeNull(); expect(foreign.data).toEqual([]);
    expect((await b.db.from("daily_coach_events").insert({ user_id: a.user.id })).error).not.toBeNull();
    const action = brief.data.morning.review_action; expect(action).not.toBeNull();
    const preview = await invoke(action.tool, action.arguments);
    expect(await a.snapshot()).toEqual(before);
    expect((await invoke("get_daily_coach_operating_brief")).data.history.entries.some((e) => e.proposal_status === "previewed")).toBe(true);
    await invoke(action.tool.replace("preview_", "apply_"), { ...action.arguments, confirmation: true, fingerprint: preview.data.fingerprint, expires_at: preview.data.expires_at });
    const applied = await invoke("get_daily_coach_operating_brief");
    expect(applied.data.history.entries.some((e) => e.proposal_status === "applied")).toBe(true);
    const after = await a.snapshot(); expect(after.plans).not.toEqual(before.plans);
    for (const key of ["executions", "fit", "sources", "metrics", "executionBlocks", "exercises"]) expect(after[key]).toEqual(before[key]);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/"); await page.getByRole("button", { name: "Perfil", exact: true }).click();
    await page.getByPlaceholder("email").fill(a.email); await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
    await page.getByRole("button", { name: "Conectar", exact: true }).click();
    await expect(page.getByText("Sesión iniciada.")).toBeVisible();
    let next = structuredClone(applied); let release;
    await page.route("**/functions/v1/enqidu-tools", async (route) => {
      if (route.request().postDataJSON()?.tool !== "get_daily_coach_operating_brief") return route.continue();
      if (release) await release;
      await route.fulfill({ status: 200, json: next });
    });
    let resolveLoading; release = new Promise((r) => { resolveLoading = r; });
    await page.locator('button.railButton[aria-label="Coach"]').click();
    const card = page.getByRole("region", { name: "Tu día con ENQIDU" });
    await expect(card.getByText("Preparando tu resumen diario…")).toBeVisible(); resolveLoading(); release = null;
    await expect(card.getByText("Entreno previsto", { exact: true })).toBeVisible();
    for (const [state, label] of [["complete", "Datos completos"], ["partial", "Datos parciales"], ["stale", "Datos anteriores"], ["missing", "Sin datos de hoy"]]) {
      next.data.health_today.state = state;
      await card.getByRole("button", { name: "Actualizar resumen" }).click();
      await expect(card.getByText(label, { exact: true }).first()).toBeVisible();
    }
    next = { ok: false, error: { code: "canonical_read_unavailable", safe_message: "No disponible" } };
    await card.getByRole("button", { name: "Actualizar resumen" }).click();
    await expect(card.getByRole("button", { name: "Reintentar" })).toBeVisible();
    next = applied; await card.getByRole("button", { name: "Reintentar" }).click();
    await expect(card.getByText("Entreno previsto", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await a.dispose(); await b.dispose(); }
});
