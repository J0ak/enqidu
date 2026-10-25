export function qualityWording(status, missing = []) {
  if (status === "missing")
    return "No tengo observaciones en este periodo. Eso no demuestra que no lo hayas practicado.";
  if (["unresolved", "needs_identity"].includes(status))
    return "Ese nombre todavía no está asociado de forma inequívoca al catálogo.";
  if (status === "needs_metrics" || missing.includes("reps"))
    return "Sé que lo practicaste, pero faltan repeticiones registradas para comparar.";
  if (missing.includes("load"))
    return "Falta la carga con su unidad para comparar pesos con seguridad.";
  if (status === "partial")
    return "Tengo parte del entrenamiento, pero falta detalle para comparar todas las observaciones con seguridad.";
  return null;
}
