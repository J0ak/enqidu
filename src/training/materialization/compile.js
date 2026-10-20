import {
  createCatalogResolver,
  normalizeExactName,
} from "../catalogResolver.js";
import { matchesSchema } from "../../enqiduTools/schema.js";
import { MATERIALIZATION_SCHEMA } from "./contract.js";
import { OPERATIONS_SCHEMA } from "../semantics/contract.js";
import { patchExercises } from "../semantics/domain.js";

export function compileMaterialization(input, state, catalog, exerciseTarget) {
  const facts = structuredClone(input),
    operations = [],
    targets = new Set();
  const resolve = createCatalogResolver(
    catalog.filter((e) => e.is_active !== false),
  );
  const fail = (o, reason, status = "unresolved") => {
    o.state = status;
    facts.unresolved_facts.push({
      text: o.provenance.clause,
      state: status,
      reason,
    });
  };
  if (!matchesSchema(facts, MATERIALIZATION_SCHEMA))
    throw Error("invalid_arguments");
  facts.session_resolution = {
    ...facts.session_resolution,
    state: "resolved",
    session_id: state.session_id,
  };
  if (exerciseTarget && facts.observations.length !== 1) {
    facts.unresolved_facts.push({
      text: "",
      state: "ambiguous",
      reason: "Selecciona cada ejercicio mediante el editor",
    });
    return { facts, operations: [], status: "needs_clarification" };
  }
  if (exerciseTarget && !state.exercises.some((e) => e.id === exerciseTarget)) {
    facts.unresolved_facts.push({
      text: "",
      state: "unresolved",
      reason: "El ejercicio seleccionado no pertenece a esta sesión",
    });
    return { facts, operations: [], status: "needs_clarification" };
  }
  for (const o of facts.observations) {
    const selected = exerciseTarget
      ? state.exercises.find((e) => e.id === exerciseTarget)
      : undefined;
    const unnamed = !o.exercise.reported_name;
    if (!o.exercise.reported_name && selected)
      o.exercise.reported_name = selected.reported_name;
    const r = resolve(
      o.exercise.rename_to
        ? { reported_name: o.exercise.rename_to }
        : selected?.exercise_id && unnamed
          ? selected
          : { reported_name: o.exercise.reported_name },
    );
    o.exercise.resolution_state = r.state;
    if (r.exercise) {
      o.exercise.exercise_id = r.exercise.id;
      o.exercise.canonical_code = r.exercise.code;
      o.exercise.resolved_by =
        selected?.exercise_id && unnamed && !o.exercise.rename_to
          ? "exercise_id"
          : "exact_label";
    }
    let matches = exerciseTarget
      ? state.exercises.filter((e) => e.id === exerciseTarget)
      : o.exercise.reported_name
        ? state.exercises.filter(
            (e) =>
              normalizeExactName(e.reported_name) ===
                normalizeExactName(o.exercise.reported_name) ||
              (r.exercise && resolve(e).exercise?.id === r.exercise.id),
          )
        : [];
    if (matches.length > 1) {
      fail(o, "Ese ejercicio aparece varias veces", "ambiguous");
      continue;
    }
    if (!o.exercise.reported_name && !exerciseTarget) {
      fail(o, "Selecciona el ejercicio", "missing");
      continue;
    }
    if (r.state === "ambiguous") {
      fail(o, "Alias de catálogo ambiguo", "ambiguous");
      continue;
    }
    if (!matches.length && !r.exercise) {
      fail(o, "Identidad no resuelta; selecciona o nombra el ejercicio");
      continue;
    }
    if (o.exercise.rename_to && !r.exercise) {
      fail(o, "Nuevo nombre no resuelto");
      continue;
    }
    let e = matches[0],
      target = e?.id || crypto.randomUUID();
    const targetKey = e ? `row:${e.id}` : `catalog:${r.exercise.id}`;
    if (targets.has(targetKey)) {
      fail(
        o,
        "Dos observaciones sobre el mismo ejercicio; combina los datos en el editor",
        "conflicting",
      );
      continue;
    }
    targets.add(targetKey);
    const ops = [];
    if (!e) {
      if (o.execution.last_reps !== undefined || !o.exercise.reported_name) {
        fail(o, "Faltan series previas", "missing");
        continue;
      }
      ops.push({
        op: "add_exercise",
        target,
        reported_name: o.exercise.reported_name,
      });
    } else if (
      o.exercise.rename_to ||
      (r.exercise && e.exercise_id !== r.exercise.id)
    ) {
      // Reuse #102 rename to persist identity on the very same row, retaining the reported label.
      ops.push({
        op: "rename_exercise",
        target,
        reported_name:
          o.exercise.rename_to ||
          (resolve(e).exercise?.id === r.exercise?.id
            ? e.reported_name
            : o.exercise.reported_name),
      });
    }
    const x = o.execution,
      add = (op, v) => ops.push({ op, target, ...v });
    if (x.reps_per_set) add("set_reps", { reps: x.reps_per_set });
    if (x.sets_completed !== undefined && !x.reps_per_set)
      add("set_sets", { value: x.sets_completed });
    if (x.load_value !== undefined)
      add("set_load", { value: x.load_value, unit: x.load_unit });
    for (const [field, op] of Object.entries({
      last_reps: "set_last_reps",
      rounds_completed: "set_rounds",
      side: "set_side",
      tempo_or_pause: "set_tempo",
    }))
      if (x[field] !== undefined) add(op, { value: x[field] });
    if (x.performed !== undefined) add("set_omitted", { value: !x.performed });
    if (o.notes && !e?.notes?.split("\n").includes(o.notes))
      add("append_note", { value: o.notes });
    if (o.technical_note !== undefined)
      add("set_technical_note", { value: o.technical_note });
    try {
      let current = e ? [e] : [];
      for (const op of ops) {
        let after = patchExercises(current, [op]);
        if (["rename_exercise", "add_exercise"].includes(op.op) && r.exercise)
          after = after.map((v) => ({ ...v, exercise_id: r.exercise.id }));
        // data_confidence alone does not manufacture a semantic change.
        const compare = (v) =>
          JSON.stringify(v.map(({ data_confidence, ...rest }) => rest));
        if (compare(current) !== compare(after)) operations.push(op);
        current = after;
      }
      o.state = "resolved";
      if (
        e &&
        ops.some((op) => !["rename_exercise", "append_note"].includes(op.op)) &&
        operations.some((op) => op.target === target)
      )
        facts.warnings.push(
          `Revisa ANTES → DESPUÉS: ${e.reported_name.slice(0, 400)}`,
        );
    } catch {
      fail(
        o,
        "El cambio contradice las series actuales o faltan datos",
        "conflicting",
      );
    }
  }
  if (
    facts.unresolved_facts.length ||
    operations.length > 30 ||
    (operations.length && !matchesSchema(operations, OPERATIONS_SCHEMA))
  )
    return { facts, operations: [], status: "needs_clarification" };
  return {
    facts,
    operations,
    status: operations.length ? "preview_ready" : "already_materialized",
  };
}
