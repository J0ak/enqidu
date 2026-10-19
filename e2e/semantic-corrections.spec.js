import { test, expect } from "@playwright/test";
test.use({ actionTimeout: 15000 });
import { createToolsFixture, TOOLS_PASSWORD } from "./tools-fixture.js";
async function setup(label, { two = false, withBlock = false } = {}) {
  const f = await createToolsFixture(label, { plans: false, health: false });
  const [source] = await f.insert("training_sources", {
    user_id: f.user.id,
    source_type: "garmin_fit",
    source_name: "FIT original",
    file_checksum: crypto.randomUUID(),
    original_json: { immutable: "raw FIT evidence" },
  });
  const [session] = await f.insert("training_sessions", {
    user_id: f.user.id,
    source_id: source.id,
    title: "Fuerza semántica",
    local_date: f.date(),
    session_date: f.date(),
    session_status: "completed",
    session_kind: "completed",
    started_at: f.date() + "T10:00:00Z",
    duration_seconds: 3600,
    session_structure: {
      garmin_fit_summary: {
        sport: "training",
        sub_sport: "strength_training",
        heart_rate: { average_bpm: 123 },
        training_effect: { aerobic: 3 },
      },
    },
  });
  await f.insert("session_source_links", {
    session_id: session.id,
    source_id: source.id,
    source_role: "garmin_fit",
    is_primary: true,
  });
  const block = withBlock
    ? (
        await f.insert("session_blocks", {
          session_id: session.id,
          block_order: 1,
          block_type: "strength",
          name: "Bloque original",
          prescription: {
            exercises: [
              {
                name: "Unknown",
                sets_completed: 5,
                reps_per_set: [12, 12, 12, 12, 12],
                load_value: 99,
                load_unit: "kg",
              },
            ],
          },
        })
      )[0]
    : null;
  const [unknown] = await f.insert("session_exercises", {
    block_id: block?.id || null,
    session_id: session.id,
    reported_name: "Unknown",
    name: "Unknown",
    exercise_order: 1,
    execution_type: "performed",
    data_confidence: "unknown",
  });
  await f.insert("fit_message_payloads", {
    user_id: f.user.id,
    session_id: session.id,
    message_type: "session",
    message_index: 0,
    payload: {
      immutable: "FIT raw bytes fixture",
      heart_rate: 123,
      calories: 400,
      training_effect: 3,
    },
  });
  await f.insert("session_metrics", {
    session_id: session.id,
    metric_code: "heart_rate_avg_bpm",
    value_numeric: 123,
    metric_scope: "session",
    source_path: "garmin_fit",
    confidence: "reported",
  });
  await f.insert("session_laps", {
    session_id: session.id,
    lap_index: 1,
    lap_order: 1,
    duration_seconds: 3600,
    average_heart_rate: 123,
  });
  await f.insert("session_samples", {
    session_id: session.id,
    elapsed_seconds: 0,
    heart_rate: 123,
  });
  if (two)
    await f.insert("training_sessions", {
      user_id: f.user.id,
      title: "Pilates semántico",
      local_date: f.date(),
      session_date: f.date(),
      duration_seconds: 1800,
      session_status: "completed",
      session_structure: {
        garmin_fit_summary: {
          sport: "fitness_equipment",
          sub_sport: "pilates",
        },
      },
    });
  const physiology = async () => {
    const snap = await f.snapshot();
    const extra = async (table) => {
      const r = await f.adminDb
        .from(table)
        .select("*")
        .eq("session_id", session.id);
      expect(r.error).toBeNull();
      return r.data;
    };
    return {
      sessions: snap.executions,
      fit: snap.fit,
      source: snap.sources.find((s) => s.id === source.id),
      metrics: snap.metrics,
      laps: await extra("session_laps"),
      samples: await extra("session_samples"),
    };
  };
  return { ...f, session, unknown, physiology };
}
async function login(page, f) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/profile");
  await page.getByPlaceholder("email").fill(f.email);
  await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
  await page.getByRole("button", { name: "Conectar", exact: true }).click();
  await expect(page.getByText("Sesión iniciada.")).toBeVisible();
}
async function call(f, tool, args) {
  const r = await fetch(f.url + "/functions/v1/enqidu-tools", {
    method: "POST",
    headers: f.headers,
    body: JSON.stringify({ tool, arguments: args }),
  });
  return r.json();
}
async function send(page, text) {
  await page.getByPlaceholder("Escribe o dicta tu actualización").fill(text);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
}
async function confirm(page) {
  const card = page
    .getByRole("region", { name: "Corrección de entrenamiento" })
    .last();
  await card
    .getByRole("button", { name: "Revisar cambio", exact: true })
    .click();
  await expect(
    card.getByRole("heading", { name: "ANTES", exact: true }).first(),
  ).toBeVisible();
  await expect(
    card.getByRole("heading", { name: "DESPUÉS", exact: true }).first(),
  ).toBeVisible();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/functions/v1/enqidu-tools") &&
      r.request().postDataJSON()?.tool === "apply_training_semantics_v1",
  );
  await card.getByRole("button", { name: "Confirmar", exact: true }).click();
  const result = await (await response).json();
  expect(result.ok, JSON.stringify(result)).toBe(true);
  expect(result.data.persistence_verified).toBe(true);
  return result;
}
const noOverflow = async (page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

test("102 Coach 390: Unknown FIT → RDL preview/confirm → same activity → Progress/Weekly/reload/A→B", async ({
  page,
}) => {
  test.setTimeout(180000);
  const a = await setup("semantic-coach"),
    b = await createToolsFixture("semantic-other", {
      plans: false,
      health: false,
    });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let writes = 0;
  page.on("request", (r) => {
    if (
      r.url().includes("/functions/v1/enqidu-tools") &&
      r.postDataJSON()?.tool === "apply_training_semantics_v1"
    )
      writes++;
  });
  try {
    const before = await a.physiology();
    const edgeReply = await fetch(a.url + "/functions/v1/coach-reply", {
      method: "POST",
      headers: a.headers,
      body: JSON.stringify({ message: "En RDL hice 3x8 con 45 kg." }),
    });
    expect(edgeReply.ok).toBe(true);
    expect(await edgeReply.json()).toMatchObject({
      ok: true,
      response_mode: "deterministic",
      llm_used: false,
      usage: null,
      semantic_correction: { status: "preview_ready" },
    });
    await login(page, a);
    await page.locator('button.railButton[aria-label="Coach"]').click();
    await send(page, "En RDL hice 3x8 con 45 kg.");
    const card = page
      .getByRole("region", { name: "Corrección de entrenamiento" })
      .last();
    await expect(
      card.getByText("8 / 8 / 8 reps", { exact: false }),
    ).toBeVisible();
    await expect(card.getByText("3 series", { exact: true })).toBeVisible();
    expect(writes).toBe(0);
    expect(await a.physiology()).toEqual(before);
    await noOverflow(page);
    await page.screenshot({
      path: "test-results/102-coach-preview-390.png",
      fullPage: true,
    });
    const receipt = await confirm(page);
    expect(writes).toBe(1);
    expect(receipt.data.session_id).toBe(a.session.id);
    expect(receipt.data.llm_used).toBe(false);
    expect(receipt.data.usage).toBeNull();
    await expect(
      card.getByText("Cambio confirmado en esta actividad."),
    ).toBeVisible();
    expect(await a.physiology()).toEqual(before);
    const progress = await call(a, "get_progress_performance_v1", {
      period: "week",
    });
    expect(progress.ok, JSON.stringify(progress)).toBe(true);
    const rdl = progress.data.strength.find((e) => e.name === "rdl");
    expect(rdl.known_volume).toBe(1080);
    expect(rdl.best_load).toBe(45);
    await send(page, "¿Qué he entrenado esta semana?");
    const dashboard = page.getByRole("article", {
      name: "Informe semanal de entrenamiento",
    });
    await expect(dashboard).toContainText("rdl");
    await expect(dashboard).toContainText("45");
    await noOverflow(page);
    await page.reload();
    await page.locator('button.railButton[aria-label="Coach"]').click();
    await expect(
      page.getByText("Cambio confirmado en esta actividad."),
    ).toBeVisible();
    expect(writes).toBe(1);
    const foreign = await call(b, "get_training_semantics_v1", {
      session_id: a.session.id,
    });
    expect(foreign.ok).toBe(false);
    expect(foreign.error.code).toBe("session_not_found");
    const hostile = await call(b, "preview_training_semantics_v1", {
      session_id: a.session.id,
      operations: [
        {
          op: "rename_exercise",
          target: a.unknown.id,
          reported_name: "Foreign",
        },
      ],
    });
    expect(hostile.ok).toBe(false);
    expect(hostile.error.code).toBe("session_not_found");
    await page.getByRole("button", { name: "Perfil", exact: true }).click();
    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await page.getByPlaceholder("email").fill(b.email);
    await page.getByPlaceholder("password").fill(TOOLS_PASSWORD);
    await page.getByRole("button", { name: "Conectar", exact: true }).click();
    await page.locator('button.railButton[aria-label="Coach"]').click();
    await expect(
      page.getByText("Cambio confirmado en esta actividad."),
    ).toHaveCount(0);
    await expect(
      page.getByText("Fuerza semántica", { exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await a.dispose();
    await b.dispose();
  }
});

test("102 manual detail editor 390: explicit identity, last reps, omission, stale and refresh", async ({
  page,
}) => {
  test.setTimeout(180000);
  const a = await setup("semantic-manual", { withBlock: true });
  try {
    const before = await a.physiology();
    await login(page, a);
    await page.locator('button.railButton[aria-label="Hoy"]').click();
    await page.getByRole("button", { name: /Ver última actividad/i }).click();
    await page
      .getByRole("button", {
        name: "Completar / corregir entrenamiento",
        exact: true,
      })
      .click();
    let card = page.getByRole("region", {
      name: "Corrección de entrenamiento",
    });
    await card
      .getByRole("combobox", { name: "Ejercicio", exact: true })
      .selectOption(a.unknown.id);
    await card.getByLabel("Renombrar / catálogo").fill("RDL");
    await card.getByLabel("Reps por serie").fill("8, 8, 8");
    await card.getByLabel("Series", { exact: true }).fill("3");
    await card.getByLabel("Carga", { exact: true }).fill("17,5");
    await card.getByLabel("Unidad").selectOption("kg_each");
    await card.getByLabel("Lado").selectOption("each_side");
    await card.getByLabel("Tempo / pausa").fill("pausa de 2 segundos");
    await card.getByLabel("Notas / sensaciones").fill("Última serie difícil");
    await card.getByRole("button", { name: "Preparar cambio" }).click();
    await expect(
      card.getByText("17.5 kg por mancuerna", { exact: false }),
    ).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: "test-results/102-manual-preview-390.png",
      fullPage: true,
    });
    await confirm(page);
    await expect(
      page.locator(".conversationActivityCard").first(),
    ).toContainText("RDL");
    await expect(
      page.locator(".conversationActivityCard").first(),
    ).not.toContainText("Unknown");
    await page
      .getByRole("button", {
        name: "Completar / corregir entrenamiento",
        exact: true,
      })
      .click();
    card = page.getByRole("region", { name: "Corrección de entrenamiento" });
    await card
      .getByRole("combobox", { name: "Ejercicio", exact: true })
      .selectOption(a.unknown.id);
    await expect(
      card.getByText("8 / 8 / 8 reps", { exact: false }),
    ).toBeVisible();
    await card.getByLabel("Reps por serie").fill("8, 8, 7");
    await card.getByRole("button", { name: "Preparar cambio" }).click();
    await confirm(page);
    expect(await a.physiology()).toEqual(before);
    await page.reload();
    await page.locator('button.railButton[aria-label="Hoy"]').click();
    await page.getByRole("button", { name: /Ver última actividad/i }).click();
    await page
      .getByRole("button", {
        name: "Completar / corregir entrenamiento",
        exact: true,
      })
      .click();
    card = page.getByRole("region", { name: "Corrección de entrenamiento" });
    await card
      .getByRole("combobox", { name: "Ejercicio", exact: true })
      .selectOption(a.unknown.id);
    await expect(
      card.getByText("8 / 8 / 7 reps", { exact: false }),
    ).toBeVisible();
    await card.getByLabel("Carga", { exact: true }).fill("20");
    await card.getByRole("button", { name: "Preparar cambio" }).click();
    await card
      .getByRole("button", { name: "Revisar cambio", exact: true })
      .click();
    const external = await a.adminDb
      .from("session_exercises")
      .update({ load_value: 19 })
      .eq("id", a.unknown.id);
    expect(external.error).toBeNull();
    await card.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(card).toHaveAttribute("data-state", "stale");
    await expect(
      card.getByRole("button", { name: "Confirmar", exact: true }),
    ).toBeDisabled();
    await card.getByRole("button", { name: "Revisar de nuevo" }).click();
    await card
      .getByRole("combobox", { name: "Ejercicio", exact: true })
      .selectOption(a.unknown.id);
    await card.getByLabel("Realización").selectOption("yes");
    await card.getByRole("button", { name: "Preparar cambio" }).click();
    await confirm(page);
    const progress = await call(a, "get_progress_performance_v1", {
      period: "week",
    });
    expect(progress.data.strength).toHaveLength(0);
    expect(
      progress.data.weekly_dashboard.days
        .flatMap((d) => d.sessions || [])
        .flatMap((s) => s.exercises || []),
    ).toHaveLength(0);
    expect(await a.physiology()).toEqual(before);
  } finally {
    await a.dispose();
  }
});

test("102 Coach ambiguous date requires explicit choice; no autoapply", async ({
  page,
}) => {
  test.setTimeout(120000);
  const a = await setup("semantic-ambiguous", { two: true });
  try {
    await login(page, a);
    await page.locator('button.railButton[aria-label="Coach"]').click();
    await send(page, "en el entrenamiento de hoy hice 8 dominadas");
    const card = page
      .getByRole("region", { name: "Corrección de entrenamiento" })
      .last();
    await expect(card).toHaveAttribute("data-state", "needs_clarification");
    await expect(
      card.getByRole("button", { name: /Fuerza semántica/ }),
    ).toBeVisible();
    await expect(
      card.getByRole("button", { name: /Pilates semántico/ }),
    ).toBeVisible();
    await expect(card.getByRole("button", { name: "Confirmar" })).toHaveCount(
      0,
    );
    await card.getByRole("button", { name: /Fuerza semántica/ }).click();
    await expect(card).toHaveAttribute("data-state", "preview_ready");
    await card.getByRole("button", { name: "Cancelar", exact: true }).click();
    const current = await call(a, "get_training_semantics_v1", {
      session_id: a.session.id,
    });
    expect(current.data.exercises).toHaveLength(1);
    await noOverflow(page);
  } finally {
    await a.dispose();
  }
});
