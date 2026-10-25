import {
  objectSchema as o,
  listSchema as l,
  textSchema as t,
  nullable as n,
  DATE_SCHEMA as date,
  ID_SCHEMA as id,
} from "../enqiduTools/schema.js";
import { progressDomainSchema as p } from "../progress/schema.js";
const str = t(1000),
  text = n(str),
  num = { type: "number" },
  nullableNum = n(num),
  bool = { type: "boolean" };
const period = { enum: ["week", "4", "12", "all"] };
const code = {
  type: "string",
  minLength: 1,
  maxLength: 120,
  pattern: "^[a-z0-9_]+$",
};
const scope = { calendar_date: date, timezone: t(100) };
const presentation = o({
  canonical_code: code,
  display_name: str,
  classification: { enum: ["skill", "exercise"] },
  metric_requirements: l({ enum: ["reps", "load"] }, 2),
});
const metricLists = {
  applicable_metrics: l(str, 2),
  available_metrics: l(str, 2),
  missing_metrics: l(str, 2),
};
const observation = o({
  id,
  session_id: id,
  date,
  block_id: n(id),
  identity_status: { enum: ["resolved", "unresolved"] },
  canonical_code: n(code),
  display_name: text,
  reported_name: text,
  execution_type: n(t(80)),
  sets: nullableNum,
  reps: n(l(num, 100)),
  load: nullableNum,
  unit: n(t(80)),
  rounds: nullableNum,
  side: n(t(80)),
  tempo: n(t(200)),
  notes: text,
  notes_truncated: bool,
  quality: {
    enum: [
      "needs_identity",
      "unresolved",
      "needs_metrics",
      "partial",
      "complete",
    ],
  },
  source: n(t(80)),
  ...metricLists,
});
const card = p.properties.strength.items;
const { notes, ...variant } = card.properties;
const quality = { enum: ["missing", "partial", "complete"] };
const base = (name, properties) =>
  o({ schema_version: { const: name }, ...scope, ...properties });
const summary = o({
  ...p.properties.summary.properties,
  session_ids: l(str, 12),
});
const highlight = o({
  display_name: str,
  classification: { enum: ["skill", "exercise"] },
  observations: num,
  sessions: num,
  trend: card.properties.trend,
  records: num,
  last_practice: date,
});
export const SEMANTIC_READ_SCHEMAS = {
  resolve_exercise_reference_v1: base("resolve_exercise_reference_v1", {
    status: { enum: ["resolved", "ambiguous", "unresolved"] },
    exercise: n(presentation),
    candidates: l(presentation, 8),
    has_more_candidates: bool,
    explanation: str,
  }),
  get_exercise_progress_v1: base("get_exercise_progress_v1", {
    exercise: presentation,
    period: { enum: ["week", "4", "12", "all", "range"] },
    from: n(date),
    to: date,
    observations: num,
    sessions: num,
    metric_coverage: o({ reps_known: num, load_known: num, comparable: num }),
    best_observations: l(o({ session_id: id, date, load: nullableNum, reps: num, unit: text }), 20),
    best_load: nullableNum,
    best_reps: nullableNum,
    best_reps_at_load: nullableNum,
    known_volume: nullableNum,
    records: l(card.properties.records.items, 200),
    trend: card.properties.trend,
    last_practice: n(date),
    data_quality: quality,
    ...metricLists,
    missing_data: l(str, 8),
    explanation: str,
    variants: l(
      o({
        ...variant,
        points: l(card.properties.points.items, 200),
        records: l(card.properties.records.items, 200),
      }),
      20,
    ),
    evidence: l(card.properties.points.items, 200),
  }),
  get_exercise_history_v1: base("get_exercise_history_v1", {
    exercise: presentation,
    from: date,
    to: date,
    observations: l(observation, 50),
    has_more: bool,
  }),
  get_training_session_detail_v2: base("get_training_session_detail_v2", {
    session: o({ id, title: text, date, status: str }),
    canonical_modality: str,
    duration: nullableNum,
    distance: nullableNum,
    elevation: nullableNum,
    blocks: l(
      o({
        id,
        order: num,
        name: text,
        type: text,
        duration: nullableNum,
        rounds: nullableNum,
      }),
      100,
    ),
    exercises: l(observation, 200),
    metrics: l(
      o({
        code: str,
        value: nullableNum,
        unit: n(t(80)),
        confidence: n(t(80)),
      }),
      100,
    ),
    data_quality: quality,
    source_summary: l(o({ type: n(t(80)) }), 1),
  }),
  get_training_overview_v1: base("get_training_overview_v1", {
    period: { enum: ["week", "4", "12", "range"] },
    from: n(date),
    to: date,
    status: p.properties.status,
    activity: summary,
    modalities: p.properties.summary.properties.modalities,
    skills: l(highlight, 5),
    strength_highlights: l(highlight, 5),
    endurance: l(
      o({ ...p.properties.cardio.items.properties, session_ids: l(str, 12) }),
      4,
    ),
    observed_records: num,
    data_quality: p.properties.data_quality,
    plan_execution: o({
      ...p.properties.planning.properties,
      evidence: l(p.properties.planning.properties.evidence.items, 12),
    }),
    evidence_scope: { const: "summary_all_rows_details_bounded_sample" },
    exercise_groups: num,
    has_more_exercises: bool,
    explanation: str,
  }),
};
export const SEMANTIC_READ_DEFINITIONS = [
  [
    "resolve_exercise_reference_v1",
    "Resolve an exact catalog name/code/alias or return bounded candidates. Candidates are not resolved identities.",
    o({ query: { type: "string", minLength: 1, maxLength: 200 } }),
  ],
  [
    "get_exercise_progress_v1",
    "Use when asking how a specific canonical exercise or skill is progressing. Compares only compatible metrics.",
    o({ canonical_code: code, period, from: date, to: date }, ["canonical_code"]),
  ],
  [
    "get_exercise_history_v1",
    "Use for individual executed observations of a canonical exercise over a bounded date range (up to 366 days). Narrow dates if the limit is exceeded.",
    o(
      {
        canonical_code: code,
        from: date,
        to: date,
        limit: { type: "integer", minimum: 1, maximum: 50 },
        order: { enum: ["asc", "desc"] },
      },
      ["canonical_code", "from", "to"],
    ),
  ],
  [
    "get_training_session_detail_v2",
    "Use when asking what happened in one specific recorded activity. Includes normalized exercises, blocks and permitted metrics.",
    o({ session_id: id }),
  ],
  [
    "get_training_overview_v1",
    "Use for broad questions about recent training or overall progress. Returns a compact overview to choose the next specific tool.",
    o({ period: { enum: ["week", "4", "12"] }, from: date, to: date }, []),
  ],
];
