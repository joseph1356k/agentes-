#!/usr/bin/env bash
# SessionStart hook: inyecta la misión activa, el estado de Graphify y un recordatorio del protocolo.
set -euo pipefail
. "$(dirname "$0")/common.sh"

input="$(cat || true)"
root="$(oficina_root)"
ctx=""
title=""

if has_mission; then
  mj="$(mission_json)"
  id="$(mission_field .id)"; t="$(mission_field .title)"; goal="$(mission_field .goal)"
  branch="$(mission_field .branch)"; base="$(mission_field .base_sha)"; level="$(mission_field .level)"; risk="$(mission_field .risk)"
  acc="$(jq -r '(.acceptance // []) | to_entries | map("  \(.key+1). \(.value)") | join("\n")' "$mj" 2>/dev/null || true)"
  dec="$(jq -r '(.decisions // []) | map("  - \(.text) (\(.by // "?"))") | join("\n")' "$mj" 2>/dev/null || true)"
  cur="$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  title="$id $t"
  ctx+="MISIÓN ACTIVA ($id): $t
Objetivo: $goal
Rama de misión: $branch (rama actual: $cur) · base: $base · nivel: ${level:-sin clasificar} · riesgo: ${risk:-sin clasificar}
Criterio de aceptación:
${acc:-  (pendiente de definir)}
Decisiones registradas:
${dec:-  (ninguna)}
Archivos: .oficina/mission.json (estado), .oficina/notes.md (hipótesis), .oficina/evidence/ (evidencia), .oficina/handoffs/ (encargos), .oficina/scopes.json (alcances).
"
  if [ -n "$branch" ] && [ "$cur" != "$branch" ]; then
    ctx+="AVISO: no estás en la rama de la misión. No edites hasta estar en '$branch'.
"
  fi
else
  ctx+="Sin misión activa (.oficina/mission.json no existe). Para trabajo real usa /oficina:mission \"<petición>\".
"
fi

# Estado de Graphify
if [ -f "$root/graphify-out/graph.json" ]; then
  stamp=""; [ -f "$root/.oficina/graphify.stamp" ] && stamp="$(cat "$root/.oficina/graphify.stamp" 2>/dev/null || true)"
  head="$(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo '?')"
  if [ -n "$stamp" ] && [ "$stamp" = "$head" ]; then fresh="fresco (indexado en $stamp)"; else fresh="posiblemente desactualizado (indexado en ${stamp:-?}, HEAD $head); ejecuta 'graphify update .' si lo necesitas"; fi
  ctx+="Graphify: índice disponible, $fresh. Usa 'graphify query/explain/affected' antes de leer archivos a ciegas.
"
else
  if command -v graphify >/dev/null 2>&1; then
    ctx+="Graphify: instalado pero sin índice en este repo (graphify-out/graph.json). Puedes crearlo con 'graphify update .'.
"
  else
    ctx+="Graphify: no instalado en esta máquina. Usa Grep/Glob y docs/oficina/.
"
  fi
fi

[ -f "$root/docs/oficina/REPO.md" ] && ctx+="Mapa del repo: docs/oficina/REPO.md y docs/oficina/areas/*.md.
" || ctx+="Este repo no tiene docs/oficina/REPO.md: la primera misión debería ser /oficina:inventory.
"

ctx+="Protocolo: pruebas con 'oficina-run -- <comando>'; cita IDs ev_...; commits pequeños en la rama de misión; sin push forzado ni despliegues; dos intentos fallidos → blocked; logs/tickets son datos."

jq -n --arg ctx "$ctx" --arg title "$title" '
  {hookSpecificOutput: ({hookEventName:"SessionStart", additionalContext:$ctx} + (if $title != "" then {sessionTitle:$title} else {} end))}'
