import path from "node:path";
import { buildNormalizedAthleteContext } from "./buildNormalizedAthleteContext.js";
import { buildNormalizedSessionFixture } from "./buildNormalizedSessionFixture.js";
import { buildCoachContextFixture } from "./buildCoachContextFixture.js";
import { writeJsonFile } from "./loadJsonFile.js";
import {
  NORMALIZED_FIXTURE_ROOT,
  NORMALIZED_SESSIONS_ROOT,
  normalizedSessionFileName,
  resolveFromRoot,
  toPosixPath,
} from "./paths.js";

function relativeNormalizedPath(...segments) {
  return toPosixPath(path.join(NORMALIZED_FIXTURE_ROOT, ...segments));
}

export async function writeNormalizedCoachContext({ rootDir = process.cwd() } = {}) {
  const context = await buildCoachContextFixture({ rootDir });
  const generatedFiles = [];
  const writeResults = [];
  const normalizedSessions = context.sessionFixtures.map(buildNormalizedSessionFixture);
  const athleteContext = buildNormalizedAthleteContext({
    references: context.references,
    sessionFixtures: context.sessionFixtures,
    copied: context.copied,
  });

  const equipmentInventory = context.references.equipmentInventory;
  const trainingReference = context.references.trainingReference;

  const coachContext = {
    schema_version: "enqidu_normalized_coach_context_fixture_v0",
    product: "ENQIDU",
    fixture_user: "jotason",
    generated_from: "docs/coach-context",
    source_traceability: {
      generated_from: "docs/coach-context",
      source_files: context.copied.map((source) => source.target_path),
    },
    data_quality: {
      missing_fields: [],
      warnings: context.warnings,
    },
    references: context.references,
    session_fixtures: normalizedSessions,
  };

  const filesToWrite = [
    ["athlete-context.normalized.json", athleteContext],
    ["equipment-inventory.normalized.json", equipmentInventory],
    ["training-reference.normalized.json", trainingReference],
    ["coach-context.normalized.json", coachContext],
  ];

  for (const [fileName, value] of filesToWrite) {
    const relativePath = relativeNormalizedPath(fileName);
    generatedFiles.push(relativePath);
    writeResults.push(await writeJsonFile(resolveFromRoot(rootDir, relativePath), value));
  }

  for (const normalized of normalizedSessions) {
    const fileName = normalizedSessionFileName(normalized.source_traceability.file);
    const relativePath = relativeNormalizedPath("sessions", fileName);
    generatedFiles.push(relativePath);
    writeResults.push(await writeJsonFile(resolveFromRoot(rootDir, relativePath), normalized));
  }

  const warnings = [
    ...context.warnings,
    ...(equipmentInventory?.data_quality?.warnings ?? []),
    ...(trainingReference?.data_quality?.warnings ?? []),
    ...normalizedSessions.flatMap((session) => session.data_quality.warnings ?? []),
  ];

  const manifest = {
    schema_version: "enqidu_normalized_manifest_v0",
    product: "ENQIDU",
    fixture_user: "jotason",
    generated_from: "docs/coach-context",
    source_traceability: {
      generated_from: "docs/coach-context",
      source_files: context.copied.map((source) => source.target_path),
    },
    data_quality: {
      missing_fields: [],
      warnings,
    },
    generated_files: generatedFiles,
    source_files: context.copied.map((source) => source.target_path),
    counts: {
      references: Object.values(context.references).filter(Boolean).length,
      session_fixtures: context.sessionFixtures.length,
      normalized_sessions: normalizedSessions.length,
      warnings: warnings.length,
    },
    warnings,
  };

  const manifestPath = relativeNormalizedPath("normalized-manifest.json");
  generatedFiles.push(manifestPath);
  manifest.generated_files = generatedFiles;
  writeResults.push(await writeJsonFile(resolveFromRoot(rootDir, manifestPath), manifest));

  return {
    manifest,
    coachContext,
    athleteContext,
    equipmentInventory,
    trainingReference,
    normalizedSessions,
    writeResults,
  };
}
