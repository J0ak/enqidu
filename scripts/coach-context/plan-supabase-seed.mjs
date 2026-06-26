import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadJsonFile,
  NORMALIZED_FIXTURE_ROOT,
  NORMALIZED_SESSIONS_ROOT,
  toPosixPath,
  validateSupabaseSeedPlan,
  writeJsonFile,
} from "../../src/coachContext/index.js";

const NORMALIZED_FIXTURE_ROOT_POSIX = toPosixPath(NORMALIZED_FIXTURE_ROOT);
const NORMALIZED_SESSIONS_ROOT_POSIX = toPosixPath(NORMALIZED_SESSIONS_ROOT);
const OUTPUT_RELATIVE_PATH = path.posix.join(
  NORMALIZED_FIXTURE_ROOT_POSIX,
  "supabase-seed-plan.generated.json",
);

const ROOT_FILES = {
  athleteContext: "athlete-context.normalized.json",
  coachContext: "coach-context.normalized.json",
  equipmentInventory: "equipment-inventory.normalized.json",
  trainingReference: "training-reference.normalized.json",
};

async function loadFixtureInputs(rootDir) {
  const normalizedRoot = path.join(rootDir, NORMALIZED_FIXTURE_ROOT);
  const sessionsRoot = path.join(rootDir, NORMALIZED_SESSIONS_ROOT);
  const rootFiles = {};

  for (const [key, fileName] of Object.entries(ROOT_FILES)) {
    rootFiles[key] = await loadJsonFile(path.join(normalizedRoot, fileName));
  }

  const sessionFileNames = (await readdir(sessionsRoot))
    .filter((fileName) => fileName.endsWith(".normalized.json"))
    .sort((a, b) => a.localeCompare(b));
  const sessions = [];

  for (const fileName of sessionFileNames) {
    sessions.push({
      fileName,
      normalized_path: path.posix.join(NORMALIZED_SESSIONS_ROOT_POSIX, fileName),
      payload: await loadJsonFile(path.join(sessionsRoot, fileName)),
    });
  }

  return { rootFiles, sessions };
}

function stableKey(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join(":")
    .replaceAll("\\", "/");
}

function uniqueByNaturalKey(rows) {
  const seen = new Set();
  const result = [];

  for (const row of rows) {
    if (seen.has(row.natural_key)) continue;
    seen.add(row.natural_key);
    result.push(row);
  }

  return result;
}

function qualityWarnings(...payloads) {
  return payloads.flatMap((payload) => payload?.data_quality?.warnings ?? []);
}

function buildSourceRows(rootFiles, sessions, fixtureUser) {
  const rawSourceFiles = new Set(rootFiles.athleteContext.source_traceability?.source_files ?? []);
  for (const session of sessions) {
    if (session.payload?.source_traceability?.source_path) {
      rawSourceFiles.add(session.payload.source_traceability.source_path);
    }
  }

  const normalizedFiles = [
    ...Object.values(ROOT_FILES).map((fileName) => path.posix.join(NORMALIZED_FIXTURE_ROOT_POSIX, fileName)),
    ...sessions.map((session) => session.normalized_path),
  ];

  const rawRows = [...rawSourceFiles].sort((a, b) => a.localeCompare(b)).map((sourcePath) => ({
    natural_key: stableKey(fixtureUser, "raw_json", sourcePath),
    operation: "insert_if_absent",
    fixture_user: fixtureUser,
    source_kind: "raw_json",
    source_path: sourcePath,
    editable_live_state: false,
  }));

  const normalizedRows = normalizedFiles.sort((a, b) => a.localeCompare(b)).map((sourcePath) => ({
    natural_key: stableKey(fixtureUser, "normalized_json", sourcePath),
    operation: "insert_if_absent",
    fixture_user: fixtureUser,
    source_kind: "normalized_json",
    source_path: sourcePath,
    editable_live_state: false,
  }));

  return [...rawRows, ...normalizedRows];
}

function buildSessionRows(sessions, fixtureUser) {
  const fixtures = [];
  const blocks = [];
  const exercises = [];

  for (const sessionFile of sessions) {
    const session = sessionFile.payload.session ?? {};
    const source = sessionFile.payload.source_traceability ?? {};
    const sessionKey = stableKey(fixtureUser, "session", session.date ?? "undated", source.file ?? sessionFile.fileName);

    fixtures.push({
      natural_key: sessionKey,
      operation: "insert_if_absent",
      fixture_user: fixtureUser,
      date: session.date ?? null,
      title: session.title ?? null,
      sport: session.sport ?? null,
      session_type: session.session_type ?? null,
      normalized_path: sessionFile.normalized_path,
      raw_source_path: source.source_path ?? null,
      editable_live_state: false,
      historical_fixture: true,
    });

    for (const [blockIndex, block] of (session.blocks ?? []).entries()) {
      const blockKey = stableKey(sessionKey, "block", block.block_id ?? blockIndex + 1);
      blocks.push({
        natural_key: blockKey,
        operation: "insert_if_absent",
        fixture_user: fixtureUser,
        session_natural_key: sessionKey,
        block_order: blockIndex + 1,
        block_id: block.block_id ?? null,
        block_type: block.block_type ?? null,
        title: block.title ?? null,
        rounds: block.rounds ?? null,
        estimated_duration_min: block.estimated_duration_min ?? null,
        normalized_path: sessionFile.normalized_path,
      });

      for (const [exerciseIndex, exercise] of (block.exercises ?? []).entries()) {
        exercises.push({
          natural_key: stableKey(blockKey, "exercise", exercise.order ?? exerciseIndex + 1),
          operation: "insert_if_absent",
          fixture_user: fixtureUser,
          session_natural_key: sessionKey,
          block_natural_key: blockKey,
          exercise_order: exercise.order ?? exerciseIndex + 1,
          exercise_name: exercise.exercise_name ?? null,
          equipment: exercise.equipment ?? null,
          sets: exercise.sets ?? null,
          reps: exercise.reps ?? null,
          duration_sec: exercise.duration_sec ?? null,
          rest_sec: exercise.rest_sec ?? null,
          load_kg: exercise.load_kg ?? null,
          normalized_path: sessionFile.normalized_path,
        });
      }
    }
  }

  return { fixtures, blocks, exercises };
}

export async function buildSupabaseSeedPlan(rootDir = process.cwd()) {
  const { rootFiles, sessions } = await loadFixtureInputs(rootDir);
  const fixtureUser = rootFiles.athleteContext.fixture_user;
  const equipment = rootFiles.equipmentInventory;
  const training = rootFiles.trainingReference;
  const sessionRows = buildSessionRows(sessions, fixtureUser);

  const wouldCreate = {
    athlete_profiles: [
      {
        natural_key: stableKey(fixtureUser, "athlete_profile"),
        operation: "insert_if_absent",
        fixture_user: fixtureUser,
        display_name: rootFiles.athleteContext.athleteFixture?.label ?? fixtureUser,
        role: rootFiles.athleteContext.athleteFixture?.role ?? "pilot_fixture",
        auth_user_id: null,
        editable_live_state: false,
        source_path: path.posix.join(NORMALIZED_FIXTURE_ROOT_POSIX, ROOT_FILES.athleteContext),
      },
    ],
    athlete_training_goals: [
      {
        natural_key: stableKey(fixtureUser, "training_goals", training.planName),
        operation: "insert_if_absent",
        fixture_user: fixtureUser,
        plan_name: training.planName ?? null,
        priorities: training.priorities ?? {},
        rules: training.rules ?? [],
        editable_live_state: false,
        source_path: path.posix.join(NORMALIZED_FIXTURE_ROOT_POSIX, ROOT_FILES.trainingReference),
      },
    ],
    athlete_constraints: [
      {
        natural_key: stableKey(fixtureUser, "constraints", equipment.location?.id ?? "unknown"),
        operation: "insert_if_absent",
        fixture_user: fixtureUser,
        location_id: equipment.location?.id ?? null,
        constraints: equipment.constraints ?? {},
        editable_live_state: false,
        source_path: path.posix.join(NORMALIZED_FIXTURE_ROOT_POSIX, ROOT_FILES.equipmentInventory),
      },
    ],
    athlete_equipment_locations: [
      {
        natural_key: stableKey(fixtureUser, "equipment_location", equipment.location?.id ?? "unknown"),
        operation: "insert_if_absent",
        fixture_user: fixtureUser,
        location_id: equipment.location?.id ?? null,
        location_type: equipment.location?.type ?? null,
        label: equipment.location?.label ?? null,
        editable_live_state: false,
        source_path: path.posix.join(NORMALIZED_FIXTURE_ROOT_POSIX, ROOT_FILES.equipmentInventory),
      },
    ],
    athlete_equipment_items: uniqueByNaturalKey(
      (equipment.equipment ?? []).map((item) => ({
        natural_key: stableKey(fixtureUser, "equipment_item", equipment.location?.id ?? "unknown", item.id),
        operation: "insert_if_absent",
        fixture_user: fixtureUser,
        location_id: equipment.location?.id ?? null,
        item_id: item.id,
        category: item.category ?? null,
        name: item.name ?? null,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        value: item.value ?? null,
        editable_live_state: false,
        source_path: path.posix.join(NORMALIZED_FIXTURE_ROOT_POSIX, ROOT_FILES.equipmentInventory),
      })),
    ),
    coach_context_sources: buildSourceRows(rootFiles, sessions, fixtureUser),
    coach_context_snapshots: [
      {
        natural_key: stableKey(fixtureUser, "coach_context_snapshot", "normalized_v0"),
        operation: "insert_if_absent",
        fixture_user: fixtureUser,
        source_path: path.posix.join(NORMALIZED_FIXTURE_ROOT_POSIX, ROOT_FILES.coachContext),
        references_count: rootFiles.coachContext.counts?.references ?? null,
        session_fixtures_count: rootFiles.coachContext.counts?.session_fixtures ?? sessions.length,
        editable_live_state: false,
      },
    ],
    coach_session_fixtures: sessionRows.fixtures,
    coach_session_blocks: sessionRows.blocks,
    coach_session_exercises: sessionRows.exercises,
    coach_seed_runs: [
      {
        natural_key: stableKey(fixtureUser, "seed_run", "dry_run", "v0"),
        operation: "dry_run_only",
        fixture_user: fixtureUser,
        mode: "dry_run",
        generated_from: NORMALIZED_FIXTURE_ROOT_POSIX,
        writes_to_database: false,
      },
    ],
  };

  const counts = Object.fromEntries(
    Object.entries(wouldCreate).map(([key, rows]) => [key, rows.length]),
  );
  const warnings = [
    "dry_run_only_no_database_write",
    "fixture_user_not_live_auth_user",
    ...qualityWarnings(rootFiles.athleteContext, rootFiles.coachContext, equipment, training, ...sessions.map((s) => s.payload)),
  ];

  return {
    schema_version: "enqidu_supabase_seed_plan_v0",
    product: "ENQIDU",
    fixture_user: fixtureUser,
    mode: "dry_run",
    generated_from: NORMALIZED_FIXTURE_ROOT_POSIX,
    would_create: wouldCreate,
    counts,
    warnings: [...new Set(warnings)].sort((a, b) => a.localeCompare(b)),
    source_traceability: [
      {
        kind: "normalized_root",
        path: NORMALIZED_FIXTURE_ROOT_POSIX,
      },
      ...wouldCreate.coach_context_sources.map((source) => ({
        kind: source.source_kind,
        path: source.source_path,
      })),
    ],
  };
}

export async function writeSupabaseSeedPlan(rootDir = process.cwd()) {
  const plan = await buildSupabaseSeedPlan(rootDir);
  const validation = validateSupabaseSeedPlan(plan);
  if (!validation.valid) {
    throw new Error(`Invalid Supabase seed plan: ${validation.errors.join(", ")}`);
  }

  const outputPath = path.join(rootDir, OUTPUT_RELATIVE_PATH);
  const writeResult = await writeJsonFile(outputPath, plan);

  return {
    outputPath: OUTPUT_RELATIVE_PATH,
    changed: writeResult.changed,
    plan,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await writeSupabaseSeedPlan();
  console.log(`Generated Supabase seed dry-run plan: ${result.outputPath}`);
  console.log(`Changed: ${result.changed}`);
  console.log(`Mode: ${result.plan.mode}`);
  console.log(`Tables planned: ${Object.keys(result.plan.would_create).length}`);
  console.log(`Session fixtures planned: ${result.plan.counts.coach_session_fixtures}`);
}
