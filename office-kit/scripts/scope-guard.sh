#!/usr/bin/env bash
# PreToolUse(Edit|Write|NotebookEdit): si el agente tiene alcance declarado en .oficina/scopes.json,
# solo puede editar archivos que coincidan con sus globs. Sin alcance declarado, permite (modo suave).
# Siempre protege .oficina/evidence (solo oficina-run escribe ahí) y archivos de secretos.
set -uo pipefail
. "$(dirname "$0")/common.sh"

input="$(cat || true)"
path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null || true)"
agent="$(printf '%s' "$input" | jq -r '.agent_type // empty' 2>/dev/null || true)"
[ -z "$path" ] && exit 0

root="$(oficina_root)"
rel="$path"
case "$path" in
  "$root"/*) rel="${path#"$root"/}" ;;
esac

case "$rel" in
  .oficina/evidence/*) deny "La evidencia la escribe solo oficina-run (.oficina/evidence es de solo lectura para los agentes)." ;;
  .env|.env.*|*/.env|*/.env.*|*id_rsa*|*credentials.json) deny "Archivos de secretos protegidos." ;;
esac

# Sin agente (sesión principal) o sin scopes → permitir
[ -z "$agent" ] && exit 0
scopes="$(oficina_dir)/scopes.json"
[ -f "$scopes" ] || exit 0

# el agente puede venir con prefijo de plugin
key="${agent##*:}"
globs="$(jq -r --arg k "$key" '.[$k] // [] | .[]' "$scopes" 2>/dev/null || true)"
[ -z "$globs" ] && exit 0

# .oficina/handoffs, notes y report son siempre editables (comunicación)
case "$rel" in
  .oficina/notes.md|.oficina/handoffs/*|.oficina/report.*|.oficina/review.md) exit 0 ;;
esac

matched=0
while IFS= read -r g; do
  [ -z "$g" ] && continue
  # bash extglob: convertir ** a * para fnmatch simple + comprobar prefijo de directorio
  if [[ "$rel" == $g ]]; then matched=1; break; fi
  gg="${g//\*\*\//}"; gg="${gg//\*\*/*}"
  if [[ "$rel" == $gg ]]; then matched=1; break; fi
  dir="${g%%/\*\**}"
  if [ "$dir" != "$g" ] && [[ "$rel" == "$dir"/* ]]; then matched=1; break; fi
done <<< "$globs"

if [ "$matched" -eq 0 ]; then
  deny "Fuera de tu alcance: '$rel' no coincide con los archivos propios de '$key' en .oficina/scopes.json. Pide al tech lead ampliar el alcance."
fi
exit 0
