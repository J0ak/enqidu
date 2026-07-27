from pathlib import Path

path = Path("src/main.jsx")
text = path.read_text(encoding="utf-8-sig")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 anchor, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    'import { applyQuickEditToTrainingSession, buildUniversalSessionView } from "@/training/metrics";\n',
    'import { applyQuickEditToTrainingSession, buildUniversalSessionView } from "@/training/metrics";\n'
    'import { dedupeGarminSeriesRows, extractRawGarminStrengthSets, pairGarminStrengthSets } from "@/training/garminStrengthSeries";\n',
    "import Garmin strength helpers",
)

replace_once(
'''      blocksResult,
      lapsResult,
      enrichmentResult,
''',
'''      blocksResult,
      lapsResult,
      garminSetsResult,
      enrichmentResult,
''',
    "loadActivityDetail result destructuring",
)

replace_once(
'''      supabase
        .from("session_laps")
        .select("id, lap_index, source, start_elapsed_seconds, end_elapsed_seconds, duration_seconds, active_seconds, rest_seconds, distance_meters, heart_rate_avg_bpm, heart_rate_max_bpm, raw_payload")
        .eq("session_id", latestSession.id)
        .order("lap_index", { ascending: true }),
      supabase
        .from("enkidu_conversation_enrichments")
''',
'''      supabase
        .from("session_laps")
        .select("id, lap_index, source, start_elapsed_seconds, end_elapsed_seconds, duration_seconds, active_seconds, rest_seconds, distance_meters, heart_rate_avg_bpm, heart_rate_max_bpm, raw_payload")
        .eq("session_id", latestSession.id)
        .order("lap_index", { ascending: true }),
      supabase
        .from("session_garmin_sets")
        .select("id, source, series_order, garmin_exercise_name, start_elapsed_seconds, end_elapsed_seconds, duration_seconds, active_seconds, rest_seconds, repetitions, load_value, load_unit, heart_rate_avg_bpm, heart_rate_max_bpm, raw_payload, confidence")
        .eq("session_id", latestSession.id)
        .order("series_order", { ascending: true }),
      supabase
        .from("enkidu_conversation_enrichments")
''',
    "session_garmin_sets fetch",
)

replace_once(
'''    const strengthTracking = summary.strength_tracking || {};
    const garminSeries = mapGarminSeries(summary.garmin_series || summary.sets || []);
    const blocks = mapExerciseBlocks(blocksResult.data || [], exercisesResult.data || []);
''',
'''    const strengthTracking = summary.strength_tracking || {};
    const relationalGarminSeries = garminSetsResult.error ? [] : garminSetsResult.data || [];
    const garminSeriesSource = relationalGarminSeries.length ? relationalGarminSeries : summary.garmin_series || summary.sets || [];
    const garminSeries = mapGarminSeries(dedupeGarminSeriesRows(garminSeriesSource));
    const blocks = mapExerciseBlocks(blocksResult.data || [], exercisesResult.data || []);
''',
    "prefer relational Garmin series",
)

replace_once(
'''    const activityTime = getActivityTimeMetrics(latestSession, metrics, blocksResult.data || [], summary, duration, fitSessionPayload, objectiveRows);
''',
'''    const activityTime = getActivityTimeMetrics(latestSession, metrics, blocksResult.data || [], summary, duration, fitSessionPayload, objectiveRows, garminSeries);
''',
    "Garmin series activity timing",
)

replace_once(
'''      {!isLinkedPlanned && hasConversationView && <ConversationActivityCard view={conversationView} />}
      <PhysiologyCard detail={activityDetail} />
''',
'''      {!isLinkedPlanned && hasConversationView && <ConversationActivityCard view={conversationView} />}
      <GarminSeriesCard series={activityDetail.garminSeries} />
      <PhysiologyCard detail={activityDetail} />
''',
    "render Garmin series card",
)

replace_once(
'''function ConversationExerciseList({ exercises = [], fallback }) {
''',
'''function GarminSeriesCard({ series = [] }) {
  if (!series.length) return null;
  const totalReps = sumNumeric(series.map((item) => item.repetitions));
  return (
    <article className="activityMainCard conversationActivityCard" aria-label="Series Garmin">
      <section className="conversationSummary">
        <span>Garmin/FIT</span>
        <p>Series Garmin</p>
        <small>{series.length} {series.length === 1 ? "serie" : "series"}{totalReps ? ` · ${formatNumberValue(totalReps)} repeticiones` : ""}</small>
      </section>
      <section className="conversationBlocks">
        <h2>Series Garmin</h2>
        <div>
          {series.map((item, index) => {
            const order = item.order ?? index + 1;
            const title = item.name && item.name !== "N/D" ? item.name : `Serie Garmin ${order}`;
            const summary = formatGarminSeriesSummary(item);
            return (
              <details className="conversationBlockCard" key={item.id || `garmin-series-${order}`}>
                <summary>
                  <span>{order}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{summary}</p>
                    <small>Registro Garmin independiente de los bloques Coach</small>
                  </div>
                  <ChevronRight size={18} />
                </summary>
                <div className="conversationBlockDetail">
                  <ConversationDetailLine label="Tiempo de trabajo" value={item.active_seconds != null ? formatDurationClock(item.active_seconds) : null} />
                  <ConversationDetailLine label="Descanso" value={item.rest_seconds != null ? formatDurationClock(item.rest_seconds) : null} />
                  <ConversationDetailLine label="Repeticiones" value={item.repetitions != null ? formatNumberValue(item.repetitions) : null} />
                  <ConversationDetailLine label="Peso" value={item.load_label} />
                  <ConversationDetailLine label="Frecuencia cardíaca" value={formatGarminSeriesHeartRate(item)} />
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </article>
  );
}

function formatGarminSeriesSummary(item = {}) {
  return [
    item.active_seconds != null ? `Trabajo ${formatDurationClock(item.active_seconds)}` : null,
    item.rest_seconds != null ? `Descanso ${formatDurationClock(item.rest_seconds)}` : null,
    item.repetitions != null ? `${formatNumberValue(item.repetitions)} reps` : null,
    item.load_label,
  ].filter(Boolean).join(" · ") || "Serie registrada por Garmin";
}

function formatGarminSeriesHeartRate(item = {}) {
  const avg = item.heart_rate_avg_bpm;
  const max = item.heart_rate_max_bpm;
  if (avg == null && max == null) return null;
  return [avg != null ? `${formatNumberValue(avg)} ppm media` : null, max != null ? `${formatNumberValue(max)} ppm máxima` : null].filter(Boolean).join(" · ");
}

function ConversationExerciseList({ exercises = [], fallback }) {
''',
    "GarminSeriesCard component",
)

replace_once(
'''    return augmentRecordMessagesWithRespiration(groups, buffer);
  } catch (error) {
''',
'''    const parsedSets = groups.set || groups.sets || [];
    if (!parsedSets.length) {
      const rawStrengthSets = extractRawGarminStrengthSets(buffer);
      if (rawStrengthSets.length) groups.set = rawStrengthSets;
    }
    return augmentRecordMessagesWithRespiration(groups, buffer);
  } catch (error) {
''',
    "raw Set message fallback",
)

replace_once(
'''function normalizeGarminSeriesFromFit({ sets = [], workoutSteps = [], startedAt }) {
  const setSeries = seriesFromRows(sets, "garmin_fit_set", startedAt);
  if (setSeries.length) return setSeries;
  return seriesFromRows(workoutSteps, "garmin_fit_workout_step", startedAt);
}
''',
'''function normalizeGarminSeriesFromFit({ sets = [], workoutSteps = [], startedAt }) {
  const setSeries = pairGarminStrengthSets(sets, startedAt);
  if (setSeries.length) return setSeries;
  return seriesFromRows(workoutSteps, "garmin_fit_workout_step", startedAt);
}
''',
    "pair active/rest strength sets",
)

replace_once(
'''  const exercises = normalizeFitSets(sets);
''',
'''  const exercises = normalizeFitSets(sets, startedAt);
''',
    "normalize active strength sets call",
)

replace_once(
'''function normalizeFitSets(sets = []) {
  return sets
    .map((set, index) => {
      const duration = nullableNumber(set.duration || set.total_timer_time || set.elapsed_time);
      const reps = nullableNumber(set.repetitions || set.reps);
      const type = `${set.category || set.type || ""}`.toLowerCase();
      return {
        reported_name: set.exercise_name || set.name || set.category || "Unknown",
        exercise_order: index + 1,
        sets_completed: 1,
        reps_per_set: {
          total: reps || 0,
          rest_seconds: type.includes("rest") ? duration || 0 : 0,
        },
        duration_seconds: type.includes("rest") ? 0 : Math.round(duration || 0),
        load_value: nullableNumber(set.weight),
        load_unit: set.weight ? "kg" : null,
        data_confidence: "reported",
      };
    })
    .filter((set) => set.duration_seconds || set.reps_per_set.total || set.reps_per_set.rest_seconds);
}
''',
'''function normalizeFitSets(sets = [], startedAt = null) {
  return pairGarminStrengthSets(sets, startedAt)
    .map((series, index) => ({
      reported_name: series.garmin_exercise_name || "Unknown",
      exercise_order: index + 1,
      sets_completed: 1,
      reps_per_set: {
        total: nullableNumber(series.repetitions) || 0,
        rest_seconds: nullableNumber(series.rest_seconds) || 0,
      },
      duration_seconds: Math.round(nullableNumber(series.active_seconds) || 0),
      load_value: nullableNumber(series.load_value),
      load_unit: series.load_value != null ? series.load_unit || "kg" : null,
      data_confidence: series.confidence || "reported",
    }))
    .filter((set) => set.duration_seconds || set.reps_per_set.total || set.reps_per_set.rest_seconds);
}
''',
    "normalizeFitSets active/rest aware",
)

replace_once(
'''function getActivityTimeMetrics(session, metrics, blocks = [], summary = {}, fallbackDuration = 0, fitSessionPayload = {}, objectiveRows = []) {
  const objectiveTime = timeMetricsFromObjectiveRows(objectiveRows.length ? objectiveRows : objectiveRowsFromSummary(summary), fallbackDuration);
''',
'''function getActivityTimeMetrics(session, metrics, blocks = [], summary = {}, fallbackDuration = 0, fitSessionPayload = {}, objectiveRows = [], garminSeries = []) {
  const seriesTime = timeMetricsFromGarminSeries(garminSeries, fallbackDuration);
  if (seriesTime.activeSeconds != null && seriesTime.restSeconds != null) {
    return {
      ...seriesTime,
      source: "garmin_strength_series",
      confidence: "reported",
    };
  }

  const objectiveTime = timeMetricsFromObjectiveRows(objectiveRows.length ? objectiveRows : objectiveRowsFromSummary(summary), fallbackDuration);
''',
    "strength series time priority",
)

replace_once(
'''function objectiveRowsFromSummary(summary = {}) {
''',
'''function timeMetricsFromGarminSeries(series = [], fallbackTotal = null) {
  const rows = (Array.isArray(series) ? series : []).filter((row) => row && (row.active_seconds != null || row.rest_seconds != null));
  if (!rows.length) return { totalSeconds: null, activeSeconds: null, restSeconds: null };
  const activeSeconds = sumNumeric(rows.map((row) => row.active_seconds));
  const restSeconds = sumNumeric(rows.map((row) => row.rest_seconds));
  const combined = activeSeconds + restSeconds;
  const totalSeconds = combined > 0 ? combined : optionalNumber(fallbackTotal);
  return {
    totalSeconds: totalSeconds == null ? null : Math.round(totalSeconds),
    activeSeconds: activeSeconds > 0 ? Math.round(activeSeconds) : null,
    restSeconds: restSeconds >= 0 ? Math.round(restSeconds) : null,
  };
}

function objectiveRowsFromSummary(summary = {}) {
''',
    "timeMetricsFromGarminSeries helper",
)

path.write_text(text, encoding="utf-8")
print("Patched src/main.jsx with Garmin strength series fixes")
