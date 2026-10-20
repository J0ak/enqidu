import React, { useEffect, useRef, useState } from "react";
import { requestEnqiduTool } from "../../services/enqiduToolsService.js";
import { supabase } from "@/integrations/supabase/client";
import {
  loadExerciseCatalog,
  withCatalogIdentity,
} from "../catalogResolver.js";
import {
  normalizationQueue,
  qualityLabels,
} from "../materialization/quality.js";
import { units, sides } from "./contract.js";
import "./SemanticCorrection.css";
const unitLabel = (u) =>
  ({
    kg_each: "kg por mancuerna",
    bodyweight: "Peso corporal",
    lb: "lb",
    kg: "kg",
  })[u] || u;
const sideLabel = (s) =>
  ({
    left: "Izquierda",
    right: "Derecha",
    bilateral: "Bilateral",
    alternating: "Alterno",
    each_side: "Por lado",
    na: "No aplica",
  })[s];
export function SemanticExercise({ exercise: e }) {
  if (!e) return <p>Ejercicio sin registrar</p>;
  return (
    <div className="semanticExercise">
      <strong>{e.canonical_name || e.reported_name}</strong>
      {e.canonical_name && e.canonical_name !== e.reported_name && (
        <small>Registrado como: {e.reported_name}</small>
      )}
      {e.execution_type === "skipped" ? (
        <p>Omitido · No realizado</p>
      ) : (
        <p>
          {[
            e.load_value != null
              ? `${e.load_value} ${unitLabel(e.load_unit) || ""}`
              : null,
            e.reps_per_set?.length
              ? `${e.reps_per_set.join(" / ")} reps`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Aún no hay métricas estructuradas."}
        </p>
      )}
      {e.sets_completed !== null && <p>{e.sets_completed} series</p>}
      {e.rounds_completed !== null && <p>{e.rounds_completed} rondas</p>}
      {e.side && <p>{sideLabel(e.side) || e.side}</p>}
      {e.tempo_or_pause && <p>{e.tempo_or_pause}</p>}
      {e.notes && <p>{e.notes}</p>}
      {e.technical_note && <p>Técnica: {e.technical_note}</p>}
    </div>
  );
}
export default function SemanticCorrection({
  sessionId = null,
  text = null,
  onApplied,
  initialReceipt = null,
}) {
  const [opened, setOpened] = useState(Boolean(text));
  const [status, setStatus] = useState(initialReceipt ? "applied" : "idle");
  const [message, setMessage] = useState("");
  const [interpretation, setInterpretation] = useState(null);
  const [selection, setSelection] = useState({
    session_id: sessionId,
    exercise_target: null,
  });
  const [state, setState] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [preview, setPreview] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  const [editor, setEditor] = useState(!text);
  const [target, setTarget] = useState("");
  const [form, setForm] = useState({});
  const inFlight = useRef(false);
  const busy = ["parsing", "applying"].includes(status);
  const selected = state?.exercises.find((e) => e.id === target);
  const change = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function interpret(next = selection) {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus("parsing");
    setMessage("Interpretando el cambio…");
    try {
      const args = {
        text,
        ...Object.fromEntries(Object.entries(next).filter(([, v]) => v)),
      };
      const r = await requestEnqiduTool({
        tool: "interpret_training_correction_v1",
        arguments: args,
      });
      if (!r.ok) {
        setStatus("error");
        setMessage(r.error.safe_message);
        return;
      }
      setInterpretation(r.data);
      setStatus(r.data.status);
      setMessage(r.data.message);
      setPreview(r.data.preview);
      setReviewed(false);
      if (r.data.sessions.length === 1)
        setSelection((s) => ({ ...s, session_id: r.data.sessions[0].id }));
    } finally {
      inFlight.current = false;
    }
  }
  useEffect(() => {
    if (text && !initialReceipt) interpret();
  }, []);
  async function openEditor(id = selection.session_id) {
    if (!id || inFlight.current) return;
    inFlight.current = true;
    setStatus("parsing");
    setOpened(true);
    try {
      const r = await requestEnqiduTool({
        tool: "get_training_semantics_v1",
        arguments: { session_id: id },
      });
      if (!r.ok) {
        setStatus("error");
        setMessage(r.error.safe_message);
        return;
      }
      const rows = await loadExerciseCatalog(supabase);
      setCatalog(rows);
      setState({
        ...r.data,
        exercises: r.data.exercises.map(withCatalogIdentity(rows)),
      });
      setSelection((s) => ({ ...s, session_id: id }));
      setEditor(true);
      setPreview(null);
      setForm({});
      setTarget("");
      setStatus("idle");
      setMessage("Completa solo los datos que quieras cambiar.");
    } catch {
      setStatus("error");
      setMessage("No se han podido leer los datos. Vuelve a intentarlo.");
    } finally {
      inFlight.current = false;
    }
  }
  async function manualPreview(event) {
    event.preventDefault();
    if (inFlight.current) return;
    try {
      if (!target) throw Error("Elige un ejercicio o añade uno.");
      const id = target === "new" ? crypto.randomUUID() : target,
        operations = [];
      if (target === "new" || form.name?.trim())
        operations.push({
          op: target === "new" ? "add_exercise" : "rename_exercise",
          target: id,
          reported_name: form.name?.trim() || "",
        });
      const add = (op, values) =>
        operations.push({ op, target: id, ...values });
      if (form.reps?.trim()) {
        if (!/^\d+(?:\s*[,/]\s*\d+)*$/.test(form.reps.trim()))
          throw Error("Escribe las reps por serie: 10, 10, 9.");
        add("set_reps", {
          reps: form.reps.split(/[,/]/).map((v) => Number(v.trim())),
        });
      }
      const number = (v) => {
        if (!/^\d+(?:[.,]\d+)?$/.test(v))
          throw Error("Introduce un número explícito.");
        return Number(v.replace(",", "."));
      };
      if (form.sets !== undefined && form.sets !== "")
        add("set_sets", { value: number(form.sets) });
      if (form.load !== undefined && form.load !== "")
        add("set_load", { value: number(form.load), unit: form.unit || "kg" });
      if (form.rounds !== undefined && form.rounds !== "")
        add("set_rounds", { value: number(form.rounds) });
      if (form.side) add("set_side", { value: form.side });
      if (form.tempo) add("set_tempo", { value: form.tempo });
      if (form.notes) add("append_note", { value: form.notes });
      if (form.technical) add("set_technical_note", { value: form.technical });
      if (form.omitted) add("set_omitted", { value: form.omitted === "yes" });
      if (!operations.length) throw Error("Indica al menos un cambio.");
      inFlight.current = true;
      setStatus("parsing");
      const r = await requestEnqiduTool({
        tool: "preview_training_semantics_v1",
        arguments: { session_id: selection.session_id, operations },
      });
      if (!r.ok) throw Error(r.error.safe_message);
      setPreview(r.data);
      setReviewed(false);
      setStatus("preview_ready");
      setMessage("Revisa los datos antes de confirmar.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    } finally {
      inFlight.current = false;
    }
  }
  async function apply() {
    if (!preview || !reviewed || inFlight.current || status !== "preview_ready")
      return;
    inFlight.current = true;
    setStatus("applying");
    setMessage("Aplicando el cambio…");
    try {
      const {
        session_id,
        operations,
        channel,
        revision,
        fingerprint,
        expires_at,
      } = preview;
      const r = await requestEnqiduTool({
        tool: "apply_training_semantics_v1",
        arguments: {
          session_id,
          operations,
          channel,
          revision,
          fingerprint,
          expires_at,
          confirmation: true,
          ...(preview.materialization
            ? { materialization: preview.materialization }
            : {}),
        },
      });
      if (!r.ok) {
        setStatus(r.error.code === "preview_stale" ? "stale" : "error");
        setMessage(r.error.safe_message);
        return;
      }
      setStatus(r.data.persistence_verified ? "applied" : "readback_warning");
      setMessage(
        r.data.persistence_verified
          ? "Cambio confirmado en la misma actividad."
          : "Cambio confirmado. No se pudo verificar el estado actual; recarga la actividad.",
      );
      setPreview(null);
      setState(r.data.state || null);
      setEditor(false);
      try {
        await onApplied?.(r.data);
      } catch {
        setStatus("readback_warning");
        setMessage("Cambio confirmado. Recarga para actualizar las vistas.");
      }
    } finally {
      inFlight.current = false;
    }
  }
  if (!opened)
    return (
      <button className="semanticEntry" onClick={() => openEditor(sessionId)}>
        Completar datos
      </button>
    );
  if (initialReceipt)
    return (
      <section
        className="semanticCorrection"
        aria-label="Corrección de entrenamiento"
        data-state={
          initialReceipt.persistence_verified ? "applied" : "readback_warning"
        }
      >
        <p>
          {initialReceipt.persistence_verified
            ? "Cambio confirmado en esta actividad."
            : "Cambio confirmado. Recarga para verificar el estado actual de la actividad."}
        </p>
      </section>
    );
  return (
    <section
      className="semanticCorrection"
      aria-label="Corrección de entrenamiento"
      data-state={status}
    >
      <h3>
        {text
          ? "Corrección de entrenamiento"
          : "Completar / corregir entrenamiento"}
      </h3>
      <p role="status">{message}</p>
      {status === "applied" &&
        state?.exercises.map((e) => (
          <SemanticExercise key={e.id} exercise={e} />
        ))}
      {status === "needs_clarification" && interpretation && (
        <div className="semanticChoices">
          {interpretation.sessions.length > 1 &&
            interpretation.sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  const next = { session_id: s.id, exercise_target: null };
                  setSelection(next);
                  interpret(next);
                }}
              >
                {s.title} · {s.local_date}
              </button>
            ))}
          {interpretation.sessions.length === 1 &&
            interpretation.exercises.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  const next = {
                    session_id: interpretation.sessions[0].id,
                    exercise_target: e.id,
                  };
                  setSelection(next);
                  interpret(next);
                }}
              >
                {e.reported_name}
              </button>
            ))}
          {selection.session_id && (
            <button onClick={() => openEditor()}>Abrir editor</button>
          )}
        </div>
      )}
      {editor && state && !preview && (
        <form onSubmit={manualPreview}>
          <p>
            {state.title} · {state.local_date}
          </p>
          <label>
            Ejercicio
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setForm({});
              }}
            >
              <option value="">Elige ejercicio</option>
              {[
                ...normalizationQueue(state.exercises),
                ...state.exercises.filter(
                  (e) =>
                    !normalizationQueue(state.exercises).some(
                      (q) => q.id === e.id,
                    ),
                ),
              ].map((e) => (
                <option key={e.id} value={e.id}>
                  {e.canonical_name || e.reported_name}
                  {e.quality ? ` · ${qualityLabels[e.quality]}` : ""}
                </option>
              ))}
              <option value="new">Añadir ejercicio</option>
            </select>
          </label>
          {selected && <SemanticExercise exercise={selected} />}
          {target && (
            <>
              <label>
                {target === "new"
                  ? "Nombre del ejercicio"
                  : "Renombrar / catálogo"}
                <input
                  list="semantic-catalog"
                  maxLength={200}
                  value={form.name || ""}
                  placeholder={selected?.reported_name || "Nombre informado"}
                  onChange={(e) => change("name", e.target.value)}
                />
              </label>
              <datalist id="semantic-catalog">
                {catalog
                  .filter((e) => e.is_active)
                  .map((e) => (
                    <option key={e.id} value={e.name} />
                  ))}
              </datalist>
              <div className="semanticFields">
                <label>
                  Series
                  <input
                    inputMode="numeric"
                    value={form.sets || ""}
                    onChange={(e) => change("sets", e.target.value)}
                  />
                </label>
                <label>
                  Reps por serie
                  <input
                    placeholder="8, 8, 8"
                    inputMode="text"
                    value={form.reps || ""}
                    onChange={(e) => change("reps", e.target.value)}
                  />
                </label>
                <label>
                  Carga
                  <input
                    inputMode="decimal"
                    value={form.load || ""}
                    onChange={(e) => change("load", e.target.value)}
                  />
                </label>
                <label>
                  Unidad
                  <select
                    value={form.unit || "kg"}
                    onChange={(e) => change("unit", e.target.value)}
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {unitLabel(u)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Rondas
                  <input
                    inputMode="numeric"
                    value={form.rounds || ""}
                    onChange={(e) => change("rounds", e.target.value)}
                  />
                </label>
                <label>
                  Lado
                  <select
                    value={form.side || ""}
                    onChange={(e) => change("side", e.target.value)}
                  >
                    <option value="">Sin cambio</option>
                    {sides.map((s) => (
                      <option key={s} value={s}>
                        {sideLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Tempo / pausa
                <input
                  maxLength={100}
                  value={form.tempo || ""}
                  onChange={(e) => change("tempo", e.target.value)}
                />
              </label>
              <label>
                Notas / sensaciones
                <textarea
                  maxLength={500}
                  value={form.notes || ""}
                  onChange={(e) => change("notes", e.target.value)}
                />
              </label>
              <label>
                Nota técnica
                <input
                  maxLength={500}
                  value={form.technical || ""}
                  onChange={(e) => change("technical", e.target.value)}
                />
              </label>
              <label>
                Realización
                <select
                  value={form.omitted || ""}
                  onChange={(e) => change("omitted", e.target.value)}
                >
                  <option value="">Sin cambio</option>
                  <option value="yes">Omitido / no realizado</option>
                  <option value="no">Realizado</option>
                </select>
              </label>
              <button disabled={busy} type="submit">
                Preparar cambio
              </button>
            </>
          )}
        </form>
      )}
      {preview && (
        <div>
          <p>
            {preview.title} · {preview.local_date}
          </p>
          {!reviewed ? (
            <>
              <div>
                {preview.after
                  .filter((e) =>
                    preview.operations.some((o) => o.target === e.id),
                  )
                  .map((e) => (
                    <SemanticExercise key={e.id} exercise={e} />
                  ))}
              </div>
              <button onClick={() => setReviewed(true)}>Revisar cambio</button>
            </>
          ) : (
            <>
              {[...new Set(preview.operations.map((o) => o.target))].map(
                (id) => (
                  <div className="semanticDiff" key={id}>
                    <div>
                      <h4>ANTES</h4>
                      <SemanticExercise
                        exercise={preview.before.find((e) => e.id === id)}
                      />
                    </div>
                    <div>
                      <h4>DESPUÉS</h4>
                      <SemanticExercise
                        exercise={preview.after.find((e) => e.id === id)}
                      />
                    </div>
                  </div>
                ),
              )}
              <button
                disabled={busy || status !== "preview_ready"}
                onClick={apply}
              >
                Confirmar
              </button>
            </>
          )}
        </div>
      )}
      {["stale", "error"].includes(status) && (
        <button onClick={() => (text ? interpret() : openEditor())}>
          Revisar de nuevo
        </button>
      )}
      {!["applied", "readback_warning"].includes(status) && (
        <button
          disabled={busy}
          onClick={() => {
            setPreview(null);
            setEditor(false);
            setStatus("cancelled");
            setMessage("Cambio cancelado.");
            if (!text) setOpened(false);
          }}
        >
          Cancelar
        </button>
      )}
    </section>
  );
}
