export const ENRICHMENT_SESSION_ID_20260606 =
  "5131403b-7e06-444f-808c-f10fe2fc1e31";

export const enrichmentPayload20260606 = {
  jotason_version: "MASTER_TEMPLATE_v8_MULTISPORT",
  enkidu_record_version: "conversation_pilot_v1",
  date: "2026-06-06",
  local_date: "2026-06-06",
  session_type: "strength_recovery_calisthenics",
  session_name:
    "Fuerza recovery lumbar + anillas/barra + gemelo/peroneo + core suave",
  context: {
    lumbar_status:
      "lumbar/gluteo sensible desde hace aproximadamente dos semanas",
    recent_health_context: "virus reciente; semana con baja carga",
    objective: [
      "mantener tono atletico",
      "probar tolerancia sin reactivar lumbar/gluteo",
      "priorizar ejercicios lumbar-friendly",
      "registrar demo conversacional Enkidu",
    ],
    constraints_today: [
      "no running",
      "no lower fuerte",
      "no carries pesados",
      "no cleans/RDL/peso muerto/front squat",
      "cortar si aparece gluteo/lumbar",
    ],
  },
  sessions: [
    {
      session_order: 1,
      session_kind: "completed_manual_pending_fit",
      sport_modality: "strength",
      title: "Recovery calisthenics + core lumbar-friendly",
      blocks: [
        {
          block_order: 1,
          block_name: "Movilidad + activacion",
          block_type: "mobility_activation",
          rounds_completed: 2,
          exercises: [
            { name: "Gato-vaca", execution: "performed", notes: "Incluido en el bloque inicial; previamente aliviaba." },
            { name: "Dead bug", execution: "performed", notes: "Core suave." },
            { name: "Bird dog", execution: "performed", notes: "Control motor lumbar-friendly." },
            { name: "Puente gluteo bilateral", execution: "performed", notes: "Bilateral, evitando carga unilateral fuerte." },
            { name: "Movilidad toracica", execution: "performed", notes: "Con añadido de movilidad de cadera en cuadrupedia." },
            { name: "Respiracion", execution: "performed", notes: "Bajar tono y proteccion lumbar/glutea." },
            { name: "Apertura de cadera en cuadrupedia/grupe", execution: "performed", reps: "6 por lado", notes: "Apertura hacia un lado." },
            {
              name: "Rotaciones de cadera en cuadrupedia",
              execution: "performed",
              reps: { right_clockwise: 6, right_counterclockwise: 6, left_clockwise: 6, left_counterclockwise: 6 },
              notes: "Pierna doblada; movilidad de cadera.",
            },
            {
              name: "Patadas hacia arriba con pierna doblada",
              execution: "performed",
              reps: { right: 6, left: 6 },
              notes: "Activacion glutea/cadera.",
            },
          ],
          coach_interpretation: [
            "Bloque completo y util para activacion.",
            "Pudo generar algo de tension inicial, pero ayudo a movilizar.",
          ],
        },
        {
          block_order: 2,
          block_name: "Anillas/barra tecnica",
          block_type: "technical_calisthenics",
          rounds_planned: 4,
          rounds_completed: 2,
          reason_for_cut:
            "El usuario empezo a notar bastante el gluteo y se decidio cortar el bloque.",
          exercises: [
            {
              name: "Ring row",
              execution: "performed",
              sets_completed: 2,
              reps: { first_set: 8 },
              notes: [
                "Primera serie con cuerpo algo horizontal.",
                "Luego mas vertical.",
                "Posible contribucion a tension glutea/lumbar por rigidez corporal/core.",
              ],
            },
            { name: "Scap pull-up", execution: "performed", sets_completed: 2, notes: "Realizado bien." },
            {
              name: "Dead hang",
              execution: "performed",
              sets_completed: 2,
              duration_seconds: 15,
              notes: [
                "Costaba mantener lumbar larga/relajada.",
                "Algunas series con piernas recogidas.",
                "Mas delicado que false grip para zona lumbar/glutea.",
              ],
            },
            {
              name: "False grip hold",
              execution: "performed",
              sets_completed: 2,
              duration_seconds: 10,
              notes: [
                "Mejor tolerado que dead hang.",
                "Carga mas localizada en antebrazo.",
                "Duracion aproximada 8-10 s.",
              ],
            },
            {
              name: "Dominada tecnica",
              execution: "performed",
              sets_completed: 2,
              reps_per_set: [3, 3],
              notes: [
                "Buena sensacion de fuerza.",
                "No ha perdido fuerza de tiron.",
                "Sin llegar al fallo.",
              ],
            },
          ],
          coach_interpretation: [
            "Tolerancia parcial a calistenia tecnica.",
            "Ring row horizontal y dead hang pueden aumentar demanda global de core/pelvis.",
            "Cortar al notar gluteo fue correcto.",
          ],
        },
        {
          block_order: 3,
          block_name: "Gemelo, tibial, peroneo y estabilidad",
          block_type: "ankle_calf_stability",
          format: "superserie",
          sets_completed: 2,
          exercises: [
            { name: "Gemelo bilateral lento", execution: "performed", sets_completed: 2, notes: "Sin peso; controlado; sin impacto." },
            { name: "Tibial raises", execution: "performed", sets_completed: 2, reps_per_set: [20, 20], notes: "Tolerado." },
            { name: "Balance unipodal", execution: "performed", sets_completed: 2, notes: "Realizado." },
            { name: "Peroneo con banda", execution: "performed", sets_completed: 2, reps_per_set: [15, 15], side: "each_side", notes: "Contabilizado como 2x15 por lado." },
          ],
          coach_interpretation: [
            "Bloque apropiado para tobillo/peroneo sin cargar lumbar.",
            "Util para trail y estabilidad, bajo coste sistemico.",
          ],
        },
        {
          block_order: 4,
          block_name: "Core suave lumbar-friendly",
          block_type: "core_rehab_stability",
          format: "superserie",
          rounds_completed: 2,
          exercises: [
            { name: "Respiracion 90/90", execution: "performed", sets_completed: 2, notes: "Bajar tono y control respiratorio." },
            { name: "Dead bug corto", execution: "performed", sets_completed: 2, reps_per_side: 5, notes: "Se notaba, pero tolerable." },
            { name: "McGill curl-up suave", execution: "performed", sets_completed: 2, reps_per_side: 5, notes: "Muy buena tolerancia; alivio." },
            { name: "Bird dog", execution: "performed", sets_completed: 2, reps_per_side: 5, notes: "Ya hecho al inicio; sin problema." },
            { name: "Side plank desde rodillas", execution: "performed", sets_completed: 2, duration_seconds: 20, side: "each_side", notes: "No afecto negativamente; tolerado." },
          ],
          coach_interpretation: [
            "Bloque con respuesta positiva.",
            "El usuario refiere sentirse mejor.",
            "McGill/dead bug/bird dog/side plank rodillas quedan como opcion segura.",
          ],
        },
      ],
      tolerance_and_symptoms: {
        during_session: [
          { event: "aumento de percepcion de gluteo durante bloque de anillas", action: "se recorto el bloque" },
          { event: "core suave posterior alivio", action: "se confirma buena tolerancia" },
        ],
        post_session_state: "mejor que durante el bloque de anillas; alivio tras core",
        avoid_next_time_if_sensitive: [
          "ring row demasiado horizontal",
          "dead hang largo",
          "volumen alto de anillas",
          "hollow agresivo",
          "ab wheel",
          "plancha larga",
          "carries",
        ],
        safe_candidates_next_time: [
          "McGill curl-up suave",
          "dead bug corto",
          "bird dog",
          "side plank desde rodillas",
          "gemelo/tibial/peroneo",
          "dominada tecnica dosificada",
        ],
      },
    },
  ],
} as const;

export const aiUsagePayload20260606 = {
  model: "gpt-5.5-thinking",
  phases: [
    { phase: "pre_training_advice", model: "gpt-5.5-thinking", token_source: "estimated_from_chat", exact_billing_available: false, input_tokens_estimated: 1200, cached_input_tokens_estimated: 0, output_tokens_estimated: 1300 },
    { phase: "intra_training_coaching", model: "gpt-5.5-thinking", token_source: "estimated_from_chat", exact_billing_available: false, input_tokens_estimated: 900, cached_input_tokens_estimated: 0, output_tokens_estimated: 900 },
    { phase: "post_training_log", model: "gpt-5.5-thinking", token_source: "estimated_from_chat", exact_billing_available: false, input_tokens_estimated: 2200, cached_input_tokens_estimated: 0, output_tokens_estimated: 1800 },
    { phase: "user_audio_dictation_inputs", model: "gpt-5.5-thinking", token_source: "estimated_from_chat", exact_billing_available: false, input_tokens_estimated: 2600, cached_input_tokens_estimated: 0, output_tokens_estimated: 0 },
  ],
} as const;
