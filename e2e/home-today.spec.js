import { test, expect } from "@playwright/test";
import { createToolsFixture, TOOLS_PASSWORD } from "./tools-fixture.js";

test("Home: authenticated canonical cockpit, mobile navigation, preview only and tenant isolation", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const a = await createToolsFixture("home-a");
  const b = await createToolsFixture("home-b", { health: false, plans: false });
  const call = async (owner, tool) => {
    const response = await request.post(
      `${owner.url}/functions/v1/enqidu-tools`,
      { headers: owner.headers, data: { tool, arguments: {} } },
    );
    const result = await response.json();
    expect(result.ok).toBe(true);
    return result;
  };
  try {
    const before = await a.snapshot();
    const brief = await call(a, "get_daily_coach_operating_brief");
    const week = await call(a, "get_week_plan");
    const foreign = await call(b, "get_daily_coach_operating_brief");
    expect(foreign.data.morning.today_plan.sessions).toEqual([]);
    expect(foreign.data.recent_training.sessions).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const home = page.getByRole("region", { name: "Tu cockpit diario" });
    await expect(
      home.getByRole("button", { name: "Iniciar sesión" }),
    ).toBeVisible();
    await home.getByRole("button", { name: "Iniciar sesión" }).click();
    await page.getByPlaceholder("email").fill(a.email);
    await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
    const tools = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/functions/v1/enqidu-tools"))
        tools.push(r.postDataJSON()?.tool);
    });
    await page.getByRole("button", { name: "Conectar", exact: true }).click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(
      home.getByText("Fuerza vigente hoy", { exact: true }).first(),
    ).toBeVisible();
    await expect(home.getByText(/Europe\/Madrid/)).toBeVisible();
    expect(
      tools.filter((t) => t === "get_daily_coach_operating_brief"),
    ).toHaveLength(1);
    expect(tools.filter((t) => t === "get_week_plan")).toHaveLength(1);
    expect(tools.some((t) => /^(preview|apply)_/.test(t))).toBe(false);
    const progress = home.getByRole("progressbar");
    await expect(progress).toHaveAttribute(
      "value",
      String(week.data.progress.completed_linked_count),
    );
    await expect(progress).toHaveAttribute(
      "max",
      String(week.data.progress.planned_count || 1),
    );
    expect(await a.snapshot()).toEqual(before);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/home-today-390.png",
      fullPage: true,
    });
    await home
      .getByRole("button", { name: "Ver entrenamiento de hoy" })
      .click();
    await expect(page).toHaveURL(/plannedSessionDetail/);
    await expect(
      page.getByText("Fuerza vigente hoy", { exact: true }).first(),
    ).toBeVisible();
    await page.locator('button.railButton[aria-label="Hoy"]').click();
    await expect(
      home.getByRole("button", { name: "Ver / revisar propuesta" }),
    ).toBeVisible();
    await home.getByRole("button", { name: "Ver / revisar propuesta" }).click();
    await expect(page).toHaveURL(/coach/);
    const daily = page.getByRole("region", { name: "Tu día con ENQIDU" });
    await daily
      .getByRole("button", { name: "Revisar propuesta de hoy" })
      .click();
    await expect
      .poll(() => tools.some((t) => t.startsWith("preview_")))
      .toBe(true);
    expect(tools.some((t) => t.startsWith("apply_"))).toBe(false);
    expect(await a.snapshot()).toEqual(before);
    await page.locator('button.railButton[aria-label="Hoy"]').click();
    await home
      .getByRole("button", { name: "Actualizar salud manualmente" })
      .first()
      .click();
    await expect(
      page.getByRole("region", { name: "Importación manual de salud" }),
    ).toBeVisible();
    await page.locator('button.railButton[aria-label="Hoy"]').click();
    await home.getByRole("button", { name: "Ver última actividad" }).click();
    await expect(page).toHaveURL(/activityDetail/);
    await expect(
      page.getByText("Lower Strength ejecutado", { exact: true }).first(),
    ).toBeVisible();
    await page.locator('button.railButton[aria-label="Hoy"]').click();
    await home.getByRole("button", { name: "Abrir Plan", exact: true }).click();
    await expect(page).toHaveURL(/activities/);
    // Presentation variants use real contract responses; persistence above is never mocked.
    let next = structuredClone(brief);
    let weekly = week;
    let release = null;
    await page.route("**/functions/v1/enqidu-tools", async (route) => {
      const tool = route.request().postDataJSON()?.tool;
      if (tool === "get_daily_coach_operating_brief") {
        if (release) await release;
        return route.fulfill({ json: next });
      }
      if (tool === "get_week_plan") return route.fulfill({ json: weekly });
      return route.continue();
    });
    let ready;
    release = new Promise((r) => (ready = r));
    await page.locator('button.railButton[aria-label="Hoy"]').click();
    await expect(
      home.getByText("Preparando tu día con los datos disponibles…"),
    ).toBeVisible();
    ready();
    release = null;
    for (const [state, label] of [
      ["complete", "Datos completos"],
      ["partial", "Datos parciales"],
      ["stale", "Datos anteriores"],
      ["missing", "Sin datos de hoy"],
    ]) {
      next.data.health_today.state = state;
      await home.getByRole("button", { name: "Actualizar Home" }).click();
      await expect(
        home.getByText(label, { exact: true }).first(),
      ).toBeVisible();
    }
    for (const [decision, label] of [
      ["KEEP", "Mantener el plan"],
      ["REDUCE", "Revisar una reducción"],
      ["RECOVERY_BIAS", "Priorizar recuperación"],
      ["REVIEW_REQUIRED", "Revisar el contexto"],
    ]) {
      next.data.decision = decision;
      await home.getByRole("button", { name: "Actualizar Home" }).click();
      await expect(home.getByRole("heading", { name: label })).toBeVisible();
    }
    for (const [status, label] of [
      ["completed_as_planned", "Completado según las medidas comparables"],
      ["completed_modified", "Completado con cambios"],
      ["partial", "Ejecución parcial"],
      ["unknown", "Ejecución del plan sin confirmar"],
    ]) {
      next.data.yesterday.status = status;
      await home.getByRole("button", { name: "Actualizar Home" }).click();
      await expect(
        home
          .getByRole("article", { name: "Resumen de ayer" })
          .getByText(label, { exact: true })
          .first(),
      ).toBeVisible();
    }
    next.data.morning.today_plan.sessions[0].session_type = "rest";
    await home.getByRole("button", { name: "Actualizar Home" }).click();
    await expect(
      home.getByText("Descanso planificado", { exact: true }).first(),
    ).toBeVisible();
    next.data.morning.today_plan.sessions = [];
    next.data.morning.review_action = null;
    next.data.readiness_score = null;
    await home.getByRole("button", { name: "Actualizar Home" }).click();
    await expect(
      home.getByText("No hay una sesión guardada para hoy."),
    ).toBeVisible();
    await expect(
      home.getByRole("button", { name: "Ver / revisar propuesta" }),
    ).toHaveCount(0);
    weekly = { ok: false };
    await home.getByRole("button", { name: "Actualizar Home" }).click();
    await expect(
      home.getByRole("button", { name: "Reintentar semana" }),
    ).toBeVisible();
    next = { ok: false };
    await home.getByRole("button", { name: "Actualizar Home" }).click();
    await expect(
      home.getByRole("button", { name: "Reintentar", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.unroute("**/functions/v1/enqidu-tools");
    await page.getByRole("button", { name: "Perfil", exact: true }).click();
    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await page.getByPlaceholder("email").fill(b.email);
    await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
    await page.getByRole("button", { name: "Conectar", exact: true }).click();
    await expect(
      home.getByText("No hay una sesión guardada para hoy."),
    ).toBeVisible();
    await expect(
      home.getByText("Fuerza vigente hoy", { exact: true }),
    ).toHaveCount(0);
    await expect(
      home.getByRole("button", { name: "Ver última actividad" }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      home.getByText("No hay una sesión guardada para hoy."),
    ).toBeVisible();
    await page.goto("/#/coach");
    await expect(
      page.getByRole("region", { name: "Tu día con ENQIDU" }),
    ).toBeVisible();
  } finally {
    await a.dispose();
    await b.dispose();
  }
});
