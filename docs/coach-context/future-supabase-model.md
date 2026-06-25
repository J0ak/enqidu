# Future Supabase Model

Este documento describe candidatas futuras. No crea migraciones ni tablas.

## Tablas candidatas futuras

- `coach_profiles`
- `training_goals`
- `athlete_constraints`
- `equipment_locations`
- `equipment_items`
- `weekly_availability`
- `coach_context_snapshots`
- `coach_recommendations`
- `planned_training_sessions`
- `planned_session_blocks`
- `planned_session_exercises`
- `training_sessions`
- `coach_conversation_enrichments`

## Criterio de persistencia

Supabase guardara datos vivos, editables y por usuario.

Markdown guardara reglas de producto.

JSON references guardara fixtures y contratos historicos.

## Regla de este PR

No crear ninguna tabla. No tocar migraciones. No cambiar RPCs.

