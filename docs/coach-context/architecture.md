# Coach Context Architecture v0

ENQIDU se disena como aplicacion generica de entrenamiento y coach. Los datos
Jotason sirven para aprender, validar y probar, pero no definen el producto.

## Capas

1. Product layer

Reglas genericas ENQIDU. Incluye conceptos como atleta, objetivos, restricciones,
disponibilidad, ubicacion, inventario por ubicacion, planned, executed y coach log.

2. Reference layer

JSON historicos y contratos Jotason. Son conocimiento versionado para diseno de
modelo, no runtime productivo.

3. Fixture layer

Sesiones reales de ejemplo. Sirven para validar normalizacion, render futuro y
tests posteriores.

4. Adapter layer future

Normalizadores/loaders JavaScript que leeran JSON historicos y produciran modelos
genericos ENQIDU. Esta capa no se crea en este PR.

5. Persistence layer future

Supabase guardara datos vivos, editables y por usuario. No se crean tablas ni
migraciones en este PR.

6. AI layer future

Coach integrado que consumira contexto normalizado, planned, executed, coach logs
y reglas de producto.

## Responsabilidades

- Markdown: decisiones humanas, arquitectura y reglas.
- JSON existente: datos, contratos y fixtures de referencia.
- JavaScript: adaptadores futuros.
- Supabase: datos vivos futuros.
- Pydantic: solo si existe un backend Python futuro.
- Zod: posible validacion TypeScript futura, despues de tener adaptadores reales.

## Regla principal

Jotason data can instantiate the model, but must not define the model.

