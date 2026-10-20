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
    const rdl = progress.data.strength.find(
      (e) => e.name === "Peso muerto rumano",
    );
    expect(rdl.known_volume).toBe(1080);
    expect(rdl.best_load).toBe(45);
    await send(page, "¿Qué he entrenado esta semana?");
    const dashboard = page.getByRole("article", {
      name: "Informe semanal de entrenamiento",
    });
    await expect(dashboard).toContainText("Peso muerto rumano");
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
        name: "Completar datos",
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
        name: "Completar datos",
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
        name: "Completar datos",
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

test("102 historical continuity: null alias → confirmed catalog UUID → weekly 8 to 10 reps without backfill", async () => {
  const a = await setup("semantic-continuity");
  const b = await createToolsFixture("semantic-continuity-other", {
    plans: false,
    health: false,
  });
  try {
    const [past] = await a.insert("training_sessions", {
      user_id: a.user.id,
      title: "Histórico RDL",
      local_date: a.date(-100),
      session_date: a.date(-100),
      session_status: "completed",
      session_kind: "completed",
      duration_seconds: 3600,
    });
    const [historical] = await a.insert("session_exercises", {
      session_id: past.id,
      reported_name: "Peso muerto rumano",
      name: "Peso muerto rumano",
      exercise_id: null,
      execution_type: "performed",
      load_value: 45,
      load_unit: "kg",
      reps_per_set: [8, 8, 8],
    });
    const preview = await call(a, "preview_training_semantics_v1", {
      session_id: a.session.id,
      operations: [
        { op: "rename_exercise", target: a.unknown.id, reported_name: "RDL" },
        { op: "set_reps", target: a.unknown.id, reps: [10, 10, 10] },
        { op: "set_load", target: a.unknown.id, value: 45, unit: "kg" },
      ],
    });
    expect(preview.ok, JSON.stringify(preview)).toBe(true);
    const {
      session_id,
      operations,
      channel,
      revision,
      fingerprint,
      expires_at,
    } = preview.data;
    const applied = await call(a, "apply_training_semantics_v1", {
      session_id,
      operations,
      channel,
      revision,
      fingerprint,
      expires_at,
      confirmation: true,
    });
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    expect(applied.data.state.exercises[0].exercise_id).toBeTruthy();
    const beforeRead = await a.snapshot();
    const progress = await call(a, "get_progress_performance_v1", {
      period: "week",
    });
    expect(progress.ok, JSON.stringify(progress)).toBe(true);
    expect(progress.data.strength).toHaveLength(1);
    expect(progress.data.strength[0].records).toEqual([
      expect.objectContaining({
        kind: "reps_at_load",
        previous: 8,
        value: 10,
        load: 45,
        previous_exercise_id: historical.id,
      }),
    ]);
    expect(progress.data.weekly_dashboard.observed_records).toBe(1);
    expect(progress.data.weekly_dashboard.highlights).toEqual(
      progress.data.highlights,
    );
    expect(
      progress.data.insights.find((i) => i.kind === "observed_reps_record")
        .text,
    ).toContain("8 → 10 reps");
    expect(await a.snapshot()).toEqual(beforeRead);
    const persisted = await a.adminDb
      .from("session_exercises")
      .select("*")
      .eq("id", historical.id)
      .single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toEqual(historical);
    const foreign = await call(b, "get_progress_performance_v1", {
      period: "week",
    });
    expect(foreign.ok, JSON.stringify(foreign)).toBe(true);
    expect(foreign.data.strength).toEqual([]);
    expect(foreign.data.observed_records).toBe(0);
  } finally {
    await a.dispose();
    await b.dispose();
  }
});

test("103 golden 390: three observations → one preview → same session → consumers → reload", async ({
  page,
}) => {
  test.setTimeout(240000);
  const f = await setup("materialization-golden", { withBlock: true });
  try {
    await f.adminDb
      .from("session_exercises")
      .update({
        reported_name: "Press banca",
        reps_per_set: [10, 10, 10],
        sets_completed: 3,
        load_value: 40,
        load_unit: "kg",
        execution_type: "performed",
      })
      .eq("id", f.unknown.id);
    const before = await f.physiology();
    await login(page, f);
    await page.locator('button.railButton[aria-label="Coach"]').click();
    const text =
      "Hoy en press banca hice 40 kg, 10, 10 y 9. En RDL hice 3x8 con 45 kg. No hice dead bug.";
    await send(page, text);
    const card = page
      .getByRole("region", { name: "Corrección de entrenamiento" })
      .last();
    await expect(card).toContainText("10 / 10 / 9");
    await expect(card).toContainText("8 / 8 / 8");
    await expect(card).toContainText("Omitido");
    const prior = await f.adminDb
      .from("session_exercises")
      .select("id,reps_per_set")
      .eq("session_id", f.session.id);
    expect(prior.data).toHaveLength(1);
    expect(prior.data[0].reps_per_set).toEqual([10, 10, 10]);
    await noOverflow(page);
    await page.screenshot({
      path: "test-results/103-multi-preview-390.png",
      fullPage: true,
    });
    const receipt = await confirm(page);
    expect(receipt.data.session_id).toBe(f.session.id);
    expect(receipt.data.state.exercises).toHaveLength(3);
    expect(receipt.data.state.exercises.every((e) => e.exercise_id)).toBe(true);
    expect(await f.physiology()).toEqual(before);
    const event = await f.adminDb
      .from("enkidu_conversation_enrichments")
      .select("payload")
      .eq("id", receipt.data.event_id)
      .single();
    expect(event.data.payload.materialization.original_text).toBe(text);
    expect(event.data.payload.materialization.facts.observations).toHaveLength(
      3,
    );
    const progress = await call(f, "get_progress_performance_v1", {
      period: "week",
    });
    expect(progress.ok, JSON.stringify(progress)).toBe(true);
    expect(
      progress.data.strength.find((e) => e.name === "Peso muerto rumano"),
    ).toMatchObject({ best_load: 45, best_reps: 8, known_volume: 1080 });
    expect(
      progress.data.strength.find((e) => e.name === "Dead bug"),
    ).toBeUndefined();
    await send(page, "¿Qué he entrenado esta semana?");
    await expect(
      page.getByRole("article", { name: "Informe semanal de entrenamiento" }),
    ).toContainText("45");
    const coach = await call(f, "get_training_semantics_v1", {
      session_id: f.session.id,
    });
    expect(coach.data.exercises).toEqual(receipt.data.state.exercises);
    await page.reload();
    await page.locator('button.railButton[aria-label="Hoy"]').click();
    await page.getByRole("button", { name: /Ver última actividad/i }).click();
    await expect(
      page.getByRole("button", { name: "Completar datos", exact: true }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Peso muerto rumano");
    await expect(page.locator("body")).toContainText("Registrado como: rdl");
    await noOverflow(page);
    await page.screenshot({
      path: "test-results/103-activity-390.png",
      fullPage: true,
    });
    const repeat = await call(f, "interpret_training_correction_v1", {
      text,
      session_id: f.session.id,
    });
    expect(repeat.data.status).toBe("already_materialized");
  } finally {
    await f.dispose();
  }
});
