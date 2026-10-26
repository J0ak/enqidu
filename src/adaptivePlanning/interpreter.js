import { detectEnqiduFastPathCommand } from "../coachTools/fastPath.js";

const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[¡!¿?.,;:]+/g, " ").replace(/\s+/g, " ").trim();

/** Bounded language adapter. Text never chooses a tool, RPC, SQL or identity. */
export function detectAdaptiveRequest(message) {
  const text = normalize(message);
  const minutes = text.match(/^(?:hoy )?solo tengo (\d{1,3}) (?:min|minutos)$/);
  if (minutes) return { request: "duration", duration_minutes: Number(minutes[1]) };
  if (/^he dormido mal(?: que hago)?$/.test(text)) return { request: "poor_sleep" };
  if (/^hoy estoy en casa$/.test(text)) return { request: "home" };
  if (/^he hecho mucha mas carga de la prevista$/.test(text)) return { request: "overload" };
  const command = detectEnqiduFastPathCommand(message);
  if (command?.tool === "set_training_unavailability") return { request: "unavailable", date_reference: command.arguments.date_reference };
  if (/^(?:hoy )?solo tengo .*min|^he dormido mal |^hoy estoy en casa |^he hecho mucha mas carga |^(?:hazlo|dejalo|ajustalo|recortalo) mas corto/.test(text)) return { request: "ambiguous" };
  return null;
}

