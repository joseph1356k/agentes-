#!/usr/bin/env bash
# Genera docs/11-SYSTEM-PROMPTS.md: el compendio de todos los system prompts de la oficina.
# Fuentes: docs/prompts/00-capas.md (capas, sesiones, textos del ejecutor) + office-kit/agents/*.md + office-kit/skills/*/SKILL.md.
#   bash scripts/build-prompts-doc.sh            escribe docs/11-SYSTEM-PROMPTS.md
#   OUT=/ruta bash scripts/build-prompts-doc.sh  escribe en otra ruta (lo usa evals/static.sh para comparar)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
kit="$root/office-kit"
out="${OUT:-$root/docs/11-SYSTEM-PROMPTS.md}"

# Orden de lectura: primero los agentes (lead, especialistas, revisor), luego las skills por función.
agents=(tech-lead memoria-contexto voz-conversacion computer-use backend-agentes frontend-experiencia calidad revisor)
skills=(protocolo estandar mission spec handoff evidence review triage inventory
        recipe-feature recipe-bugfix recipe-migration recipe-refactor recipe-incident recipe-release recipe-ui-verification
        playbook-memoria playbook-voz playbook-computer-use playbook-backend playbook-frontend playbook-calidad)

frontmatter_table() { # imprime el frontmatter como tabla clave/valor (solo claves de una línea)
  awk 'NR==1 && $0=="---"{inside=1; next} inside && $0=="---"{exit} inside && /^[a-zA-Z_-]+:/ { key=$0; sub(/:.*/,"",key); val=$0; sub(/^[a-zA-Z_-]+:[ ]*/,"",val); if (val!="") printf("| `%s` | %s |\n", key, val) }' "$1"
}
body() { awk 'NR==1 && $0=="---"{inside=1; next} inside && $0=="---"{inside=0; skip=1; next} !inside && !(skip && $0=="") {skip=0; print}' "$1"; }

i=0
{
  cat "$root/docs/prompts/00-capas.md"
  echo
  echo "## 5. Agentes (\`office-kit/agents/\`)"
  for a in "${agents[@]}"; do
    f="$kit/agents/$a.md"; [ -f "$f" ] || { echo "falta $f" >&2; exit 1; }
    echo; echo "### 5.$((++i)) \`$a\`"; echo
    echo "| Frontmatter | Valor |"; echo "|---|---|"; frontmatter_table "$f"
    echo; echo '```markdown'; body "$f"; echo '```'
  done
  j=0
  echo; echo "## 6. Skills (\`office-kit/skills/\`)"
  for s in "${skills[@]}"; do
    f="$kit/skills/$s/SKILL.md"; [ -f "$f" ] || { echo "falta $f" >&2; exit 1; }
    echo; echo "### 6.$((++j)) \`$s\`"; echo
    echo "| Frontmatter | Valor |"; echo "|---|---|"; frontmatter_table "$f"
    echo; echo '````markdown'; body "$f"; echo '````'
  done
  echo
  echo "## 7. Plantillas que los prompts rellenan"
  for t in HANDOFF.md SPEC.md REPO.md area.md CLAUDE.md.template; do
    echo; echo "### \`templates/$t\`"; echo; echo '```markdown'; cat "$kit/templates/$t"; echo '```'
  done
} > "$out"
echo "escrito $out ($(wc -l < "$out") líneas)"
