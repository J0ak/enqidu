# Data Sources

Las fuentes no se pisan entre si. Se reconcilian como capas separadas.

## 1. Garmin/FIT

Fuente de realidad fisiologica:

- duracion
- frecuencia cardiaca
- calorias
- Training Effect
- laps
- zonas
- bloques Garmin/FIT

## 2. Coach conversation

Fuente de detalle realizado:

- ejercicios
- pesos
- rondas
- adaptaciones
- molestias
- decisiones tomadas durante la sesion

## 3. Planned sessions

Fuente de intencion:

- objetivo
- restricciones
- ubicacion
- duracion prevista
- bloques previstos
- RPE previsto

## 4. Jotason JSON references

Fuente historica y contractual para disenar modelos ENQIDU genericos.

## 5. Normalized Coach Context

Fuente derivada reproducible:

- lee raw references/fixtures
- genera JSON ENQIDU normalizados
- mantiene `fixture_user = jotason`
- no alimenta runtime productivo por si solo

## 6. Supabase

Fuente actual parcial de datos vivos. En fases futuras guardara datos vivos,
editables y por usuario.

## 7. Supabase seed dry-run

Fuente derivada local para planificar persistencia futura. No es dato vivo, no
usa credenciales, no hace red y no escribe en base de datos.

## 8. ChatGPT pilot

Fuente temporal de inteligencia y orquestacion del piloto.

## Regla de reconciliacion

Ninguna fuente debe pisar a otra. Garmin/FIT manda en metricas fisiologicas,
planned manda en intencion, Coach conversation manda en detalle realizado y los
JSON Jotason solo informan diseno y validacion.

