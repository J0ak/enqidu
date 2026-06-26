import path from "node:path";
import { loadJsonFile } from "./loadJsonFile.js";
import { assertCoachContextRelativePath, resolveFromRoot, SOURCE_MANIFEST_RELATIVE_PATH } from "./paths.js";

export async function loadSourceManifest({ rootDir = process.cwd() } = {}) {
  const manifest = await loadJsonFile(resolveFromRoot(rootDir, SOURCE_MANIFEST_RELATIVE_PATH));
  for (const source of manifest.sources ?? []) {
    assertCoachContextRelativePath(source.target_path);
  }
  return manifest;
}

export function getCopiedSources(manifest) {
  return (manifest.sources ?? []).filter((source) => source.status === "copied");
}

export function resolveSourcePath(rootDir, source) {
  assertCoachContextRelativePath(source.target_path);
  return path.join(rootDir, source.target_path);
}

export function sourceTraceability(source) {
  return {
    file: source.file,
    source_path: source.target_path,
    fixture_user: "jotason",
    category: source.category,
    role: source.role,
    genericity: source.genericity,
    status: source.status,
  };
}

