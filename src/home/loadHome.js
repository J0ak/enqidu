// Product composition only: both responses retain their canonical domain rules.
export async function loadHome(request, { timeoutMs = 15000 } = {}) {
  const read = async (tool, args = {}) => {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => request({ tool, arguments: args })),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve({ ok: false }), timeoutMs);
        }),
      ]);
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  };
  const [brief, week] = await Promise.all([
    read("get_daily_coach_operating_brief"),
    read("get_progress_performance_v1", { period: "week" }),
  ]);
  const b = brief.ok ? brief.data : null;
  // A midnight/profile change between requests must not combine different calendars.
  const w =
    week.ok &&
    (!b ||
      (week.data.calendar_date === b.date && week.data.timezone === b.timezone))
      ? week.data.weekly_dashboard
      : null;
  return {
    status: b ? (w ? "available" : "partial") : "error",
    brief: b,
    week: w,
  };
}
