import { supabase } from "@/integrations/supabase/client";

type AnyRow = Record<string, any>;

type TemporalSegment = {
  start: number | null;
  end: number | null;
  active: number | null;
  rest: number | null;
  total: number | null;
  avgHr: number | null;
  maxHr: number | null;
  source: string;
  confidence: string;
};

export async function reconcileSessionTemporalBlocks(sessionId: string) {
  if (!supabase) {
    return { status: "insufficient_data", reason: "supabase_not_configured" };
  }

  const [sessionResult, blocksResult, samplesResult, lapsResult] = await Promise.all([
    supabase.from("training_sessions").select("id,duration_seconds,session_structure").eq("id", sessionId).maybeSingle(),
    supabase
      .from("session_blocks")
      .select("id,block_order,duration_seconds,active_seconds,rest_seconds,start_elapsed_seconds,end_elapsed_seconds,prescription")
      .eq("session_id", sessionId),
    supabase
      .from("session_samples")
      .select("elapsed_seconds,heart_rate_bpm,sample_order")
      .eq("session_id", sessionId),
    supabase.from("session_laps").select("*").eq("session_id", sessionId),
  ]);

  if (sessionResult.error) throw sessionResult.error;
  if (blocksResult.error) throw blocksResult.error;
  if (samplesResult.error) throw samplesResult.error;

  if (!sessionResult.data) return { status: "insufficient_data", reason: "session_not_found" };

  const blocks = sortByOrder(blocksResult.data || []);
  if (!blocks.length) return { status: "no_blocks", reason: "no_conversation_blocks" };

  const samples = sortSamples(samplesResult.data || []);
  if (!samples.length) return { status: "no_samples", reason: "no_session_samples" };

  const lapRows = lapsResult.error ? [] : lapsResult.data || [];
  const lapSegments = rowsToSegments(lapRows, "garmin_lap_direct");
  const summarySegments = summaryToSegments(sessionResult.data?.session_structure);
  const segments = lapSegments.length ? lapSegments : summarySegments;

  if (!segments.length) {
    return {
      status: "needs_user_confirmation",
      reason: "no_garmin_segments",
      blockCount: blocks.length,
      totalSeconds: firstNumber(sessionResult.data.session_structure?.garmin_fit_summary?.duration_total_seconds, sessionResult.data.duration_seconds),
    };
  }

  const assignments = assignSegmentsToBlocks(segments, blocks);
  if (!assignments.length) {
    return {
      status: "needs_user_confirmation",
      reason: "segments_do_not_match_blocks",
      segmentCount: segments.length,
      blockCount: blocks.length,
    };
  }

  let updated = 0;
  for (const assignment of assignments) {
    const hr = heartRateForWindow(samples, assignment.start, assignment.end);
    const patch = compactPatch({
      duration_seconds: secondsOrNull(assignment.total),
      active_seconds: secondsOrNull(assignment.active),
      rest_seconds: secondsOrNull(assignment.rest),
      start_elapsed_seconds: secondsOrNull(assignment.start),
      end_elapsed_seconds: secondsOrNull(assignment.end),
      heart_rate_avg_bpm: secondsOrNull(assignment.avgHr ?? hr.avg),
      heart_rate_max_bpm: secondsOrNull(assignment.maxHr ?? hr.max),
      temporal_metrics_source: assignment.source,
      temporal_metrics_confidence: assignment.review ? "review" : "high",
    });

    const { error } = await supabase.from("session_blocks").update(patch).eq("id", assignment.blockId);
    if (error) throw error;
    updated += 1;
  }

  return { status: "reconciled", updated, source: assignments[0]?.source, confidence: assignments.some((item) => item.review) ? "review" : "high" };
}

export async function confirmTemporalBlockEstimate(params: {
  sessionId: string;
  blockWindows: Array<{
    blockId: string;
    startElapsedSeconds?: number | null;
    endElapsedSeconds?: number | null;
    activeSeconds?: number | null;
    restSeconds?: number | null;
    durationSeconds?: number | null;
    source?: string;
    confidence?: string;
  }>;
}) {
  if (!supabase) {
    return { status: "insufficient_data", reason: "supabase_not_configured" };
  }

  const { sessionId, blockWindows } = params;
  const { data: samples, error: samplesError } = await supabase
    .from("session_samples")
    .select("elapsed_seconds,heart_rate_bpm,sample_order")
    .eq("session_id", sessionId);
  if (samplesError) throw samplesError;

  const sortedSamples = sortSamples(samples || []);
  let updated = 0;

  for (const window of blockWindows) {
    const start = firstNumber(window.startElapsedSeconds);
    const end = firstNumber(window.endElapsedSeconds);
    const duration = firstNumber(window.durationSeconds) ?? (start != null && end != null ? end - start : null);
    const active = firstNumber(window.activeSeconds) ?? duration;
    const rest = firstNumber(window.restSeconds);
    const hr = heartRateForWindow(sortedSamples, start, end);
    const patch = compactPatch({
      start_elapsed_seconds: secondsOrNull(start),
      end_elapsed_seconds: secondsOrNull(end),
      duration_seconds: secondsOrNull(duration),
      active_seconds: secondsOrNull(active),
      rest_seconds: secondsOrNull(rest),
      heart_rate_avg_bpm: secondsOrNull(hr.avg),
      heart_rate_max_bpm: secondsOrNull(hr.max),
      temporal_metrics_source: window.source || "user_confirmed_estimate",
      temporal_metrics_confidence: window.confidence || "user_confirmed",
    });

    const { error } = await supabase
      .from("session_blocks")
      .update(patch)
      .eq("id", window.blockId)
      .eq("session_id", sessionId);
    if (error) throw error;
    updated += 1;
  }

  return { status: "reconciled", updated, source: "user_confirmed_estimate", confidence: "user_confirmed" };
}

function assignSegmentsToBlocks(segments: TemporalSegment[], blocks: AnyRow[]) {
  const usableSegments = segments.filter((segment) => segment.total != null || (segment.start != null && segment.end != null));
  if (!usableSegments.length) return [];

  if (usableSegments.length === blocks.length) {
    return blocks.map((block, index) => blockAssignment(block, usableSegments[index]));
  }

  if (usableSegments.length > blocks.length) {
    return groupSegmentsByBlock(usableSegments, blocks).map(({ block, segment }) =>
      blockAssignment(block, segment),
    );
  }

  return [];
}

function blockAssignment(block: AnyRow, segment: TemporalSegment) {
  return {
    blockId: block.id,
    ...segment,
    source: segment.source,
    review: needsTimingReview(segment),
  };
}

function groupSegmentsByBlock(segments: TemporalSegment[], blocks: AnyRow[]) {
  const grouped: { block: AnyRow; segment: TemporalSegment }[] = [];
  const base = Math.floor(segments.length / blocks.length);
  let extra = segments.length % blocks.length;
  let index = 0;

  for (const block of blocks) {
    const count = base + (extra > 0 ? 1 : 0);
    extra = Math.max(0, extra - 1);
    const slice = segments.slice(index, index + count);
    index += count;
    const source = slice[0]?.source || "garmin_segment_direct";
    grouped.push({ block, segment: mergeSegments(slice, source, "reported") });
  }

  return grouped;
}

function rowsToSegments(rows: AnyRow[], source: string): TemporalSegment[] {
  return rows
    .map((row, index) => {
      const active = firstNumber(row.active_seconds, row.total_timer_time, row.total_timer_time_seconds, row.timer_time);
      const elapsed = firstNumber(row.duration_seconds, row.total_elapsed_time, row.total_elapsed_time_seconds, row.elapsed_time);
      const rest = firstNumber(row.rest_seconds);
      const total = elapsed ?? (active != null && rest != null ? active + rest : active);
      const start = firstNumber(row.start_elapsed_seconds, row.start_time_seconds, row.start_elapsed_time);
      const end = firstNumber(row.end_elapsed_seconds, row.end_time_seconds, row.end_elapsed_time) ?? (start != null && total != null ? start + total : null);
      return {
        start,
        end,
        active,
        rest,
        total,
        avgHr: firstNumber(row.heart_rate_avg_bpm, row.avg_heart_rate, row.average_heart_rate),
        maxHr: firstNumber(row.heart_rate_max_bpm, row.max_heart_rate, row.maximum_heart_rate),
        source,
        confidence: "reported",
        order: firstNumber(row.block_order, row.lap_order, row.message_index, row.message_number, row.sample_order) ?? index,
      };
    })
    .filter((segment) => segment.total != null || (segment.start != null && segment.end != null))
    .sort((a: AnyRow, b: AnyRow) => a.order - b.order);
}

function summaryToSegments(sessionStructure: AnyRow | undefined): TemporalSegment[] {
  const summary = sessionStructure?.garmin_fit_summary || sessionStructure || {};
  const sources: Array<{ rows: unknown; source: string }> = [
    { rows: summary.temporal_segments, source: "garmin_fit" },
    { rows: summary.laps, source: "garmin_lap_direct" },
    { rows: summary.segments, source: "garmin_segment_direct" },
    { rows: summary.sets, source: "garmin_set_direct" },
    { rows: summary.strength_tracking?.sets, source: "garmin_set_direct" },
    { rows: summary.strength_tracking?.segments, source: "garmin_segment_direct" },
    { rows: sessionStructure?.laps, source: "garmin_lap_direct" },
    { rows: sessionStructure?.segments, source: "garmin_segment_direct" },
    { rows: sessionStructure?.sets, source: "garmin_set_direct" },
    { rows: sessionStructure?.raw_fit?.laps, source: "garmin_lap_direct" },
    { rows: sessionStructure?.raw_fit?.segments, source: "garmin_segment_direct" },
    { rows: sessionStructure?.raw_fit?.sets, source: "garmin_set_direct" },
    { rows: sessionStructure?.parsed_fit?.laps, source: "garmin_lap_direct" },
    { rows: sessionStructure?.parsed_fit?.segments, source: "garmin_segment_direct" },
    { rows: sessionStructure?.parsed_fit?.sets, source: "garmin_set_direct" },
  ];

  for (const candidate of sources) {
    if (Array.isArray(candidate.rows) && candidate.rows.length) {
      const segments = rowsToSegments(candidate.rows as AnyRow[], candidate.source);
      if (segments.length) return segments;
    }
  }

  return [];
}

function mergeSegments(segments: TemporalSegment[], source: string, confidence: string): TemporalSegment {
  const start = firstPresent(segments.map((segment) => segment.start));
  const end = lastPresent(segments.map((segment) => segment.end));
  const active = sumKnown(segments.map((segment) => segment.active));
  const rest = sumKnown(segments.map((segment) => segment.rest));
  const total = active != null && rest != null ? active + rest : sumKnown(segments.map((segment) => segment.total));
  return {
    start,
    end,
    active,
    rest,
    total,
    avgHr: null,
    maxHr: maxKnown(segments.map((segment) => segment.maxHr)),
    source,
    confidence,
  };
}

function heartRateForWindow(samples: AnyRow[], start: number | null, end: number | null) {
  if (start == null || end == null) return { avg: null, max: null };
  const values = samples
    .filter((sample) => sample.elapsed_seconds >= start && sample.elapsed_seconds <= end)
    .map((sample) => Number(sample.heart_rate_bpm))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return { avg: null, max: null };
  return {
    avg: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    max: Math.round(Math.max(...values)),
  };
}

function needsTimingReview(segment: TemporalSegment) {
  if (segment.total == null || segment.active == null || segment.rest == null) return false;
  return Math.abs(segment.total - (segment.active + segment.rest)) > 2;
}

function sortByOrder(rows: AnyRow[]) {
  return [...rows].sort((a, b) => (firstNumber(a.block_order, a.exercise_order) ?? 0) - (firstNumber(b.block_order, b.exercise_order) ?? 0));
}

function sortSamples(rows: AnyRow[]) {
  return [...rows].sort((a, b) => (firstNumber(a.elapsed_seconds, a.sample_order) ?? 0) - (firstNumber(b.elapsed_seconds, b.sample_order) ?? 0));
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function secondsOrNull(value: unknown) {
  const number = firstNumber(value);
  return number == null ? null : Math.round(number);
}

function compactPatch(row: AnyRow) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value != null));
}

function sumKnown(values: Array<number | null>) {
  const known = values.filter((value): value is number => value != null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function maxKnown(values: Array<number | null>) {
  const known = values.filter((value): value is number => value != null);
  return known.length ? Math.max(...known) : null;
}

function firstPresent(values: Array<number | null>) {
  return values.find((value) => value != null) ?? null;
}

function lastPresent(values: Array<number | null>) {
  return [...values].reverse().find((value) => value != null) ?? null;
}
