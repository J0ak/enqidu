# Activity Rendering Rules

Estas reglas definen como razonar sobre actividades en ENQIDU sin mezclar
fuentes ni estados.

## ExecutedSession

`ExecutedSession` representa una sesion realizada.

Puede venir de:

- Garmin/FIT.
- Coach.
- Registro manual.
- Integracion futura.

Puede tener:

- metricas objetivas como duracion, distancia, frecuencia cardiaca, calorias,
  Training Effect, laps, power o cadencia;
- bloques realizados;
- ejercicios realizados;
- notas subjetivas;
- datos de confianza o procedencia.

Una sesion ejecutada es evidencia historica. No debe sobrescribirse por una
planificacion futura salvo una accion explicita y auditable.

## PlannedSession

`PlannedSession` representa una intencion futura.

Puede tener:

- fecha y hora previstas;
- bloques previstos;
- ejercicios previstos;
- duracion esperada;
- intensidad esperada;
- restricciones;
- notas del coach.

No debe contener metricas Garmin/FIT salvo que se ejecute y exista una sesion
real asociada. Una planned no demuestra que el atleta haya hecho el trabajo.

## Regla Principal

`planned`, `executed`, Garmin blocks y Coach performed blocks no son lo mismo.

- `planned`: intencion.
- `executed`: hecho historico.
- Garmin/FIT blocks: estructura o medicion importada desde un dispositivo.
- Coach performed blocks: interpretacion o captura de bloques realizados a
  partir de conversacion, registro manual o enriquecimiento.

La UI puede mostrarlos juntos cuando ayude al usuario, pero el modelo debe
mantenerlos separados.

## Reconciliacion

Si ENQIDU compara una planned con una executed, el resultado debe ser una capa
derivada: match, cumplimiento, diferencias, ajustes o aprendizaje para futuras
semanas. Esa capa no convierte automaticamente una planned en executed ni una
executed en planned.

