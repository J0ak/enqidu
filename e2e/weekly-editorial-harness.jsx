import React from "react";
import { createRoot } from "react-dom/client";
import WeeklyDashboardV1 from "../src/progress/WeeklyDashboardV1.jsx";
import { buildProgress } from "../src/progress/domain.js";
import { buildWeeklyDashboard } from "../src/progress/weeklyDashboard.js";
const host = document.createElement("div");
document.body.replaceChildren(host);
document.body.style.margin = "0";
document.body.style.fontFamily = "Arial, sans-serif";
const sessions = [
  ["zero", "12", 0],
  ["missing", "13", null],
  ["Fuerza", "15", 3600],
  ["Pilates", "15", 1800],
  ["Parcial", "17", 900],
  ["Sin duración", "17", null],
].map(([id, day, duration_seconds]) => ({
  id,
  title: id,
  local_date: `2026-10-${day}`,
  session_status: "completed",
  duration_seconds,
  modality_code: "functional_strength",
}));
const plans = [
  {
    id: "rest",
    title: "Descanso completado",
    planned_date: "2026-10-16",
    session_type: "rest",
    status: "completed",
  },
  {
    id: "next",
    title: "Salida prevista",
    planned_date: "2026-10-18",
    session_type: "running",
    status: "confirmed",
  },
];
const input = {
  sessions,
  plans,
  exercises: [],
  today: "2026-10-17",
  timezone: "Europe/Madrid",
  period: "week",
};
const dashboard = buildWeeklyDashboard({
  ...input,
  progress: buildProgress(input),
});
createRoot(host).render(<WeeklyDashboardV1 dashboard={dashboard} />);
