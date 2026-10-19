/** Audit projection only; never authority for a plan or an action. */
export async function historyKey(value) {
  const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, canonical(v[k])])) : v;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function dailyCoachEvent(tool, args, data, context) {
  // Semantic corrections have their own atomic ledger; previews remain read-only.
  if (tool.endsWith("training_semantics_v1")) return null;
  const base = { user_id: context.authenticated_user_id, calendar_date: context.request_calendar_date,
    timezone: context.profile_timezone, occurred_at: context.generated_at, decision: null, reasons: [],
    proposal: null, proposal_key: null, fingerprint: null, expires_at: null };
  if (tool === "get_daily_coach_operating_brief") {
    const b = data.morning;
    base.event_type = "decision";
    base.decision = data.decision;
    base.reasons = b.reasons;
    base.proposal = b.review_action;
    if (b.review_action) base.proposal_key = await historyKey(b.review_action);
    base.evidence = { health_state: data.health_today.state, readiness_score: data.readiness_score,
      yesterday_status: data.yesterday.status, plan_ids: [...new Set([...b.today_plan.sessions.map((s) => s.id), ...(b.adaptation_proposal?.affected_future_sessions || []).map((s) => s.id)])],
      plan_fingerprint: await historyKey(b.today_plan),
      sleep_seconds: data.health_today.current_families.includes("sleep") ? data.health_today.evidence.sleep?.duration_seconds ?? null : null,
      sleep_score: data.health_today.current_families.includes("sleep") ? data.health_today.evidence.sleep?.sleep_score ?? null : null,
      stress_average: data.health_today.current_families.includes("stress") ? data.health_today.evidence.stress?.average ?? null : null };
  } else if (/^(preview|apply)_/.test(tool)) {
    const { fingerprint, expires_at, confirmation, ...actionArgs } = args;
    base.event_type = tool.startsWith("preview_") ? "previewed" : "applied";
    base.proposal = { tool: tool.replace(/^apply_/, "preview_"), arguments: actionArgs };
    base.proposal_key = await historyKey(base.proposal);
    base.fingerprint = base.event_type === "previewed" ? data.fingerprint : fingerprint;
    base.expires_at = base.event_type === "previewed" ? data.expires_at : expires_at;
    base.evidence = { plan_ids: data.target?.session_ids || (data.planned_session_id ? [data.planned_session_id] : []) };
  } else return null;
  base.event_key = await historyKey({ ...base, occurred_at: undefined });
  return base;
}

export function createDailyCoachRecorder(serviceDb) {
  return async (event) => {
    // Server-generated allowlisted data only. No generic event body from a client.
    const result = await serviceDb.from("daily_coach_events").upsert(event, { onConflict: "user_id,event_key", ignoreDuplicates: true });
    if (result.error) throw new Error("daily_coach_history_unavailable");
  };
}

export function projectDailyHistory(rows, now, hasMore = false) {
  const decisions = rows.filter((r) => r.event_type === "decision");
  return { status: "available", has_more: hasMore || decisions.length > 14, entries: decisions.slice(0, 14).map((row) => {
    const events = row.proposal_key ? rows.filter((e) => e.proposal_key === row.proposal_key && Date.parse(e.occurred_at) >= Date.parse(row.occurred_at)) : [];
    const previews = events.filter((e) => e.event_type === "previewed" && e.evidence?.plan_ids?.some((id) => row.evidence?.plan_ids?.includes(id)));
    const preview = previews[0];
    const applied = events.find((e) => e.event_type === "applied" && previews.some((p) => p.fingerprint === e.fingerprint));
    return { date: row.calendar_date, occurred_at: row.occurred_at, decision: row.decision,
      reasons: row.reasons, proposal: row.proposal, evidence: row.evidence,
      proposal_status: applied ? "applied" : preview ? "previewed" : row.proposal ? "proposed" : "none",
      preview_expired: !!preview && !applied && Date.parse(preview.expires_at) <= Date.parse(now) };
  }) };
}
