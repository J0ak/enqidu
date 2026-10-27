import { coachPreviewSummary } from "../coachTools/actionPreviewView.js";
import { formatCoachCardDate } from "../coachContext/coachCardsView.js";
import { visibleLabel } from "../coachConversation/renderer.js";
import { reasonLabel } from "../dailyCoach/presentation.js";
const copy = {
  no_persisted_plan: "No hay un plan guardado para hoy que pueda adaptar. Eso no significa que tengas descanso prescrito.",
  persisted_rest: "Hoy tienes descanso guardado en el plan. No hay una sesión que recortar.",
  environment_unchanged: "La sesión ya está planificada en casa; no necesita un cambio de entorno.",
  duration_adaptation_unavailable: "La estructura no permite ajustar esa duración conservando la prescripción. Hace falta revisar los bloques; no voy a inventar series, repeticiones ni cargas.",
  recommendation_unavailable: "El entorno, material o contexto disponible no permite una nueva prescripción segura. No hay sustituciones demostradas para conservar esta sesión.",
  invalid_duration: "La duración debe ser un número entero entre 10 y 180 minutos. La estructura de la sesión puede limitarla más.",
  source_plan_already_completed: "La sesión ya está enlazada a una ejecución; no se puede adaptar como entrenamiento pendiente.",
  source_plan_not_adaptable: "El estado guardado de esta sesión no permite adaptarla.",
  unsupported_plan_source: "Esta prescripción requiere revisión antes de modificar su contenido.",
  remaining_week_capacity_exhausted: "No hay capacidad disponible en lo que queda de esta semana. No moveré sesiones ejecutadas ni forzaré días ocupados.",
  source_plan_ambiguous: "Hay varias sesiones en esa fecha. Elige cuál quieres revisar antes de preparar el cambio.",
  remaining_week_plan_ambiguous: "Hay varias sesiones en un día de esta semana; hace falta revisar cuál recolocar.",
  execution_selection_required: "Necesito que elijas la actividad realizada para comprobar su enlace y compararla con el plan.",
  exact_execution_link_required: "No hay un enlace persistido único entre esa actividad y un plan. La fecha o el título no demuestran qué sesión ejecutaste.",
  comparable_evidence_required: "La actividad está enlazada, pero faltan medidas comparables para evaluar la carga frente al plan.",
  no_existing_reduction_policy: "La evidencia comparable no permite aplicar una política de reducción existente. Hace falta revisar la carga; tu mensaje por sí solo no registra una ejecución.",
  proposal_not_actionable: "La propuesta existente requiere revisión y no permite un cambio seguro con estas reglas.",
  self_report_requires_review: "Has indicado que has dormido mal. No lo convertiré en una medición de Health ni asumiré un diagnóstico. Necesitamos revisar tu contexto antes de cambiar el plan.",
  request_requires_clarification: "Necesito una petición concreta: duración disponible, cambio a casa, indisponibilidad o revisión de carga. Revisemos un cambio cada vez.",
};
export function renderAdaptiveAssessment(assessment) {
  let answer = assessment.preview ? coachPreviewSummary(assessment.preview)
    : assessment.reason_codes.map((code) => copy[code] || reasonLabel(code)).join(" ");
  const candidates = assessment.candidates;
  if (assessment.status === "requires_choice" && candidates.length) answer += " " + candidates.map((s, i) => `${i + 1}. ${visibleLabel(s.title, "Sesión")} (${formatCoachCardDate(s.date)})`).join("; ");
  const actions = assessment.status === "requires_choice" && assessment.selection_request
    ? candidates.map((candidate) => ({ type: "review_adaptive_choice", label: `REVISAR ${visibleLabel(candidate.title, "ACTIVIDAD")}`,
      arguments: { ...assessment.selection_request, [candidate.kind === "execution" ? "session_id" : "planned_session_id"]: candidate.id } })) : [];
  return { answer, cards: actions.length ? [{ id: "adaptive_execution_choice", type: "adaptation_proposal", badge: "Revisión", title: "Elige la sesión", summary: "La selección se vuelve a comprobar contra tus registros guardados.", metrics: [], actions }] : [] };
}
