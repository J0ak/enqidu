import { isValidCalendarDate } from "../time/userCalendar.js";

// The registry uses this small, closed JSON Schema vocabulary on every transport.
// It validates values without coercion, defaults or removing unexpected arguments.
export function matchesSchema(value, schema, root = schema) {
  if (schema === true) return true;
  if (!schema || schema === false) return false;
  if (schema.$ref) {
    if (!schema.$ref.startsWith("#/")) return false;
    const resolved = schema.$ref.slice(2).split("/").reduce((node, key) => node?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], root);
    return Boolean(resolved) && matchesSchema(value, resolved, root);
  }
  if (schema.anyOf && !schema.anyOf.some((item) => matchesSchema(value, item, root))) return false;
  if (schema.oneOf && schema.oneOf.filter((item) => matchesSchema(value, item, root)).length !== 1) return false;
  if (schema.allOf && !schema.allOf.every((item) => matchesSchema(value, item, root))) return false;
  if (Object.hasOwn(schema, "const") && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (Array.isArray(schema.type)) return schema.type.some((type) => matchesSchema(value, { ...schema, type }, root));
  if (schema.type === "null") return value === null;
  if (schema.type === "boolean" && typeof value !== "boolean") return false;
  if (["integer", "number"].includes(schema.type)) {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) return false;
    if (schema.minimum != null && value < schema.minimum || schema.maximum != null && value > schema.maximum) return false;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") return false;
    if (schema.minLength != null && value.length < schema.minLength || schema.maxLength != null && value.length > schema.maxLength) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.format === "date" && !isValidCalendarDate(value)) return false;
    if (schema.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))) return false;
    if (schema.format === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return false;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return false;
    if (schema.minItems != null && value.length < schema.minItems || schema.maxItems != null && value.length > schema.maxItems) return false;
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) return false;
    if (schema.items && !value.every((item) => matchesSchema(item, schema.items, root))) return false;
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (schema.required?.some((key) => !Object.hasOwn(value, key))) return false;
    if (schema.maxProperties != null && Object.keys(value).length > schema.maxProperties) return false;
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) return false;
      const property = Object.hasOwn(schema.properties || {}, key) ? schema.properties[key] : undefined;
      if (property ? !matchesSchema(item, property, root) : schema.additionalProperties === false) return false;
      if (!property && schema.additionalProperties && typeof schema.additionalProperties === "object" && !matchesSchema(item, schema.additionalProperties, root)) return false;
    }
  }
  return true;
}

export const objectSchema = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
export const textSchema = (maxLength = 1000) => ({ type: "string", maxLength });
export const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
export const listSchema = (items, maxItems = 50) => ({ type: "array", items, maxItems });
export const DATE_SCHEMA = { type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$", minLength: 10, maxLength: 10 };
export const ID_SCHEMA = { type: "string", format: "uuid", minLength: 36, maxLength: 36 };
