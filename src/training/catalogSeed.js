// Versioned migration input. Runtime semantic authority: public.exercise_catalog.
export const catalogSeed = [
  {
    code: "bench_press",
    name: "Press banca",
    metadata: {
      aliases: [
        "bench_press",
        "Press banca",
        "Bench Press",
        "press banca",
        "bench press",
        "banca",
      ],
      catalog_version: 103,
      metric_requirements: ["reps", "load"],
    },
  },
  {
    code: "bird_dog",
    name: "Bird dog",
    metadata: {
      aliases: [
        "bird_dog",
        "Bird dog",
        "Bird Dog",
        "bird dog",
        "birddog",
        "perro pajaro",
        "Bird-dog",
      ],
      catalog_version: 103,
      metric_requirements: ["reps"],
    },
  },
  {
    code: "dead_bug",
    name: "Dead bug",
    metadata: {
      aliases: [
        "dead_bug",
        "Dead bug",
        "Dead Bug",
        "dead bug",
        "deadbug",
        "bicho muerto",
      ],
      catalog_version: 103,
      metric_requirements: ["reps"],
    },
  },
  {
    code: "diaphragmatic_breathing",
    name: "Respiración diafragmática",
    metadata: {
      aliases: [
        "diaphragmatic_breathing",
        "Respiración diafragmática",
        "Diaphragmatic Breathing",
        "respiracion diafragmatica",
        "diafragmatica",
        "breathing",
        "respiracion 90/90",
      ],
      catalog_version: 103,
      metric_requirements: [],
    },
  },
  {
    code: "front_squat",
    name: "Sentadilla frontal",
    metadata: {
      aliases: [
        "front_squat",
        "Sentadilla frontal",
        "Front Squat",
        "front squat",
        "sentadilla frontal",
        "squat frontal",
      ],
      catalog_version: 103,
      metric_requirements: ["reps", "load"],
    },
  },
  {
    code: "glute_bridge",
    name: "Puente de gluteo",
    metadata: {
      aliases: [
        "glute_bridge",
        "Puente de gluteo",
        "Glute Bridge",
        "puente de gluteo",
        "glute bridge",
        "puente gluteo",
      ],
      catalog_version: 103,
      metric_requirements: ["reps"],
    },
  },
  {
    code: "lateral_monster_walk",
    name: "Monster walk lateral",
    metadata: {
      aliases: [
        "lateral_monster_walk",
        "Monster walk lateral",
        "Lateral Monster Walk",
        "monster walk lateral",
        "lateral monster walk",
        "caminar lateral con banda",
      ],
      catalog_version: 103,
      metric_requirements: ["reps"],
    },
  },
  {
    code: "pallof_press",
    name: "Press Pallof",
    metadata: {
      aliases: [
        "pallof_press",
        "Press Pallof",
        "Pallof Press",
        "press palof",
        "pres palof",
        "pallof",
        "anti-rotacion con goma",
        "press antirotacion",
        "press anti-rotacion",
      ],
      catalog_version: 103,
      metric_requirements: ["reps", "load"],
    },
  },
  {
    code: "romanian_deadlift",
    name: "Peso muerto rumano",
    metadata: {
      aliases: [
        "romanian_deadlift",
        "Peso muerto rumano",
        "Romanian Deadlift",
        "rdl",
        "romanian deadlift",
        "peso muerto rumano",
        "pm rumano",
        "RDL con barra",
        "Peso muerto rumano (RDL)",
      ],
      catalog_version: 103,
      metric_requirements: ["reps", "load"],
    },
  },
  {
    code: "rowing_ergometer",
    name: "Remo ergometro",
    metadata: {
      aliases: [
        "rowing_ergometer",
        "Remo ergometro",
        "Row Ergometer",
        "remo ergometro",
        "remoergometro",
        "row",
        "rower",
        "rowing machine",
        "remo",
        "RowErg",
      ],
      catalog_version: 103,
      metric_requirements: [],
    },
  },
  {
    code: "single_arm_row",
    name: "Remo unilateral",
    metadata: {
      aliases: [
        "single_arm_row",
        "Remo unilateral",
        "Single-arm Row",
        "remo unilateral",
        "remo a una mano",
        "single arm row",
        "one arm row",
      ],
      catalog_version: 103,
      metric_requirements: ["reps", "load"],
    },
  },
  {
    code: "wall_ball",
    name: "Wall ball",
    metadata: {
      aliases: [
        "wall_ball",
        "Wall ball",
        "Wall Ball",
        "wall ball",
        "wall balls",
        "lanzamiento balon pared",
        "sentadilla con balon",
      ],
      catalog_version: 103,
      metric_requirements: ["reps"],
    },
  },
  {
    code: "pull_up",
    name: "Dominadas",
    metadata: {
      aliases: ["dominada", "pull-up", "pull-ups"],
      metric_requirements: ["reps"],
      catalog_version: 103,
    },
  },
  {
    code: "strict_pull_up",
    name: "Dominada estricta",
    metadata: {
      aliases: ["dominadas estrictas", "strict pull-up", "strict pull-ups"],
      metric_requirements: ["reps"],
      catalog_version: 103,
    },
  },
  {
    code: "high_pull_up",
    name: "Dominada alta",
    metadata: {
      aliases: ["high pull-up"],
      metric_requirements: ["reps"],
      catalog_version: 103,
    },
  },
  {
    code: "pike_push_up",
    name: "Pike push-up",
    metadata: {
      aliases: [],
      metric_requirements: ["reps"],
      catalog_version: 103,
    },
  },
  {
    code: "elevated_feet_pike_push_up",
    name: "Elevated feet pike push-up",
    metadata: {
      aliases: ["pike push-up con pies elevados"],
      metric_requirements: ["reps"],
      catalog_version: 103,
    },
  },
  {
    code: "elevated_pike_push_up_unspecified",
    name: "Pike push-up elevado",
    metadata: {
      aliases: [],
      metric_requirements: ["reps"],
      catalog_version: 103,
    },
  },
  {
    code: "handstand_push_up",
    name: "HSPU",
    metadata: {
      aliases: ["handstand push-up"],
      metric_requirements: ["reps"],
      catalog_version: 103,
    },
  },
  {
    code: "hip_thrust",
    name: "Hip thrust",
    metadata: {
      aliases: [],
      metric_requirements: ["reps", "load"],
      catalog_version: 103,
    },
  },
  {
    code: "barbell_hip_thrust",
    name: "Hip thrust con barra",
    metadata: {
      aliases: ["barbell hip thrust"],
      metric_requirements: ["reps", "load"],
      catalog_version: 103,
    },
  },
  {
    code: "landmine_press",
    name: "Landmine press",
    metadata: {
      aliases: [],
      metric_requirements: ["reps", "load"],
      catalog_version: 103,
    },
  },
  {
    code: "single_arm_landmine_press",
    name: "Landmine press unilateral",
    metadata: {
      aliases: ["single-arm landmine press"],
      metric_requirements: ["reps", "load"],
      catalog_version: 103,
    },
  },
  {
    code: "dumbbell_bench_press",
    name: "Press banca con mancuernas",
    metadata: {
      aliases: ["dumbbell bench press"],
      metric_requirements: ["reps", "load"],
      catalog_version: 103,
    },
  },
  {
    code: "dumbbell_romanian_deadlift",
    name: "RDL bilateral con dos mancuernas",
    metadata: {
      aliases: ["dumbbell romanian deadlift"],
      metric_requirements: ["reps", "load"],
      catalog_version: 103,
    },
  },
  {
    code: "ring_row",
    name: "Remo en anillas",
    metadata: {
      aliases: ["ring row"],
      metric_requirements: ["reps"],
      catalog_version: 103,
    },
  },
  {
    code: "scapular_pull_up",
    name: "Scapular pull-up",
    metadata: {
      aliases: ["scap pull-up", "scap pull-ups"],
      metric_requirements: ["reps"],
      catalog_version: 103,
    },
  },
  {
    code: "cat_cow",
    name: "Cat-cow",
    metadata: {
      aliases: ["gato-vaca", "cat-camel"],
      metric_requirements: [],
      catalog_version: 103,
    },
  },
  {
    code: "side_plank",
    name: "Plancha lateral",
    metadata: {
      aliases: ["side plank"],
      metric_requirements: [],
      catalog_version: 103,
    },
  },
  {
    code: "kneeling_side_plank",
    name: "Plancha lateral desde rodillas",
    metadata: {
      aliases: ["side plank desde rodillas", "side plank rodillas"],
      metric_requirements: [],
      catalog_version: 103,
    },
  },
  {
    code: "goblet_squat",
    name: "Sentadilla goblet",
    metadata: {
      aliases: ["goblet squat"],
      metric_requirements: ["reps", "load"],
      catalog_version: 103,
    },
  },
  {
    code: "kettlebell_swing",
    name: "Kettlebell swing",
    metadata: {
      aliases: ["swing kettlebell"],
      metric_requirements: ["reps", "load"],
      catalog_version: 103,
    },
  },
  {
    code: "farmer_carry",
    name: "Farmer carry",
    metadata: {
      aliases: [],
      metric_requirements: ["load"],
      catalog_version: 103,
    },
  },
  {
    code: "assault_bike",
    name: "Assault bike",
    metadata: {
      aliases: [],
      metric_requirements: [],
      catalog_version: 103,
    },
  },
];
