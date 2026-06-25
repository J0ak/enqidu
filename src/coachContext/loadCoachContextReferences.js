import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeEquipmentInventory } from "./normalizeEquipmentInventory.js";
import { normalizeJotasonSession } from "./normalizeJotasonSession.js";
import { normalizePromaestroReference } from "./normalizePromaestroReference.js";

const DEFAULT_CONTEXT_ROOT = path.join("docs", "coach-context");
const MANIFEST_PATH = path.join(DEFAULT_CONTEXT_ROOT, "source-json-manifest.json");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function assertCoachContextPath(targetPath) {
  const normalized = targetPath.replaceAll("\\", "/");
  if (!normalized.startsWith("docs/coach-context/")) {
    throw new Error(`Fixture path must stay under docs/coach-context: ${targetPath}`);
  }
}

function createInitialReferences() {
  return {
    equipmentInventory: null,
    trainingReference: null,
    sessionContractReference: null,
    monthlyHistoryReference: null,
  };
}

function assignReference(references, source, raw) {
  if (source.role === "pilot_user_equipment_inventory") {
    references.equipmentInventory = normalizeEquipmentInventory(raw, { file: source.file });
    return;
  }
  if (source.role === "historical_master_plan_reference") {
    references.trainingReference = normalizePromaestroReference(raw, { file: source.file });
    return;
  }
  if (source.role === "historical_session_contract_reference") {
    references.sessionContractReference = raw;
    return;
  }
  if (source.role === "monthly_history_aggregation_fixture") {
    references.monthlyHistoryReference = raw;
  }
}

export async function loadCoachContextReferences({ rootDir = process.cwd() } = {}) {
  const manifest = await readJson(path.join(rootDir, MANIFEST_PATH));
  const references = createInitialReferences();
  const sessionFixtures = [];
  const missing = [];
  const copied = [];

  for (const source of manifest.sources ?? []) {
    assertCoachContextPath(source.target_path);

    if (source.status !== "copied") {
      missing.push(source);
      continue;
    }

    const targetPath = path.join(rootDir, source.target_path);
    let raw;
    try {
      raw = await readJson(targetPath);
    } catch (error) {
      missing.push({ ...source, error: error.message });
      continue;
    }

    copied.push(source);

    if (source.category === "session_fixture") {
      sessionFixtures.push(normalizeJotasonSession(raw, { file: source.file }));
    } else if (source.category === "reference") {
      assignReference(references, source, raw);
    }
  }

  return {
    manifest,
    references,
    sessionFixtures,
    missing,
    copied,
  };
}

