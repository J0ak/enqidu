// Production session_laps contract inspected 2026-10-16. Keep parser DTO separate.
export const LAP_COLUMNS = 'id,lap_order,lap_type,started_at,duration_seconds,elapsed_seconds,active_seconds,rest_seconds,distance_m,heart_rate_avg_bpm,heart_rate_max_bpm,raw_payload';
export function readLap(row, sessionStartedAt) {
  const saved=row.raw_payload?._enqidu_lap_projection;
  const relative=row.started_at && sessionStartedAt ? (Date.parse(row.started_at)-Date.parse(sessionStartedAt))/1000 : null;
  const start=saved?.start_elapsed_seconds ?? (Number.isFinite(relative)?relative:null);
  return {...row,lap_index:row.lap_order,source:saved?.source||'garmin_fit_lap',distance_meters:row.distance_m,
    start_elapsed_seconds:start,end_elapsed_seconds:saved?.end_elapsed_seconds ?? (start!=null && row.duration_seconds!=null ? start+Number(row.duration_seconds):null)};
}
export function writeLap(sessionId,row) {
  return {session_id:sessionId,lap_order:row.lap_index,
    duration_seconds:row.duration_seconds??null,active_seconds:row.active_seconds??null,rest_seconds:row.rest_seconds??null,
    distance_m:row.distance_meters??null,heart_rate_avg_bpm:row.heart_rate_avg_bpm??null,heart_rate_max_bpm:row.heart_rate_max_bpm??null,
    raw_payload:{...(row.raw_payload||{}),_enqidu_lap_projection:{source:row.source||'garmin_fit_lap',start_elapsed_seconds:row.start_elapsed_seconds??null,end_elapsed_seconds:row.end_elapsed_seconds??null}}};
}
