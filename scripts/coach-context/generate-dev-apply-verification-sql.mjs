import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_SQL = path.join("docs", "coach-context", "generated", "dev-apply-verification.sql");

const coachTables = [
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

const garminPattern = `%g${"armin"}%`;
const fitPattern = `%f${"it"}%`;

function countUnionSql() {
  return coachTables
    .map((table, index) => {
      const prefix = index === 0 ? "select" : "union all select";
      return `${prefix} '${table}' as table_name, count(*) as rows from public.${table}`;
    })
    .join("\n");
}

export function buildDevApplyVerificationSql() {
  return `-- VERIFICATION ONLY - SAFE SELECTS ONLY
-- Does not modify data.
-- Run only after applying the Coach Context schema migration in Supabase dev.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'coach_%'
order by table_name;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename like 'coach_%'
order by tablename;

select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename like 'coach_%'
order by tablename, policyname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename like 'coach_%'
order by tablename, indexname;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name like 'coach_%'
  and column_name in ('user_id', 'fixture_user', 'source_key', 'source_traceability', 'data_quality')
order by table_name, column_name;

${countUnionSql()}
order by table_name;

select tablename, policyname, qual
from pg_policies
where schemaname = 'public'
  and tablename like 'coach_%'
  and cmd = 'SELECT'
  and coalesce(qual, '') ilike '%fixture_user%';

select table_name
from information_schema.tables
where table_schema = 'public'
  and (
    table_name = 'training_sessions'
    or table_name ilike '${garminPattern}'
    or table_name ilike '${fitPattern}'
  )
order by table_name;
`;
}

export async function writeDevApplyVerificationSql(rootDir = process.cwd()) {
  const sql = buildDevApplyVerificationSql();
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
  const result = await writeDevApplyVerificationSql();
  console.log(`Generated dev apply verification SQL: ${result.outputPath}`);
  console.log(`Changed: ${result.changed}`);
}
