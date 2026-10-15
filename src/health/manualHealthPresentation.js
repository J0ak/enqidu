import { GARMIN_MEASUREMENT_FIELDS } from './garminAdapter.js';
export const manualFamilyNames = { daily_health: 'Resumen diario', sleep: 'Sueño', hrv: 'VFC', stress: 'Estrés', body_battery: 'Body Battery', heart_rate: 'Frecuencia cardíaca', spo2: 'SpO₂', respiration: 'Respiración' };
const labels = {
  total_duration_seconds:'Duración del sueño',deep_sleep_seconds:'Sueño profundo',light_sleep_seconds:'Sueño ligero',rem_sleep_seconds:'Sueño REM',awake_seconds:'Tiempo despierto',unmeasurable_seconds:'Tiempo sin medición',sleep_score:'Puntuación de sueño',restless_moments_count:'Momentos de inquietud',
  avg_sleep_heart_rate_bpm:'Pulso medio durante el sueño',resting_heart_rate_bpm:'Pulso en reposo',min_heart_rate_bpm:'Pulso mínimo',max_heart_rate_bpm:'Pulso máximo',
  body_battery_change:'Cambio de Body Battery',body_battery_current:'Body Battery',body_battery_charged:'Body Battery cargada',body_battery_drained:'Body Battery consumida',
  spo2_avg_pct:'SpO₂ media',spo2_min_pct:'SpO₂ mínima',respiration_avg_brpm:'Respiración media',respiration_min_brpm:'Respiración mínima',
  hrv_last_night_avg_ms:'VFC nocturna media',hrv_last_night_5min_high_ms:'VFC máxima en 5 minutos',last_night_avg_ms:'VFC nocturna media',last_night_5min_high_ms:'VFC máxima en 5 minutos',skin_temperature_change_c:'Cambio de temperatura de la piel',
  average_stress_level:'Estrés medio',max_stress_level:'Estrés máximo',steps:'Pasos',intensity_minutes:'Minutos de intensidad',active_kcal:'Calorías activas',bmr_kcal:'Calorías basales',distance_m:'Distancia',active_time_seconds:'Tiempo activo',moderate_intensity_seconds:'Intensidad moderada',vigorous_intensity_seconds:'Intensidad vigorosa',steps_goal:'Objetivo de pasos',intensity_goal_seconds:'Objetivo de intensidad',stress_duration_seconds:'Tiempo con estrés',rest_stress_duration_seconds:'Tiempo en reposo',activity_stress_duration_seconds:'Tiempo de actividad',low_stress_duration_seconds:'Estrés bajo',medium_stress_duration_seconds:'Estrés medio',high_stress_duration_seconds:'Estrés alto',
};
const units = { heart_rate:'bpm',respiration:'resp/min',score:'/100',battery_accumulation:'puntos',count:'',minutes:'min',seconds:'s',milliseconds:'ms',distance:'m',percent:'%',energy:'kcal',celsius:'°C' };
export function manualMetricPresentation(family, metric) {
  const descriptor=GARMIN_MEASUREMENT_FIELDS[family]?.[metric];
  return {label:labels[metric] || metric.replaceAll('_',' '),unit:descriptor ? units[descriptor[0]] : ''};
}
