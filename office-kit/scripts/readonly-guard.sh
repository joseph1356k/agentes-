#!/usr/bin/env bash
# PreToolUse(Bash) para el agente revisor: solo lectura y ejecución de pruebas/lint/build.
set -uo pipefail
. "$(dirname "$0")/common.sh"

input="$(cat || true)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0
c=" $(printf '%s' "$cmd" | tr '\n' ' ' | tr -s ' ') "

# git que escribe
if printf '%s' "$c" | grep -Eq ' git [^|;&]*(add|commit|push|checkout|switch|reset|rebase|merge|stash|restore|rm|mv|tag|branch -[dDmM]|cherry-pick|revert|clean|am|apply) '; then
  deny "El revisor es de solo lectura: no ejecuta git que escriba."
fi
# redirecciones y edición por shell
if printf '%s' "$c" | grep -Eq '(^| )(>|>>|tee |sed -i|perl -pi|mv |cp |rm |mkdir |touch |chmod |chown |ln )'; then
  # permitir redirección a /dev/null y a .oficina/evidence (oficina-run escribe ahí por sí mismo)
  if ! printf '%s' "$c" | grep -Eq '> ?/dev/null'; then
    deny "El revisor es de solo lectura: no crea ni modifica archivos por shell."
  fi
fi
# instalaciones y despliegues
if printf '%s' "$c" | grep -Eq ' (npm|pnpm|yarn|bun) [^|;&]*(install|add|remove|publish)|pip install|uv (add|pip install)|vercel|supabase (db|functions|link)|gh (pr|release|repo) (create|merge|edit|delete)'; then
  deny "El revisor no instala, publica ni despliega."
fi
exit 0
