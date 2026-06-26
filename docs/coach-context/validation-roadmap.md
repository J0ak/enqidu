# Validation Roadmap

## Fase 0: Markdown + JSON existentes

Documentar arquitectura, reglas, decisiones y manifiesto. Preservar JSON fuente
cuando existan. No modificar runtime.

## Fase 1: adaptadores JavaScript

Crear loaders/normalizers que lean referencias y fixtures y produzcan modelos
genericos ENQIDU.

## Fase 2: tests de normalizacion

Usar fixtures Jotason para probar normalizacion, reconciliacion y render models.

## Fase 3: materializacion normalized JSON

Generar JSON normalizados ENQIDU desde raw references/fixtures con adapters
JavaScript reproducibles.

## Fase 4: Zod opcional para TypeScript/Edge

Evaluar Zod cuando existan adaptadores JS reales y superficies TypeScript que
validar.

## Fase 5: Supabase para datos vivos

Persistir solo datos vivos, editables y por usuario.

## Fase 6: Pydantic solo si hay backend Python IA

Pydantic solo tiene sentido si ENQIDU incorpora un backend Python de IA.

## Regla

No anadir Pydantic ahora. No anadir Zod ahora. No anadir dependencias en este
PR.

