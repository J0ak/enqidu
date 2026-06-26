import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function loadJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const next = stringifyJson(value);

  try {
    const current = await readFile(filePath, "utf8");
    if (current === next) return { path: filePath, changed: false };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, next, "utf8");
  await rename(temporaryPath, filePath);
  return { path: filePath, changed: true };
}

