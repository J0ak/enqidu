import React from "react";
import { createRoot } from "react-dom/client";
import { ProgressContent } from "../src/progress/Progress.jsx";
import { buildProgress } from "../src/progress/domain.js";
const host = document.createElement("div");
document.body.replaceChildren(host);
document.body.style.background = "#0b1518";
document.body.style.color = "#eff5ef";
document.body.style.margin = "0";
const root = createRoot(host);
window.renderProgress = (status = "available") => {
  const sessions = [
    {
      id: "s",
      session_status: "completed",
      local_date: "2026-10-06",
      duration_seconds: 3600,
      modality_code: "functional_strength",
    },
  ];
  const data = buildProgress({
    sessions: status === "empty" ? [] : sessions,
    exercises: [
      {
        id: "e",
        session_id: "s",
        reported_name: "Press banca DB",
        load_value: 17.5,
        load_unit: "kg",
        reps_per_set: [10, 10, 11],
      },
      {
        id: "missing",
        session_id: "s",
        reported_name: "Dominada alta",
        canonical_exercise_code: "high_pull_up",
        metric_requirements: ["reps"],
      },
      {
        id: "reps-only",
        session_id: "s",
        reported_name: "Hip thrust",
        metric_requirements: ["reps", "load"],
        reps_per_set: [8, 8, 8],
      },
    ],
    plans: [],
    today: "2026-10-17",
    timezone: "Europe/Madrid",
  });
  data.status = status;
  data.exercise_count = data.strength.length;
  data.observed_records = 0;
  data.highlights = [];
  data.improving_count = 0;
  data.stable_count = 0;
  root.render(
    <ProgressContent
      state={
        ["loading", "error"].includes(status)
          ? { status }
          : { status: "available", data }
      }
      period="4"
      setPeriod={() => {}}
      filter="all"
      setFilter={() => {}}
      refresh={() => {}}
    />,
  );
};
window.renderProgress();
