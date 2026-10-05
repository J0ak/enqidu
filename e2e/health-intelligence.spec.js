import { test, expect } from "@playwright/test";
import { normalizeGarminHealthRecord } from "../src/health/garminAdapter.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = "LocalHealth-E2E-Only-57!";
const secretMarker = "local-provider-secret-must-never-reach-coach";
const date = (offset = 0) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const value = new Date(`${today}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
const adminHeaders = () => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" });
const userHeaders = (user) => ({ apikey: anonKey, Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" });

test.beforeAll(() => {
  const url = new URL(supabaseUrl);
  expect(["127.0.0.1", "localhost", "[::1]"], "Health E2E must use disposable localhost Supabase").toContain(url.hostname);
  expect(serviceKey, "Local service role is required only in the Node test process").toBeTruthy();
  expect(anonKey, "Local anon key is required").toBeTruthy();
});

async function json(response) {
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  return JSON.parse(body);
}

async function createUser(request, label) {
  const email = `health-e2e-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@enqidu.local`;
  const user = await json(await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: adminHeaders(), data: { email, password, email_confirm: true },
  }));
  await json(await request.post(`${supabaseUrl}/rest/v1/profiles`, {
    headers: adminHeaders(), data: { id: user.id, display_name: "Health E2E atleta", timezone: "Europe/Madrid", experience_level: "intermediate", primary_goal: "Fuerza sostenible", disciplines: ["strength"], usual_environment: ["home"] },
  }));
  const session = await json(await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, "Content-Type": "application/json" }, data: { email, password },
  }));
  return { id: user.id, email, token: session.access_token };
}

async function insert(request, table, data) {
  if (Array.isArray(data)) {
    const rows = [];
    for (const item of data) rows.push(...await insert(request, table, item));
    return rows;
  }
  return json(await request.post(`${supabaseUrl}/rest/v1/${table}`, { headers: adminHeaders(), data }));
}

async function ingest(request, user, calendarDate, dataType, measurements, mode = "aggregator") {
  const record = normalizeGarminHealthRecord({
    provider: "garmin", provider_mode: mode,
    data_confidence: "reported",
    ingestion_channel: mode === "official_api" ? "garmin_health_api" : "fitness_ai_connector",
    data_type: dataType, calendar_date: calendarDate, timezone: "Europe/Madrid",
    retrieved_at: `${calendarDate}T08:00:00.000Z`, measurements,
    raw: { provider_secret: secretMarker },
  });
  return json(await request.post(`${supabaseUrl}/rest/v1/rpc/ingest_garmin_health_record`, {
    headers: adminHeaders(), data: { p_user_id: user.id, p_record: record },
  }));
}

async function seedHealth(request, user) {
  for (let offset = -14; offset <= 0; offset += 1) {
    const calendarDate = date(offset);
    await ingest(request, user, calendarDate, "daily_health", {
      resting_heart_rate_bpm: { value: offset === 0 ? 58 : 52, unit: "bpm" },
      body_battery_current: { value: offset === 0 ? 35 : 75, unit: "score" },
      body_battery_charged: { value: 0, unit: "score" },
      average_stress_level: { value: 0, unit: "score" },
      spo2_avg_pct: { value: null, unit: "%" },
    });
    await ingest(request, user, calendarDate, "hrv", {
      last_night_avg_ms: { value: offset === 0 ? 42 : 60, unit: "ms" },
      last_night_5min_high_ms: { value: offset === 0 ? 55 : 75, unit: "ms" },
    });
    await ingest(request, user, calendarDate, "sleep", {
      total_duration_seconds: { value: offset === 0 ? 25200 : 28800, unit: "s" },
      sleep_score: { value: offset === 0 ? 70 : 85, unit: "score" },
      deep_sleep_seconds: { value: 3600, unit: "s" },
      awake_seconds: { value: 0, unit: "s" },
    });
  }
}

async function seedPlanExecution(request, user) {
  const [source] = await insert(request, "training_sources", { user_id: user.id, source_type: "garmin_fit", provider: "garmin", file_name: "local-only.fit", raw_metadata: { original_fit_marker: secretMarker } });
  const [execution] = await insert(request, "training_sessions", {
    user_id: user.id, source_id: source.id, title: "Lower Strength FIT ejecutado", local_date: date(-1), session_date: date(-1),
    started_at: `${date(-1)}T10:00:00Z`, ended_at: `${date(-1)}T10:20:00Z`, duration_seconds: 1200,
    session_status: "completed", sport: "strength", notes: "Feedback confirmado de usuario",
  });
  const [historicalPlan, todayPlan, futurePlan] = await insert(request, "planned_training_sessions", [
    { user_id: user.id, planned_date: date(-1), title: "Lower Strength anterior", session_type: "strength", status: "planned", planned_duration_min: 30, planned_duration_max: 30, linked_completed_session_id: execution.id, source: "enkidu_coach" },
    { user_id: user.id, planned_date: date(), title: "Lower Strength persistido hoy", session_type: "strength", status: "planned", planned_duration_min: 40, planned_duration_max: 40, source: "enkidu_coach" },
    { user_id: user.id, planned_date: date(1), title: "Fuerza futura persistida", session_type: "strength", status: "planned", planned_duration_min: 40, planned_duration_max: 40, source: "enkidu_coach" },
  ]);
  await insert(request, "planned_session_blocks", [
    { planned_session_id: historicalPlan.id, block_order: 1, title: "Sentadilla", block_type: "strength", planned_duration_seconds: 900, planned_exercises: [{ name: "Sentadilla", sets: 3, reps: 5, load_kg: 45 }] },
    { planned_session_id: historicalPlan.id, block_order: 2, title: "Accesorios", block_type: "strength", planned_duration_seconds: 900 },
    { planned_session_id: todayPlan.id, block_order: 1, title: "Plan que sigue vigente", block_type: "strength", planned_duration_seconds: 2400 },
  ]);
  const [block] = await insert(request, "session_blocks", { session_id: execution.id, block_order: 1, title: "Sentadilla", name: "Sentadilla", block_type: "strength", duration_seconds: 1200, data_confidence: "reported" });
  await insert(request, "session_exercises", { session_id: execution.id, block_id: block.id, exercise_order: 1, name: "Sentadilla", reported_name: "Sentadilla", sets_completed: 2, reps_per_set: [5, 5], load_value: 45, load_unit: "kg", data_confidence: "manual" });
  await insert(request, "session_metrics", [
    { session_id: execution.id, metric_code: "rpe_global", value_numeric: 9, metric_scope: "session", source_path: "chatgpt_session_correction", confidence: "manual" },
    { session_id: execution.id, metric_code: "discomfort", value_numeric: 1, metric_scope: "session", source_path: "chatgpt_session_correction", confidence: "manual" },
    { session_id: execution.id, metric_code: "session_completion", value_text: "partial", metric_scope: "session", source_path: "chatgpt_session_correction", confidence: "manual" },
  ]);
  await insert(request, "fit_message_payloads", { user_id: user.id, session_id: execution.id, message_type: "session", message_index: 0, payload: { duration_seconds: 1200, original_fit_marker: secretMarker } });
  return { execution, historicalPlan, todayPlan, futurePlan };
}

async function snapshot(request, user) {
  const plans = await json(await request.get(`${supabaseUrl}/rest/v1/planned_training_sessions?user_id=eq.${user.id}&select=*&order=id`, { headers: adminHeaders() }));
  const blocks = await json(await request.get(`${supabaseUrl}/rest/v1/planned_session_blocks?planned_session_id=in.(${plans.map((plan) => plan.id).join(",")})&select=*&order=id`, { headers: adminHeaders() }));
  const fit = await json(await request.get(`${supabaseUrl}/rest/v1/fit_message_payloads?user_id=eq.${user.id}&select=*&order=id`, { headers: adminHeaders() }));
  const executions = await json(await request.get(`${supabaseUrl}/rest/v1/training_sessions?user_id=eq.${user.id}&select=*&order=id`, { headers: adminHeaders() }));
  return { plans, blocks, fit, executions };
}

async function context(request, user, data = {}) {
  const response = await json(await request.post(`${supabaseUrl}/functions/v1/coach-context`, { headers: userHeaders(user), data }));
  expect(response.ok).toBe(true);
  expect(response.context.status).toBe("available");
  expect(JSON.stringify(response)).not.toContain(secretMarker);
  return response.context;
}

async function askBrowser(page, user, message) {
  await page.goto("/#/profile");
  await page.getByRole("button", { name: "Perfil" }).click();
  await page.getByPlaceholder("email").fill(user.email);
  await page.getByPlaceholder("password").fill(password);
  await page.getByRole("button", { name: "Conectar" }).click();
  await expect(page.getByText("Sesión iniciada.")).toBeVisible();
  await page.locator('button.railButton[aria-label="Coach"]').click();
  const pending = page.waitForResponse((response) => response.url().includes("/functions/v1/coach-reply") && response.request().method() === "POST");
  await page.getByPlaceholder("Escribe o dicta tu actualización").fill(message);
  await page.getByRole("button", { name: "Enviar" }).click();
  return json(await pending);
}

test("canonical Health → personal Readiness → deterministic Coach → Closed Loop preserves all plans and FIT", async ({ page, request }) => {
  test.setTimeout(90000);
  const browserErrors = [];
  let openAiCalls = 0;
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (request) => { if (/api\.openai\.com/i.test(request.url())) openAiCalls += 1; });
  const user = await createUser(request, "vertical");
  await seedHealth(request, user);
  const identities = await seedPlanExecution(request, user);
  const before = await snapshot(request, user);
  const coachContext = await context(request, user);
  const health = coachContext.health_recovery;
  expect(health).toMatchObject({ schema_version: "health_recovery_v1", calendar_date: date(), timezone: "Europe/Madrid", freshness: "current" });
  expect(health.hrv.last_night_avg_ms).toBe(42);
  expect(health.sleep.duration_seconds).toBe(25200);
  expect(health.stress.average).toBe(0);
  expect(health.body_battery.charged).toBe(0);
  expect(health.provenance).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector" })]));
  expect(coachContext.readiness).toMatchObject({ schema_version: "readiness_v1", status: "available" });
  expect(Number.isFinite(coachContext.readiness.score)).toBe(true);
  expect(coachContext.readiness.algorithm_version).toBeTruthy();
  expect(coachContext.readiness.factors).toEqual(expect.arrayContaining([expect.objectContaining({ metric: "hrv", baseline: expect.any(Object), evidence_date: date(), reason: expect.any(String) })]));
  const loop = coachContext.closed_loop_assessments.find((assessment) => assessment.planned_session.id === identities.historicalPlan.id);
  expect(loop).toMatchObject({ schema_version: "closed_loop_assessment_v1", identity_match: "exact_persisted_link", completion: "partial", adaptation_proposal: { applied: false, requires_explicit_action: true } });
  expect(loop.executed_session.id).toBe(identities.execution.id);
  expect(loop.duration_delta).toBeTruthy();
  expect(loop.user_feedback).toMatchObject({ rpe: 9 });
  expect(["reduce", "recovery_bias"]).toContain(loop.adaptation_proposal.action);
  expect(loop.health_after).toBeTruthy();
  expect(loop.assessment.facts).toEqual(expect.arrayContaining([expect.objectContaining({ code: "user_reported_discomfort" })]));
  const reply = await askBrowser(page, user, "¿Cómo está mi recuperación?");
  expect(reply).toMatchObject({ ok: true, calendar_timezone: "Europe/Madrid", date_source: "profile_timezone", response_mode: "deterministic", llm_used: false, usage: null });
  expect(reply.answer).toMatch(/readiness|recuperaci[oó]n/i);
  expect(JSON.stringify(reply)).not.toContain(secretMarker);
  const trainingReply = await json(await request.post(`${supabaseUrl}/functions/v1/coach-reply`, { headers: userHeaders(user), data: { message: "¿Qué entreno hoy?" } }));
  expect(trainingReply.answer).toContain("Lower Strength persistido hoy");
  expect(trainingReply.cards.some((card) => card.id === "recommended_training_today")).toBe(false);
  expect(await snapshot(request, user)).toEqual(before);
  expect(browserErrors).toEqual([]);
  expect(openAiCalls).toBe(0);
});

test("authenticated users cannot read another athlete's Health, Readiness, Closed Loop or mutate plans", async ({ request }) => {
  test.setTimeout(90000);
  const owner = await createUser(request, "owner");
  const stranger = await createUser(request, "stranger");
  await seedHealth(request, owner);
  const identities = await seedPlanExecution(request, owner);
  const before = await snapshot(request, owner);
  const isolated = await context(request, stranger, { user_id: owner.id, session_id: identities.execution.id });
  expect(isolated.health_recovery.status).toBe("unavailable");
  expect(isolated.readiness).toMatchObject({ status: "unavailable", score: null });
  expect(isolated.closed_loop_assessments).toEqual([]);
  const leaked = await json(await request.get(`${supabaseUrl}/rest/v1/wearable_health_daily?user_id=eq.${owner.id}&select=calendar_date`, { headers: userHeaders(stranger) }));
  expect(leaked).toEqual([]);
  const reply = await json(await request.post(`${supabaseUrl}/functions/v1/coach-reply`, { headers: userHeaders(stranger), data: { message: "¿Estoy recuperado?", user_id: owner.id } }));
  expect(reply).toMatchObject({ response_mode: "deterministic", llm_used: false, usage: null });
  expect(reply.answer).toContain("No hay evidencia suficiente para calcular readiness hoy.");
  expect(reply.answer).not.toMatch(/42\s*ms|25200|Lower Strength/);
  const forbidden = await request.patch(`${supabaseUrl}/rest/v1/planned_training_sessions?id=eq.${identities.todayPlan.id}`, { headers: userHeaders(owner), data: { planned_duration_min: 5 } });
  expect(forbidden.ok()).toBe(false);
  const healthWrite = await request.post(`${supabaseUrl}/rest/v1/wearable_health_daily`, { headers: userHeaders(owner), data: { user_id: owner.id, calendar_date: date(1), provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector" } });
  expect(healthWrite.ok()).toBe(false);
  expect(await snapshot(request, owner)).toEqual(before);
});

test("old official Garmin evidence keeps its date and cannot manufacture today's readiness", async ({ request }) => {
  const user = await createUser(request, "stale");
  await ingest(request, user, date(-10), "sleep", { total_duration_seconds: { value: 28800, unit: "s" }, sleep_score: { value: 90, unit: "score" } }, "official_api");
  const coachContext = await context(request, user);
  expect(coachContext.health_recovery.freshness).toBe("stale");
  expect(coachContext.health_recovery.sleep.calendar_date).toBe(date(-10));
  expect(coachContext.health_recovery.provenance).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "garmin", provider_mode: "official_api", ingestion_channel: "garmin_health_api" })]));
  expect(coachContext.readiness).toMatchObject({ status: "unavailable", score: null });
  const reply = await json(await request.post(`${supabaseUrl}/functions/v1/coach-reply`, { headers: userHeaders(user), data: { message: "¿Cómo está mi recuperación?" } }));
  expect(reply).toMatchObject({ response_mode: "deterministic", llm_used: false, usage: null });
  expect(reply.answer).toContain("No hay evidencia suficiente para calcular readiness hoy.");
});
