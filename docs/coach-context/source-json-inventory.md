# Source JSON Inventory

Este inventario humano clasifica los JSON fuente esperados. En esta fase no se
reescriben ni se inventan archivos fuente.

## References

### inventory_home_v4.json

- Inventario home del piloto.
- Incluye rack, barra, discos, mancuernas, kettlebells, landmine, chalecos,
  anillas, poleas, cajon, bandas, wall ball, slam ball, ab wheel, foam roller y
  theragun.
- Regla critica: `cardio_at_home = false`.
- Uso: solo fixture Jotason, no inventario global ENQIDU.

### jotason_promaestro_v5.json

- Plan maestro historico.
- Prioridades: masa magra funcional, skills, resistencia trail/triathlon.
- Reglas: prioridad masa sobre cardio, skills semanales, solo un dia running de
  alta intensidad, viernes sin fatiga de pierna, sabado fuerza principal,
  domingo resistencia especifica.
- Uso: referencia historica, no disponibilidad actual universal.

### JOTASON_MASTER_TEMPLATE_v8_COMPLETO.json

- Contrato historico universal de sesion.
- Define metadata, summary, Garmin/FIT, zonas, laps, time series, bloques,
  ejercicios, reconciliacion, metricas derivadas, coach layer y data quality.
- Uso: base conceptual para contrato generico ENQIDU.

### JOTASON_MASTER_ULTIMO_MES_2026-04-18_ULTRA_DETALLADO.json

- Historico mensual consolidado.
- Incluye inventario, agregados, sesiones, raw daily objects y conclusiones
  coach.
- Uso: fixture de historico y analytics.

## Session fixtures

Los JSON diarios esperados representan sesiones reales del piloto Jotason. Deben
vivir en `docs/coach-context/fixtures/jotason/sessions/` si aparecen en el repo
o entorno Codex:

- `JOTASON_2026-04-20_FULL_DAY_MASTER_TEMPLATE_v8.json`
- `JOTASON_2026-04-21_FULL_DAY.json`
- `JOTASON_2026-04-22_FULL_DAY_ENRICHED_TEMPLATE.json`
- `2026-04-26_jotason_trail.json`
- `2026-04-27_jotason.json`
- `2026-04-29_jotason_full_day_v2.json`
- `2026-05-04_JOTASON_FULL.json`
- `JOTASON_2026-05-05_strength_lower_body.json`
- `JOTASON_2026-05-06_HIBRIDO_SWIM.json`
- `JOTASON_2026-05-07_YOGA_RECOVERY.json`
- `JOTASON_2026-05-08_FULL_DAY_HYBRID.json`
- `JOTASON_2026-05-09_LOWER_STRENGTH_HYBRID.json`
- `jotason_trail_running_2026_05_10.json`
- `11-05-2026_Jotason.json`
- `Jotason_2026-05-12_upper_hybrid_skill_strength.json`
- `Jotason_2026-05-13_COMPLETO.json`

