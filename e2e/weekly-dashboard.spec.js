import { test, expect } from "@playwright/test";
import { createToolsFixture, TOOLS_PASSWORD } from "./tools-fixture.js";
import { durationLabel } from "../src/progress/presentation.js";

test("390px: shared real activity in Home, inline weekly Coach report, persistence and Progress parity", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const a = await createToolsFixture("weekly", { plans: false, health: false });
  const b = await createToolsFixture("weekly-other", {
    plans: false,
    health: false,
  });
  try {
    const [strength, pilates] = await a.insert("training_sessions", [
      {
        user_id: a.user.id,
        title: "Fuerza semanal",
        local_date: a.date(),
        session_date: a.date(),
        session_status: "completed",
        duration_seconds: 3600,
        session_structure: {
          garmin_fit_summary: {
            sport: "training",
            sub_sport: "strength_training",
          },
        },
      },
      {
        user_id: a.user.id,
        title: "Pilates semanal",
        local_date: a.date(),
        session_date: a.date(),
        session_status: "completed",
        duration_seconds: 1800,
        session_structure: {
          garmin_fit_summary: {
            sport: "fitness_equipment",
            sub_sport: "pilates",
          },
        },
      },
    ]);
    await a.insert("planned_training_sessions", {
      user_id: a.user.id,
      title: "Fuerza prevista",
      planned_date: a.date(),
      session_type: "strength",
      status: "confirmed",
      linked_completed_session_id: strength.id,
    });
    const [previous] = await a.insert("training_sessions", {
      user_id: a.user.id,
      title: "Exposición histórica",
      local_date: a.date(-14),
      session_date: a.date(-14),
      session_status: "completed",
      duration_seconds: 1200,
    });
    for (const [session, reps] of [
      [previous, [8]],
      [strength, [10]],
    ]) {
      const [block] = await a.insert("session_blocks", {
        session_id: session.id,
        block_order: 1,
        name: "Fuerza técnica",
        block_type: "strength",
        execution_notes: "Modificación observada: apoyo en cajón",
        data_confidence: "reported",
      });
      await a.insert("session_exercises", {
        session_id: session.id,
        block_id: block.id,
        exercise_order: 1,
        name: "Press banca",
        reported_name: "Press banca",
        load_value: 20,
        load_unit: "kg",
        reps_per_set: reps,
        data_confidence: "manual",
      });
    }
    const before = await a.snapshot();
    const call = async (owner) => {
      const r = await request.post(`${owner.url}/functions/v1/enqidu-tools`, {
        headers: owner.headers,
        data: {
          tool: "get_progress_performance_v1",
          arguments: { period: "week" },
        },
      });
      const body = await r.json();
      expect(body.ok, JSON.stringify(body)).toBe(true);
      return body.data;
    };
    const progress = await call(a),
      foreign = await call(b);
    expect(progress.summary.sessions).toBe(2);
    expect(progress.summary.seconds).toBe(5400);
    expect(progress.observed_records).toBe(1);
    const day = progress.weekly_dashboard.days.find((d) => d.date === a.date());
    expect(day.chart_seconds).toBe(5400);
    expect(day.activities.map((s) => s.id).sort()).toEqual(
      [strength.id, pilates.id].sort(),
    );
    expect(progress.weekly_dashboard.insights).toEqual(progress.insights);
    expect(foreign.weekly_dashboard.activity.sessions).toBe(0);
    await page.addInitScript(() =>
      localStorage.setItem(
        "enqidu.messages",
        JSON.stringify([
          { role: "assistant", content: "LEGACY_UNOWNED_PRIVATE_HISTORY" },
        ]),
      ),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/profile");
    await page.getByPlaceholder("email").fill(a.email);
    await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
    await page.getByRole("button", { name: "Conectar", exact: true }).click();
    const home = page.getByRole("region", { name: "Tu cockpit diario" });
    await expect(home.getByLabel("Actividad real")).toContainText(
      `2 actividades · ${durationLabel(progress.summary.seconds)}`,
    );
    await expect(home.getByLabel("Planificación secundaria")).toContainText(
      "1 con ejecución enlazada",
    );
    await expect(
      home.getByText("completadas enlazadas", { exact: true }),
    ).toHaveCount(0);
    const recovery = home.getByRole("article", {
      name: "Recuperación en siete días",
    });
    await expect(
      recovery.getByRole("heading", {
        name: "Aún no tenemos suficientes datos para ver una tendencia",
      }),
    ).toBeVisible();
    await expect(recovery.getByText(/Faltan al menos dos/)).not.toBeVisible();
    await page.screenshot({
      path: "test-results/weekly-home-390.png",
      fullPage: true,
    });
    await page.locator('button.railButton[aria-label="Coach"]').click();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/functions/v1/coach-reply") &&
        r.request().method() === "POST",
    );
    const composer = page.getByPlaceholder("Escribe o dicta tu actualización");
    await composer.fill("¿Qué he entrenado esta semana?");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    const reply = await (await response).json();
    expect(reply.ok, JSON.stringify(reply)).toBe(true);
    expect(reply.response_mode).toBe("deterministic");
    expect(reply.llm_used).toBe(false);
    expect(reply.usage).toBeNull();
    expect(reply.cards[0].dashboard).toEqual(progress.weekly_dashboard);
    const dashboard = page.getByRole("article", {
      name: "Informe semanal de entrenamiento",
    });
    await expect(dashboard).toBeVisible();
    for (const name of [
      "Día a día",
      "¿Cómo has repartido el tiempo esta semana?",
      "¿Qué está avanzando?",
      "Tu semana, con perspectiva",
      "Qué sabemos de tus datos",
    ])
      await expect(dashboard.getByRole("heading", { name })).toBeVisible();
    await expect(
      dashboard.getByText("Fuerza semanal", { exact: true }),
    ).toBeVisible();
    await expect(
      dashboard.getByText("Pilates semanal", { exact: true }),
    ).toBeVisible();
    await expect(
      dashboard.getByLabel("Distribución diaria del tiempo"),
    ).toBeVisible();
    await expect(dashboard.locator(".weeklyDailyBar")).toHaveCount(7);
    await expect(dashboard.getByText(/8 → 10 reps/)).toBeVisible();
    await expect(
      dashboard.getByText(/Plan enlazado: Fuerza prevista/),
    ).toBeVisible();
    await expect(
      dashboard.getByText(/Nota de Fuerza técnica: Modificación observada/),
    ).toBeVisible();
    await expect(dashboard.locator(".weeklyExerciseHighlight")).toContainText(
      "20 kg × 10 reps",
    );
    expect(await dashboard.getByRole("button").count()).toBe(0);
    await expect(page).toHaveURL(/#\/coach$/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/weekly-coach-390.png",
      fullPage: true,
    });
    await page.reload();
    await expect(dashboard).toBeVisible();
    await composer.fill("Hola");
    expect(
      await composer.evaluate(
        (el) =>
          el.compareDocumentPosition(
            document.querySelector(".weeklyDashboard"),
          ) & Node.DOCUMENT_POSITION_PRECEDING,
      ),
    ).toBeTruthy();
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Enviar", exact: true }),
    ).toBeEnabled();
    await expect(dashboard).toBeVisible();
    await page.locator('button.railButton[aria-label="Progreso"]').click();
    await page.getByLabel("Periodo", { exact: true }).selectOption("week");
    const view = page.getByRole("region", { name: "Progreso y rendimiento" });
    await expect(
      view
        .locator(".progressMetric")
        .filter({ hasText: "Sesiones realizadas" })
        .locator("strong"),
    ).toHaveText(String(progress.summary.sessions));
    await expect(
      view
        .locator(".progressMetric")
        .filter({ hasText: "Minutos conocidos" })
        .locator("strong"),
    ).toHaveText("90");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await a.snapshot()).toEqual(before);
    await page.locator('button.railButton[aria-label="Perfil"]').click();
    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await page.getByPlaceholder("email").fill(b.email);
    await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
    await page.getByRole("button", { name: "Conectar", exact: true }).click();
    await page.locator('button.railButton[aria-label="Coach"]').click();
    await expect(dashboard).toHaveCount(0);
    await expect(page.getByText("LEGACY_UNOWNED_PRIVATE_HISTORY")).toHaveCount(
      0,
    );
    await expect(page.getByText("Fuerza semanal", { exact: true })).toHaveCount(
      0,
    );
    await page.reload();
    await expect(dashboard).toHaveCount(0);
    await page.locator('button.railButton[aria-label="Perfil"]').click();
    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await page.getByPlaceholder("email").fill(a.email);
    await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
    await page.getByRole("button", { name: "Conectar", exact: true }).click();
    await page.locator('button.railButton[aria-label="Coach"]').click();
    await expect(dashboard).toBeVisible();
  } finally {
    await a.dispose();
    await b.dispose();
  }
});

test("390px daily bars distinguish observed zero, missing, unconfirmed rest, completed rest and future", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => import("/e2e/weekly-editorial-harness.jsx"));
  const chart = page.getByLabel("Distribución diaria del tiempo");
  await expect(chart.locator(".weeklyDailyBar")).toHaveCount(7);
  await expect(chart.locator('[data-state="observed"]').first()).toContainText(
    "0 min observados",
  );
  await expect(chart.locator('[data-state="missing_duration"]')).toContainText(
    "duración sin dato",
  );
  await expect(chart.locator('[data-state="unconfirmed"]')).toContainText(
    "descanso sin confirmar",
  );
  await expect(chart.locator('[data-state="confirmed_rest"]')).toContainText(
    "0 min · descanso confirmado",
  );
  await expect(chart.locator('[data-state="partial"]')).toContainText(
    "15 min conocidos · duración parcial",
  );
  await expect(chart.locator('[data-state="future"]')).toContainText(
    "Próximo · planificación",
  );
  for (const state of ["missing_duration", "unconfirmed", "future"])
    await expect(chart.locator(`[data-state="${state}"] meter`)).toHaveCount(0);
  await expect(
    chart.getByRole("meter", { name: "Tiempo observado 2026-10-15" }),
  ).toHaveAttribute("value", "5400");
  await expect(page.getByText("Fuerza", { exact: true })).toBeVisible();
  await expect(page.getByText("Pilates", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await chart.screenshot({ path: "test-results/weekly-daily-states-390.png" });
});
