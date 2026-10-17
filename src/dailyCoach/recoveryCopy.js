export function recoveryTrendCopy(trend) {
  if (trend.direction !== "insufficient_data")
    return {
      title: {
        improving: "Tu recuperación está mejorando",
        stable: "Tu recuperación se mantiene estable",
        declining: "Tu recuperación muestra un descenso",
      }[trend.direction],
      explanation:
        "Esta tendencia compara tus puntuaciones recientes con días anteriores que tienen datos equivalentes. No explica por sí sola la causa del cambio.",
    };
  const latest = trend.points.filter((p) => p.readiness_score != null).at(-1);
  return {
    title: "Aún no tenemos suficientes datos para ver una tendencia",
    explanation: latest
      ? `Tenemos una puntuación reciente de ${latest.readiness_score}. Necesitamos algunos días más de datos comparables para saber si tu recuperación mejora, se mantiene o empeora.`
      : "Aún no tenemos puntuaciones recientes de recuperación. Con algunos días de datos podremos empezar a ver cómo evoluciona.",
  };
}
