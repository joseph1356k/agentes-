# ADR-009 · Graphify local por repo, incremental, con stamp de frescura

Estado: accepted (confirmar que es la herramienta que el equipo usa) · 2026-10-01

## Hechos
`graphifyy` 0.9.73 instalado y verificado: `graphify update <ruta>` (sin LLM), `query`, `explain`, `affected`, `path`, `god-nodes`, `install --platform claude`, servidor `graphify-mcp`. Salida en `graphify-out/`.

## Decisión
Índice local por repo en cada ejecutor (`graphify-out/` ignorado en git); el ejecutor lo actualiza antes de cada misión si `.oficina/graphify.stamp` ≠ HEAD; el hook `SessionStart` informa frescura o ausencia; los playbooks indican consultar el grafo antes de leer archivos a ciegas. MCP opcional por repo.

## Consecuencias
Sin Graphify instalado los agentes usan Grep/Glob y `docs/oficina/` (sin inventar herramientas). Debe confirmarse que "Graphify" del equipo no es su propio proyecto `Graph` (repos `joseph1356k/Graph`, `ZevCorp/Graph`).
