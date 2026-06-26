import path from "node:path";

export const COACH_CONTEXT_ROOT = path.join("docs", "coach-context");
export const SOURCE_MANIFEST_RELATIVE_PATH = path.join(COACH_CONTEXT_ROOT, "source-json-manifest.json");
export const NORMALIZED_ROOT = path.join(COACH_CONTEXT_ROOT, "normalized");
export const NORMALIZED_FIXTURE_USER = "jotason";
export const NORMALIZED_FIXTURE_ROOT = path.join(NORMALIZED_ROOT, NORMALIZED_FIXTURE_USER);
export const NORMALIZED_SESSIONS_ROOT = path.join(NORMALIZED_FIXTURE_ROOT, "sessions");

export function toPosixPath(filePath) {
  return filePath.replaceAll(path.sep, "/").replaceAll("\\", "/");
}

export function resolveFromRoot(rootDir, relativePath) {
  return path.join(rootDir, relativePath);
}

export function assertCoachContextRelativePath(relativePath) {
  const normalized = toPosixPath(relativePath);
  if (!normalized.startsWith("docs/coach-context/")) {
    throw new Error(`Coach Context paths must stay under docs/coach-context: ${relativePath}`);
  }
  return normalized;
}

export function normalizedSessionFileName(sourceFile) {
  return sourceFile.replace(/\.json$/i, ".normalized.json");
}

