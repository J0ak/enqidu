# ADR-003: Supabase Later for Live User Data

## Estado

Aceptada.

## Contexto

Supabase ya existe en la app, pero el modelo de coach-context todavia debe
cerrarse.

## Decision

No migrar todavia perfil, inventario ni objetivos a Supabase.

## Motivo

Primero hay que cerrar modelo y contratos.

## Consecuencias

- No se crean tablas en este PR.
- Supabase quedara reservado para datos vivos, editables y por usuario.
- Markdown y JSON cubren la fase de arquitectura.

