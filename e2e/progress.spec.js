import { test, expect } from "@playwright/test";
import { createToolsFixture, TOOLS_PASSWORD } from "./tools-fixture.js";
test("Progress: 390px states, cards, sections and no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => import("/e2e/progress-harness.jsx"));
  await expect(
    page.getByRole("heading", { name: "Tu progreso." }),
  ).toBeVisible();
  for (const status of [
    "loading",
    "partial",
    "insufficient_data",
    "empty",
    "error",
    "available",
  ]) {
    await page.evaluate((s) => window.renderProgress(s), status);
    await expect(
      page.getByRole("region", { name: "Progreso y rendimiento" }),
    ).toBeVisible();
    if (status === "loading")
      await expect(
        page.getByText("Cargando tu histórico canónico…"),
      ).toBeVisible();
    if (status === "error") await expect(page.getByRole("alert")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  for (const name of [
    "Fuerza",
    "Skills",
    "Resistencia",
    "Consistencia",
    "Plan vs ejecución",
    "Resumen",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "test-results/progress-390-summary.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fuerza", exact: true }).click();
  await expect(page.getByText("Press banca DB", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/progress-390-strength.png",
    fullPage: true,
  });
});
test("Progress authenticated tool: tenant isolation, unchanged canonical rows and Home navigation", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const a = await createToolsFixture("progress-a");
  const b = await createToolsFixture("progress-b", {
    plans: false,
    health: false,
  });
  try {
    const before = await a.snapshot();
    const call = async (owner) => {
      const response = await request.post(
        `${owner.url}/functions/v1/enqidu-tools`,
        {
          headers: owner.headers,
          data: {
            tool: "get_progress_performance_v1",
            arguments: { period: "all" },
          },
        },
      );
      const r = await response.json();
      expect(r.ok, JSON.stringify(r)).toBe(true);
      return r.data;
    };
    const own = await call(a),
      foreign = await call(b);
    expect(own.summary.sessions).toBe(1);
    expect(foreign.summary.sessions).toBe(0);
    expect(own.strength[0].known_volume).toBe(675);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/profile");
    await page.getByPlaceholder("email").fill(a.email);
    await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
    await page.getByRole("button", { name: "Conectar", exact: true }).click();
    await page
      .getByRole("button", { name: "PROGRESO · Ver evolución ↗" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tu progreso." }),
    ).toBeVisible();
    await page.getByLabel("Periodo", { exact: true }).selectOption("all");
    await expect(
      page.getByText("Europe/Madrid", { exact: false }).last(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/progress-390-authenticated.png",
      fullPage: true,
    });
    expect(await a.snapshot()).toEqual(before);
  } finally {
    await a.dispose();
    await b.dispose();
  }
});
