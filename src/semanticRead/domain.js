import { loadProgressDomain } from "../progress/loadProgress.js";
import {
  exerciseIdentity,
  bestCompatibleObservation,
  isSkillExercise,
  observedReps,
  numeric,
  modality,
} from "../progress/domain.js";
import {
  createCatalogResolver,
  loadExerciseCatalog,
  withCatalogIdentity,
  normalizeExactName,
  isUnknownName,
} from "../training/catalogResolver.js";
import { exerciseDataQuality } from "../training/materialization/quality.js";
import { toolError } from "../enqiduTools/errors.js";
import { isValidCalendarDate } from "../time/userCalendar.js";

const text = (v, max = 1000) => {
  if (typeof v !== "string") return null;
  if (v.length > max) throw toolError("output_limit_exceeded");
  return v;
};
const number = (v) => (numeric(v) ? v : null);
const requirements = (v) =>
  Array.isArray(v)
    ? [...new Set(v.filter((m) => ["reps", "load"].includes(m)))]
    : [];
export function exercisePresentation(row) {
  return {
    canonical_code: row.code,
    display_name: row.name,
    classification: isSkillExercise({ canonical_exercise_code: row.code })
      ? "skill"
      : "exercise",
    metric_requirements: requirements(row.metadata?.metric_requirements),
  };
}
function observation(row, session, identify) {
  const e = identify(row);
  const reps = observedReps(e.reps_per_set);
  if (reps?.length > 100) throw toolError("output_limit_exceeded");
  const required = requirements(e.metric_requirements);
  const available = [
    reps !== null ? "reps" : null,
    numeric(e.load_value) && e.load_unit ? "load" : null,
  ].filter(Boolean);
  return {
    id: e.id,
    session_id: session.id,
    date: session.local_date,
    block_id: e.block_id ?? null,
    identity_status: e.canonical_exercise_code ? "resolved" : "unresolved",
    canonical_code: e.canonical_exercise_code,
    display_name: e.canonical_name,
    reported_name:
      e.reported_name !== e.canonical_name ? text(e.reported_name) : null,
    execution_type: text(e.execution_type, 80),
    sets: number(e.sets_completed),
    reps,
    load: number(e.load_value),
    unit: text(e.load_unit, 80),
    rounds: number(e.rounds_completed),
    side: text(e.side, 80),
    tempo: text(e.tempo_or_pause, 200),
    notes: typeof e.notes === "string" ? e.notes.slice(0, 1000) : null,
    notes_truncated: typeof e.notes === "string" && e.notes.length > 1000,
    quality: exerciseDataQuality(e),
    source: text(e.data_confidence, 80),
    applicable_metrics: required,
    available_metrics: available,
    missing_metrics: required.filter((m) => !available.includes(m)),
  };
}
const EXERCISES =
  "id,session_id,block_id,exercise_id,exercise_order,reported_name,execution_type,sets_completed,reps_per_set,load_value,load_unit,rounds_completed,side,tempo_or_pause,notes,data_confidence";

/** Presentation projections over canonical Progress/catalog/materialization. Shared by every channel. */
export function createSemanticReadHandlers({ db, userId, calendar }) {
  const scope = { calendar_date: calendar.date, timezone: calendar.timezone };
  const bounded = async (query, limit) => {
    const { data, error } = await query.limit(limit + 1);
    if (error) throw toolError("canonical_read_unavailable");
    if (data.length > limit) throw toolError("output_limit_exceeded");
    return data;
  };
  const canonical = async (code) => {
    const catalog = await loadExerciseCatalog(db);
    const row = catalog.find((e) => e.code === code);
    if (!row || isUnknownName(row.name)) throw toolError("invalid_arguments");
    return { catalog, row };
  };
  const progress = async (period, from, to) => {
    try {
      return await loadProgressDomain(db, { userId, calendar, period, from, to });
    } catch (e) {
      throw toolError(
        e.message === "invalid_date" ? "invalid_date" : e.message === "progress_scope_too_large"
          ? "output_limit_exceeded"
          : "canonical_read_unavailable",
      );
    }
  };
  const handlers = {
    async resolve_exercise_reference_v1({ query }) {
      const catalog = await loadExerciseCatalog(db);
      const result = createCatalogResolver(catalog)({ reported_name: query });
      const normalized = normalizeExactName(query);
      const candidates = result.candidates.length
        ? result.candidates
        : isUnknownName(query)
          ? []
          : catalog.filter((e) =>
              [
                e.code,
                e.name,
                ...(Array.isArray(e.metadata?.aliases)
                  ? e.metadata.aliases
                  : []),
              ].some(
                (v) =>
                  typeof v === "string" &&
                  normalized &&
                  (normalizeExactName(v).includes(normalized) ||
                    normalized
                      .split(" ")
                      .some(
                        (word) =>
                          word.length >= 3 && normalizeExactName(v) === word,
                      )),
              ),
            );
      return {
        schema_version: "resolve_exercise_reference_v1",
        ...scope,
        status: result.state === "missing" ? "unresolved" : result.state,
        exercise: result.exercise
          ? exercisePresentation(result.exercise)
          : null,
        candidates: candidates.slice(0, 8).map(exercisePresentation),
        has_more_candidates: candidates.length > 8,
        explanation:
          "Only exact code, name or explicit alias resolves identity. Search candidates are not resolved identity.",
      };
    },
    async get_exercise_progress_v1({ canonical_code, period = "4", from, to }) {
      const { row } = await canonical(canonical_code);
      const { result, exercises } = await progress(period, from, to);
      const selected = exercises.filter(
        (e) =>
          e.canonical_exercise_code === canonical_code && exerciseIdentity(e),
      );
      const keys = new Set(selected.map(exerciseIdentity));
      const variants = result.strength.filter((e) => keys.has(e.key));
      if (variants.length > 20) throw toolError("output_limit_exceeded");
      const single = variants.length === 1 ? variants[0] : null;
      const required = requirements(row.metadata?.metric_requirements);
      const available = ["reps", "load"].filter((m) =>
        variants.some(
          (v) => v[m === "reps" ? "best_reps" : "best_load"] !== null,
        ),
      );
      const missing = required.filter((m) => !available.includes(m));
      const partial = required.some((m) =>
        selected.some((e) =>
          m === "reps"
            ? observedReps(e.reps_per_set) === null
            : !numeric(e.load_value) || !e.load_unit,
        ),
      );
      const evidence = variants.flatMap((v) => v.points);
      const records = variants.flatMap((v) => v.records);
      if (evidence.length > 200 || records.length > 200)
        throw toolError("output_limit_exceeded");
      return {
        schema_version: "get_exercise_progress_v1",
        ...scope,
        exercise: exercisePresentation(row),
        period: result.period,
        from: result.from,
        to: result.to,
        observations: selected.length,
        sessions: new Set(selected.map((e) => e.session_id)).size,
        metric_coverage: {
          reps_known: evidence.filter((e) => e.max_reps !== null).length,
          load_known: evidence.filter((e) => e.load !== null).length,
          comparable: evidence.filter((e) => e.max_reps !== null && (e.load !== null || selected.find((r) => r.id === e.exercise_id)?.load_unit === "bodyweight")).length,
        },
        best_observations: variants.flatMap(v => {
          const best = bestCompatibleObservation(v.points, v.unit);
          return best ? [{ session_id: best.session_id, date: best.date, load: best.load, reps: best.max_reps, unit: v.unit }] : [];
        }),
        best_load: single?.best_load ?? null,
        best_reps: single?.best_reps ?? null,
        best_reps_at_load: single?.best_reps_at_load ?? null,
        known_volume: single?.known_volume ?? null,
        records,
        trend: single?.trend ?? "insufficient_data",
        last_practice:
          variants
            .map((v) => v.last_practice)
            .sort()
            .at(-1) ?? null,
        data_quality: !selected.length
          ? "missing"
          : missing.length || partial || !required.length
            ? "partial"
            : "complete",
        applicable_metrics: required,
        available_metrics: available,
        missing_metrics: missing,
        missing_data: [
          ...missing,
          ...(!selected.length ? ["observations"] : []),
          ...(partial ? ["some_observation_metrics"] : []),
        ],
        explanation:
          variants.length > 1
            ? "Incompatible variants remain separate; top-level best metrics and trend are unavailable. Consult variants."
            : "Metrics and comparisons use the canonical Progress domain; volume and frequency do not establish improvement.",
        variants: variants.map(({ notes, ...v }) => v),
        evidence,
      };
    },
    async get_exercise_history_v1({ canonical_code, from, to, limit = 20, order }) {
      if (
        !isValidCalendarDate(from) ||
        !isValidCalendarDate(to) ||
        from > to ||
        to > calendar.date ||
        (Date.parse(to) - Date.parse(from)) / 86400000 > 366
      )
        throw toolError("invalid_date");
      const { catalog, row } = await canonical(canonical_code);
      const sessions = (
        await bounded(
          db
            .from("training_sessions")
            .select("id,user_id,local_date")
            .eq("user_id", userId)
            .in("session_status", ["completed", "recorded"])
            .gte("local_date", from)
            .lte("local_date", to)
            .order("local_date", { ascending: order !== "desc" }).order("id"),
          1000,
        )
      ).filter((s) => s.user_id === userId);
      const identify = withCatalogIdentity(catalog);
      const observations = [];
      let readCount = 0;
      for (let i = 0; i < sessions.length; i += 100) {
        const subset = sessions.slice(i, i + 100);
        const rows = await bounded(
          db
            .from("session_exercises")
            .select(EXERCISES)
            .in(
              "session_id",
              subset.map((s) => s.id),
            )
            .order("id"),
          5000,
        );
        readCount += rows.length;
        if (readCount > 5000) throw toolError("output_limit_exceeded");
        for (const e of rows) {
          const session = subset.find((s) => s.id === e.session_id),
            identified = identify(e);
          if (
            session &&
            identified.canonical_exercise_code === canonical_code &&
            exerciseIdentity(identified)
          )
            observations.push(observation(e, session, identify));
          if (!order && observations.length > limit)
            throw toolError("output_limit_exceeded");
        }
        if (order && observations.length > limit) break;
      }
      observations.sort((a, b) => (order === "desc" ? -1 : 1) * a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      return {
        schema_version: "get_exercise_history_v1",
        ...scope,
        exercise: exercisePresentation(row),
        from,
        to,
        observations: observations.slice(0, limit),
        has_more: observations.length > limit,
      };
    },
    async get_training_session_detail_v2({ session_id }) {
      const owned = (
        await bounded(
          db
            .from("training_sessions")
            .select(
              "id,user_id,title,local_date,session_status,duration_seconds,distance_meters,elevation_gain_meters,modality_id,source_id,data_quality_status,fit_sport:session_structure->garmin_fit_summary->>sport,fit_sub_sport:session_structure->garmin_fit_summary->>sub_sport",
            )
            .eq("user_id", userId)
            .eq("id", session_id)
            .in("session_status", ["completed", "recorded"])
            .lte("local_date", calendar.date),
          1,
        )
      ).find((s) => s.user_id === userId);
      if (!owned) throw toolError("session_not_found");
      const [catalog, rows, blocks, metrics, modalities, sources] =
        await Promise.all([
          loadExerciseCatalog(db),
          bounded(
            db
              .from("session_exercises")
              .select(EXERCISES)
              .eq("session_id", session_id)
              .order("exercise_order")
              .order("id"),
            200,
          ),
          bounded(
            db
              .from("session_blocks")
              .select(
                "id,session_id,block_order,name,block_type,duration_seconds,rounds_completed",
              )
              .eq("session_id", session_id)
              .order("block_order")
              .order("id"),
            100,
          ),
          bounded(
            db
              .from("session_metrics")
              .select("session_id,metric_code,value_numeric,unit,confidence")
              .eq("session_id", session_id)
              .eq("metric_scope", "session")
              .in("metric_code", [
                "rpe_global",
                "rpe",
                "duration_seconds",
                "distance_meters",
                "average_heart_rate",
                "max_heart_rate",
                "training_load",
              ])
              .order("id"),
            100,
          ),
          bounded(
            db.from("sport_modalities").select("id,code").order("id"),
            250,
          ),
          owned.source_id
            ? bounded(
                db
                  .from("training_sources")
                  .select("id,user_id,source_type")
                  .eq("user_id", userId)
                  .eq("id", owned.source_id),
                1,
              )
            : [],
        ]);
      const identify = withCatalogIdentity(catalog);
      const exercises = rows
        .filter((e) => e.session_id === session_id)
        .map((e) => observation(e, owned, identify));
      return {
        schema_version: "get_training_session_detail_v2",
        ...scope,
        session: {
          id: owned.id,
          title: text(owned.title),
          date: owned.local_date,
          status: owned.session_status,
        },
        canonical_modality: modality({
          ...owned,
          modality_code: modalities.find((m) => m.id === owned.modality_id)
            ?.code,
        }),
        duration: number(owned.duration_seconds),
        distance: number(owned.distance_meters),
        elevation: number(owned.elevation_gain_meters),
        blocks: blocks
          .filter((b) => b.session_id === session_id)
          .map((b) => ({
            id: b.id,
            order: b.block_order,
            name: text(b.name),
            type: text(b.block_type),
            duration: number(b.duration_seconds),
            rounds: number(b.rounds_completed),
          })),
        exercises,
        metrics: metrics
          .filter((m) => m.session_id === session_id)
          .map((m) => ({
            code: m.metric_code,
            value: number(m.value_numeric),
            unit: text(m.unit, 80),
            confidence: text(m.confidence, 80),
          })),
        data_quality:
          exercises.length &&
          exercises.every((e) => e.quality === "complete") &&
          numeric(owned.duration_seconds)
            ? "complete"
            : "partial",
        source_summary: sources
          .filter((s) => s.user_id === userId)
          .map((s) => ({ type: text(s.source_type, 80) })),
      };
    },
    async get_training_overview_v1({ period = "4", from, to }) {
      const { result } = await progress(period, from, to);
      const compact = (v) => ({ ...v, session_ids: v.session_ids.slice(-12) });
      const highlight = (e) => ({
        display_name: e.name,
        classification: e.skill ? "skill" : "exercise",
        observations: e.observations,
        sessions: e.exposures,
        trend: e.trend,
        records: e.record_count,
        last_practice: e.last_practice,
      });
      return {
        schema_version: "get_training_overview_v1",
        ...scope,
        period: result.period,
        from: result.from,
        to: result.to,
        status: result.status,
        activity: compact(result.summary),
        modalities: result.summary.modalities,
        skills: result.strength
          .filter((e) => e.skill)
          .slice(0, 5)
          .map(highlight),
        strength_highlights: result.strength
          .filter((e) => !e.skill)
          .slice(0, 5)
          .map(highlight),
        endurance: result.cardio.map(compact),
        observed_records: result.strength.reduce(
          (n, e) => n + e.record_count,
          0,
        ),
        data_quality: result.data_quality,
        plan_execution: {
          ...result.planning,
          evidence: result.planning.evidence.slice(-12),
        },
        evidence_scope: "summary_all_rows_details_bounded_sample",
        exercise_groups: result.strength.length,
        has_more_exercises:
          result.strength.filter((e) => e.skill).length > 5 ||
          result.strength.filter((e) => !e.skill).length > 5,
        explanation:
          "Overview uses canonical Progress periods (4/12 completed weeks; week is current week). Counts and minutes describe activity, not improvement. Details and session evidence are explicitly sampled.",
      };
    },
  };
  return handlers;
}
