#!/usr/bin/env bash
# Evals estáticas de la oficina: consistencia entre kit, ejecutor, esquema y docs. Sin modelo; corren en CI.
#   bash evals/static.sh [--full]     (--full añade typecheck/pruebas del ejecutor y del dashboard)
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
kit="$root/office-kit"
fail=0; n=0
ok()   { n=$((n+1)); printf 'ok   %s\n' "$1"; }
bad()  { n=$((n+1)); fail=$((fail+1)); printf 'FAIL %s\n' "$1"; }
check(){ if eval "$2" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }

# 1. Plugin válido
check "plugin valida en modo estricto" "claude plugin validate '$kit' --strict"

# 2. Cada agente tiene modelo, descripción y sección de retorno
for a in "$kit"/agents/*.md; do
  name="$(basename "$a" .md)"
  grep -q '^model:' "$a" && grep -q '^description:' "$a" || bad "agente $name: falta model o description"
  case "$name" in
    tech-lead) grep -q '## 11. Al terminar' "$a" && ok "agente $name: cierre con informe" || bad "agente $name: falta la sección 'Al terminar'" ;;
    revisor)   grep -q '## Veredicto' "$a" && ok "agente $name: formato de veredicto" || bad "agente $name: falta '## Veredicto'" ;;
    *)         grep -q '## Retorno (obligatorio)' "$a" && ok "agente $name: retorno obligatorio" || bad "agente $name: falta '## Retorno (obligatorio)'" ;;
  esac
done

# 3. Las skills referenciadas existen (frontmatter skills: y menciones /oficina:<x>)
for s in $(grep -rhoE '^\s*-\s*oficina:[a-z-]+' "$kit"/agents/*.md | sed -E 's/.*oficina://' | sort -u); do
  [ -f "$kit/skills/$s/SKILL.md" ] && ok "skill precargada existe: $s" || bad "skill precargada no existe: $s"
done
for s in $(grep -rhoE '/oficina:[a-z-]+' "$kit"/agents "$kit"/skills "$root"/docs "$root"/README.md | sed 's#/oficina:##' | grep -vE -- '-$' | sort -u); do
  [ -f "$kit/skills/$s/SKILL.md" ] && ok "skill mencionada existe: $s" || bad "skill mencionada no existe: $s"
done
for s in "$kit"/skills/*/; do
  [ -f "$s/SKILL.md" ] && grep -q '^name:' "$s/SKILL.md" && grep -q '^description:' "$s/SKILL.md" || bad "skill $(basename "$s"): falta SKILL.md con name/description"
done

# 4. Herramientas de la oficina: el ejecutor y los prompts nombran las mismas
tools_ts="$(grep -oE "mcp__oficina__[a-z_]+" "$root/executor/src/office-tools.ts" | sed 's/mcp__oficina__//' | sort -u)"
for t in $tools_ts; do
  grep -q "\`$t\`\|$t" "$kit/agents/tech-lead.md" && grep -q "$t" "$kit/skills/protocolo/SKILL.md" && ok "herramienta documentada: $t" || bad "herramienta no documentada en tech-lead/protocolo: $t"
done
for t in $(grep -oE '`(mission_get|plan_set|acceptance_set|decision_record|learning_record|child_mission_create|review_request|attention|[a-z_]+_record|[a-z_]+_set)`' "$kit/agents/tech-lead.md" | tr -d '`' | sort -u); do
  echo "$tools_ts" | grep -qx "$t" && ok "herramienta del prompt existe en el ejecutor: $t" || bad "el prompt nombra una herramienta que el ejecutor no expone: $t"
done

# 5. Esquema del informe y tipos del ejecutor/dashboard coinciden en los estados
check "mission-result.schema.json es JSON válido" "jq -e . '$kit/schemas/mission-result.schema.json'"
for st in completed partial blocked failed; do
  grep -q "'$st'" "$root/executor/src/types.ts" && ok "estado de informe en types.ts: $st" || bad "estado de informe ausente en types.ts: $st"
done
enum_values() { sed -n "/create type $1 as enum/,\$p" "$root/supabase/migrations/0001_oficina.sql" | sed '/);/q' | grep -oE "'[a-z_]+'" | tr -d "'" | sort; }
sql_states="$(enum_values mission_status)"
ts_states="$(sed -n '/export type MissionStatus =/,/;/p' "$root/executor/src/types.ts" | grep -oE "'[a-z_]+'" | tr -d "'" | sort)"
dash_states="$(sed -n '/export type MissionStatus =/,/;/p' "$root/dashboard/lib/types.ts" | grep -oE "'[a-z_]+'" | tr -d "'" | sort)"
[ "$sql_states" = "$ts_states" ] && ok "estados SQL = estados ejecutor" || bad "estados SQL ≠ estados ejecutor"
[ "$sql_states" = "$dash_states" ] && ok "estados SQL = estados dashboard" || bad "estados SQL ≠ estados dashboard"
sql_kinds="$(enum_values mission_kind)"
ts_kinds="$(grep -E "export type MissionKind" "$root/executor/src/types.ts" | grep -oE "'[a-z_]+'" | tr -d "'" | sort)"
[ "$sql_kinds" = "$ts_kinds" ] && ok "tipos de misión SQL = ejecutor" || bad "tipos de misión SQL ≠ ejecutor"
for k in $sql_kinds; do [ "$k" = triage ] || [ "$k" = verify ] || [ "$k" = research ] || grep -q "value=\"$k\"" "$root/dashboard/app/missions/new/page.tsx" && ok "tipo en intake del dashboard: $k" || bad "tipo ausente en intake: $k"; done

# 6. Plantillas y recetas que los prompts citan existen
for f in templates/SPEC.md templates/HANDOFF.md templates/mission.json templates/REPO.md schemas/mission-result.schema.json bin/oficina-run scripts/guard.sh scripts/readonly-guard.sh; do
  [ -e "$kit/$f" ] && ok "archivo del kit: $f" || bad "falta en el kit: $f"
done

# 7. Compendio de prompts al día (docs/11 se genera desde el kit)
if [ -x "$root/scripts/build-prompts-doc.sh" ]; then
  tmp="$(mktemp)"; OUT="$tmp" bash "$root/scripts/build-prompts-doc.sh" >/dev/null 2>&1
  if diff -q "$tmp" "$root/docs/11-SYSTEM-PROMPTS.md" >/dev/null 2>&1; then ok "docs/11-SYSTEM-PROMPTS.md está al día"; else bad "docs/11-SYSTEM-PROMPTS.md desactualizado: ejecuta scripts/build-prompts-doc.sh"; fi
  rm -f "$tmp"
fi

# 8. Pruebas de hooks del kit (si existe el harness) y del calificador
[ -f "$root/evals/grade.test.mjs" ] && { (cd "$root" && node --test evals/grade.test.mjs >/dev/null 2>&1) && ok "pruebas del calificador (node --test evals/grade.test.mjs)" || bad "pruebas del calificador fallan"; }

if [ "${1:-}" = "--full" ]; then
  (cd "$root/executor" && pnpm -s typecheck >/dev/null 2>&1) && ok "ejecutor typecheck" || bad "ejecutor typecheck"
  (cd "$root/executor" && pnpm -s test >/dev/null 2>&1) && ok "ejecutor pruebas" || bad "ejecutor pruebas"
  (cd "$root/dashboard" && pnpm -s exec tsc --noEmit >/dev/null 2>&1) && ok "dashboard typecheck" || bad "dashboard typecheck"
fi

printf '\n%d comprobaciones, %d fallos\n' "$n" "$fail"
[ "$fail" -eq 0 ]
