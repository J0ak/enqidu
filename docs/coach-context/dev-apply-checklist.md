# Coach Context Dev Apply Checklist

- [ ] Estoy en entorno dev.
- [ ] No estoy en produccion.
- [ ] Tengo backup/snapshot.
- [ ] He revisado la migracion.
- [ ] He revisado RLS.
- [ ] He confirmado que no toca Garmin/FIT.
- [ ] He ejecutado `npm run coach:supabase:dev-preflight`.
- [ ] He generado `docs/coach-context/generated/dev-apply-verification.sql`.
- [ ] He aplicado solo la migracion.
- [ ] He verificado tablas `coach_*`.
- [ ] He verificado policies.
- [ ] He verificado que fixtures no son publicos.
- [ ] He confirmado que tablas `coach_*` estan vacias antes de seed.
- [ ] No he ejecutado seed.
- [ ] He documentado resultados.

