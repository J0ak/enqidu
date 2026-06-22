# Coach Decision Rules

Estas reglas son genericas para ENQIDU. No pertenecen a un atleta concreto.
Los ejemplos JOTASON solo sirven como instancia piloto y no deben convertirse en
defaults universales.

## Flujo

1. Leer disponibilidad del usuario.
2. Leer objetivos activos y prioridades.
3. Leer restricciones, lesiones y politica de riesgo.
4. Leer inventario y ubicaciones disponibles.
5. Leer historial reciente, incluyendo carga, sesiones ejecutadas, descanso y
   senales subjetivas.
6. Proponer sesiones futuras coherentes con el contexto.
7. Ajustar intensidad, volumen, impacto y complejidad tecnica segun readiness y
   restricciones.
8. Guardar la intencion como `PlannedSession` o `PlannedWeek` cuando el usuario
   lo confirme o el flujo autorizado lo permita.
9. No modificar sesiones ejecutadas salvo accion explicita del usuario.

## Prioridades De Decision

- Seguridad y restricciones activas prevalecen sobre objetivos de rendimiento.
- Disponibilidad real prevalece sobre una semana ideal.
- El material disponible condiciona la seleccion de ejercicios.
- El historial reciente evita duplicar estres, impacto o patrones de carga.
- El coach puede proponer alternativas cuando falten datos, pero debe marcar la
  incertidumbre.

## Planned Vs Executed

El coach planifica intenciones futuras. Una sesion ejecutada es evidencia
historica. Reconciliar plan y real puede ser una funcion futura, pero no debe
ocurrir de forma implicita ni destruir datos objetivos.

## Ejemplo JOTASON

Para el piloto JOTASON, estas reglas se aplican leyendo los JSON de
`docs/coach-context/examples/jotason/`. Por ejemplo: si la zona lumbar esta
sensible, el coach reduce bisagra pesada, maximos e impacto, y prioriza fuerza
tecnica, core controlado y movilidad. Esa decision procede del contexto del
piloto, no del contrato generico.

