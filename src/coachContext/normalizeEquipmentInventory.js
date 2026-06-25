const CATEGORY_MAP = {
  strength_equipment: "strength",
  functional_equipment: "functional",
  conditioning_equipment: "conditioning",
  core_recovery: "recovery",
};

function toCamelCase(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

function toTitle(value) {
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferUnit(key) {
  if (/_kg$/.test(key) || key.includes("_kg") || /kg$/.test(key)) return "kg";
  if (/_lb$/.test(key) || key.includes("_lb") || /lb$/.test(key)) return "lb";
  return null;
}

function normalizeScalarItem({ category, key, value, suffix = null }) {
  const id = suffix ? `${toCamelCase(key)}-${toCamelCase(suffix)}` : toCamelCase(key);
  return {
    id,
    category,
    name: suffix ? `${toTitle(key)} ${suffix}` : toTitle(key),
    quantity: typeof value === "number" ? value : null,
    unit: inferUnit(key),
    value,
  };
}

function normalizeObjectItems({ category, key, value }) {
  if (value && typeof value.available === "boolean") {
    return [
      {
        id: toCamelCase(key),
        category,
        name: toTitle(key),
        quantity: null,
        unit: inferUnit(key),
        value: value.type ?? value.available,
      },
    ];
  }

  return Object.entries(value ?? {}).map(([childKey, childValue]) =>
    normalizeScalarItem({ category, key, value: childValue, suffix: childKey }),
  );
}

function normalizeArrayItems({ category, key, value }) {
  return value.map((entry) => ({
    id: `${toCamelCase(key)}-${String(entry).replace(/[^a-zA-Z0-9]+/g, "_")}`,
    category,
    name: toTitle(key),
    quantity: 1,
    unit: inferUnit(key),
    value: entry,
  }));
}

function normalizeEquipmentEntries(raw) {
  const equipment = [];

  for (const [sectionKey, category] of Object.entries(CATEGORY_MAP)) {
    const section = raw?.[sectionKey];
    if (!section || typeof section !== "object") continue;

    for (const [key, value] of Object.entries(section)) {
      if (Array.isArray(value)) {
        equipment.push(...normalizeArrayItems({ category, key, value }));
      } else if (value && typeof value === "object") {
        equipment.push(...normalizeObjectItems({ category, key, value }));
      } else {
        equipment.push(normalizeScalarItem({ category, key, value }));
      }
    }
  }

  return equipment;
}

export function normalizeEquipmentInventory(raw, { file = "inventory_home_v4.json" } = {}) {
  return {
    source: {
      file,
      fixture: "jotason",
      role: "pilot_user_equipment_inventory",
    },
    location: {
      id: raw?.location ?? "home",
      type: raw?.location ?? "home",
      label: raw?.location === "home" || !raw?.location ? "Home" : toTitle(raw.location),
    },
    equipment: normalizeEquipmentEntries(raw),
    constraints: {
      cardioAtHome: raw?.constraints?.cardio_at_home ?? null,
      noRackWhenRain: raw?.constraints?.no_rack_when_rain ?? null,
    },
  };
}

