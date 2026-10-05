import test from "node:test";
import assert from "node:assert/strict";
import { assessClosedLoop, feedbackFromSessionMetrics, CLOSED_LOOP_ALGORITHM_VERSION } from "../src/closedLoop/index.js";
import { loadClosedLoopAssessments } from "../src/closedLoop/loadClosedLoopAssessments.js";
import { READINESS_ALGORITHM_VERSION } from "../src/health/readinessV1.js";

const scope = { userId: "athlete-a", calendarDate: "2026-10-05", timezone: "Europe/Madrid", generatedAt: "2026-10-05T10:00:00Z" };
const plan = (patch = {}) => ({ id: "p1", user_id: "athlete-a", title: "Lower Strength", planned_date: "2026-10-03", status: "completed", planned_duration_min: 45, planned_duration_max: 60, planned_intensity: "RPE 7-8", linked_completed_session_id: "e1", ...patch });
const execution = (patch = {}) => ({ id: "e1", user_id: "athlete-a", title: "Lower Strength", local_date: "2026-10-03", started_at: "2026-10-03T08:00:00Z", ended_at: "2026-10-03T09:00:00Z", session_status: "completed", source_id: "fit1", source_type: "garmin_fit", duration_seconds: 3600, ...patch });
const feedback = (patch = {}) => ({ confirmed: true, source: "user_confirmed", user_id: "athlete-a", session_id: "e1", ...patch });
const metric = (patch = {}) => ({ id: "m1", user_id: "athlete-a", session_id: "e1", metric_code: "rpe_global", value_numeric: 9, metric_scope: "session", source_path: "chatgpt_session_correction", confidence: "manual", ...patch });
const baseline = (value) => ({ value, observations: 7, method: "rolling_median", window_days: 28, evidence_dates: ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"], evidence: [{ calendar_date: "2026-10-02", value }] });
const health = (calendarDate, patch = {}) => ({ schema_version: "health_recovery_v1", calendar_date: calendarDate, timezone: "Europe/Madrid", freshness: "current", provenance: [{ provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector" }], hrv: { calendar_date: calendarDate, freshness: "current", last_night_avg_ms: 40 }, readiness: { schema_version: "readiness_v1", algorithm_version: READINESS_ALGORITHM_VERSION, status: "partial", score: 40, confidence: "medium", factors: [{ metric: "hrv", observed_value: 40, baseline: baseline(50), contribution: -10, evidence_date: calendarDate, reason: "personal_baseline" }, { metric: "resting_heart_rate", observed_value: 60, baseline: baseline(55), contribution: -5, evidence_date: calendarDate, reason: "personal_baseline" }] }, ...patch });
const assess = (patch = {}) => assessClosedLoop({ ...scope, plannedSession: plan(), executedSession: execution(), ...patch });
const codes = (result) => result.assessment.facts.map((fact) => fact.code);

test("canonical persisted completed plan and exact linked FIT execution stay one identity", () => {
  const result = assess();
  assert.equal(result.completion, "completed");
  assert.equal(result.identity_match, "exact_persisted_link");
  assert.equal(result.executed_session.id, "e1");
  assert.equal(result.executed_session.linked_planned_session_id, "p1");
  assert.equal(result.executed_session.evidence_kind, "objective_fit");
  assert.equal(result.duration_delta.comparison, "within_range");
  assert.equal(result.duration_delta.seconds, 0);
  assert.equal(result.duration_delta.exact_target_delta_seconds, null);
  assert.equal(result.algorithm_version, CLOSED_LOOP_ALGORITHM_VERSION);
  assert.equal(result.adaptation_proposal.action, "keep");
  assert.equal(result.applied, false);
  assert.equal(result.adaptation_proposal.applied, false);
  assert.equal(result.adaptation_proposal.requires_explicit_action, true);
});

test("canonical duration range compares boundaries without replacing range by its maximum", () => {
  const shorter = assess({ executedSession: execution({ duration_seconds: 2400 }) });
  assert.equal(shorter.duration_delta.seconds, -300);
  assert.equal(shorter.duration_delta.comparison, "shorter");
  assert.ok(codes(shorter).includes("duration_shorter"));
  const longer = assess({ executedSession: execution({ duration_seconds: 3900 }) });
  assert.equal(longer.duration_delta.seconds, 300);
  assert.equal(longer.duration_delta.comparison, "longer");
  const exact = assess({ plannedSession: plan({ planned_duration_min: 60 }), executedSession: execution({ duration_seconds: 3300 }) });
  assert.equal(exact.duration_delta.exact_target_delta_seconds, -300);
  assert.equal(exact.duration_delta.ratio, 0.92);
});

test("duration alone proves neither complete plan nor omissions", () => {
  const result = assess({ plannedSession: plan({ status: "planned", planned_session_blocks: [{ title: "Warmup" }, { title: "Intervals" }] }), executedSession: execution({ duration_seconds: 4200, session_blocks: [{ name: "Warmup" }] }) });
  assert.equal(result.completion, "unknown");
  assert.deepEqual(result.omitted_blocks, []);
  assert.equal(result.block_exercise_matching[1].status, "unverified");
  assert.equal(result.adaptation_proposal.action, "no_change");
});

test("confirmed partial completion and explicit block omission enrich existing identity", () => {
  const result = assess({ plannedSession: plan({ planned_session_blocks: [{ id: "pb1", title: "Warmup" }, { id: "pb2", title: "Intervals" }] }), executedSession: execution({ duration_seconds: 1800, session_blocks: [{ id: "eb1", name: "Warmup" }] }), userFeedback: feedback({ completion: "partial", omitted_blocks: ["Intervals"] }) });
  assert.equal(result.completion, "partial");
  assert.deepEqual(result.omitted_blocks, ["Intervals"]);
  assert.equal(result.block_exercise_matching[0].executed_id, "eb1");
  assert.equal(result.adaptation_proposal.action, "no_change");
});

test("missing execution is unknown; explicit persisted skipped is not_executed", () => {
  assert.equal(assess({ executedSession: null }).completion, "unknown");
  assert.equal(assess({ plannedSession: plan({ status: "skipped", linked_completed_session_id: null }), executedSession: null }).completion, "not_executed");
  assert.equal(assessClosedLoop().completion, "unknown");
});

test("unrelated or foreign sessions cannot supply completion or leak their payload", () => {
  assert.equal(assess({ executedSession: execution({ id: "e2" }) }).executed_session, null);
  assert.equal(assess({ executedSession: execution({ id: "e2" }) }).completion, "unknown");
  assert.throws(() => assess({ executedSession: execution({ user_id: "athlete-b" }) }), /scope_mismatch/);
  assert.throws(() => assess({ plannedSession: { id: "p1" } }), /scope_mismatch/);
  const otherFeedback = assess({ userFeedback: feedback({ user_id: "athlete-b", discomfort: true }) });
  assert.equal(otherFeedback.user_feedback, null);
  assert.equal(otherFeedback.adaptation_proposal.action, "keep");
});

test("null and invalid text remain absent; observed duration/RPE/load zero survive", () => {
  assert.equal(assess({ executedSession: execution({ duration_seconds: null }) }).duration_delta, null);
  assert.equal(assess({ executedSession: execution({ duration_seconds: " " }) }).duration_delta, null);
  const zero = assess({ plannedSession: plan({ planned_duration_min: 0, planned_duration_max: 0, planned_intensity: "RPE 0" }), executedSession: execution({ duration_seconds: 0 }), userFeedback: feedback({ rpe: 0, discomfort: false }) });
  assert.equal(zero.duration_delta.executed_seconds, 0);
  assert.equal(zero.duration_delta.ratio, null);
  assert.equal(zero.user_feedback.rpe, 0);
  assert.equal(zero.user_feedback.discomfort, false);
});

test("canonical PlannedExercise exact targets yield comparable volume with evidence lineage", () => {
  const result = assess({ plannedSession: plan({ planned_session_blocks: [{ id: "pb1", title: "Strength", planned_exercises: [{ name: "Squat", target_sets: 3, target_reps: "5", load: "40 kg" }] }] }), executedSession: execution({ session_blocks: [{ id: "eb1", name: "Strength", exercises: [{ id: "ex1", reported_name: "Squat", sets_completed: 3, reps_per_set: [5, 5, 4], load_value: 40, load_unit: "kg" }] }] }) });
  assert.equal(result.volume_delta.planned, 600);
  assert.equal(result.volume_delta.executed, 560);
  assert.equal(result.volume_delta.delta, -40);
  const volume = result.block_exercise_matching[0].exercises[0].volume_delta;
  assert.equal(volume.evidence.planned[0].target_sets, 3);
  assert.equal(volume.evidence.executed[0].record_id, "ex1");
  assert.deepEqual(volume.evidence.executed[0].reps_per_set, [5, 5, 4]);
});

test("canonical performed sets use only explicit completed reps and load; zero load is valid", () => {
  const result = assess({ plannedSession: plan({ planned_session_blocks: [{ title: "Strength", planned_exercises: [{ name: "Squat", target_sets: 1, target_reps: "5", load: "0 kg" }] }] }), executedSession: execution({ session_blocks: [{ name: "Strength", exercises: [{ id: "ex1", display_name: "Squat", performed_sets: [{ id: "set1", completed: true, reps: 5, load_kg: 0 }] }] }] }) });
  assert.equal(result.volume_delta.executed, 0);
  assert.equal(result.block_exercise_matching[0].exercises[0].volume_delta.evidence.executed[0].record_id, "set1");
  const invalid = structuredClone(result);
  assert.equal(invalid.volume_delta.unit, "kg_repetitions");
});

test("repetition ranges, missing load, unmatched or duplicate names do not become session volume", () => {
  const target = plan({ planned_session_blocks: [{ title: "Strength", planned_exercises: [{ name: "Squat", target_sets: 3, target_reps: "8-10", load: "40 kg" }] }] });
  const actual = execution({ session_blocks: [{ name: "Strength", exercises: [{ reported_name: "Squat", sets_completed: 3, reps_per_set: [8, 8, 8], load_value: 40, load_unit: "kg" }] }] });
  assert.equal(assess({ plannedSession: target, executedSession: actual }).volume_delta, null);
  actual.session_blocks.push(structuredClone(actual.session_blocks[0]));
  const ambiguous = assess({ plannedSession: target, executedSession: actual });
  assert.equal(ambiguous.block_exercise_matching[0].status, "unverified");
  assert.deepEqual(ambiguous.omitted_blocks, []);
});

test("only scoped persisted confirmed manual feedback supplies RPE/discomfort/completion", () => {
  const rows = [metric(), metric({ id: "m2", metric_code: "discomfort", value_numeric: 1 }), metric({ id: "m3", metric_code: "session_completion", value_numeric: null, value_text: "partial" }), metric({ id: "foreign", session_id: "e2", value_numeric: 0 }), metric({ id: "estimated", metric_code: "pain", value_numeric: 1, confidence: "estimated" })];
  const result = feedbackFromSessionMetrics(rows, { sessionId: "e1", userId: "athlete-a" });
  assert.equal(result.rpe, 9);
  assert.equal(result.discomfort, true);
  assert.equal(result.completion, "partial");
  assert.deepEqual(result.evidence.map((item) => item.record_id), ["m1", "m2", "m3"]);
  assert.equal(feedbackFromSessionMetrics([metric({ confidence: "estimated" })], { sessionId: "e1", userId: "athlete-a" }), null);
  assert.equal(feedbackFromSessionMetrics([metric({ value_numeric: " " })], { sessionId: "e1", userId: "athlete-a" }), null);
  const conflict = feedbackFromSessionMetrics([metric(), metric({ id: "conflict", value_numeric: 7 })], { sessionId: "e1", userId: "athlete-a" });
  assert.equal(conflict.rpe, undefined);
});

test("feedback is explicit, versioned proposals target future owned sessions and never apply", () => {
  const future = [plan({ id: "past-today", planned_date: "2026-10-05", planned_time: "08:00", status: "planned", linked_completed_session_id: null }), plan({ id: "foreign", user_id: "athlete-b", planned_date: "2026-10-06", status: "planned", linked_completed_session_id: null }), plan({ id: "next", planned_date: "2026-10-06", status: "planned", linked_completed_session_id: null })];
  const input = { ...scope, plannedSession: plan(), executedSession: execution(), userFeedback: feedback({ rpe: 9, discomfort: true, token: "secret" }), futureSessions: future };
  const original = structuredClone(input);
  const result = assessClosedLoop(input);
  assert.equal(result.adaptation_proposal.action, "recovery_bias");
  assert.equal(result.adaptation_proposal.schema_version, "adaptation_proposal_v1");
  assert.deepEqual(result.adaptation_proposal.affected_future_sessions.map((item) => item.id), ["next"]);
  assert.equal(assess({ userFeedback: feedback({ rpe: 9 }) }).adaptation_proposal.action, "reduce");
  assert.equal(assess({ userFeedback: { discomfort: true } }).adaptation_proposal.action, "keep");
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.deepEqual(input, original);
});

test("post-session current personal baseline evidence describes association, not causal disease", () => {
  const result = assess({ beforeDate: "2026-10-02", afterDate: "2026-10-04", healthBefore: health("2026-10-02"), healthAfter: health("2026-10-04") });
  assert.ok(codes(result).includes("subsequent_hrv_below_baseline"));
  assert.ok(codes(result).includes("subsequent_resting_heart_rate_above_baseline"));
  assert.equal(result.adaptation_proposal.action, "recovery_bias");
  assert.equal(result.recovery_comparison[0].causal_claim, false);
  assert.equal(result.health_after.readiness.factors[0].baseline.evidence[0].value, 50);
  assert.doesNotMatch(JSON.stringify(result), /enfermedad|diagn[oó]stico|entrenamiento caus[oó]/i);
});

test("stale, future, wrong version and insufficient health cannot fabricate recovery", () => {
  assert.equal(assess().health_after, null);
  const stale = assess({ afterDate: "2026-10-04", healthAfter: health("2026-10-04", { freshness: "stale" }) });
  assert.deepEqual(stale.recovery_comparison, []);
  const future = assess({ afterDate: "2026-10-06", healthAfter: health("2026-10-06") });
  assert.equal(future.health_after, null);
  const wrong = assess({ afterDate: "2026-10-04", healthAfter: health("2026-10-04", { readiness: { schema_version: "readiness_v1", algorithm_version: "legacy", status: "available", score: 99, factors: [] }, raw_payload: { token: "secret" } }) });
  assert.equal(wrong.health_after.readiness, undefined);
  assert.deepEqual(wrong.recovery_comparison, []);
  assert.equal(JSON.stringify(wrong).includes("secret"), false);
  const insufficient = health("2026-10-04");
  insufficient.readiness.status = "unavailable";
  insufficient.readiness.score = 99;
  insufficient.readiness.factors = [];
  assert.equal(assess({ afterDate: "2026-10-04", healthAfter: insufficient }).health_after.readiness.score, null);
});

function dbFixture(patch = {}, userId = "athlete-a", forceRows = null, apiRowCap = 1000) {
  const calls = [];
  const tables = { planned_training_sessions: [plan(), plan({ id: "future", planned_date: "2026-10-06", status: "planned", linked_completed_session_id: null })], training_sessions: [execution()], training_sources: [{ id: "fit1", user_id: "athlete-a", source_type: "garmin_fit", credentials: "secret" }], planned_session_blocks: [], session_blocks: [], session_exercises: [], session_metrics: [metric()], ...patch };
  const db = { calls, tables, auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) }, from(table) {
    const filters = []; const ordering = []; let maximum = Infinity; let offset = 0;
    const query = { select(columns) { calls.push({ table, columns, filters }); return query; }, eq(column, value) { filters.push(["eq", column, value]); return query; }, in(column, values) { filters.push(["in", column, values]); return query; }, gte(column, value) { filters.push(["gte", column, value]); return query; }, lte(column, value) { filters.push(["lte", column, value]); return query; }, order(column, options) { ordering.push([column, options.ascending]); return query; }, limit(value) { maximum = value; return query; }, range(start, end) { offset = start; maximum = end - start + 1; return query; }, then(resolve, reject) {
      if (!Object.hasOwn(tables, table)) return Promise.resolve({ data: null, error: { code: "PGRST205" } }).then(resolve, reject);
      let rows = (forceRows?.[table] ?? tables[table]).filter((row) => forceRows?.[table] || filters.every(([op, column, value]) => op === "eq" ? row[column] === value : op === "in" ? value.includes(row[column]) : op === "gte" ? row[column] >= value : row[column] <= value));
      rows = [...rows].sort((a, b) => { for (const [column, ascending] of ordering) { const result = String(a[column]).localeCompare(String(b[column])); if (result) return ascending ? result : -result; } return 0; }).slice(offset, offset + Math.min(maximum, apiRowCap));
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    } }; return query;
  } };
  return db;
}
const load = (db, patch = {}) => loadClosedLoopAssessments(db, { ...scope, healthLoader: async (_db, options) => health(options.calendarDate), ...patch });

test("loader authenticates, scopes canonical parents/children and has no write methods", async () => {
  const db = dbFixture(); const original = structuredClone(db.tables);
  const result = await load(db);
  assert.equal(result.length, 1);
  assert.equal(result[0].user_feedback.rpe, 9);
  assert.equal(result[0].executed_session.source, "garmin_fit");
  assert.equal(result[0].health_before.calendar_date, "2026-10-02");
  assert.equal(result[0].health_after.calendar_date, "2026-10-04");
  assert.ok(db.calls.filter((call) => ["planned_training_sessions", "training_sessions", "training_sources"].includes(call.table)).every((call) => call.filters.some(([op, column, value]) => op === "eq" && column === "user_id" && value === "athlete-a")));
  assert.ok(db.calls.filter((call) => ["planned_session_blocks", "session_blocks", "session_exercises", "session_metrics"].includes(call.table)).every((call) => call.filters.some(([op]) => op === "in")));
  assert.deepEqual(db.tables, original);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  await assert.rejects(load(dbFixture({}, "athlete-b")), /scope_mismatch/);
});

test("loader rejects foreign returned rows despite compromised or incorrect query client", async () => {
  const db = dbFixture({}, "athlete-a", { training_sessions: [execution({ user_id: "athlete-b" })] });
  const result = await load(db);
  assert.equal(result[0].executed_session, null);
  assert.equal(result[0].completion, "unknown");
  assert.deepEqual(await load(dbFixture({}, "athlete-a", { planned_training_sessions: [plan({ user_id: "athlete-b" })] })), []);
});

test("shared execution links outside date/filter pagination are never counted twice", async () => {
  const db = dbFixture({ planned_training_sessions: [plan(), plan({ id: "older", planned_date: "2026-08-01" })] });
  const result = await load(db, { sessionId: "e1", limit: 1 });
  assert.equal(result.length, 1);
  assert.equal(result[0].identity_match, "unlinked");
  assert.equal(result[0].completion, "unknown");
  assert.ok(result[0].missing_evidence.includes("ambiguous_shared_execution_link"));
});

test("archived or future execution does not establish today's completion", async () => {
  for (const patch of [{ session_status: "archived" }, { local_date: "2026-10-06", started_at: "2026-10-06T08:00:00Z" }]) {
    const result = await load(dbFixture({ training_sessions: [execution(patch)] }));
    assert.equal(result[0].executed_session, null);
    assert.equal(result[0].completion, "unknown");
    assert.ok(result[0].missing_evidence.includes("execution_temporal_or_status_conflict"));
  }
});

test("pure domain shares temporal/status eligibility with the authenticated loader", () => {
  for (const patch of [{ session_status: "archived" }, { local_date: "2026-10-06" }, { started_at: "2026-10-05T20:00:00Z", ended_at: "2026-10-05T21:00:00Z" }, { ended_at: "invalid" }, { ended_at: "2026-10-06T08:00:00Z" }]) {
    const result = assess({ executedSession: execution(patch), userFeedback: feedback({ discomfort: true }) });
    assert.equal(result.executed_session, null);
    assert.equal(result.completion, "unknown");
    assert.equal(result.adaptation_proposal.action, "no_change");
    assert.ok(result.missing_evidence.includes("execution_temporal_or_status_conflict"));
  }
});

test("Europe/Madrid midnight and DST overnight execution use athlete date after end", async () => {
  const db = dbFixture({ planned_training_sessions: [plan({ planned_date: "2026-10-24" })], training_sessions: [execution({ local_date: "2026-10-24", started_at: "2026-10-24T21:30:00Z", ended_at: "2026-10-25T01:30:00Z" })] });
  const dates = [];
  const result = await load(db, { calendarDate: "2026-10-26", generatedAt: "2026-10-26T10:00:00Z", healthLoader: async (_db, options) => { dates.push(options.calendarDate); return health(options.calendarDate); } });
  assert.deepEqual(dates, ["2026-10-23", "2026-10-26"]);
  assert.equal(result[0].health_after.calendar_date, "2026-10-26");
  const overlapping = assess({ executedSession: execution({ ended_at: "2026-10-04T00:00:00Z" }), afterDate: "2026-10-04", healthAfter: health("2026-10-04") });
  assert.equal(overlapping.health_after, null);
});

test("loader bounds coverage, health latest three, validates calendar and filters foreign session", async () => {
  const plans = Array.from({ length: 6 }, (_, index) => plan({ id: `p${index}`, linked_completed_session_id: `e${index}` }));
  const executions = Array.from({ length: 6 }, (_, index) => execution({ id: `e${index}` }));
  const dates = [];
  const result = await load(dbFixture({ planned_training_sessions: plans, training_sessions: executions }), { healthLoader: async (_db, options) => { dates.push(options.calendarDate); return health(options.calendarDate); } });
  assert.equal(result.length, 5);
  assert.equal(result[0].scope_coverage.truncated, true);
  assert.equal(result[3].health_after, null);
  assert.ok(result[3].missing_evidence.includes("health_assessment_coverage_limited"));
  assert.deepEqual(dates, ["2026-10-02", "2026-10-04"]);
  assert.deepEqual(await load(dbFixture(), { sessionId: "foreign" }), []);
  await assert.rejects(load(dbFixture(), { timezone: "invalid" }), /profile_calendar/);
  await assert.rejects(load(dbFixture(), { toDate: "2026-10-06" }), /invalid_date_range/);
});

test("same explicit input is reproducible and all missing evidence stays explicit", () => {
  const input = { ...scope, plannedSession: plan(), executedSession: execution(), userFeedback: feedback({ rpe: 7 }) };
  assert.deepEqual(assessClosedLoop(input), assessClosedLoop(structuredClone(input)));
  assert.ok(assessClosedLoop(input).missing_evidence.includes("health_before"));
  assert.ok(assessClosedLoop(input).missing_evidence.includes("comparable_volume"));
});

test("PostgREST 1000-row cap cannot silently shorten a performed-set volume calculation", async () => {
  const makeTables = (count) => ({
    planned_session_blocks: [{ id: "pb1", planned_session_id: "p1", title: "Strength", planned_exercises: [{ name: "Squat", target_sets: count, target_reps: "1", load: "1 kg" }] }],
    session_blocks: [{ id: "eb1", session_id: "e1", name: "Strength" }],
    block_items: [{ id: "bi1", block_id: "eb1" }],
    item_exercises: [{ id: "ie1", block_item_id: "bi1", display_name: "Squat" }],
    performed_sets: Array.from({ length: count }, (_, index) => ({ id: `set-${index}`, item_exercise_id: "ie1", set_index: index, completed: true, reps: 1, load_kg: 1 })),
  });
  const db = dbFixture(makeTables(1500));
  const result = await load(db);
  assert.equal(result[0].volume_delta.executed, 1500);
  assert.equal(result[0].block_exercise_matching[0].exercises[0].volume_delta.evidence.executed.length, 1500);
  assert.equal(db.calls.filter((call) => call.table === "performed_sets").length, 8);
  const capped = await load(dbFixture(makeTables(2100)));
  assert.equal(capped[0].volume_delta, null);
  assert.ok(capped[0].missing_evidence.includes("performed_sets_coverage_truncated"));
});

test("link-reference pagination detects duplicate identities hidden beyond REST row cap", async () => {
  const oldReferences = Array.from({ length: 1100 }, (_, index) => plan({ id: `a-${index}`, planned_date: "2026-08-01" }));
  const db = dbFixture({ planned_training_sessions: [...oldReferences, plan(), plan({ id: "p2", linked_completed_session_id: "e2" }), plan({ id: "z-duplicate", planned_date: "2026-08-01", linked_completed_session_id: "e2" })], training_sessions: [execution(), execution({ id: "e2" })] });
  const result = await load(db);
  assert.equal(result.length, 2);
  assert.ok(result.every((assessment) => assessment.executed_session === null));
  assert.ok(result.every((assessment) => assessment.missing_evidence.includes("ambiguous_shared_execution_link")));
});

test("mixed canonical Body Battery sample/daily fields retain their precise source lineage", () => {
  const after = health("2026-10-04", { body_battery: { calendar_date: "2026-10-04", freshness: "current", temporal_scope: "instant", source: { table: "wearable_body_battery_samples", record_id: "point1" }, current: 42, charged: 60, current_observed_at: "2026-10-04T07:00:00Z", field_sources: { current: { table: "wearable_body_battery_samples", record_id: "point1", calendar_date: "2026-10-04", observed_at: "2026-10-04T07:00:00Z" }, charged: { table: "wearable_health_daily", record_id: "daily1", calendar_date: "2026-10-04" } } } });
  const result = assess({ afterDate: "2026-10-04", healthAfter: after });
  assert.equal(result.health_after.body_battery.field_sources.current.table, "wearable_body_battery_samples");
  assert.equal(result.health_after.body_battery.field_sources.charged.table, "wearable_health_daily");
  assert.equal(result.health_after.body_battery.current_observed_at, "2026-10-04T07:00:00.000Z");
  assert.equal(result.health_after.body_battery.temporal_scope, "instant");
});

test("confirmed nonexecution conflicts with linked FIT without rewriting or proposing a change", () => {
  const input = { ...scope, plannedSession: plan(), executedSession: execution(), userFeedback: feedback({ completion: "not_executed", discomfort: true, rpe: 9 }) };
  const before = structuredClone(input);
  const result = assessClosedLoop(input);
  assert.equal(result.identity_match, "exact_persisted_link");
  assert.equal(result.executed_session.id, "e1");
  assert.equal(result.completion, "unknown");
  assert.ok(codes(result).includes("confirmed_completion_conflict"));
  assert.equal(result.adaptation_proposal.action, "no_change");
  assert.deepEqual(result.adaptation_proposal.affected_future_sessions, []);
  assert.deepEqual(input, before);
});

test("canonical HRV count method and per-field summary link survive safe health projection", () => {
  const after = health("2026-10-04");
  after.hrv.readings_count = 0;
  after.hrv.readings_count_method = "exact_canonical_summary_link";
  after.hrv.field_sources = { readings_count: { table: "wearable_hrv_nightly_samples", linked_summary_id: "summary1", as_of: "2026-10-05T10:00:00Z" } };
  const result = assess({ afterDate: "2026-10-04", healthAfter: after });
  assert.equal(result.health_after.hrv.readings_count, 0);
  assert.equal(result.health_after.hrv.readings_count_method, "exact_canonical_summary_link");
  assert.equal(result.health_after.hrv.field_sources.readings_count.linked_summary_id, "summary1");
});
