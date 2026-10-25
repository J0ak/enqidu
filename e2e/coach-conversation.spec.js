import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createToolsFixture, TOOLS_PASSWORD } from "./tools-fixture.js";

async function fixture(label) {
  const f = await createToolsFixture(label, { health: false, plans: false });
  const day = f.date(-1);
  const [strength, pilates] = await f.insert("training_sessions", [
    {
      user_id: f.user.id,
      title: "Fuerza",
      local_date: day,
      session_date: day,
      session_status: "completed",
      duration_seconds: 3000,
      session_structure: {
        garmin_fit_summary: {
          sport: "training",
          sub_sport: "strength_training",
        },
      },
    },
    {
      user_id: f.user.id,
      title: "Pilates",
      local_date: day,
      session_date: day,
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
  const [block] = await f.insert("session_blocks", {
    session_id: strength.id,
    block_order: 1,
    name: "Fuerza principal",
    block_type: "strength",
    duration_seconds: 3000,
  });
  const catalog = await f.db.from("exercise_catalog").select("id,code");
  expect(catalog.error).toBeNull();
  for (const [index, code, name, reps, load, unit] of [
    [1, "high_pull_up", "Dominada alta", [3, 3, 2], null, "bodyweight"],
    [2, "handstand_push_up", "HSPU", null, null, "bodyweight"],
    [3, "romanian_deadlift", "RDL", [8, 8, 8], 45, "kg"],
    [4, "bench_press", "Press banca", [10, 10, 9], 40, "kg"],
  ])
    await f.insert("session_exercises", {
      session_id: strength.id,
      block_id: block.id,
      exercise_order: index,
      exercise_id: catalog.data.find((e) => e.code === code).id,
      reported_name: name,
      name,
      execution_type: "performed",
      sets_completed: 3,
      reps_per_set: reps,
      load_value: load,
      load_unit: unit,
      data_confidence: "reported",
    });
  return { ...f, strength, pilates, day };
}
async function api(f, message, focus = null, extra = {}) {
  const response = await fetch(`${f.url}/functions/v1/coach-reply`, {
    method: "POST",
    headers: f.headers,
    body: JSON.stringify({
      message,
      conversation_focus: focus,
      client_timezone: "America/Los_Angeles",
      user_id: "00000000-0000-4000-8000-000000000001",
      ...extra,
    }),
  });
  expect(response.status).toBe(200);
  const r = await response.json();
  expect(r.response_mode).toBe("deterministic");
  expect(r.llm_used).toBe(false);
  expect(r.usage).toBeNull();
  expect(r.request_date).toBe(f.date());
  expect(r.calendar_timezone).toBe("Europe/Madrid");
  expect(r.date_source).toBe("profile_timezone");
  expect(r.answer).not.toMatch(
    /schema_version|canonical_code|undefined|NaN|[a-f0-9]{8}-[a-f0-9]{4}-/,
  );
  return r;
}
test("V2 HTTP: goldens, canonical tool parity, ambiguity, correction and read-only behavior", async () => {
  test.setTimeout(120000);
  const f = await fixture("conversation-api");
  try {
    const before = await f.snapshot();
    let r = await api(f, "¿Cómo voy con las dominadas altas?");
    expect(r.conversation_focus.canonical_exercise_code).toBe("high_pull_up");
    const tool = await f.db.functions.invoke("enqidu-tools", {
      body: {
        tool: "get_exercise_progress_v1",
        arguments: {
          canonical_code: "high_pull_up",
          ...r.conversation_focus.period,
        },
      },
    });
    expect(tool.error).toBeNull();
    expect(tool.data.data.best_reps).toBe(r.cards[0].metrics[0].value);
    r = await api(f, "¿Y desde julio?", r.conversation_focus);
    expect(r.conversation_focus.period.from).toMatch(/-07-01$/);
    r = await api(f, "¿Y HSPU?", r.conversation_focus);
    r = await api(f, "¿Qué datos te faltan?", r.conversation_focus);
    expect(r.conversation_focus.canonical_exercise_code).toBe(
      "handstand_push_up",
    );
    expect(r.answer).toMatch(/repeticiones/);
    r = await api(f, `¿Qué hice el ${f.day}?`);
    expect(r.answer).toMatch(/Fuerza/);
    expect(r.answer).toMatch(/Pilates/);
    r = await api(f, "¿Y en la de fuerza?", r.conversation_focus);
    expect(r.answer).toMatch(/45 kg/);
    expect(r.answer).toMatch(/Fuerza · Fuerza/);
    expect(r.answer).not.toMatch(/Pilates/);
    r = await api(f, "¿Cuánto levanté en RDL la última vez?");
    expect(r.answer).toMatch(/45 kg/);
    r = await api(f, "¿Cuál es mi mejor registro conocido en press banca?");
    expect(r.answer).toMatch(/40 kg con 10/);
    for (const message of [
      "¿Cómo voy este mes?",
      "Compárame estas cuatro semanas con las anteriores.",
      "¿Qué me toca hoy?",
      "¿Cómo estoy hoy para entrenar?",
    ])
      await api(f, message);
    for (const noun of ["pike", "algo RDL", "Unknown"])
      expect((await api(f, `cómo voy con ${noun}`)).conversation_status).toBe(
        "needs_clarification",
      );
    const correction = await api(f, "Ayer hice RDL 3x8 a 45 kg");
    expect(correction.semantic_correction.status).toBe("needs_clarification");
    expect(correction.semantic_correction.sessions).toHaveLength(2);
    expect(await f.snapshot()).toEqual(before);
  } finally {
    await f.dispose();
  }
});

test("V2 Coach at 390px: focus survives reload and cards stay within viewport", async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await fixture("conversation-mobile");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/profile");
    await page.getByRole("button", { name: "Perfil" }).click();
    await page.getByPlaceholder("email").fill(f.email);
    await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
    await page.getByRole("button", { name: "Conectar" }).click();
    await expect(page.getByText("Sesión iniciada.")).toBeVisible();
    await page.locator('button.railButton[aria-label="Coach"]').click();
    const ask = async (message) => {
      const response = page.waitForResponse(
        (r) =>
          r.url().includes("/functions/v1/coach-reply") &&
          r.request().method() === "POST",
      );
      await page
        .getByPlaceholder("Escribe o dicta tu actualización")
        .fill(message);
      await page.getByRole("button", { name: "Enviar" }).click();
      const responseValue = await response;
      expect(responseValue.status()).toBe(200);
      return responseValue.json();
    };
    let r = await ask("¿Cómo voy con las dominadas altas?");
    expect(r.conversation_focus.canonical_exercise_code).toBe("high_pull_up");
    await expect(page.getByText("Máximas reps en una serie")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key) || "[]").at(-1)
              ?.conversation_focus?.canonical_exercise_code,
          `enqidu.messages.v2:${f.user.id}`,
        ),
      )
      .toBe("high_pull_up");
    await page.reload();
    await page.locator('button.railButton[aria-label="Coach"]').click();
    r = await ask("¿Y desde julio?");
    expect(r.conversation_focus.canonical_exercise_code).toBe("high_pull_up");
    r = await ask("¿Y HSPU?");
    expect(r.conversation_focus.canonical_exercise_code).toBe(
      "handstand_push_up",
    );
    r = await ask("¿Qué datos te faltan?");
    expect(r.answer).toMatch(/faltan repeticiones/);
    await expect(page.getByText(r.answer, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await mkdir("docs/coach-conversation/evidence", { recursive: true });
    await page.getByText(r.answer, { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "docs/coach-conversation/evidence/coach-v2-390.png",
      fullPage: false,
    });
    r = await ask(`¿Qué hice el ${f.day}?`);
    expect(r.answer).toMatch(/actividades separadas/);
    r = await ask("¿Y en la de fuerza?");
    expect(r.answer).toMatch(/45 kg/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByText(r.answer, { exact: true })).toBeVisible();
    await page.getByText(r.answer, { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "docs/coach-conversation/evidence/session-v2-390.png",
      fullPage: false,
    });
    expect(errors).toEqual([]);
  } finally {
    await f.dispose();
  }
});
