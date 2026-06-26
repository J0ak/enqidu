import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadJsonFile,
  NORMALIZED_FIXTURE_ROOT,
  NORMALIZED_SESSIONS_ROOT,
  toPosixPath,
  validateNormalizedCoachContext,
} from "../../src/coachContext/index.js";

const REQUIRED_ROOT_FILES = {
  athleteContext: "athlete-context.normalized.json",
  coachContext: "coach-context.normalized.json",
  equipmentInventory: "equipment-inventory.normalized.json",
  trainingReference: "training-reference.normalized.json",
};
const NORMALIZED_FIXTURE_ROOT_POSIX = toPosixPath(NORMALIZED_FIXTURE_ROOT);
const NORMALIZED_SESSIONS_ROOT_POSIX = toPosixPath(NORMALIZED_SESSIONS_ROOT);

async function loadNormalizedFixtureSet(rootDir) {
  const normalizedRoot = path.join(rootDir, NORMALIZED_FIXTURE_ROOT);
  const sessionsRoot = path.join(rootDir, NORMALIZED_SESSIONS_ROOT);
  const rootFiles = {};

  for (const [key, fileName] of Object.entries(REQUIRED_ROOT_FILES)) {
    rootFiles[key] = await loadJsonFile(path.join(normalizedRoot, fileName));
  }

  const sessionFileNames = (await readdir(sessionsRoot))
    .filter((fileName) => fileName.endsWith(".normalized.json"))
    .sort((a, b) => a.localeCompare(b));
  const sessions = [];

  for (const fileName of sessionFileNames) {
    sessions.push({
      fileName,
      payload: await loadJsonFile(path.join(sessionsRoot, fileName)),
    });
  }

  return { normalizedRoot, sessionsRoot, rootFiles, sessions };
}

function aggregateQuality(payloads) {
  const warnings = [];
  const missingFields = [];

  for (const { label, payload } of payloads) {
    const quality = payload?.data_quality ?? {};
    for (const warning of quality.warnings ?? []) warnings.push(`${label}:${warning}`);
    for (const missingField of quality.missing_fields ?? []) {
      missingFields.push(`${label}:${missingField}`);
    }
  }

  return { warnings, missingFields };
}

function countBlocksAndExercises(sessions) {
  let blocks = 0;
  let exercises = 0;

  for (const { payload } of sessions) {
    const sessionBlocks = payload?.session?.blocks ?? [];
    blocks += sessionBlocks.length;
    for (const block of sessionBlocks) exercises += (block.exercises ?? []).length;
  }

  return { blocks, exercises };
}

export async function inspectNormalizedForSupabase(rootDir = process.cwd()) {
  const fixtureSet = await loadNormalizedFixtureSet(rootDir);
  const { rootFiles, sessions } = fixtureSet;
  const payloads = [
    ...Object.entries(rootFiles).map(([label, payload]) => ({ label, payload })),
    ...sessions.map(({ fileName, payload }) => ({ label: fileName, payload })),
  ];
  const validations = payloads.map(({ label, payload }) => ({
    label,
    ...validateNormalizedCoachContext(payload),
  }));
  const quality = aggregateQuality(payloads);
  const sessionsWithDate = sessions.filter(({ payload }) => payload?.session?.date).length;
  const sessionsWithoutDate = sessions.length - sessionsWithDate;
  const blockCounts = countBlocksAndExercises(sessions);

  return {
    fixture_user: rootFiles.athleteContext.fixture_user,
    detected: {
      athlete_context: Boolean(rootFiles.athleteContext),
      equipment_inventory: Boolean(rootFiles.equipmentInventory),
      training_reference: Boolean(rootFiles.trainingReference),
      coach_context: Boolean(rootFiles.coachContext),
    },
    counts: {
      normalized_sessions: sessions.length,
      sessions_with_date: sessionsWithDate,
      sessions_without_date: sessionsWithoutDate,
      blocks: blockCounts.blocks,
      exercises: blockCounts.exercises,
    },
    possible_supabase_entities: [
      "athlete_profiles",
      "athlete_training_goals",
      "athlete_constraints",
      "athlete_equipment_locations",
      "athlete_equipment_items",
      "coach_context_sources",
      "coach_context_snapshots",
      "coach_session_fixtures",
      "coach_session_blocks",
      "coach_session_exercises",
      "coach_seed_runs",
    ],
    warnings: quality.warnings,
    missing_fields: quality.missingFields,
    validation_errors: validations.flatMap((result) =>
      result.errors.map((error) => `${result.label}:${error}`),
    ),
    source_traceability: {
      normalized_root: NORMALIZED_FIXTURE_ROOT_POSIX,
      raw_sources:
        rootFiles.athleteContext.source_traceability?.source_files ??
        rootFiles.coachContext.source_traceability?.source_files ??
        [],
      normalized_files: [
        ...Object.values(REQUIRED_ROOT_FILES).map((fileName) => path.posix.join(NORMALIZED_FIXTURE_ROOT_POSIX, fileName)),
        ...sessions.map(({ fileName }) => path.posix.join(NORMALIZED_SESSIONS_ROOT_POSIX, fileName)),
      ],
    },
  };
}

function printInspection(summary) {
  console.log(`Fixture user: ${summary.fixture_user}`);
  console.log(`Athlete context detected: ${summary.detected.athlete_context}`);
  console.log(`Equipment inventory detected: ${summary.detected.equipment_inventory}`);
  console.log(`Training reference detected: ${summary.detected.training_reference}`);
  console.log(`Coach context detected: ${summary.detected.coach_context}`);
  console.log(`Normalized sessions: ${summary.counts.normalized_sessions}`);
  console.log(`Sessions with date: ${summary.counts.sessions_with_date}`);
  console.log(`Sessions without date: ${summary.counts.sessions_without_date}`);
  console.log(`Blocks: ${summary.counts.blocks}`);
  console.log(`Exercises: ${summary.counts.exercises}`);
  console.log(`Warnings: ${summary.warnings.length}`);
  console.log(`Missing fields: ${summary.missing_fields.length}`);
  console.log(`Validation errors: ${summary.validation_errors.length}`);
  console.log(`Possible Supabase entities: ${summary.possible_supabase_entities.join(", ")}`);
  console.log(`Traceability raw sources: ${summary.source_traceability.raw_sources.length}`);
  console.log(`Traceability normalized files: ${summary.source_traceability.normalized_files.length}`);

  if (summary.warnings.length > 0) {
    console.log(`Warning details: ${summary.warnings.join(", ")}`);
  }
  if (summary.missing_fields.length > 0) {
    console.log(`Missing field details: ${summary.missing_fields.join(", ")}`);
  }
  if (summary.validation_errors.length > 0) {
    console.log(`Validation error details: ${summary.validation_errors.join(", ")}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = await inspectNormalizedForSupabase();
  printInspection(summary);

  if (summary.validation_errors.length > 0) {
    process.exitCode = 1;
  }
}
