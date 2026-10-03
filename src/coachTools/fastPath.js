import { getEnqiduTool } from "./catalog.js";

const normalize = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[¡!¿?.,;:]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const SAVE_RECOMMENDATION_PATTERNS = Object.freeze([
  /^(?:si )?apuntamelo$/,
  /^(?:si )?guardalo(?: en (?:mi )?plan)?$/,
  /^(?:si )?metelo en (?:mi )?plan$/,
  /^(?:si )?anadelo (?:a|al) (?:mi )?plan$/,
  /^(?:yes )?save it(?: to my plan)?$/,
  /^(?:yes )?put it in my plan$/,
  /^add it to my plan$/,
]);

export function detectEnqiduFastPathCommand(message = "") {
  const text = normalize(message);
  if (!text || text.startsWith("no ")) return null;

  if (SAVE_RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(text))) {
    const definition = getEnqiduTool("save_recommendation_today");
    if (!definition?.enabled || definition.access !== "write") return null;
    return {
      tool: definition.name,
      explicit_user_command: true,
      confidence: 1,
      source: "deterministic_fast_path",
    };
  }

  return null;
}
