import { test as base, expect } from "@playwright/test";

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`console.error: ${message.text()} @ ${message.location().url || "unknown"}`); });
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
  await page.getByPlaceholder("password").fill(password);
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

async function createPlan(request, userId, title = "Plan persistido E2E") {
  const response = await request.post(`${supabaseUrl}/rest/v1/rpc/save_coach_recommendation_plan`, { headers: headers(), data: { p_user_id: userId, p_planned_date: madridDate(), p_session: { title, session_type: "strength", duration_minutes: 35, intensity: "moderada", environment: "home", blocks: [{ title: "Bloque sintético", duration_minutes: 35 }] } } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function planRows(request, userId) {
  const response = await request.get(`${supabaseUrl}/rest/v1/planned_training_sessions?user_id=eq.${userId}&planned_date=eq.${madridDate()}&select=id,title`, { headers: headers() });
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
  await page.getByRole("button", { name: "Guardar en plan" }).click(); await expect(page.getByText("Ya existe un plan para hoy")).toBeVisible(); expect(await planRows(request, user.id)).toHaveLength(1);
});

test("a stale stored recommendation is rejected and becomes non-actionable", async ({ page, request }) => {
  const user = await provision(request, "stale");
  const oldDate = madridDate(-1);
  await page.addInitScript(({ oldDate }) => localStorage.setItem("enqidu.messages", JSON.stringify([{ role:"assistant", content:"Recomendación anterior", cards:[{ id:"recommended_training_today", title:"Sesión anterior", subtitle:"Recomendación calculada · no guardada", actions:[{ type:"save_recommendation_to_plan", label:"Guardar en plan", date:oldDate, location:"home" }] }] }])) , { oldDate });
  await login(page, user); await page.getByRole("button", { name: "Guardar en plan" }).click();
  await expect(page.getByText("Recomendación caducada")).toBeVisible(); await expect(page.getByRole("button", { name: "Guardar en plan" })).toHaveCount(0); expect(await planRows(request,user.id)).toHaveLength(0);
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
  await page.getByRole("button",{name:"Actividades"}).click(); await expect(page.getByRole("heading",{name:"ENQIDU"})).toBeVisible(); await page.getByRole("button",{name:"Perfil"}).click(); await expect(page.getByText(user.email)).toBeVisible();
});
