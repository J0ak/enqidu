import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const INPUT_PLAN = path.join(
  "docs",
  "coach-context",
  "normalized",
  "jotason",
  "supabase-seed-plan.generated.json",
);

const OUTPUT_DIR = path.join("docs", "coach-context", "generated");
const SEED_SQL = path.join(OUTPUT_DIR, "coach-context-jotason-fixture-seed-v1.sql");
const VERIFY_SQL = path.join(OUTPUT_DIR, "coach-context-jotason-fixture-seed-v1.verify.sql");
const ROLLBACK_SQL = path.join(OUTPUT_DIR, "coach-context-jotason-fixture-seed-v1.rollback.sql");

const SEED_KEY = "coach_context_jotason_fixture_v1";
const FIXTURE_USER = "jotason";
const PROFILE_SOURCE_KEY = "jotason:athlete_profile";

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonLiteral(value) {
  return `${sqlLiteral(JSON.stringify(value ?? {}, null, 2))}::jsonb`;
}

function sqlNumber(value) {
  if (value === null || value === undefined || value === "") return "null";
  const number = Number(value);
  return Number.isNaN(number) ? "null" : String(number);
}

function sqlDate(value) {
  return value ? `${sqlLiteral(value)}::date` : "null";
}

function profileId(sourceKey = PROFILE_SOURCE_KEY) {
  return `(select id from public.coach_athlete_profiles where fixture_user = ${sqlLiteral(FIXTURE_USER)} and source_key = ${sqlLiteral(sourceKey)} limit 1)`;
}

function locationId(sourceKey) {
  return `(select id from public.coach_equipment_locations where fixture_user = ${sqlLiteral(FIXTURE_USER)} and source_key = ${sqlLiteral(sourceKey)} limit 1)`;
}

function sessionId(sourceKey) {
  return `(select id from public.coach_session_fixtures where fixture_user = ${sqlLiteral(FIXTURE_USER)} and source_key = ${sqlLiteral(sourceKey)} limit 1)`;
}

function blockId(sourceKey) {
  return `(select id from public.coach_session_blocks where fixture_user = ${sqlLiteral(FIXTURE_USER)} and source_key = ${sqlLiteral(sourceKey)} limit 1)`;
}

function fixtureConflict(updateColumns) {
  return [
    "on conflict (fixture_user, source_key) where fixture_user is not null do update set",
    updateColumns.map((column) => `  ${column} = excluded.${column}`).join(",\n"),
    ";",
    "",
  ].join("\n");
}

function header(plan) {
  return [
    "-- ENQIDU Coach Context Jotason fixture seed v1.",
    "-- Idempotent fixture seed generated from normalized JSON already stored in this repo.",
    `-- Source: ${INPUT_PLAN.replaceAll("\\", "/")}`,
    `-- Seed key: ${SEED_KEY}`,
    "-- Scope: fixture_user = 'jotason', user_id = null.",
    "-- Does not touch Garmin/FIT tables, existing user rows, Edge Functions, or runtime code.",
    "",
    "begin;",
    "set local statement_timeout = '60s';",
    "",
    `-- Planned rows: ${JSON.stringify(plan.counts)}`,
    "",
  ].join("\n");
}

function profileSql(row) {
  return [
    "insert into public.coach_athlete_profiles (",
    "  user_id, fixture_user, display_name, profile_type, product, source_key, source_traceability, data_quality",
    ") values (",
    `  null, ${sqlLiteral(FIXTURE_USER)}, ${sqlLiteral(row.display_name)}, 'fixture', 'ENQIDU', ${sqlLiteral(row.natural_key)},`,
    `  ${jsonLiteral({ normalized_file: row.source_path, seed_key: SEED_KEY })},`,
    `  ${jsonLiteral({ warnings: ["fixture_user_not_live_auth_user"], role: row.role ?? null })}`,
    ")",
    fixtureConflict(["display_name", "profile_type", "product", "source_traceability", "data_quality", "updated_at"]),
  ].join("\n");
}

function goalSql(row) {
  return [
    "insert into public.coach_athlete_training_goals (",
    "  athlete_profile_id, user_id, fixture_user, goal_type, priority, description, source_key, source_traceability, data_quality, payload",
    ") values (",
    `  ${profileId()}, null, ${sqlLiteral(FIXTURE_USER)}, 'training', ${sqlLiteral(row.priorities?.primary ?? null)}, ${sqlLiteral(row.plan_name)}, ${sqlLiteral(row.natural_key)},`,
    `  ${jsonLiteral({ normalized_file: row.source_path, seed_key: SEED_KEY })},`,
    "  '{}'::jsonb,",
    `  ${jsonLiteral({ priorities: row.priorities ?? {}, rules: row.rules ?? [] })}`,
    ")",
    fixtureConflict(["athlete_profile_id", "goal_type", "priority", "description", "source_traceability", "data_quality", "payload", "updated_at"]),
  ].join("\n");
}

function constraintSql(row) {
  return [
    "insert into public.coach_athlete_constraints (",
    "  athlete_profile_id, user_id, fixture_user, constraint_type, severity, description, active, source_key, source_traceability, data_quality, payload",
    ") values (",
    `  ${profileId()}, null, ${sqlLiteral(FIXTURE_USER)}, 'equipment_location', null, ${sqlLiteral(`Constraints for ${row.location_id ?? "unknown"}`)}, true, ${sqlLiteral(row.natural_key)},`,
    `  ${jsonLiteral({ normalized_file: row.source_path, seed_key: SEED_KEY })},`,
    "  '{}'::jsonb,",
    `  ${jsonLiteral({ location_id: row.location_id ?? null, constraints: row.constraints ?? {} })}`,
    ")",
    fixtureConflict(["athlete_profile_id", "constraint_type", "severity", "description", "active", "source_traceability", "data_quality", "payload", "updated_at"]),
  ].join("\n");
}

function locationSql(row) {
  return [
    "insert into public.coach_equipment_locations (",
    "  athlete_profile_id, user_id, fixture_user, location_id, location_type, label, constraints, source_key, source_traceability, data_quality",
    ") values (",
    `  ${profileId()}, null, ${sqlLiteral(FIXTURE_USER)}, ${sqlLiteral(row.location_id)}, ${sqlLiteral(row.location_type)}, ${sqlLiteral(row.label)}, '{}'::jsonb, ${sqlLiteral(row.natural_key)},`,
    `  ${jsonLiteral({ normalized_file: row.source_path, seed_key: SEED_KEY })},`,
    "  '{}'::jsonb",
    ")",
    fixtureConflict(["athlete_profile_id", "location_id", "location_type", "label", "constraints", "source_traceability", "data_quality", "updated_at"]),
  ].join("\n");
}

function equipmentSql(row) {
  const locationSourceKey = `${FIXTURE_USER}:equipment_location:${row.location_id ?? "unknown"}`;
  return [
    "insert into public.coach_equipment_items (",
    "  equipment_location_id, athlete_profile_id, user_id, fixture_user, item_id, category, name, quantity, unit, value, raw_path, source_key, source_traceability, data_quality, payload",
    ") values (",
    `  ${locationId(locationSourceKey)}, ${profileId()}, null, ${sqlLiteral(FIXTURE_USER)}, ${sqlLiteral(row.item_id)}, ${sqlLiteral(row.category)}, ${sqlLiteral(row.name)}, ${sqlNumber(row.quantity)}, ${sqlLiteral(row.unit)}, ${jsonLiteral(row.value)}, ${sqlLiteral(row.source_path)}, ${sqlLiteral(row.natural_key)},`,
    `  ${jsonLiteral({ normalized_file: row.source_path, seed_key: SEED_KEY })},`,
    "  '{}'::jsonb,",
    `  ${jsonLiteral(row)}`,
    ")",
    fixtureConflict(["equipment_location_id", "athlete_profile_id", "item_id", "category", "name", "quantity", "unit", "value", "raw_path", "source_traceability", "data_quality", "payload", "updated_at"]),
  ].join("\n");
}

function sourceSql(row) {
  const rawFile = row.source_kind === "raw_json" ? row.source_path : null;
  const normalizedFile = row.source_kind === "normalized_json" ? row.source_path : null;
  return [
    "insert into public.coach_context_sources (",
    "  user_id, fixture_user, source_key, source_type, raw_file, normalized_file, role, checksum, source_traceability, data_quality",
    ") values (",
    `  null, ${sqlLiteral(FIXTURE_USER)}, ${sqlLiteral(row.natural_key)}, ${sqlLiteral(row.source_kind)}, ${sqlLiteral(rawFile)}, ${sqlLiteral(normalizedFile)}, 'coach_context_fixture_source', null,`,
    `  ${jsonLiteral({ path: row.source_path, kind: row.source_kind, seed_key: SEED_KEY })},`,
    "  '{}'::jsonb",
    ")",
    fixtureConflict(["source_type", "raw_file", "normalized_file", "role", "checksum", "source_traceability", "data_quality", "updated_at"]),
  ].join("\n");
}

function snapshotSql(row, plan) {
  return [
    "insert into public.coach_context_snapshots (",
    "  athlete_profile_id, user_id, fixture_user, snapshot_type, schema_version, source_key, payload, source_traceability, data_quality",
    ") values (",
    `  ${profileId()}, null, ${sqlLiteral(FIXTURE_USER)}, 'normalized_context', 'coach_context_fixture_seed_v1', ${sqlLiteral(row.natural_key)},`,
    `  ${jsonLiteral({ counts: plan.counts, source_path: row.source_path, references_count: row.references_count, session_fixtures_count: row.session_fixtures_count })},`,
    `  ${jsonLiteral({ normalized_file: row.source_path, seed_key: SEED_KEY })},`,
    "  '{}'::jsonb",
    ")",
    fixtureConflict(["athlete_profile_id", "snapshot_type", "schema_version", "payload", "source_traceability", "data_quality", "updated_at"]),
  ].join("\n");
}

function sessionSql(row) {
  return [
    "insert into public.coach_session_fixtures (",
    "  athlete_profile_id, user_id, fixture_user, source_key, session_date, title, sport, session_type, intent_type, location_type, duration_seconds, distance_meters, calories_total, raw_source_file, normalized_source_file, payload, source_traceability, data_quality",
    ") values (",
    `  ${profileId()}, null, ${sqlLiteral(FIXTURE_USER)}, ${sqlLiteral(row.natural_key)}, ${sqlDate(row.date)}, ${sqlLiteral(row.title)}, ${sqlLiteral(row.sport)}, ${sqlLiteral(row.session_type)}, ${sqlLiteral(row.session_type)}, null, null, null, null, ${sqlLiteral(row.raw_source_path)}, ${sqlLiteral(row.normalized_path)},`,
    `  ${jsonLiteral(row)},`,
    `  ${jsonLiteral({ raw_file: row.raw_source_path, normalized_file: row.normalized_path, seed_key: SEED_KEY })},`,
    `  ${jsonLiteral({ historical_fixture: true })}`,
    ")",
    fixtureConflict(["athlete_profile_id", "session_date", "title", "sport", "session_type", "intent_type", "location_type", "duration_seconds", "distance_meters", "calories_total", "raw_source_file", "normalized_source_file", "payload", "source_traceability", "data_quality", "updated_at"]),
  ].join("\n");
}

function blockSql(row) {
  return [
    "insert into public.coach_session_blocks (",
    "  session_fixture_id, athlete_profile_id, user_id, fixture_user, source_key, block_index, block_type, title, payload, source_traceability, data_quality",
    ") values (",
    `  ${sessionId(row.session_natural_key)}, ${profileId()}, null, ${sqlLiteral(FIXTURE_USER)}, ${sqlLiteral(row.natural_key)}, ${sqlNumber(row.block_order)}, ${sqlLiteral(row.block_type)}, ${sqlLiteral(row.title)},`,
    `  ${jsonLiteral(row)},`,
    `  ${jsonLiteral({ normalized_file: row.normalized_path, seed_key: SEED_KEY })},`,
    "  '{}'::jsonb",
    ")",
    fixtureConflict(["session_fixture_id", "athlete_profile_id", "block_index", "block_type", "title", "payload", "source_traceability", "data_quality", "updated_at"]),
  ].join("\n");
}

function exerciseSql(row) {
  return [
    "insert into public.coach_session_exercises (",
    "  session_fixture_id, block_id, athlete_profile_id, user_id, fixture_user, source_key, exercise_index, name, category, sets, metrics, payload, source_traceability, data_quality",
    ") values (",
    `  ${sessionId(row.session_natural_key)}, ${blockId(row.block_natural_key)}, ${profileId()}, null, ${sqlLiteral(FIXTURE_USER)}, ${sqlLiteral(row.natural_key)}, ${sqlNumber(row.exercise_order)}, ${sqlLiteral(row.exercise_name)}, null, ${jsonLiteral(row.sets)},`,
    `  ${jsonLiteral({ reps: row.reps ?? null, duration_sec: row.duration_sec ?? null, rest_sec: row.rest_sec ?? null, load_kg: row.load_kg ?? null, equipment: row.equipment ?? null })},`,
    `  ${jsonLiteral(row)},`,
    `  ${jsonLiteral({ normalized_file: row.normalized_path, seed_key: SEED_KEY })},`,
    "  '{}'::jsonb",
    ")",
    fixtureConflict(["session_fixture_id", "block_id", "athlete_profile_id", "exercise_index", "name", "category", "sets", "metrics", "payload", "source_traceability", "data_quality", "updated_at"]),
  ].join("\n");
}

function seedRunSql(plan) {
  return [
    "insert into public.coach_seed_runs (",
    "  seed_key, mode, fixture_user, status, input_plan, result_summary, warnings",
    ") values (",
    `  ${sqlLiteral(SEED_KEY)}, 'applied', ${sqlLiteral(FIXTURE_USER)}, 'success',`,
    `  ${jsonLiteral({ source: INPUT_PLAN.replaceAll("\\", "/"), seed_sql: SEED_SQL.replaceAll("\\", "/"), counts: plan.counts })},`,
    `  ${jsonLiteral({ fixture_user: FIXTURE_USER, writes_to_database: true, generated_from: plan.generated_from })},`,
    `  ${jsonLiteral(plan.warnings ?? [])}`,
    ")",
    "on conflict (seed_key) do update set",
    "  mode = excluded.mode,",
    "  fixture_user = excluded.fixture_user,",
    "  status = excluded.status,",
    "  input_plan = excluded.input_plan,",
    "  result_summary = excluded.result_summary,",
    "  warnings = excluded.warnings,",
    "  updated_at = now();",
    "",
  ].join("\n");
}

function footer() {
  return ["commit;", ""].join("\n");
}

export async function buildCoachContextSeedSql(rootDir = process.cwd()) {
  const plan = JSON.parse(await readFile(path.join(rootDir, INPUT_PLAN), "utf8"));
  if (plan.product !== "ENQIDU" || plan.fixture_user !== FIXTURE_USER) {
    throw new Error("Seed plan must be ENQIDU fixture_user jotason");
  }

  const rows = plan.would_create;
  const lines = [header(plan)];
  rows.athlete_profiles.forEach((row) => lines.push(profileSql(row)));
  rows.athlete_training_goals.forEach((row) => lines.push(goalSql(row)));
  rows.athlete_constraints.forEach((row) => lines.push(constraintSql(row)));
  rows.athlete_equipment_locations.forEach((row) => lines.push(locationSql(row)));
  rows.athlete_equipment_items.forEach((row) => lines.push(equipmentSql(row)));
  rows.coach_context_sources.forEach((row) => lines.push(sourceSql(row)));
  rows.coach_context_snapshots.forEach((row) => lines.push(snapshotSql(row, plan)));
  rows.coach_session_fixtures.forEach((row) => lines.push(sessionSql(row)));
  rows.coach_session_blocks.forEach((row) => lines.push(blockSql(row)));
  rows.coach_session_exercises.forEach((row) => lines.push(exerciseSql(row)));
  lines.push(seedRunSql(plan));
  lines.push(footer());
  return lines.join("\n");
}

export function buildCoachContextSeedVerifySql() {
  const tables = [
    "coach_athlete_profiles",
    "coach_athlete_training_goals",
    "coach_athlete_constraints",
    "coach_equipment_locations",
    "coach_equipment_items",
    "coach_context_sources",
    "coach_context_snapshots",
    "coach_session_fixtures",
    "coach_session_blocks",
    "coach_session_exercises",
    "coach_seed_runs",
  ];
  const countSelects = tables.map((table) => {
    if (table === "coach_seed_runs") {
      return `select '${table}' as table_name, count(*)::bigint as row_count from public.${table} where fixture_user = '${FIXTURE_USER}' or seed_key = '${SEED_KEY}'`;
    }
    return `select '${table}' as table_name, count(*)::bigint as row_count from public.${table} where fixture_user = '${FIXTURE_USER}'`;
  });

  return [
    "-- ENQIDU Coach Context Jotason fixture seed v1 verification.",
    "-- SELECT-only verification; safe to run after seed.",
    "",
    countSelects.join("\nunion all\n") + ";",
    "",
    "select 'fixture_rows_with_user_id' as check_name, count(*)::bigint as issue_count from (",
    "  select user_id from public.coach_athlete_profiles where fixture_user = 'jotason' and user_id is not null",
    "  union all select user_id from public.coach_athlete_training_goals where fixture_user = 'jotason' and user_id is not null",
    "  union all select user_id from public.coach_athlete_constraints where fixture_user = 'jotason' and user_id is not null",
    "  union all select user_id from public.coach_equipment_locations where fixture_user = 'jotason' and user_id is not null",
    "  union all select user_id from public.coach_equipment_items where fixture_user = 'jotason' and user_id is not null",
    "  union all select user_id from public.coach_context_sources where fixture_user = 'jotason' and user_id is not null",
    "  union all select user_id from public.coach_context_snapshots where fixture_user = 'jotason' and user_id is not null",
    "  union all select user_id from public.coach_session_fixtures where fixture_user = 'jotason' and user_id is not null",
    "  union all select user_id from public.coach_session_blocks where fixture_user = 'jotason' and user_id is not null",
    "  union all select user_id from public.coach_session_exercises where fixture_user = 'jotason' and user_id is not null",
    ") rows;",
    "",
    "select 'duplicate_source_keys' as check_name, count(*)::bigint as issue_count from (",
    "  select 'coach_athlete_profiles' as table_name, source_key from public.coach_athlete_profiles where fixture_user = 'jotason' group by source_key having count(*) > 1",
    "  union all select 'coach_athlete_training_goals', source_key from public.coach_athlete_training_goals where fixture_user = 'jotason' group by source_key having count(*) > 1",
    "  union all select 'coach_athlete_constraints', source_key from public.coach_athlete_constraints where fixture_user = 'jotason' group by source_key having count(*) > 1",
    "  union all select 'coach_equipment_locations', source_key from public.coach_equipment_locations where fixture_user = 'jotason' group by source_key having count(*) > 1",
    "  union all select 'coach_equipment_items', source_key from public.coach_equipment_items where fixture_user = 'jotason' group by source_key having count(*) > 1",
    "  union all select 'coach_context_sources', source_key from public.coach_context_sources where fixture_user = 'jotason' group by source_key having count(*) > 1",
    "  union all select 'coach_context_snapshots', source_key from public.coach_context_snapshots where fixture_user = 'jotason' group by source_key having count(*) > 1",
    "  union all select 'coach_session_fixtures', source_key from public.coach_session_fixtures where fixture_user = 'jotason' group by source_key having count(*) > 1",
    "  union all select 'coach_session_blocks', source_key from public.coach_session_blocks where fixture_user = 'jotason' group by source_key having count(*) > 1",
    "  union all select 'coach_session_exercises', source_key from public.coach_session_exercises where fixture_user = 'jotason' group by source_key having count(*) > 1",
    ") duplicates;",
    "",
    "select 'orphan_relationships' as check_name, count(*)::bigint as issue_count from (",
    "  select g.id from public.coach_athlete_training_goals g left join public.coach_athlete_profiles p on p.id = g.athlete_profile_id where g.fixture_user = 'jotason' and p.id is null",
    "  union all select c.id from public.coach_athlete_constraints c left join public.coach_athlete_profiles p on p.id = c.athlete_profile_id where c.fixture_user = 'jotason' and p.id is null",
    "  union all select i.id from public.coach_equipment_items i left join public.coach_equipment_locations l on l.id = i.equipment_location_id left join public.coach_athlete_profiles p on p.id = i.athlete_profile_id where i.fixture_user = 'jotason' and (l.id is null or p.id is null)",
    "  union all select b.id from public.coach_session_blocks b left join public.coach_session_fixtures s on s.id = b.session_fixture_id where b.fixture_user = 'jotason' and s.id is null",
    "  union all select e.id from public.coach_session_exercises e left join public.coach_session_fixtures s on s.id = e.session_fixture_id where e.fixture_user = 'jotason' and s.id is null",
    ") orphaned;",
    "",
    "select 'garmin_fit_untouched' as check_name, 'documented_local_guard' as result;",
    "",
  ].join("\n");
}

export function buildCoachContextSeedRollbackSql() {
  return [
    "-- ENQIDU Coach Context Jotason fixture seed v1 rollback.",
    "-- Deletes only fixture rows owned by fixture_user = 'jotason' or this seed key.",
    "begin;",
    "delete from public.coach_session_exercises where fixture_user = 'jotason';",
    "delete from public.coach_session_blocks where fixture_user = 'jotason';",
    "delete from public.coach_session_fixtures where fixture_user = 'jotason';",
    "delete from public.coach_context_snapshots where fixture_user = 'jotason';",
    "delete from public.coach_context_sources where fixture_user = 'jotason';",
    "delete from public.coach_equipment_items where fixture_user = 'jotason';",
    "delete from public.coach_equipment_locations where fixture_user = 'jotason';",
    "delete from public.coach_athlete_constraints where fixture_user = 'jotason';",
    "delete from public.coach_athlete_training_goals where fixture_user = 'jotason';",
    "delete from public.coach_seed_runs where seed_key = 'coach_context_jotason_fixture_v1' or fixture_user = 'jotason';",
    "delete from public.coach_athlete_profiles where fixture_user = 'jotason';",
    "commit;",
    "",
  ].join("\n");
}

async function writeIfChanged(rootDir, relativePath, content) {
  const outputPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    const current = await readFile(outputPath, "utf8");
    if (current === content) return { outputPath: relativePath.replaceAll("\\", "/"), changed: false };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(outputPath, content, "utf8");
  return { outputPath: relativePath.replaceAll("\\", "/"), changed: true };
}

export async function writeCoachContextSeedSql(rootDir = process.cwd()) {
  const seed = await buildCoachContextSeedSql(rootDir);
  const verify = buildCoachContextSeedVerifySql();
  const rollback = buildCoachContextSeedRollbackSql();
  const results = [];
  results.push(await writeIfChanged(rootDir, SEED_SQL, seed));
  results.push(await writeIfChanged(rootDir, VERIFY_SQL, verify));
  results.push(await writeIfChanged(rootDir, ROLLBACK_SQL, rollback));
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await writeCoachContextSeedSql();
  for (const result of results) {
    console.log(`Generated ${result.outputPath}`);
    console.log(`Changed: ${result.changed}`);
  }
}
