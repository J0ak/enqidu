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
const OUTPUT_SQL = path.join("supabase", "seed", "coach_context_jotason_seed.generated.sql");

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonLiteral(value) {
  return `${sqlLiteral(JSON.stringify(value ?? {}, null, 2))}::jsonb`;
}

function header(plan) {
  return [
    "-- GENERATED DRAFT ONLY - DO NOT APPLY AUTOMATICALLY",
    `-- Source: ${INPUT_PLAN.replaceAll("\\", "/")}`,
    "-- This file is not executed automatically.",
    "-- Review RLS, target environment and rollback before applying.",
    "-- It intentionally keeps fixture rows under fixture_user = 'jotason'.",
    "",
    "begin;",
    "",
    "-- This generated SQL is a review artifact. It is wrapped in rollback so",
    "-- accidental execution does not persist rows without a deliberate edit.",
    "",
    `-- Planned tables: ${Object.keys(plan.would_create ?? {}).length}`,
    `-- Planned session fixtures: ${plan.counts?.coach_session_fixtures ?? 0}`,
    "",
  ].join("\n");
}

function profileSql(profile) {
  return [
    "insert into public.coach_athlete_profiles (",
    "  fixture_user, display_name, profile_type, product, source_key, source_traceability, data_quality",
    ")",
    "values (",
    `  ${sqlLiteral(profile.fixture_user)},`,
    `  ${sqlLiteral(profile.display_name)},`,
    "  'fixture',",
    "  'ENQIDU',",
    `  ${sqlLiteral(profile.natural_key)},`,
    `  ${jsonLiteral({ normalized_file: profile.source_path, fixture_user: profile.fixture_user })},`,
    `  ${jsonLiteral({ warnings: ["fixture_user_not_live_auth_user"] })}`,
    ")",
    "on conflict do nothing;",
    "",
  ].join("\n");
}

function sourceSql(source) {
  const rawFile = source.source_kind === "raw_json" ? source.source_path : null;
  const normalizedFile = source.source_kind === "normalized_json" ? source.source_path : null;

  return [
    "insert into public.coach_context_sources (",
    "  fixture_user, source_key, source_type, raw_file, normalized_file, role, source_traceability, data_quality",
    ")",
    "values (",
    `  ${sqlLiteral(source.fixture_user)},`,
    `  ${sqlLiteral(source.natural_key)},`,
    `  ${sqlLiteral(source.source_kind)},`,
    `  ${sqlLiteral(rawFile)},`,
    `  ${sqlLiteral(normalizedFile)},`,
    "  'coach_context_fixture_source',",
    `  ${jsonLiteral({ path: source.source_path, kind: source.source_kind })},`,
    "  '{}'::jsonb",
    ")",
    "on conflict do nothing;",
    "",
  ].join("\n");
}

function seedRunSql(plan) {
  const seedRun = plan.would_create?.coach_seed_runs?.[0] ?? {};

  return [
    "insert into public.coach_seed_runs (",
    "  seed_key, mode, fixture_user, status, input_plan, result_summary, warnings",
    ")",
    "values (",
    `  ${sqlLiteral(seedRun.natural_key ?? "jotason:seed_run:dry_run:v0")},`,
    "  'dry_run',",
    `  ${sqlLiteral(plan.fixture_user)},`,
    "  'draft',",
    `  ${jsonLiteral({ source: INPUT_PLAN.replaceAll("\\", "/"), counts: plan.counts })},`,
    `  ${jsonLiteral({ writes_to_database: false, generated_from: plan.generated_from })},`,
    `  ${jsonLiteral(plan.warnings ?? [])}`,
    ")",
    "on conflict (seed_key) do nothing;",
    "",
  ].join("\n");
}

export async function buildSupabaseSeedSql(rootDir = process.cwd()) {
  const planPath = path.join(rootDir, INPUT_PLAN);
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const profiles = plan.would_create?.athlete_profiles ?? [];
  const sources = plan.would_create?.coach_context_sources ?? [];
  const lines = [header(plan)];

  for (const profile of profiles) lines.push(profileSql(profile));
  for (const source of sources) lines.push(sourceSql(source));
  lines.push(seedRunSql(plan));
  lines.push("rollback;", "");

  return lines.join("\n");
}

export async function writeSupabaseSeedSql(rootDir = process.cwd()) {
  const sql = await buildSupabaseSeedSql(rootDir);
  const outputPath = path.join(rootDir, OUTPUT_SQL);
  await mkdir(path.dirname(outputPath), { recursive: true });

  try {
    const current = await readFile(outputPath, "utf8");
    if (current === sql) {
      return { outputPath: OUTPUT_SQL.replaceAll("\\", "/"), changed: false };
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await writeFile(outputPath, sql, "utf8");
  return { outputPath: OUTPUT_SQL.replaceAll("\\", "/"), changed: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await writeSupabaseSeedSql();
  console.log(`Generated Supabase seed SQL draft: ${result.outputPath}`);
  console.log(`Changed: ${result.changed}`);
}

