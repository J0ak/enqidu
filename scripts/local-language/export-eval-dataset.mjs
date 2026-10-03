import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildLocalLanguageEvalDataset } from "../../src/localLanguage/evalDataset.js";

const OUTPUT_URL = new URL("../../public/labs/local-language-v0/dataset.json", import.meta.url);

export function serializeLocalLanguageBrowserDataset() {
  return JSON.stringify(buildLocalLanguageEvalDataset(), null, 2) + "\n";
}

export async function exportLocalLanguageBrowserDataset() {
  await mkdir(new URL("./", OUTPUT_URL), { recursive: true });
  const content = serializeLocalLanguageBrowserDataset();
  await writeFile(OUTPUT_URL, content, "utf8");
  return fileURLToPath(OUTPUT_URL);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  const output = await exportLocalLanguageBrowserDataset();
  console.log(`local-language dataset -> ${output}`);
}
