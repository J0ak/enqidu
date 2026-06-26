import { loadJsonFile } from "./loadJsonFile.js";
import { normalizeEquipmentInventory } from "./normalizeEquipmentInventory.js";
import { normalizeJotasonSession } from "./normalizeJotasonSession.js";
import { normalizeMasterTemplateReference } from "./normalizeMasterTemplateReference.js";
import { normalizeMonthlyHistoryReference } from "./normalizeMonthlyHistoryReference.js";
import { normalizePromaestroReference } from "./normalizePromaestroReference.js";
import { loadSourceManifest, resolveSourcePath } from "./sourceManifest.js";

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
    references.equipmentInventory = normalizeEquipmentInventory(raw, {
      file: source.file,
      sourcePath: source.target_path,
    });
    return;
  }
  if (source.role === "historical_master_plan_reference") {
    references.trainingReference = normalizePromaestroReference(raw, {
      file: source.file,
      sourcePath: source.target_path,
    });
    return;
  }
  if (source.role === "historical_session_contract_reference") {
    references.sessionContractReference = normalizeMasterTemplateReference(raw, {
      file: source.file,
      sourcePath: source.target_path,
    });
    return;
  }
  if (source.role === "monthly_history_aggregation_fixture") {
    references.monthlyHistoryReference = normalizeMonthlyHistoryReference(raw, {
      file: source.file,
      sourcePath: source.target_path,
    });
  }
}

export async function loadCoachContextReferences({ rootDir = process.cwd() } = {}) {
  const manifest = await loadSourceManifest({ rootDir });
  const references = createInitialReferences();
  const sessionFixtures = [];
  const missing = [];
  const copied = [];

  for (const source of manifest.sources ?? []) {
    if (source.status !== "copied") {
      missing.push(source);
      continue;
    }

    const targetPath = resolveSourcePath(rootDir, source);
    let raw;
    try {
      raw = await loadJsonFile(targetPath);
    } catch (error) {
      missing.push({ ...source, error: error.message });
      continue;
    }

    copied.push(source);

    if (source.category === "session_fixture") {
      sessionFixtures.push(normalizeJotasonSession(raw, { file: source.file, sourcePath: source.target_path }));
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
