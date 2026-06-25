# Activity Rendering Rules

Estas reglas documentan la separacion conceptual actual. No cambian runtime.

## Executed

Una ejecutada viene de Garmin/FIT y/o Coach realizado.

Puede tener:

- duracion real
- tiempo activo
- descanso
- calorias
- frecuencia cardiaca
- respiracion
- Training Effect
- zonas
- laps
- bloques Garmin
- bloques Coach realizados
- ejercicios realizados
- pesos/cargas

Abre `ActivityView`.

## Planned

Una planificada es intencion.

Puede tener:

- objetivo
- restricciones
- ubicacion
- duracion prevista
- RPE previsto
- bloques previstos
- ejercicios previstos solo si ubicacion/inventario lo permiten

No tiene:

- frecuencia cardiaca real
- Training Effect real
- calorias reales
- laps Garmin
- zonas Garmin

Abre detalle planned.

## Planned completed

Cuando una planned tiene `linked_completed_session_id`, se renderiza como
`planned_completed`.

Regla universal:

- Titulo principal = `planned.title`
- Estado = `Completada - FIT`
- Metricas = executed Garmin/FIT
- Referencia secundaria = `Garmin: executed.title`

Ejemplos:

- Planned Yoga + Garmin Pilates = `Yoga - Completada - FIT - Garmin: Pilates`
- Planned Hibrido fuera de casa + Garmin HIIT = `Hibrido fuera de casa - Completada - FIT - Garmin: HIIT`
- Planned Recuperacion activa + Garmin Fuerza = `Recuperacion activa - Completada - FIT - Garmin: Fuerza`

## Regla critica

No exigir igualdad estricta entre tipo planned y tipo Garmin. Garmin type is not
training intent.

## Separacion de capas

No mezclar:

- bloques previstos
- bloques Garmin
- bloques Coach realizados

Deben verse como capas distintas.

## Casa vs fuera

Si `location_type = home`, se pueden mostrar ejercicios previstos concretos
usando inventario de esa ubicacion.

Si `location_type = outside_home`, `studio`, `gym`, `box`, `outdoor` o
desconocido:

- no usar inventario home
- no mostrar ejercicios previstos concretos dependientes del inventario home
- mostrar intencion, foco, restricciones, duracion y RPE
- el registro Coach realizado si puede listar ejercicios reales dictados

