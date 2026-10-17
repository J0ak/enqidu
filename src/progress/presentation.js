export const modalityLabel = (code) =>
  ({
    functional_strength: "Fuerza",
    hybrid_training: "Híbrido",
    running: "Running",
    trail_running: "Trail",
    yoga_pilates: "Yoga / Pilates",
    cycling: "Ciclismo",
    swimming: "Natación",
    unknown: "Modalidad no registrada",
  })[code] || code.replaceAll("_", " ");
export const durationLabel = (seconds) => {
  if (seconds == null) return "Duración sin registrar";
  const minutes = Math.round(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
    : `${minutes} min`;
};
