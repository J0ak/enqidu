import { test as base, expect } from "@playwright/test";
import { createToolsFixture, TOOLS_PASSWORD } from "./tools-fixture.js";

const test = base.extend({
  expectedToolStatuses: async ({}, use) => { await use(new Set()); },
  page: async ({ page, expectedToolStatuses }, use) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const expectedDomainError = message.location().url?.includes("/functions/v1/enqidu-tools")
        && [...expectedToolStatuses].some((status) => message.text().includes(`status of ${status}`));
      if (!expectedDomainError) errors.push(`console.error: ${message.text()} @ ${message.location().url || "unknown"}`);
    });
    await use(page);
    expect(errors, errors.join("\n")).toEqual([]);
  },
});

const supabaseUrl = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = "LocalE2E-Only-57!";
const headers = () => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" });
const madridDate = (offset = 0) => {
  const date = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
};

const weekdayIndex = Object.freeze({
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
});

const nextWeekdayDate = (sourceDate, weekday) => {
  const date = new Date(`${sourceDate}T12:00:00Z`);
  const delta = ((weekdayIndex[weekday] - date.getUTCDay() + 7) % 7) || 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};

async function provision(request, label) {
  expect(serviceKey, "SUPABASE_SERVICE_ROLE_KEY is required only in the Node test process").toBeTruthy();
  const email = `playwright-${label}-${Date.now()}@enqidu.local`;
  const created = await request.post(`${supabaseUrl}/auth/v1/admin/users`, { headers: headers(), data: { email, password, email_confirm: true } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const user = await created.json();
  const profile = await request.post(`${supabaseUrl}/rest/v1/profiles`, { headers: headers(), data: { id: user.id, display_name: "Atleta Playwright", experience_level: "intermediate", primary_goal: "Fuerza sostenible", disciplines: ["strength"], usual_environment: ["home"], timezone: "Europe/Madrid" } });
  expect(profile.ok(), await profile.text()).toBeTruthy();
  await request.post(`${supabaseUrl}/rest/v1/user_goals`, { headers: headers(), data: { user_id: user.id, name: "Fuerza sostenible", description: "Mantener fuerza y recuperación", goal_type: "strength", priority: 1, status: "active" } });
  const catalog = await request.post(`${supabaseUrl}/rest/v1/equipment_catalog`, { headers: headers(), data: { name: `Mancuernas ${label}`, equipment_category: "strength", equipment_type: "dumbbell", unit: "kg" } });
  const [item] = await catalog.json();
  await request.post(`${supabaseUrl}/rest/v1/user_equipment`, { headers: headers(), data: { user_id: user.id, equipment_id: item.id, quantity: 2, location_label: "home", available: true } });
  await request.post(`${supabaseUrl}/rest/v1/user_training_locations`, { headers: headers(), data: { user_id: user.id, display_name: "Casa", location_type: "home", access_mode: "anytime", prescription_scope: "autonomous", is_active: true } });
  return { id: user.id, email };
}

async function login(page, user) {
  await page.goto("/#/profile");
  await page.getByRole("button", { name: "Perfil" }).click();
  await page.getByPlaceholder("email").fill(user.email);
  await page.getByPlaceholder("password").fill(user.password || password);
  await page.getByRole("button", { name: "Conectar" }).click();
  await expect(page.getByText("Sesión iniciada.")).toBeVisible();
  await page.locator('button.railButton[aria-label="Coach"]').click();
}

async function ask(page, text) {
  const responsePromise = page.waitForResponse((response) => response.url().includes("/functions/v1/coach-reply") && response.request().method() === "POST");
  await page.getByPlaceholder("Escribe o dicta tu actualización").fill(text);
  await page.getByRole("button", { name: "Enviar" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.json();
}

async function previewCommand(page, text, tool) {
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/functions/v1/enqidu-tools")
    && response.request().method() === "POST"
    && response.request().postDataJSON()?.tool === tool
  );
  await page.getByPlaceholder("Escribe o dicta tu actualización").fill(text);
  await page.getByRole("button", { name: "Enviar" }).click();
  const response = await responsePromise;
  const body = await response.json();
  expect(body.ok, JSON.stringify(body)).toBe(true);
  expect(body.timezone).toBe("Europe/Madrid");
  expect(body.calendar_date).toBe(madridDate());
  return body;
}

async function applyReviewedPreview(page, tool) {
  await page.getByRole("button", { name: "REVISAR CAMBIO", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Antes", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Después", exact: true })).toBeVisible();
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/functions/v1/enqidu-tools")
    && response.request().method() === "POST"
    && response.request().postDataJSON()?.tool === tool
  );
  await page.getByRole("button", { name: "APLICAR", exact: true }).click();
  const response = await responsePromise;
  const body = await response.json();
  expect(body.ok, JSON.stringify(body)).toBe(true);
  expect(body.timezone).toBe("Europe/Madrid");
  return { ...body.data, calendar_timezone: body.timezone, request_date: body.calendar_date };
}

async function createPlan(request, userId, title = "Plan persistido E2E", plannedDate = madridDate(), environment = "home") {
  const response = await request.post(`${supabaseUrl}/rest/v1/rpc/save_coach_recommendation_plan`, { headers: headers(), data: { p_user_id: userId, p_planned_date: plannedDate, p_session: { title, session_type: environment === "trail" ? "trail" : "strength", duration_minutes: 35, intensity: "moderada", environment, blocks: [{ title: "Bloque sintético", duration_minutes: 35 }] } } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function planRows(request, userId) {
  const response = await request.get(`${supabaseUrl}/rest/v1/planned_training_sessions?user_id=eq.${userId}&planned_date=eq.${madridDate()}&select=id,title`, { headers: headers() });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function planRowsOnDate(request, userId, date) {
  const response = await request.get(
    `${supabaseUrl}/rest/v1/planned_training_sessions?user_id=eq.${userId}&planned_date=eq.${date}&select=id,title,status,planned_date,location_type,session_type,planned_duration_min,planned_duration_max,source`,
    { headers: headers() },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}


test("uses the profile timezone and deterministic LLM-free reply", async ({ page, request }) => {
  const user = await provision(request, "timezone");
  await login(page, user);
  let openAiCalls = 0;
  page.on("request", (req) => { if (req.url().includes("api.openai.com")) openAiCalls += 1; });
  const body = await ask(page, "¿Qué entreno hoy?");
  expect(body).toMatchObject({ ok: true, calendar_timezone: "Europe/Madrid", date_source: "profile_timezone", response_mode: "deterministic", llm_used: false, usage: null, request_date: madridDate() });
  expect(openAiCalls).toBe(0);
});

test("a persisted plan wins over a calculated recommendation", async ({ page, request }) => {
  const user = await provision(request, "persisted"); await createPlan(request, user.id);
  await login(page, user); const body = await ask(page, "¿Qué entreno hoy?");
  expect(body.answer).toContain("Plan persistido E2E");
  expect(body.cards.some((card) => card.id === "recommended_training_today")).toBe(false);
  await expect(page.getByRole("button", { name: "Guardar en plan" })).toHaveCount(0);
});

test("no plan exposes an unsaved recommendation without writing", async ({ page, request }) => {
  const user = await provision(request, "recommendation"); await login(page, user);
  const body = await ask(page, "¿Qué entreno hoy?");
  expect(body.cards.some((card) => card.id === "recommended_training_today")).toBe(true);
  await expect(page.getByText("Recomendación calculada · no guardada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar en plan" })).toBeVisible();
  expect(await planRows(request, user.id)).toHaveLength(0);
});

test("explicit save persists coherent blocks and refreshes Activities", async ({ page, request }) => {
  const user = await provision(request, "save"); await login(page, user); await ask(page, "¿Qué entreno hoy?");
  await page.getByRole("button", { name: "Guardar en plan" }).click();
  await expect(page.getByText("Entrenamiento guardado en tu plan.")).toBeVisible();
  const rows = await planRows(request, user.id); expect(rows).toHaveLength(1);
  const blocks = await request.get(`${supabaseUrl}/rest/v1/planned_session_blocks?planned_session_id=eq.${rows[0].id}&select=*`, { headers: headers() });
  expect((await blocks.json()).length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Actividades" }).click(); await expect(page.getByText(rows[0].title)).toBeVisible();
  await page.locator('button.railButton[aria-label="Coach"]').click(); const body = await ask(page, "¿Qué entreno hoy?"); expect(body.answer).toContain(rows[0].title);
});

test("double click remains single-flight", async ({ page, request }) => {
  const user = await provision(request, "double"); await login(page, user); await ask(page, "¿Qué entreno hoy?");
  const button = page.getByRole("button", { name: "Guardar en plan" }); await button.dblclick();
  await expect(page.getByText("Entrenamiento guardado en tu plan.")).toBeVisible(); expect(await planRows(request, user.id)).toHaveLength(1); await expect(button).toHaveCount(0);
});

test("concurrent persisted plan resolves as plan_already_exists", async ({ page, request }) => {
  const user = await provision(request, "race"); await login(page, user); await ask(page, "¿Qué entreno hoy?"); await createPlan(request, user.id, "Plan de carrera concurrente");
  await page.getByRole("button", { name: "Guardar en plan" }).click(); await expect(page.getByText("Ya existe un plan para hoy", { exact: true })).toBeVisible(); expect(await planRows(request, user.id)).toHaveLength(1);
});

test("a stale stored recommendation is rejected and becomes non-actionable", async ({ page, request }) => {
  const user = await provision(request, "stale");
  const oldDate = madridDate(-1);
  await page.addInitScript(({ oldDate }) => localStorage.setItem("enqidu.messages", JSON.stringify([{ role:"assistant", content:"Recomendación anterior", cards:[{ id:"recommended_training_today", title:"Sesión anterior", subtitle:"Recomendación calculada · no guardada", actions:[{ type:"save_recommendation_to_plan", label:"Guardar en plan", date:oldDate, location:"home" }] }] }])) , { oldDate });
  await login(page, user); await page.getByRole("button", { name: "Guardar en plan" }).click();
  await expect(page.getByText("Recomendación caducada")).toBeVisible(); await expect(page.getByRole("button", { name: "Guardar en plan" })).toHaveCount(0); expect(await planRows(request,user.id)).toHaveLength(0);
});

test("explicit conversational move reprograms the persisted plan without Coach LLM", async ({ page, request }) => {
  const user = await provision(request, "move");
  await createPlan(request, user.id, "Fuerza para mover");
  await login(page, user);
  await ask(page, "¿Qué entreno hoy?");

  let coachReplyCalls = 0;
  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/coach-reply") && req.method() === "POST") coachReplyCalls += 1;
  });

  const preview = await previewCommand(page, "Muévelo al viernes", "preview_move_session");
  expect(preview.data.requires_confirmation).toBe(true);
  expect(await planRowsOnDate(request, user.id, madridDate())).toHaveLength(1);
  expect(await planRowsOnDate(request, user.id, nextWeekdayDate(madridDate(), "friday"))).toHaveLength(0);
  const body = await applyReviewedPreview(page, "apply_move_session");
  const targetDate = nextWeekdayDate(madridDate(), "friday");
  expect(body).toMatchObject({
    ok: true,
    action: "move_planned_session",
    moved: true,
    source_date: madridDate(),
    target_date: targetDate,
    response_mode: "deterministic_action",
    llm_used: false,
    usage: null,
    calendar_timezone: "Europe/Madrid",
  });
  expect(coachReplyCalls).toBe(0);

  expect(await planRowsOnDate(request, user.id, madridDate())).toHaveLength(0);
  const movedRows = await planRowsOnDate(request, user.id, targetDate);
  expect(movedRows).toHaveLength(1);
  expect(movedRows[0]).toMatchObject({
    title: "Fuerza para mover",
    status: "rescheduled",
    planned_date: targetDate,
  });
  await expect(page.getByText(/He movido Fuerza para mover al/)).toBeVisible();
});

test("explicit environment adaptation recalculates an ENQIDU plan for home without Coach LLM", async ({ page, request }) => {
  const user = await provision(request, "environment");
  await createPlan(request, user.id, "Plan exterior a adaptar", madridDate(), "outdoor");
  await login(page, user);
  await ask(page, "¿Qué entreno hoy?");

  let coachReplyCalls = 0;
  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/coach-reply") && req.method() === "POST") coachReplyCalls += 1;
  });

  await previewCommand(page, "Hazlo en casa", "preview_adapt_environment");
  const beforeApply = await planRowsOnDate(request, user.id, madridDate());
  expect(beforeApply[0]).toMatchObject({ title: "Plan exterior a adaptar", location_type: "outdoor" });
  const body = await applyReviewedPreview(page, "apply_adapt_environment");
  expect(body).toMatchObject({
    ok: true,
    action: "adapt_session_environment",
    adapted: true,
    source_date: madridDate(),
    response_mode: "deterministic_action",
    llm_used: false,
    usage: null,
    calendar_timezone: "Europe/Madrid",
  });
  expect(body.planned_session).toMatchObject({
    date: madridDate(),
    environment: "home",
  });
  expect(coachReplyCalls).toBe(0);

  const rows = await planRowsOnDate(request, user.id, madridDate());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    status: "modified",
    planned_date: madridDate(),
    location_type: "home",
    source: "enkidu_coach",
  });
  expect(rows[0].title).not.toBe("Plan exterior a adaptar");
  expect(Number(rows[0].planned_duration_min)).toBeGreaterThan(0);
  expect(rows[0].planned_duration_min).toBe(rows[0].planned_duration_max);

  const blocksResponse = await request.get(
    `${supabaseUrl}/rest/v1/planned_session_blocks?planned_session_id=eq.${rows[0].id}&select=title,planned_duration_seconds&order=block_order.asc`,
    { headers: headers() },
  );
  expect(blocksResponse.ok(), await blocksResponse.text()).toBeTruthy();
  const blocks = await blocksResponse.json();
  expect(blocks.length).toBeGreaterThan(0);
  expect(blocks.reduce((sum, block) => sum + Number(block.planned_duration_seconds || 0), 0))
    .toBe(rows[0].planned_duration_min * 60);

  await expect(page.getByText(/He adaptado .* para casa/i)).toBeVisible();
  await expect(page.getByText("Plan adaptado", { exact: true })).toBeVisible();
});

test("explicit duration adaptation rescales an ENQIDU plan without Coach LLM", async ({ page, request }) => {
  const user = await provision(request, "duration");
  await createPlan(request, user.id, "Fuerza de 35 minutos");
  await login(page, user);
  await ask(page, "¿Qué entreno hoy?");

  let coachReplyCalls = 0;
  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/coach-reply") && req.method() === "POST") coachReplyCalls += 1;
  });

  await previewCommand(page, "Hazlo de 30 minutos", "preview_adapt_duration");
  const beforeApply = await planRowsOnDate(request, user.id, madridDate());
  expect(beforeApply[0].planned_duration_min).toBe(35);
  const body = await applyReviewedPreview(page, "apply_adapt_duration");
  expect(body).toMatchObject({
    ok: true,
    action: "adapt_session_duration",
    adapted: true,
    source_date: madridDate(),
    response_mode: "deterministic_action",
    llm_used: false,
    usage: null,
    calendar_timezone: "Europe/Madrid",
  });
  expect(body.planned_session).toMatchObject({
    date: madridDate(),
    title: "Fuerza de 35 minutos",
    duration_minutes: 30,
    environment: "home",
  });
  expect(coachReplyCalls).toBe(0);

  const rows = await planRowsOnDate(request, user.id, madridDate());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    title: "Fuerza de 35 minutos",
    status: "modified",
    planned_date: madridDate(),
    location_type: "home",
    source: "enkidu_coach",
    planned_duration_min: 30,
    planned_duration_max: 30,
  });

  const blocksResponse = await request.get(
    `${supabaseUrl}/rest/v1/planned_session_blocks?planned_session_id=eq.${rows[0].id}&select=title,planned_duration_seconds&order=block_order.asc`,
    { headers: headers() },
  );
  expect(blocksResponse.ok(), await blocksResponse.text()).toBeTruthy();
  const blocks = await blocksResponse.json();
  expect(blocks).toHaveLength(1);
  expect(blocks[0].planned_duration_seconds).toBe(1800);

  await expect(page.getByText(/He ajustado Fuerza de 35 minutos a 30 minutos/i)).toBeVisible();
  await expect(page.getByText("Plan adaptado", { exact: true })).toBeVisible();
});

test("remaining-week batch RPC moves an ENQIDU plan atomically without changing its contents", async ({ request }) => {
  const user = await provision(request, "week-rpc");
  const sourceDate = madridDate(10);
  const targetDate = madridDate(12);
  const saved = await createPlan(request, user.id, "Plan semanal para mover", sourceDate);
  expect(saved.ok).toBe(true);
  expect(saved.planned_session_id).toBeTruthy();

  const response = await request.post(
    `${supabaseUrl}/rest/v1/rpc/adapt_coach_remaining_week`,
    {
      headers: headers(),
      data: {
        p_user_id: user.id,
        p_from_date: sourceDate,
        p_to_date: targetDate,
        p_moves: [{
          planned_session_id: saved.planned_session_id,
          source_date: sourceDate,
          target_date: targetDate,
        }],
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  expect(await response.json()).toMatchObject({
    ok: true,
    adapted: true,
    moved_count: 1,
  });

  expect(await planRowsOnDate(request, user.id, sourceDate)).toHaveLength(0);
  const targetRows = await planRowsOnDate(request, user.id, targetDate);
  expect(targetRows).toHaveLength(1);
  expect(targetRows[0]).toMatchObject({
    title: "Plan semanal para mover",
    status: "rescheduled",
    planned_date: targetDate,
    source: "enkidu_coach",
  });
});

test("explicit remaining-week adaptation is deterministic and LLM-free when no move is pending", async ({ page, request }) => {
  const user = await provision(request, "week-adapt");
  await login(page, user);

  let coachReplyCalls = 0;
  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/coach-reply") && req.method() === "POST") coachReplyCalls += 1;
  });

  const body = await previewCommand(page, "Adapta el resto de la semana", "preview_adapt_remaining_week");
  expect(body.data.requires_confirmation).toBe(false);
  expect(coachReplyCalls).toBe(0);
  await expect(page.getByRole("button", { name: "APLICAR", exact: true })).toHaveCount(0);
  await expect(page.getByText(/No hay sesiones.*pendientes de recolocar/i)).toBeVisible();

});

test("explicit cancellation preserves audit history and releases the date for a new active plan", async ({ page, request }) => {
  const user = await provision(request, "cancel");
  await createPlan(request, user.id, "Fuerza para cancelar");
  await login(page, user);
  await ask(page, "¿Qué entreno hoy?");

  let coachReplyCalls = 0;
  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/coach-reply") && req.method() === "POST") coachReplyCalls += 1;
  });

  await previewCommand(page, "Cancélalo", "preview_cancel_session");
  const beforeApply = await planRowsOnDate(request, user.id, madridDate());
  expect(beforeApply[0].status).not.toBe("cancelled");
  const body = await applyReviewedPreview(page, "apply_cancel_session");
  expect(body).toMatchObject({
    ok: true,
    action: "cancel_planned_session",
    cancelled: true,
    source_date: madridDate(),
    title: "Fuerza para cancelar",
    response_mode: "deterministic_action",
    llm_used: false,
    usage: null,
    calendar_timezone: "Europe/Madrid",
  });
  expect(coachReplyCalls).toBe(0);

  const cancelledRows = await planRowsOnDate(request, user.id, madridDate());
  expect(cancelledRows).toHaveLength(1);
  expect(cancelledRows[0]).toMatchObject({
    title: "Fuerza para cancelar",
    status: "cancelled",
    planned_date: madridDate(),
    source: "enkidu_coach",
  });
  await expect(page.getByText(/He cancelado Fuerza para cancelar/i)).toBeVisible();
  await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();

  const afterCancellation = await ask(page, "¿Qué entreno hoy?");
  expect(afterCancellation.cards.some((card) => card.id === "planned_training_today")).toBe(false);
  expect(afterCancellation.cards.some((card) => card.id === "recommended_training_today")).toBe(true);
  expect(afterCancellation.answer).not.toContain("Fuerza para cancelar");

  await page.getByRole("button", { name: "Guardar en plan" }).click();
  await expect(page.getByText("Entrenamiento guardado en tu plan.")).toBeVisible();

  const rowsAfterSave = await planRowsOnDate(request, user.id, madridDate());
  expect(rowsAfterSave).toHaveLength(2);
  expect(rowsAfterSave.filter((row) => row.status === "cancelled")).toHaveLength(1);
  expect(rowsAfterSave.filter((row) => row.status !== "cancelled")).toHaveLength(1);
});

test("explicit tomorrow unavailability persists without moving or cancelling a conflicting plan", async ({ page, request }) => {
  const user = await provision(request, "unavailable");
  const targetDate = madridDate(1);
  await createPlan(request, user.id, "Plan de mañana intacto", targetDate);
  await login(page, user);

  let coachReplyCalls = 0;
  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/coach-reply") && req.method() === "POST") coachReplyCalls += 1;
  });

  const actionResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/functions/v1/coach-plan-action")
    && response.request().method() === "POST"
  );
  await page.getByPlaceholder("Escribe o dicta tu actualización").fill("Mañana no puedo");
  await page.getByRole("button", { name: "Enviar" }).click();

  const actionResponse = await actionResponsePromise;
  expect(actionResponse.status()).toBe(200);
  const body = await actionResponse.json();
  expect(body).toMatchObject({
    ok: true,
    action: "set_training_unavailability",
    marked_unavailable: true,
    date_reference: "tomorrow",
    date: targetDate,
    planned_conflict: true,
    response_mode: "deterministic_action",
    llm_used: false,
    usage: null,
    calendar_timezone: "Europe/Madrid",
  });
  expect(body.planned_titles).toContain("Plan de mañana intacto");
  expect(coachReplyCalls).toBe(0);

  const availability = await request.get(
    `${supabaseUrl}/rest/v1/training_availability_overrides?user_id=eq.${user.id}&calendar_date=eq.${targetDate}&select=calendar_date,availability_status,source`,
    { headers: headers() },
  );
  expect(availability.ok(), await availability.text()).toBeTruthy();
  expect(await availability.json()).toEqual([{
    calendar_date: targetDate,
    availability_status: "unavailable",
    source: "coach_explicit",
  }]);

  const plan = await planRowsOnDate(request, user.id, targetDate);
  expect(plan).toHaveLength(1);
  expect(plan[0]).toMatchObject({
    title: "Plan de mañana intacto",
    status: "planned",
    planned_date: targetDate,
  });

  await expect(page.getByText(/no la he movido ni cancelado/i)).toBeVisible();
});

test("week without plan does not fabricate sessions", async ({ page, request }) => {
  const user = await provision(request, "week"); await login(page,user); const body=await ask(page,"¿Qué sesiones tengo planificadas esta semana?");
  expect(body.response_mode).toBe("deterministic"); expect(body.llm_used).toBe(false); expect(body.answer.toLowerCase()).toMatch(/no (tienes|hay).*plan/);
});

test("trend reports volume without claiming performance improvement", async ({ page, request }) => {
  const user=await provision(request,"trend");
  await login(page,user);
  for (const [offset,duration] of [[-8,1200],[-1,3600]]) await request.post(`${supabaseUrl}/rest/v1/training_sessions`,{headers:headers(),data:{user_id:user.id,local_date:madridDate(offset),title:`Carga ${offset}`,sport:"strength",activity_type:"strength",duration_seconds:duration,session_status:"completed"}});
  const body=await ask(page,"¿Estoy mejorando?"); expect(body.response_mode).toBe("deterministic"); expect(body.llm_used).toBe(false); expect(body.answer).toContain("no puedo afirmar una mejora de rendimiento"); expect(body.answer.toLowerCase()).not.toMatch(/sí, estás mejorando|estas mejorando/);
});

test("Coach cards and primary navigation render without browser exceptions", async ({ page, request }) => {
  const user=await provision(request,"smoke"); await login(page,user); await ask(page,"¿Qué entreno hoy?"); await expect(page.locator("article.coachInlineCard")).toBeVisible();
  await page.getByRole("button",{name:"Actividades"}).click(); await expect(page.getByRole("heading",{name:"ENQIDU"})).toBeVisible(); await page.getByRole("button",{name:"Perfil"}).click(); await expect(page.getByText("Cuenta e ingesta", { exact: true })).toBeVisible(); await expect(page.getByText(user.email, { exact: true }).first()).toBeVisible();
});

test("preview can be dismissed and conversational acceptance first requires reviewing the exact change", async ({ page, request }) => {
  const user = await provision(request, "preview-review");
  await createPlan(request, user.id, "Fuerza para revisar");
  await login(page, user);
  await ask(page, "¿Qué entreno hoy?");
  await previewCommand(page, "Déjalo en 30 minutos", "preview_adapt_duration");
  let applies = 0;
  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/enqidu-tools") && req.method() === "POST" && req.postDataJSON()?.tool?.startsWith("apply_")) applies += 1;
  });
  await expect(page.getByRole("button", { name: "APLICAR", exact: true })).toHaveCount(0);
  await page.getByPlaceholder("Escribe o dicta tu actualización").fill("Aplícalo");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("heading", { name: "Antes", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Después", exact: true })).toBeVisible();
  const panel = page.getByRole("region", { name: "Cambio propuesto" });
  await expect(panel.getByText(/35 min/).first()).toBeVisible();
  await expect(panel.getByText(/30 min/).first()).toBeVisible();
  expect(applies).toBe(0);
  expect((await planRowsOnDate(request, user.id, madridDate()))[0].planned_duration_min).toBe(35);
  await page.getByRole("button", { name: "Descartar propuesta" }).click();
  await expect(panel).toHaveCount(0);
  expect(applies).toBe(0);
  expect((await planRowsOnDate(request, user.id, madridDate()))[0].planned_duration_min).toBe(35);
});

test("stale preview is rejected in Coach and preserves the concurrent canonical plan", async ({ page, request, expectedToolStatuses }) => {
  const user = await provision(request, "preview-stale");
  const created = await createPlan(request, user.id, "Fuerza antes de editar");
  await login(page, user);
  await ask(page, "¿Qué entreno hoy?");
  await previewCommand(page, "Déjalo en 30 minutos", "preview_adapt_duration");
  await page.getByRole("button", { name: "REVISAR CAMBIO", exact: true }).click();
  const concurrent = await request.patch(`${supabaseUrl}/rest/v1/planned_training_sessions?id=eq.${created.planned_session_id}`, {
    headers: headers(), data: { title: "Fuerza editada mientras revisabas" },
  });
  expect(concurrent.ok(), await concurrent.text()).toBe(true);
  expectedToolStatuses.add(409);
  const responsePromise = page.waitForResponse((response) => response.url().includes("/functions/v1/enqidu-tools") && response.request().method() === "POST" && response.request().postDataJSON()?.tool === "apply_adapt_duration");
  await page.getByRole("button", { name: "APLICAR", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({ ok: false, error: { code: "preview_stale" } });
  await expect(page.getByRole("alert")).toContainText("El plan ha cambiado");
  await expect(page.getByRole("button", { name: "APLICAR", exact: true })).toHaveCount(0);
  expect((await planRowsOnDate(request, user.id, madridDate()))[0]).toMatchObject({ title: "Fuerza editada mientras revisabas", planned_duration_min: 35, planned_duration_max: 35 });
  const blocks = await request.get(`${supabaseUrl}/rest/v1/planned_session_blocks?planned_session_id=eq.${created.planned_session_id}&select=planned_duration_seconds`, { headers: headers() });
  expect((await blocks.json())[0].planned_duration_seconds).toBe(2100);
  let repeatedApplies = 0;
  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/enqidu-tools") && req.method() === "POST" && req.postDataJSON()?.tool?.startsWith("apply_")) repeatedApplies += 1;
  });
  for (const text of ["Revisar cambio", "Aplícalo"]) {
    await page.getByPlaceholder("Escribe o dicta tu actualización").fill(text);
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "APLICAR", exact: true })).toHaveCount(0);
  }
  expect(repeatedApplies).toBe(0);
});

test("new frontend with unavailable Tools backend fails safely without a legacy write fallback", async ({ page, request, expectedToolStatuses }) => {
  const user = await provision(request, "tools-rollout");
  await createPlan(request, user.id, "Fuerza durante actualización");
  await login(page, user);
  await ask(page, "¿Qué entreno hoy?");
  const original = await planRowsOnDate(request, user.id, madridDate());
  let writes = 0;
  page.on("request", (req) => {
    if (req.method() !== "POST") return;
    if (req.url().includes("/functions/v1/coach-plan-action") || (req.url().includes("/functions/v1/enqidu-tools") && req.postDataJSON()?.tool?.startsWith("apply_"))) writes += 1;
  });
  expectedToolStatuses.add(404);
  await page.route("**/functions/v1/enqidu-tools", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "Function not found" }) }));
  await page.getByPlaceholder("Escribe o dicta tu actualización").fill("Déjalo en 30 minutos");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("No se pudo consultar ENQIDU. Vuelve a intentarlo.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cambio propuesto" })).toHaveCount(0);
  expect(writes).toBe(0);
  expect(await planRowsOnDate(request, user.id, madridDate())).toEqual(original);
});

test("Closed Loop Coach proposal reviews exact 50-to-40 minute change and applies only after acceptance", async ({ page }) => {
  const fixture = await createToolsFixture("coach-closed-loop");
  try {
    const before = await fixture.snapshot();
    await login(page, { email: fixture.email, password: TOOLS_PASSWORD });
    const response = await ask(page, "Evalúa mi entrenamiento de ayer");
    expect(response.llm_used).toBe(false);
    expect(response.response_mode).toBe("deterministic");
    expect(response.answer).toMatch(/propuesta/i);
    const proposal = response.cards.find((card) => card.actions?.some((action) => action.type === "review_closed_loop_proposal"));
    expect(proposal).toBeTruthy();
    expect(await fixture.snapshot()).toEqual(before);
    const previewPromise = page.waitForResponse((result) => result.url().includes("/functions/v1/enqidu-tools") && result.request().method() === "POST" && result.request().postDataJSON()?.tool === "preview_closed_loop_proposal");
    await page.getByRole("button", { name: "Revisar cambio", exact: true }).click();
    const previewResponse = await previewPromise;
    const preview = await previewResponse.json();
    expect(preview.ok, JSON.stringify(preview)).toBe(true);
    expect(preview.timezone).toBe("Europe/Madrid");
    expect(preview.data.before[0]).toMatchObject({ title: "Lower Strength siguiente", duration_minutes: 50 });
    expect(preview.data.after[0]).toMatchObject({ title: "Lower Strength siguiente", duration_minutes: 40 });
    const panel = page.getByRole("region", { name: "Cambio propuesto" });
    await expect(panel.getByRole("heading", { name: "Antes", exact: true })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Después", exact: true })).toBeVisible();
    await expect(panel.getByText(/50 min/).first()).toBeVisible();
    await expect(panel.getByText(/40 min/).first()).toBeVisible();
    await expect(panel.getByText("El esfuerzo que confirmaste superó el rango previsto.", { exact: true })).toBeVisible();
    expect(await fixture.snapshot()).toEqual(before);
    const applyPromise = page.waitForResponse((result) => result.url().includes("/functions/v1/enqidu-tools") && result.request().method() === "POST" && result.request().postDataJSON()?.tool === "apply_closed_loop_proposal");
    await page.getByRole("button", { name: "APLICAR", exact: true }).click();
    const applied = await (await applyPromise).json();
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    expect(applied.data.planned_session).toMatchObject({ title: "Lower Strength siguiente", duration_minutes: 40 });
    await expect(page.getByText("He ajustado Lower Strength siguiente a 40 minutos.", { exact: true })).toBeVisible();
    const after = await fixture.snapshot();
    expect(after.plans.find((plan) => plan.id === fixture.identities.futurePlan.id)).toMatchObject({ planned_duration_min: 40, planned_duration_max: 40, status: "modified" });
    expect(after.fit).toEqual(before.fit);
    expect(after.executions).toEqual(before.executions);
    expect(after.metrics).toEqual(before.metrics);
    const week = await ask(page, "Muéstrame mi plan semanal");
    expect(week.llm_used).toBe(false);
    expect(week.cards.some((card) => card.id === "weekly_plan_progress")).toBe(true);
  } finally {
    await fixture.dispose();
  }
});
