---
name: inventory
description: Inventario de un repositorio para la oficina: identidad, función, entorno y comandos verificados, calidad, integraciones, git, despliegue, contexto y dependencias. Produce docs/oficina/REPO.md y docs/oficina/areas/<área>.md con el mapa real de cada especialidad. Es la primera misión de cada repo. Úsalo con /oficina:inventory.
disable-model-invocation: true
---

# Inventario del repositorio

Parte determinista (detectada por script, sin suposiciones):

```!
bash "${CLAUDE_PLUGIN_ROOT}/scripts/inventory.sh" . 2>/dev/null || echo "inventory.sh no pudo ejecutarse"
```

## Pasos

1. **Verifica los comandos detectados** ejecutándolos con `oficina-run --label inventory -- <comando>`: instalación, typecheck, lint, pruebas, build. Anota cuáles funcionan, cuánto tardan y cuáles fallan (con la causa real, no supuesta). No instales herramientas globales; si falta algo, repórtalo.
2. **Identidad y función**: nombre real, remoto, rama por defecto y de producción (consulta `gh repo view` y protecciones si `gh` está autenticado), qué producto o componente contiene, en una o dos frases basadas en el código.
3. **Calidad**: pruebas existentes por tipo, recorridos críticos sin cubrir, CI configurada.
4. **Integraciones**: servicios externos (por nombres de variables de entorno, nunca valores), MCP (`.mcp.json`), Vercel/Supabase (`vercel.json`, `supabase/`).
5. **Despliegue**: dev, staging y producción tal como están configurados realmente; si no hay staging, dilo.
6. **Contexto**: `CLAUDE.md`, ADRs, `graphify-out/` (y si no hay índice, crea uno con `graphify update .` si `graphify` está instalado; si no, dilo).
7. **Dependencias con otros repos**: clientes, SDKs internos, contratos compartidos.
8. **Mapa por especialidad**: para cada área (`memoria`, `voz`, `computer-use`, `backend`, `frontend`, `calidad`) escribe `docs/oficina/areas/<área>.md` con la plantilla `${CLAUDE_PLUGIN_ROOT}/templates/area.md`: dónde vive el código del área, módulos clave, decisiones vigentes, comandos y pruebas del área, riesgos, referencias. Si el área no existe en este repo, escribe el archivo diciendo "no aplica en este repo" y por qué.
9. Escribe `docs/oficina/REPO.md` con la plantilla `${CLAUDE_PLUGIN_ROOT}/templates/REPO.md`. Marca como **desconocido** lo que no pudiste comprobar.
10. Si no existe `CLAUDE.md`, propón uno breve a partir de `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md.template` (comandos verificados, convenciones observadas, enlaces a `docs/oficina/`). Si existe, no lo reescribas: propón añadidos en `## Siguientes pasos`.
11. Commitea en la rama de misión y cierra con `/oficina:evidence`.
