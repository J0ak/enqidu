import { WEBLLM, VERSION, DATASET_URL, MODELS, schema, prompt } from "./config.js";
import { buildRuntimeFailureArtifact, isFatalLocalLanguageRuntimeError, parseModelPayload, summarizeBenchmarkResults } from "./benchmark.js";

const data = await fetch(DATASET_URL).then(async (response) => {
  if (!response.ok) throw new Error(`dataset_load_failed_${response.status}`);
  return response.json();
});

const $ = (id) => document.getElementById(id);
const select = $("model");
let lastArtifact = null;

MODELS.forEach((model) => {
  select.add(new Option(
    `${model.params} · ${model.id} · ${Math.round(model.vramMb)} MB · ${model.license}`,
    model.id,
  ));
});

$("dataset").textContent = `${data.length} casos · core ${data.filter((item) => item.kind === "core").length} · challenge ${data.filter((item) => item.kind === "challenge").length} · ES + EN`;
$("device").textContent = `${navigator.deviceMemory || "?"} GB deviceMemory · ${navigator.userAgent}`;

async function gpuInfo() {
  if (!navigator.gpu) return { available: false };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { available: false };
    return {
      available: true,
      info: adapter.info || {},
      features: [...adapter.features],
    };
  } catch (error) {
    return { available: false, error: String(error) };
  }
}

const gpu = await gpuInfo();
$("webgpu").textContent = gpu.available
  ? `sí · ${gpu.info.description || gpu.info.vendor || "adapter"}`
  : "no disponible";

const storageUsage = async () => {
  try {
    return (await navigator.storage?.estimate?.())?.usage ?? null;
  } catch {
    return null;
  }
};

function cases(limit) {
  if (limit === "all") return data;
  const count = Number(limit);
  const challenge = data.filter((item) => item.kind === "challenge");
  const core = data.filter((item) => item.kind === "core");
  const output = [];
  let challengeIndex = 0;
  let coreIndex = 0;

  while (output.length < Math.min(count, data.length)) {
    const useChallenge = output.length % 2 === 0 && challengeIndex < challenge.length;
    const source = useChallenge ? challenge : core;
    const index = useChallenge ? challengeIndex++ : coreIndex++;
    if (source[index]) output.push(source[index]);
    else if (challenge[challengeIndex]) output.push(challenge[challengeIndex++]);
    else if (core[coreIndex]) output.push(core[coreIndex++]);
    else break;
  }
  return output;
}

const cloudLlmApiCalls = () => performance
  .getEntriesByType("resource")
  .filter((entry) => /api\.openai\.com/i.test(entry.name))
  .length;

async function completion(engine, text) {
  return engine.chat.completions.create({
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: text },
    ],
    temperature: 0,
    max_tokens: 180,
    response_format: {
      type: "json_object",
      schema: JSON.stringify(schema),
    },
  });
}

function failureReason(record) {
  if (record.error) return record.error;
  if (!record.jsonValid) return "invalid_json";
  if (!record.structuredValid) return "invalid_contract";
  const reasons = [];
  if (record.actual?.intent !== record.expected?.intent) reasons.push("intent");
  if (JSON.stringify(record.actual?.slots) !== JSON.stringify(record.expected?.slots)) reasons.push("slots");
  return reasons.join(" ");
}

function renderFailures(records) {
  const failures = records.filter((record) => failureReason(record));
  $("failures").innerHTML = failures.length
    ? ""
    : '<tr><td colspan="4" class="good">Sin fallos en esta muestra.</td></tr>';

  failures.slice(0, 30).forEach((record) => {
    const row = document.createElement("tr");
    [
      record.text,
      JSON.stringify(record.expected),
      record.actual ? JSON.stringify(record.actual) : record.raw || "—",
      failureReason(record),
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    $("failures").append(row);
  });
  return failures;
}

function setArtifact(artifact) {
  lastArtifact = artifact;
  $("download").disabled = false;
  $("copy").disabled = false;
}

$("download").onclick = () => {
  if (!lastArtifact) return;
  const blob = new Blob([JSON.stringify(lastArtifact, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const model = lastArtifact.summary?.model?.id || "model";
  anchor.href = url;
  anchor.download = `enqidu-local-language-v0-${model}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

$("copy").onclick = async () => {
  if (!lastArtifact) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastArtifact, null, 2));
    $("status").textContent = "Resultado copiado.";
  } catch {
    $("status").textContent = "No se pudo copiar; usa Descargar resultado JSON.";
  }
};

$("run").onclick = async () => {
  const model = MODELS.find((item) => item.id === select.value);
  const requestedCases = $("caseCount").value;
  const device = {
    userAgent: navigator.userAgent,
    deviceMemoryGb: navigator.deviceMemory || null,
    gpu,
  };

  if (!gpu.available) {
    const artifact = buildRuntimeFailureArtifact({
      model,
      device,
      datasetSize: data.length,
      requestedCases,
      stage: "webgpu_unavailable",
      error: gpu.error || "webgpu_unavailable",
      cloudLlmApiCalls: cloudLlmApiCalls(),
    });
    setArtifact(artifact);
    $("status").textContent = "WebGPU no disponible: usar fallback determinista.";
    $("gateStatus").textContent = "Sin benchmark de modelo: WebGPU no disponible.";
    $("summary").textContent = JSON.stringify(artifact.summary, null, 2);
    return;
  }

  $("run").disabled = true;
  $("download").disabled = true;
  $("copy").disabled = true;
  lastArtifact = null;
  $("failures").innerHTML = "";
  $("summary").textContent = "—";

  const sample = cases(requestedCases);
  const seenKey = `enqidu.localLanguage.seen.${model.id}`;
  const seenBefore = localStorage.getItem(seenKey) === "1";
  let stage = "import_webllm";

  try {
    $("status").textContent = "Importando WebLLM…";
    const webllm = await import(WEBLLM);
    stage = "model_init";
    const beforeStorage = await storageUsage();
    const initStarted = performance.now();
    const engine = await webllm.CreateMLCEngine(model.id, {
      initProgressCallback: (report) => {
        $("status").textContent = report.text || `Cargando ${model.id}…`;
        if (Number.isFinite(report.progress)) $("progress").value = report.progress;
      },
    });
    const initMs = performance.now() - initStarted;
    const afterStorage = await storageUsage();
    localStorage.setItem(seenKey, "1");

    stage = "warmup";
    $("status").textContent = "Calentando inferencia…";
    const warmupStarted = performance.now();
    await completion(engine, "Hola");
    const warmupMs = performance.now() - warmupStarted;

    stage = "inference";
    const records = [];
    let completionTokens = 0;

    for (let index = 0; index < sample.length; index += 1) {
      const item = sample[index];
      $("status").textContent = `${model.id} · ${index + 1}/${sample.length} · ${item.text}`;
      $("progress").value = (index + 1) / sample.length;

      const record = {
        text: item.text,
        expected: item.expected,
        kind: item.kind,
        language: item.language,
        jsonValid: false,
        structuredValid: false,
        actual: null,
        raw: null,
        latencyMs: null,
        error: null,
      };

      try {
        const started = performance.now();
        const response = await completion(engine, item.text);
        record.latencyMs = performance.now() - started;
        record.raw = response?.choices?.[0]?.message?.content || "";
        completionTokens += Number(response?.usage?.completion_tokens || 0);
        const parsed = parseModelPayload(record.raw);
        record.jsonValid = parsed.jsonValid;
        record.structuredValid = parsed.structuredValid;
        record.actual = parsed.value;
        if (parsed.error) record.error = parsed.error;
      } catch (error) {
        record.error = String(error?.message || error);
        records.push(record);
        if (isFatalLocalLanguageRuntimeError(error)) {
          throw new Error(`fatal_webgpu_runtime: ${record.error}`);
        }
        continue;
      }

      records.push(record);
    }

    const summary = summarizeBenchmarkResults({
      records,
      datasetSize: data.length,
      model,
      device,
      initMs,
      warmupMs,
      cacheState: seenBefore ? "previously_loaded_in_this_browser" : "first_observed_load_in_this_browser",
      cacheDeltaMb: beforeStorage != null && afterStorage != null
        ? (afterStorage - beforeStorage) / 1048576
        : null,
      completionTokens,
      cloudLlmApiCalls: cloudLlmApiCalls(),
    });

    const failures = renderFailures(records);
    const artifact = {
      summary,
      failures: failures.map((record) => ({
        text: record.text,
        kind: record.kind,
        language: record.language,
        expected: record.expected,
        actual: record.actual,
        raw: record.raw,
        reason: failureReason(record),
      })),
    };

    setArtifact(artifact);
    $("summary").textContent = JSON.stringify(summary, null, 2);
    $("status").textContent = `Completado: ${summary.failures} fallos de ${sample.length}.`;

    if (summary.gates.evaluation === "sample_only") {
      $("gateStatus").textContent = "Muestra parcial: métricas informativas; ejecuta “todos” para evaluar gates.";
    } else if (summary.gates.passes_measured_gates) {
      $("gateStatus").textContent = "Dataset completo: este dispositivo/modelo supera los gates medidos.";
    } else {
      $("gateStatus").textContent = "Dataset completo: este dispositivo/modelo NO supera todos los gates medidos.";
    }
  } catch (error) {
    const artifact = buildRuntimeFailureArtifact({
      model,
      device,
      datasetSize: data.length,
      requestedCases,
      stage,
      error,
      cloudLlmApiCalls: cloudLlmApiCalls(),
      cacheState: seenBefore ? "previously_loaded_in_this_browser" : "first_observed_load_in_this_browser",
    });
    setArtifact(artifact);
    $("status").textContent = `Fallo limpio: ${String(error?.message || error)}. Producción no afectada.`;
    $("gateStatus").textContent = "Fallback determinista requerido.";
    $("summary").textContent = JSON.stringify(artifact.summary, null, 2);
  } finally {
    $("run").disabled = false;
  }
};
