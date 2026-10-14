export const decisionLabel = { KEEP: "Mantener el plan", REDUCE: "Revisar una reducción", RECOVERY_BIAS: "Priorizar recuperación", REVIEW_REQUIRED: "Revisar el contexto" };
export const healthLabel = { complete: "Datos completos", partial: "Datos parciales", stale: "Datos anteriores", missing: "Sin datos de hoy" };
export const familyLabel = { sleep: "sueño", hrv: "HRV", stress: "estrés", heart_rate: "frecuencia cardiaca", body_battery: "Body Battery", spo2: "SpO₂", respiration: "respiración" };
export const completionLabel = { completed_as_planned: "Completado según las medidas comparables", completed_modified: "Completado con cambios", partial: "Ejecución parcial", missed: "No realizado, según evidencia explícita", no_session_planned: "Sin entrenamiento previsto", unknown: "Ejecución del plan sin confirmar" };
export const reasonLabel = (reason) => ({
  current_sleep_under_six_hours: "El sueño registrado dura menos de seis horas.", current_sleep_score_under_50: "La puntuación de sueño registrada es inferior a 50.",
  current_stress_at_least_60: "El estrés medio registrado es de al menos 60.", current_readiness_under_40: "El readiness disponible es inferior a 40.",
  health_partial: "Falta parte de la evidencia de salud de hoy.", health_stale: "Sólo hay evidencia de salud de días anteriores.", health_absent: "No hay evidencia de salud disponible.",
  rpe_higher: "El esfuerzo confirmado de la sesión enlazada superó el rango previsto.", user_reported_discomfort: "Hay una molestia confirmada por el usuario; requiere revisión.", multiple_subsequent_personal_baseline_signals: "La HRV y el pulso en reposo posteriores difieren de sus referencias personales; no se puede atribuir una causa.",
  today_unavailable: "Hoy figura como no disponible para entrenar.", existing_closed_loop_proposal: "La evaluación de una sesión enlazada propone revisar el plan.",
  proposal_target_unavailable: "La fecha de la sesión propuesta no está disponible.", ambiguous_closed_loop_proposals: "Hay varias propuestas y falta resolver cuál corresponde.",
  yesterday_execution_truncated: "La consulta de ayer no cubre todas las sesiones.", no_active_persisted_plan: "No hay una sesión activa guardada que adaptar.",
})[reason] || "La evidencia disponible requiere revisión.";
