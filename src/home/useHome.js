import { useEffect, useState } from "react";
import { requestEnqiduTool } from "../services/enqiduToolsService";
import { healthCalendarUtcBounds } from "../health/healthEvidence.js";
import { loadHome } from "./loadHome.js";

export function useHome(userId) {
  const [state, setState] = useState({ status: "loading" });
  const [revision, refresh] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ status: userId ? "loading" : "missing", userId });
    if (userId)
      loadHome(requestEnqiduTool).then((result) => {
        if (active) setState({ ...result, userId });
      });
    const foreground = () => {
      if (document.visibilityState === "visible") refresh((n) => n + 1);
    };
    document.addEventListener("visibilitychange", foreground);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [userId, revision]);
  const current =
    state.userId === userId
      ? state
      : { status: userId ? "loading" : "missing" };
  useEffect(() => {
    if (!current.brief) return;
    const { date, timezone } = current.brief;
    const midnight = Date.parse(
      healthCalendarUtcBounds(date, timezone).end_utc,
    );
    const timer = setTimeout(
      () => refresh((n) => n + 1),
      Math.max(1000, midnight - Date.now() + 100),
    );
    return () => clearTimeout(timer);
  }, [current.brief]);
  return { ...current, refresh: () => refresh((n) => n + 1) };
}
