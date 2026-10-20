# #103 — Auditoría real del corpus

Consulta SELECT ONLY en Enqidu (rdduqsziboqxlgeqouxq), 2026-10-19 UTC. Sin escrituras. El recuento real es **727**, frente a los 722 previstos. **438 nombres distintos**; **0 exercise_id**; **341 filas con array de reps no vacío**; **334 con load_value no nulo**. Estas métricas describen presencia, no suficiencia o comparabilidad; carga cero también cuenta. Unknown: 79 (0 con reps; 64 con carga), permanece sin resolver.

Catálogo persistido: 12 entradas. Propuesto: 34. Cobertura exacta antes: **63/727 (8.7%)**; después: **175/727 (24.1%)**. Después es simulación local del catálogo propuesto; producción no ha cambiado. No se agrupan nombres por similitud.

## Consulta reproducible

```sql
select reported_name, count(*) as frequency,
 count(*) filter (where exercise_id is not null) as with_identity,
 count(*) filter (where jsonb_typeof(reps_per_set)='array' and reps_per_set <> '[]'::jsonb) as with_reps,
 count(*) filter (where load_value is not null) as with_load
from public.session_exercises group by reported_name order by count(*) desc, reported_name;
select id,code,name,metadata,is_active from public.exercise_catalog order by code;
```

## Duplicados exclusivamente por normalización trivial

- Bird dog / Bird Dog
- Cat-cow / Cat-Cow
- Remo ergómetro / remo ergómetro
- Farmer carry / Farmer Carry
- Assault Bike / Assault bike
- Pallof press / Pallof Press
- Dead bug / Dead Bug
- Respiración 90/90 / Respiracion 90/90
- Farmer carry con dos kettlebells / Farmer Carry con dos kettlebells
- Respiracion / Respiración

## Decisiones explícitas

- ES/EN demostrados: Remo en anillas ↔ Ring row; Plancha lateral ↔ Side plank; Sentadilla goblet ↔ Goblet squat; RDL con barra ↔ catálogo RDL existente (equipamiento barra en el seed #102). Se añaden aliases enumerados, nunca reglas lingüísticas.
- Dominadas (genéricas), dominadas estrictas y dominada alta tienen códigos separados. No se presume que una dominada sin cualificador sea estricta.
- Pike push-up, Elevated feet pike push-up y Pike push-up elevado tienen tres códigos: el último no especifica qué se eleva. No se fusiona con pies elevados.
- Hip thrust genérico y con barra permanecen separados; también landmine genérico y unilateral; banca con barra y mancuernas; RDL con barra y dos mancuernas.
- HSPU está documentado en docs/coach-context/references/jotason/JOTASON_MASTER_ULTIMO_MES_2026-04-18_ULTRA_DETALLADO.json (bloques hspu) y training-reference.normalized.json. Entrada explícita, sin reinterpretar pike como HSPU.
- Press militar: no aparece literalmente en este corpus ni como ejercicio documentado en la búsqueda del repositorio. No se incorpora por anticipación.
- Cat-cow/Gato-vaca/Cat-camel y Bird-dog son aliases enumerados del mismo movimiento; variantes con carga, unilateralidad, equipo diferente, opciones «o» y movimientos compuestos permanecen separadas/no resueltas.
- Se conservan aliases heredados de #102. Su revisión deportiva (p.ej. «remo» genérico) es un riesgo conocido, no una licencia para ampliar matching.

## Inventario completo

| Nombre informado | Frecuencia | Con reps | Con carga | Antes | Después propuesto |
|---|---:|---:|---:|---|---|
| Unknown | 79 | 0 | 64 | unresolved | unresolved |
| Bird dog | 10 | 7 | 4 | bird_dog | bird_dog |
| Cat-cow | 10 | 7 | 2 | unresolved | cat_cow |
| Remo ergómetro | 10 | 0 | 2 | rowing_ergometer | rowing_ergometer |
| Dominada estricta | 9 | 8 | 5 | unresolved | strict_pull_up |
| Farmer carry | 9 | 0 | 8 | unresolved | farmer_carry |
| Plancha lateral | 9 | 0 | 4 | unresolved | side_plank |
| Remo en anillas | 9 | 7 | 5 | unresolved | ring_row |
| Puente de glúteo | 8 | 5 | 2 | glute_bridge | glute_bridge |
| Ankle rocks | 7 | 7 | 3 | unresolved | unresolved |
| Assault Bike | 7 | 1 | 0 | unresolved | assault_bike |
| Pallof press | 7 | 7 | 3 | pallof_press | pallof_press |
| Ankle rock | 6 | 4 | 2 | unresolved | unresolved |
| Dead bug | 6 | 5 | 3 | dead_bug | dead_bug |
| Respiración 90/90 | 6 | 3 | 2 | diaphragmatic_breathing | diaphragmatic_breathing |
| Wall slide | 6 | 4 | 2 | unresolved | unresolved |
| Front squat | 5 | 3 | 3 | front_squat | front_squat |
| Rock-back | 5 | 1 | 0 | unresolved | unresolved |
| Scapular pull-up | 5 | 4 | 3 | unresolved | scapular_pull_up |
| Assault bike | 4 | 0 | 3 | unresolved | assault_bike |
| Calentamiento completo | 4 | 0 | 1 | unresolved | unresolved |
| Caminata lateral con minibanda | 4 | 2 | 0 | unresolved | unresolved |
| Flexión con chaleco | 4 | 3 | 4 | unresolved | unresolved |
| Quadruped rock-back | 4 | 4 | 1 | unresolved | unresolved |
| Ring row | 4 | 3 | 0 | unresolved | ring_row |
| Sóleo unilateral sentado | 4 | 4 | 4 | unresolved | unresolved |
| Tibial raises | 4 | 4 | 1 | unresolved | unresolved |
| Dead bug con pelota de tenis | 3 | 3 | 0 | unresolved | unresolved |
| Escaladores | 3 | 3 | 0 | unresolved | unresolved |
| Estiramientos finales | 3 | 0 | 1 | unresolved | unresolved |
| Landmine press unilateral | 3 | 2 | 3 | unresolved | single_arm_landmine_press |
| Medio wall ball | 3 | 2 | 2 | unresolved | unresolved |
| Pallof monopodal | 3 | 3 | 3 | unresolved | unresolved |
| Pallof walkout | 3 | 3 | 0 | unresolved | unresolved |
| Press banca con mancuernas | 3 | 2 | 3 | unresolved | dumbbell_bench_press |
| RDL con barra | 3 | 3 | 2 | unresolved | romanian_deadlift |
| Remo unilateral con kettlebell | 3 | 2 | 3 | unresolved | unresolved |
| Rotación torácica en cuadrupedia | 3 | 3 | 2 | unresolved | unresolved |
| Split squat | 3 | 3 | 2 | unresolved | unresolved |
| Step-down | 3 | 3 | 2 | unresolved | unresolved |
| Step-down bajo | 3 | 2 | 2 | unresolved | unresolved |
| Step-up | 3 | 3 | 2 | unresolved | unresolved |
| 90/90 | 2 | 2 | 2 | unresolved | unresolved |
| 90/90 con rotación interna y externa | 2 | 0 | 0 | unresolved | unresolved |
| 90/90 de cadera | 2 | 1 | 1 | unresolved | unresolved |
| Bird Dog | 2 | 0 | 0 | bird_dog | bird_dog |
| Bird-dog | 2 | 2 | 2 | unresolved | bird_dog |
| Círculos de cadera en cuadrupedia | 2 | 2 | 0 | unresolved | unresolved |
| Dead bug corto | 2 | 1 | 0 | unresolved | unresolved |
| Dominadas estrictas | 2 | 2 | 2 | unresolved | strict_pull_up |
| Gato-vaca | 2 | 1 | 0 | unresolved | cat_cow |
| Gemelo bilateral lento | 2 | 1 | 0 | unresolved | unresolved |
| Goblet squat | 2 | 2 | 2 | unresolved | goblet_squat |
| High pull unilateral con kettlebell | 2 | 2 | 1 | unresolved | unresolved |
| Hip thrust | 2 | 0 | 2 | unresolved | hip_thrust |
| Kettlebell swing | 2 | 2 | 2 | unresolved | kettlebell_swing |
| Landmine press/control unilateral | 2 | 1 | 1 | unresolved | unresolved |
| McGill curl-up suave | 2 | 1 | 0 | unresolved | unresolved |
| Peroneo con banda | 2 | 2 | 0 | unresolved | unresolved |
| Peso muerto rumano (RDL) | 2 | 0 | 2 | unresolved | romanian_deadlift |
| Pike push-up elevado | 2 | 0 | 1 | unresolved | elevated_pike_push_up_unspecified |
| Plancha lateral desde rodillas | 2 | 1 | 1 | unresolved | kneeling_side_plank |
| Press diagonal | 2 | 2 | 0 | unresolved | unresolved |
| Press diagonal medio arrodillado con goma | 2 | 1 | 0 | unresolved | unresolved |
| Puente de glúteo unilateral | 2 | 1 | 1 | unresolved | unresolved |
| Puente de glúteo unilateral asistido | 2 | 2 | 1 | unresolved | unresolved |
| Push press unilateral con kettlebell | 2 | 2 | 1 | unresolved | unresolved |
| RDL bilateral con dos mancuernas | 2 | 2 | 2 | unresolved | dumbbell_romanian_deadlift |
| Remo con goma en posición de lunge | 2 | 2 | 0 | unresolved | unresolved |
| Remo unilateral | 2 | 2 | 2 | single_arm_row | single_arm_row |
| Respiracion 90/90 | 2 | 1 | 0 | diaphragmatic_breathing | diaphragmatic_breathing |
| Respiración lenta | 2 | 2 | 2 | unresolved | unresolved |
| Rotación externa de hombro con goma | 2 | 2 | 0 | unresolved | unresolved |
| Rotación interna de hombro con goma | 2 | 2 | 0 | unresolved | unresolved |
| Rotaciones de tobillo con miniband | 2 | 0 | 0 | unresolved | unresolved |
| Scaption | 2 | 2 | 1 | unresolved | unresolved |
| Scapular push-up | 2 | 2 | 0 | unresolved | unresolved |
| Sentadilla sin carga | 2 | 2 | 0 | unresolved | unresolved |
| Side plank desde rodillas | 2 | 0 | 0 | unresolved | kneeling_side_plank |
| Sóleo sentado unilateral | 2 | 2 | 2 | unresolved | unresolved |
| Split squat isométrico | 2 | 0 | 2 | unresolved | unresolved |
| Suitcase carry | 2 | 0 | 2 | unresolved | unresolved |
| Swing unilateral con kettlebell | 2 | 1 | 2 | unresolved | unresolved |
| 90/90 cadera / rock back | 1 | 0 | 1 | unresolved | unresolved |
| 90/90 de cadera final | 1 | 0 | 1 | unresolved | unresolved |
| A-Skip | 1 | 0 | 0 | unresolved | unresolved |
| Activación de core profundo | 1 | 0 | 0 | unresolved | unresolved |
| Activación y control de glúteo | 1 | 0 | 0 | unresolved | unresolved |
| Active hang | 1 | 0 | 0 | unresolved | unresolved |
| Aductor squeeze con pelota 25 cm | 1 | 0 | 1 | unresolved | unresolved |
| Aeróbico 20/10 + 10/5 | 1 | 0 | 1 | unresolved | unresolved |
| Agarre estático simétrico | 1 | 0 | 1 | unresolved | unresolved |
| Alcance largo de brazo en caballero | 1 | 0 | 0 | unresolved | unresolved |
| Apertura de cadera en cuadrupedia | 1 | 1 | 0 | unresolved | unresolved |
| Apertura de cadera en cuadrupedia/grupe | 1 | 1 | 0 | unresolved | unresolved |
| Apertura pectoral | 1 | 0 | 0 | unresolved | unresolved |
| Apertura suave de pectoral derecho | 1 | 0 | 0 | unresolved | unresolved |
| Apertura suave pectoral derecho | 1 | 0 | 1 | unresolved | unresolved |
| Aperturas con mancuernas en banco inclinado | 1 | 0 | 1 | unresolved | unresolved |
| Apoyo en cajón con pierna estirada | 1 | 1 | 0 | unresolved | unresolved |
| Apoyo monopodal con rodilla ligeramente flexionada | 1 | 0 | 0 | unresolved | unresolved |
| Arco con mano y rodilla abierta | 1 | 0 | 1 | unresolved | unresolved |
| Assault bike / bici | 1 | 0 | 0 | unresolved | unresolved |
| Assault Bike intervalos 20/10 | 1 | 0 | 0 | unresolved | unresolved |
| Balance unipodal | 1 | 0 | 0 | unresolved | unresolved |
| Balance unipodal en tabla de equilibrio | 1 | 0 | 0 | unresolved | unresolved |
| Battle rope en sentadilla | 1 | 0 | 0 | unresolved | unresolved |
| Bird dog con mancuerna | 1 | 1 | 1 | unresolved | unresolved |
| Bird dog con mancuernas de 2.5 kg | 1 | 1 | 1 | unresolved | unresolved |
| Bisagra / RDL sin carga | 1 | 1 | 0 | unresolved | unresolved |
| Bisagra de cadera / RDL sin carga | 1 | 0 | 1 | unresolved | unresolved |
| Bisagra sin carga | 1 | 1 | 0 | unresolved | unresolved |
| Bisagra tocando pared | 1 | 1 | 0 | unresolved | unresolved |
| Bottom squat to press | 1 | 1 | 1 | unresolved | unresolved |
| Box jumps | 1 | 0 | 0 | unresolved | unresolved |
| Búlgara invertida con pie elevado en step | 1 | 1 | 1 | unresolved | unresolved |
| Cambios 90/90 | 1 | 1 | 0 | unresolved | unresolved |
| Caminar | 1 | 1 | 1 | unresolved | unresolved |
| Caminar calentamiento | 1 | 0 | 0 | unresolved | unresolved |
| Caminar recuperación | 1 | 0 | 0 | unresolved | unresolved |
| Caminar suave | 1 | 0 | 0 | unresolved | unresolved |
| Caminata con desnivel | 1 | 0 | 1 | unresolved | unresolved |
| Caminata lateral con goma | 1 | 1 | 0 | unresolved | unresolved |
| Caminata llana con cambios de ritmo | 1 | 0 | 0 | unresolved | unresolved |
| Caminata rápida + cuestas | 1 | 0 | 0 | unresolved | unresolved |
| Caminata suave | 1 | 0 | 0 | unresolved | unresolved |
| Carry/granjero asim?trico en posici?n de press | 1 | 1 | 1 | unresolved | unresolved |
| Cat-camel | 1 | 1 | 1 | unresolved | cat_cow |
| Cat-Cow | 1 | 0 | 0 | unresolved | cat_cow |
| Cat-cow y movilidad lumbar suave | 1 | 1 | 1 | unresolved | unresolved |
| Cierre de movilidad suave | 1 | 0 | 0 | unresolved | unresolved |
| Círculo de cadera en cuadrupedia | 1 | 1 | 0 | unresolved | unresolved |
| Clamshell | 1 | 1 | 0 | unresolved | unresolved |
| Clamshell / monster walk con goma | 1 | 0 | 0 | unresolved | unresolved |
| Clean + press ligero con pelota | 1 | 0 | 1 | unresolved | unresolved |
| Clean unilateral con kettlebell | 1 | 1 | 1 | unresolved | unresolved |
| Cross squat / sentadilla lateral con KB al frente | 1 | 0 | 0 | unresolved | unresolved |
| Cuclilla asistida con talones elevados | 1 | 0 | 1 | unresolved | unresolved |
| Dead Bug | 1 | 0 | 0 | dead_bug | dead_bug |
| Dead bug / bicho muerto | 1 | 0 | 0 | unresolved | unresolved |
| Dead bug / core | 1 | 1 | 0 | unresolved | unresolved |
| Dead bug clásico | 1 | 1 | 1 | unresolved | unresolved |
| Dead bug con goma | 1 | 1 | 0 | unresolved | unresolved |
| Dead bug con pelota | 1 | 0 | 0 | unresolved | unresolved |
| Dead bug con presión de pierna | 1 | 0 | 1 | unresolved | unresolved |
| Dead bug con tensión de goma | 1 | 1 | 0 | unresolved | unresolved |
| Dead bug progresado con gomas | 1 | 1 | 0 | unresolved | unresolved |
| Dead hang | 1 | 0 | 0 | unresolved | unresolved |
| Desplazamiento lateral de peso | 1 | 1 | 1 | unresolved | unresolved |
| Dominada alta | 1 | 0 | 0 | unresolved | high_pull_up |
| Dominada alta / chest-to-bar técnica | 1 | 1 | 1 | unresolved | unresolved |
| Dominada tecnica | 1 | 1 | 0 | unresolved | unresolved |
| Double kettlebell lunges plus farmer walk | 1 | 0 | 1 | unresolved | unresolved |
| Elevación de sóleo con rodilla flexionada | 1 | 1 | 0 | unresolved | unresolved |
| Elevación de talón | 1 | 1 | 0 | unresolved | unresolved |
| Elevación de talón bilateral lenta | 1 | 1 | 0 | unresolved | unresolved |
| Elevación en plano escapular | 1 | 1 | 1 | unresolved | unresolved |
| Elevated feet pike push-up | 1 | 1 | 0 | unresolved | elevated_feet_pike_push_up |
| Equilibrio a una pierna | 1 | 0 | 0 | unresolved | unresolved |
| Escaladores inclinados alternos | 1 | 1 | 0 | unresolved | unresolved |
| Escaladores multidireccionales | 1 | 0 | 1 | unresolved | unresolved |
| Escaladores rectos | 1 | 0 | 0 | unresolved | unresolved |
| Estiramiento flexor de cadera | 1 | 0 | 1 | unresolved | unresolved |
| Estiramientos | 1 | 0 | 0 | unresolved | unresolved |
| Estiramientos dinámicos generales | 1 | 0 | 0 | unresolved | unresolved |
| Estiramientos y relajación | 1 | 0 | 0 | unresolved | unresolved |
| Face pull | 1 | 1 | 0 | unresolved | unresolved |
| Face pull con goma | 1 | 1 | 0 | unresolved | unresolved |
| False grip asistido | 1 | 0 | 0 | unresolved | unresolved |
| False grip hold | 1 | 0 | 0 | unresolved | unresolved |
| False grip hold opcional | 1 | 0 | 0 | unresolved | unresolved |
| False grip técnico en anillas | 1 | 0 | 0 | unresolved | unresolved |
| Farmer Carry | 1 | 0 | 0 | unresolved | farmer_carry |
| Farmer carry con dos kettlebells | 1 | 0 | 1 | unresolved | unresolved |
| Farmer Carry con dos kettlebells | 1 | 0 | 1 | unresolved | unresolved |
| Farmer/granjero unilateral | 1 | 1 | 1 | unresolved | unresolved |
| Flexión | 1 | 1 | 0 | unresolved | unresolved |
| Flexión escapular | 1 | 1 | 0 | unresolved | unresolved |
| Flexión inclinada | 1 | 0 | 0 | unresolved | unresolved |
| Flexiones en suelo con chaleco | 1 | 1 | 1 | unresolved | unresolved |
| Flexiones inclinadas | 1 | 1 | 1 | unresolved | unresolved |
| Fondo parcial muy corto | 1 | 1 | 0 | unresolved | unresolved |
| Fondos en paralelas | 1 | 1 | 1 | unresolved | unresolved |
| Front squat con barra | 1 | 0 | 0 | unresolved | unresolved |
| Front squat con barra, serie adicional de aproximación | 1 | 0 | 1 | unresolved | unresolved |
| Front squat con dos mancuernas | 1 | 1 | 1 | unresolved | unresolved |
| Glute bridge con pelota | 1 | 1 | 1 | unresolved | unresolved |
| Goblet split squat | 1 | 1 | 1 | unresolved | unresolved |
| Goblet squat / sentadilla técnica con talones elevados | 1 | 0 | 0 | unresolved | unresolved |
| Goma roja en semi-sentadilla hacia delante | 1 | 0 | 0 | unresolved | unresolved |
| Handstand cara a pared | 1 | 0 | 0 | unresolved | unresolved |
| Handstand de cara a pared | 1 | 0 | 1 | unresolved | unresolved |
| Hip thrust con barra | 1 | 1 | 0 | unresolved | barbell_hip_thrust |
| Hollow hold / dead bug | 1 | 0 | 0 | unresolved | unresolved |
| Inchworm + plancha + Superman | 1 | 0 | 0 | unresolved | unresolved |
| Isom?trico de control hacia delante | 1 | 0 | 0 | unresolved | unresolved |
| Isométrico de sóleo | 1 | 0 | 1 | unresolved | unresolved |
| KB halo alrededor de la cabeza | 1 | 1 | 1 | unresolved | unresolved |
| Kettlebell high pull / remo alto | 1 | 0 | 1 | unresolved | unresolved |
| Kettlebell lunge | 1 | 1 | 1 | unresolved | unresolved |
| Kettlebell remo | 1 | 1 | 0 | unresolved | unresolved |
| Kettlebell squat holding low | 1 | 1 | 1 | unresolved | unresolved |
| Kettlebell upright row | 1 | 1 | 1 | unresolved | unresolved |
| Landmine press | 1 | 1 | 1 | unresolved | landmine_press |
| landmine squat + press diagonal | 1 | 1 | 1 | unresolved | unresolved |
| Landmine squat to calf raise | 1 | 0 | 1 | unresolved | unresolved |
| Leñador con kettlebell | 1 | 1 | 1 | unresolved | unresolved |
| Leñador con wall ball | 1 | 1 | 1 | unresolved | unresolved |
| Leñador de pie con pelota | 1 | 1 | 1 | unresolved | unresolved |
| Leñador/lanzamiento rotacional con wall ball | 1 | 0 | 1 | unresolved | unresolved |
| Lunge con balón medicinal y rotación | 1 | 1 | 1 | unresolved | unresolved |
| Lunge con press hacia arriba y vuelos laterales | 1 | 0 | 1 | unresolved | unresolved |
| Lunge frontal con carga hacia delante | 1 | 1 | 1 | unresolved | unresolved |
| Lunge lateral / diagonal | 1 | 1 | 1 | unresolved | unresolved |
| Lunges con saco | 1 | 0 | 1 | unresolved | unresolved |
| Marcha técnica | 1 | 0 | 0 | unresolved | unresolved |
| Media sentadilla con despegue de talones | 1 | 0 | 0 | unresolved | unresolved |
| Media wall ball / sentadilla con balón medicinal a media altura | 1 | 1 | 1 | unresolved | unresolved |
| Medio arrodillado overhead unilateral con KB | 1 | 0 | 1 | unresolved | unresolved |
| Monster walk | 1 | 1 | 1 | unresolved | unresolved |
| Monster walk con minibanda | 1 | 0 | 0 | unresolved | unresolved |
| Monster walk lateral | 1 | 0 | 0 | lateral_monster_walk | lateral_monster_walk |
| Movilidad cadera con pierna contraria hacia un lado | 1 | 0 | 1 | unresolved | unresolved |
| Movilidad de cadera | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad de cadera y estiramientos | 1 | 0 | 1 | unresolved | unresolved |
| Movilidad de cadera y hombros | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad de columna | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad de hombro y escápula | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad de hombros | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad de tobillo | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad dinámica + ankle rock | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad dinámica + comprobación | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad dinámica + técnica de pies | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad dinámica completa | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad dinámica de brazos | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad dinámica de cadera en apoyo unilateral (nombre exacto pendiente) | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad dinámica de caderas | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad final lumbar/cadera | 1 | 0 | 1 | unresolved | unresolved |
| Movilidad front rack con pica | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad hombro en W | 1 | 0 | 1 | unresolved | unresolved |
| Movilidad hombro/dorsal con pared y pica | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad lateral | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad lumbar/cadera | 1 | 0 | 1 | unresolved | unresolved |
| Movilidad toracica | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad y estiramientos generales | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad y respiración | 1 | 0 | 0 | unresolved | unresolved |
| Movilidad y rotaciones habituales | 1 | 0 | 0 | unresolved | unresolved |
| movilidad/estiramiento de cadera de pie | 1 | 0 | 0 | unresolved | unresolved |
| One-arm kettlebell row left | 1 | 1 | 1 | unresolved | unresolved |
| One-arm kettlebell row right | 1 | 1 | 1 | unresolved | unresolved |
| Paladas lentas | 1 | 1 | 0 | unresolved | unresolved |
| Paladas r?pidas | 1 | 1 | 0 | unresolved | unresolved |
| Pallof con goma | 1 | 0 | 0 | unresolved | unresolved |
| Pallof hold | 1 | 0 | 0 | unresolved | unresolved |
| Pallof hold suave | 1 | 0 | 0 | unresolved | unresolved |
| Pallof monopodal con banda azul | 1 | 0 | 0 | unresolved | unresolved |
| Pallof Press | 1 | 0 | 0 | pallof_press | pallof_press |
| Pallof press / side plank rodillas | 1 | 1 | 0 | unresolved | unresolved |
| Pallof press con goma | 1 | 1 | 0 | unresolved | unresolved |
| Pallof press con goma doble | 1 | 1 | 0 | unresolved | unresolved |
| Pallof press con pasos | 1 | 1 | 0 | unresolved | unresolved |
| Paseo granjero con kettlebell | 1 | 0 | 1 | unresolved | unresolved |
| Paso lateral sobre valla + apoyo monopodal 90° | 1 | 0 | 0 | unresolved | unresolved |
| Pass-through con pica | 1 | 0 | 0 | unresolved | unresolved |
| Patadas hacia arriba con pierna doblada | 1 | 1 | 0 | unresolved | unresolved |
| Pelvic tilt tumbado | 1 | 1 | 1 | unresolved | unresolved |
| Peroneo con goma | 1 | 1 | 0 | unresolved | unresolved |
| Pike push-up | 1 | 1 | 0 | unresolved | pike_push_up |
| Plancha con arrastre de saco lado a lado | 1 | 1 | 0 | unresolved | unresolved |
| Plancha con empuje y tracción de saco | 1 | 1 | 0 | unresolved | unresolved |
| Plancha contralateral isométrica | 1 | 0 | 0 | unresolved | unresolved |
| Plancha lateral con piernas extendidas | 1 | 0 | 0 | unresolved | unresolved |
| Pogo bilateral bajo | 1 | 1 | 0 | unresolved | unresolved |
| Polea al pecho en caballero | 1 | 0 | 1 | unresolved | unresolved |
| Posici?n V / squat normal | 1 | 0 | 0 | unresolved | unresolved |
| Posición 90/90 con control respiratorio | 1 | 0 | 0 | unresolved | unresolved |
| Posición de caballero con respiraciones | 1 | 0 | 0 | unresolved | unresolved |
| Power swing con kettlebell | 1 | 0 | 1 | unresolved | unresolved |
| Presión con pierna estirada con pelota de Pilates | 1 | 0 | 0 | unresolved | unresolved |
| Press anti-rotación con goma roja | 1 | 1 | 0 | unresolved | unresolved |
| Press con banda elástica negra | 1 | 0 | 0 | unresolved | unresolved |
| Press con kettlebell y paso atrás | 1 | 0 | 1 | unresolved | unresolved |
| Press con mancuernas elevando ligeramente glúteo | 1 | 1 | 1 | unresolved | unresolved |
| Press en lunge con barra | 1 | 1 | 1 | unresolved | unresolved |
| Press frontal | 1 | 1 | 1 | unresolved | unresolved |
| Press frontal con wall ball + Step-Up alterno | 1 | 0 | 1 | unresolved | unresolved |
| Press inclinado alterno con mancuernas | 1 | 0 | 1 | unresolved | unresolved |
| press jerk con apertura/cierre de piernas | 1 | 1 | 1 | unresolved | unresolved |
| Press Pallof a una pierna | 1 | 1 | 0 | unresolved | unresolved |
| Puente con pelota | 1 | 1 | 0 | unresolved | unresolved |
| Puente de glúteo con pelota de tenis | 1 | 0 | 0 | unresolved | unresolved |
| Puente de glúteo de activación | 1 | 1 | 0 | unresolved | unresolved |
| Puente gluteo bilateral | 1 | 0 | 0 | unresolved | unresolved |
| Puente unilateral con pelota de tenis | 1 | 1 | 0 | unresolved | unresolved |
| Pull-up / high pull-up progression | 1 | 1 | 0 | unresolved | unresolved |
| Push press | 1 | 1 | 1 | unresolved | unresolved |
| Push press con dos mancuernas | 1 | 1 | 1 | unresolved | unresolved |
| Push-up | 1 | 1 | 0 | unresolved | unresolved |
| Push-up + empuje/tirón de saco | 1 | 1 | 1 | unresolved | unresolved |
| Push-ups / fondos | 1 | 0 | 0 | unresolved | unresolved |
| RDL / peso muerto con barra | 1 | 0 | 0 | unresolved | unresolved |
| Recuperación y normalización postural | 1 | 0 | 0 | unresolved | unresolved |
| Remo alto / high pull con componente de cadera | 1 | 1 | 1 | unresolved | unresolved |
| Remo alto con kettlebell | 1 | 1 | 1 | unresolved | unresolved |
| Remo apoyado tipo bird dog sobre cajón | 1 | 1 | 1 | unresolved | unresolved |
| Remo con barra | 1 | 1 | 1 | unresolved | unresolved |
| Remo con barra hexagonal / trap bar | 1 | 1 | 1 | unresolved | unresolved |
| Remo con goma | 1 | 1 | 1 | unresolved | unresolved |
| Remo en anillas o barra baja | 1 | 1 | 0 | unresolved | unresolved |
| Remo en anillas unilateral con brazo contrario extendido arriba | 1 | 1 | 0 | unresolved | unresolved |
| Remo en anillas/barra | 1 | 0 | 0 | unresolved | unresolved |
| Remo en lunge | 1 | 1 | 0 | unresolved | unresolved |
| Remo en polea con brazo largo | 1 | 0 | 0 | unresolved | unresolved |
| Remo en posición de lunge con kettlebell | 1 | 1 | 1 | unresolved | unresolved |
| remo ergómetro | 1 | 0 | 0 | rowing_ergometer | rowing_ergometer |
| Remo ergómetro 250 m | 1 | 0 | 0 | unresolved | unresolved |
| Remo inclinado unilateral con kettlebell | 1 | 1 | 1 | unresolved | unresolved |
| Remo supino | 1 | 1 | 1 | unresolved | unresolved |
| remo unilateral con apoyo en cajón | 1 | 1 | 1 | unresolved | unresolved |
| Remo unilateral con KB apoyado en banco | 1 | 0 | 1 | unresolved | unresolved |
| Remo unilateral en apoyo/plancha | 1 | 1 | 0 | unresolved | unresolved |
| remo unilateral en posición sumo con kettlebell | 1 | 1 | 1 | unresolved | unresolved |
| Remo/tirón inclinado – variación 4+4 | 1 | 1 | 0 | unresolved | unresolved |
| Respiracion | 1 | 0 | 0 | unresolved | unresolved |
| Respiración | 1 | 1 | 0 | unresolved | unresolved |
| Respiración / reset lumbar | 1 | 0 | 1 | unresolved | unresolved |
| Respiracion 90/90 con pies en pared/cajon | 1 | 1 | 0 | unresolved | unresolved |
| Respiración controlada | 1 | 0 | 0 | unresolved | unresolved |
| Respiración diafragmática / control respiratorio | 1 | 0 | 0 | unresolved | unresolved |
| Respiración tranquila | 1 | 1 | 1 | unresolved | unresolved |
| Respiración y movilidad suave | 1 | 0 | 0 | unresolved | unresolved |
| Reverse lunge corto | 1 | 1 | 0 | unresolved | unresolved |
| Ring row vertical opcional | 1 | 0 | 0 | unresolved | unresolved |
| Rings pull movement | 1 | 0 | 0 | unresolved | unresolved |
| Rock back de cadera | 1 | 1 | 1 | unresolved | unresolved |
| Rock back final | 1 | 1 | 1 | unresolved | unresolved |
| Rock-back de cadera | 1 | 1 | 0 | unresolved | unresolved |
| Rodilla a pared en caballero | 1 | 0 | 0 | unresolved | unresolved |
| Rotaci?n controlada en caballero | 1 | 0 | 0 | unresolved | unresolved |
| Rotación 90/90 con lift-offs | 1 | 0 | 0 | unresolved | unresolved |
| Rotación externa activa en 90/90 | 1 | 1 | 0 | unresolved | unresolved |
| Rotación externa con goma | 1 | 0 | 0 | unresolved | unresolved |
| Rotación externa con goma fina | 1 | 1 | 0 | unresolved | unresolved |
| Rotación externa de hombro | 1 | 1 | 0 | unresolved | unresolved |
| Rotación externa hombro | 1 | 1 | 1 | unresolved | unresolved |
| Rotación interna activa en 90/90 | 1 | 1 | 0 | unresolved | unresolved |
| Rotación interna con goma | 1 | 0 | 0 | unresolved | unresolved |
| Rotación interna de hombro | 1 | 1 | 0 | unresolved | unresolved |
| Rotación lateral / open book suave | 1 | 0 | 1 | unresolved | unresolved |
| Rotación torácica | 1 | 0 | 0 | unresolved | unresolved |
| Rotaciones atr?s sobre pared | 1 | 1 | 0 | unresolved | unresolved |
| Rotaciones con carga | 1 | 1 | 1 | unresolved | unresolved |
| Rotaciones de cadera | 1 | 0 | 0 | unresolved | unresolved |
| Rotaciones de cadera con pierna flexionada | 1 | 0 | 0 | unresolved | unresolved |
| Rotaciones de cadera en cuadrupedia | 1 | 1 | 0 | unresolved | unresolved |
| rotaciones generales | 1 | 0 | 0 | unresolved | unresolved |
| Rotaciones tumbado con pelvis/glúteo pegado | 1 | 0 | 1 | unresolved | unresolved |
| RowErg | 1 | 0 | 0 | unresolved | rowing_ergometer |
| Run interval | 1 | 0 | 0 | unresolved | unresolved |
| sandbag plank drag lateral | 1 | 1 | 1 | unresolved | unresolved |
| Scap pull-up | 1 | 0 | 0 | unresolved | scapular_pull_up |
| Scap pull-up opcional | 1 | 0 | 0 | unresolved | unresolved |
| Scap pull-ups | 1 | 1 | 0 | unresolved | scapular_pull_up |
| Scaption / elevación en plano escapular | 1 | 0 | 1 | unresolved | unresolved |
| Sentadilla + press adelante | 1 | 0 | 1 | unresolved | unresolved |
| Sentadilla + remo con kettlebell | 1 | 1 | 0 | unresolved | unresolved |
| Sentadilla asistida en poste/barra | 1 | 1 | 0 | unresolved | unresolved |
| Sentadilla con dos mancuernas | 1 | 1 | 1 | unresolved | unresolved |
| Sentadilla con pelota al frente | 1 | 1 | 1 | unresolved | unresolved |
| Sentadilla con press frontal y lateral | 1 | 1 | 1 | unresolved | unresolved |
| Sentadilla con remo / tirón alto | 1 | 1 | 0 | unresolved | unresolved |
| Sentadilla con salto | 1 | 1 | 0 | unresolved | unresolved |
| Sentadilla controlada | 1 | 1 | 0 | unresolved | unresolved |
| Sentadilla goblet | 1 | 1 | 1 | unresolved | goblet_squat |
| Sentadilla goblet a silla | 1 | 1 | 1 | unresolved | unresolved |
| Sentadilla isométrica con KB al frente | 1 | 0 | 1 | unresolved | unresolved |
| Sentadilla isométrica con KB brazos extendidos | 1 | 0 | 1 | unresolved | unresolved |
| Sentadilla sin peso | 1 | 1 | 0 | unresolved | unresolved |
| Sentadilla Zercher | 1 | 1 | 0 | unresolved | unresolved |
| Sentadillas laterales | 1 | 0 | 0 | unresolved | unresolved |
| Shoulder wall mobility / line drill | 1 | 0 | 0 | unresolved | unresolved |
| shuttle con step-up al cajón | 1 | 0 | 0 | unresolved | unresolved |
| Shuttle run 8 m | 1 | 0 | 1 | unresolved | unresolved |
| shuttle sin cajón con giro/salida | 1 | 0 | 0 | unresolved | unresolved |
| Side plank | 1 | 0 | 0 | unresolved | side_plank |
| Side plank rodillas | 1 | 0 | 1 | unresolved | kneeling_side_plank |
| Skipping bajo | 1 | 0 | 0 | unresolved | unresolved |
| Sóleo - variantes de pie y sentado | 1 | 0 | 1 | unresolved | unresolved |
| Sóleo sentado | 1 | 1 | 1 | unresolved | unresolved |
| Sóleo sentado técnico | 1 | 1 | 0 | unresolved | unresolved |
| Sóleo unilateral con rodilla flexionada | 1 | 1 | 1 | unresolved | unresolved |
| Soporte en anillas | 1 | 0 | 0 | unresolved | unresolved |
| Soporte en paralelas | 1 | 0 | 0 | unresolved | unresolved |
| Split squat en posición fija | 1 | 1 | 1 | unresolved | unresolved |
| Split squat estático + curl de bíceps | 1 | 0 | 1 | unresolved | unresolved |
| Split squat sin carga de preparación | 1 | 1 | 0 | unresolved | unresolved |
| Split stance hold | 1 | 0 | 0 | unresolved | unresolved |
| Squat hold / cuclilla asistida con talones elevados | 1 | 0 | 1 | unresolved | unresolved |
| Step-down lento | 1 | 1 | 0 | unresolved | unresolved |
| Step-up al cajón | 1 | 1 | 1 | unresolved | unresolved |
| step-up al cajón sin peso | 1 | 1 | 0 | unresolved | unresolved |
| Step-up con KB ipsilateral | 1 | 0 | 1 | unresolved | unresolved |
| Step-up con rodilla arriba y descenso lento | 1 | 1 | 0 | unresolved | unresolved |
| Step-up lateral al cajón con rodilla arriba y kettlebell en goblet | 1 | 1 | 1 | unresolved | unresolved |
| Step-ups | 1 | 0 | 0 | unresolved | unresolved |
| Suitcase carry unilateral | 1 | 0 | 1 | unresolved | unresolved |
| Supine neutral row to chest | 1 | 0 | 0 | unresolved | unresolved |
| Swing kettlebell | 1 | 0 | 1 | unresolved | kettlebell_swing |
| Thruster | 1 | 1 | 0 | unresolved | unresolved |
| Thruster con mancuernas | 1 | 0 | 1 | unresolved | unresolved |
| Tirón con goma tipo SkiErg | 1 | 1 | 0 | unresolved | unresolved |
| Trabajo de control postural | 1 | 0 | 0 | unresolved | unresolved |
| Trabajo en plancha con empuje alterno | 1 | 1 | 0 | unresolved | unresolved |
| Trabajo t?cnico con kettlebell | 1 | 0 | 1 | unresolved | unresolved |
| Transición de muscle-up en anillas asistida | 1 | 0 | 1 | unresolved | unresolved |
| Transiciones 90/90 | 1 | 1 | 1 | unresolved | unresolved |
| Transiciones 90/90 de cadera | 1 | 1 | 0 | unresolved | unresolved |
| Transiciones muscle-up asistidas en anillas | 1 | 0 | 0 | unresolved | unresolved |
| trineo | 1 | 0 | 0 | unresolved | unresolved |
| Trineo empuje | 1 | 0 | 1 | unresolved | unresolved |
| Trineo tirón tipo remo bajo | 1 | 0 | 1 | unresolved | unresolved |
| Trote muy cómodo | 1 | 0 | 0 | unresolved | unresolved |
| Vallas frontales y laterales | 1 | 0 | 0 | unresolved | unresolved |
| Vuelos con 5 kg | 1 | 0 | 1 | unresolved | unresolved |
| Vuelta a la calma | 1 | 0 | 0 | unresolved | unresolved |
| Wall ball | 1 | 1 | 1 | wall_ball | wall_ball |
| Wall ball con rotaciones | 1 | 0 | 1 | unresolved | unresolved |
| Wall ball press hacia adelante con paso lateral | 1 | 0 | 1 | unresolved | unresolved |
| Wall ball tipo leñador lateral-arriba | 1 | 1 | 1 | unresolved | unresolved |
| Wall shoulder drill tipo W | 1 | 0 | 0 | unresolved | unresolved |
| Wall slide - activación | 1 | 0 | 0 | unresolved | unresolved |
| Wall slide en pared | 1 | 1 | 0 | unresolved | unresolved |
| Wall slides / deslizamientos tumbado | 1 | 1 | 1 | unresolved | unresolved |
| Wall walk / handstand hold | 1 | 0 | 0 | unresolved | unresolved |
| Zancada atrás | 1 | 1 | 0 | unresolved | unresolved |
| Zancada controlada | 1 | 1 | 0 | unresolved | unresolved |
| Zancadas caminando con dos kettlebells | 1 | 1 | 1 | unresolved | unresolved |
| Zancadas caminando en goblet | 1 | 0 | 1 | unresolved | unresolved |
