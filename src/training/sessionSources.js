/** Traceable semantic context; physiology is deliberately not projected here. */
export async function fetchSessionSemanticContext(db, sessionId, userId) {
  if (!sessionId || !userId) return [];
  const { data: links, error } = await db.from('session_source_links')
    .select('source_id,source_role,is_primary').eq('session_id',sessionId);
  if (error || !links?.length) return [];
  const semanticLinks=links.filter(l=>['manual_description','supporting'].includes(l.source_role));
  if (!semanticLinks.length) return [];
  const { data: sources, error: sourceError } = await db.from('training_sources')
    .select('id,source_name,source_type,original_json').eq('user_id',userId).in('id',semanticLinks.map(l=>l.source_id));
  if(sourceError) return [];
  return (sources||[]).map(source=>{
    const p=source.original_json||{};
    const notes=[p.context,p.observations?.overall,p.observations?.left_right,p.execution?.technical_feedback,p.athlete_feedback,p.modifications,p.video_note]
      .filter(v=>typeof v==='string' && v.trim());
    return {id:source.id,title:p.session_title||source.source_name||'Descripción del entrenamiento',notes};
  });
}
