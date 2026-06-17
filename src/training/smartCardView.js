import { blockMeasurementLabel, buildUniversalSessionView } from "./metrics.js";

export function buildTrainingSessionCardView(detailOrSession, selectedBlockIndex = 0) {
  const session = detailOrSession?.schema_version
    ? detailOrSession
    : buildUniversalSessionView(detailOrSession || {});
  const blocks = session.blocks || [];
  const selectedBlock = blocks[Math.max(0, Math.min(blocks.length - 1, selectedBlockIndex))] || null;
  return {
    visible_levels: ["session_summary", "block_detail"],
    session_summary: {
      title: session.session?.title || "Sesión",
      session_type: session.session?.session_type || "mixed",
      metrics: session.summary_metrics || session.session?.summary_metrics || {},
      blocks: blocks.map((block) => ({
        id: block.id || `block-${block.order_index}`,
        block_id: block.block_id || block.id,
        order_index: block.order_index,
        title: block.name || block.title || block.block_type,
        block_type: block.block_type,
        block_format: block.block_format,
        measurement: blockMeasurementLabel(block),
        duration_s: block.duration_s,
        rounds: block.rounds,
        exercise_count: (block.items || []).reduce((sum, item) => sum + (item.exercises?.length || 0), 0),
        missing_fields_count: (block.items || []).reduce((sum, item) => {
          return sum + (item.exercises || []).reduce((itemSum, exercise) => itemSum + (exercise.missing_fields?.length || 0), 0);
        }, 0),
      })),
    },
    block_detail: selectedBlock ? blockDetail(selectedBlock) : null,
  };
}

function blockDetail(block) {
  return {
    id: block.id || `block-${block.order_index}`,
    block_id: block.block_id || block.id,
    order_index: block.order_index,
    title: block.name || block.title || block.block_type,
    block_type: block.block_type,
    block_format: block.block_format,
    measurement: blockMeasurementLabel(block),
    duration_s: block.duration_s,
    rounds: block.rounds,
    completion_score: block.summary_metrics?.completion_score,
    items: (block.items || []).map((item) => ({
      id: item.id || `${block.order_index}-${item.order_index}`,
      block_item_id: item.block_item_id || item.id,
      order_index: item.order_index,
      item_type: item.item_type,
      station_label: item.station_label,
      item_name: item.item_name,
      minute_slot: item.minute_slot,
      duration_s: item.duration_s,
      rest_s: item.rest_s,
      exercises: (item.exercises || []).map((exercise) => ({
        id: exercise.id || exercise.exercise_id,
        item_exercise_id: exercise.item_exercise_id || exercise.id,
        exercise_id: exercise.exercise_id,
        display_name: exercise.display_name,
        measurement_type: exercise.measurement_type,
        missing_fields: exercise.missing_fields || [],
        performed_sets: exercise.performed_sets || [],
        performed_metrics: exercise.performed_metrics || [],
        summary_metrics: exercise.summary_metrics || {},
      })),
    })),
  };
}
