#!/usr/bin/env bash
# Stop hook: en una misión activa, no se termina el turno con cambios sin commit.
# Evita bucles: si stop_hook_active es true, no vuelve a bloquear.
set -uo pipefail
. "$(dirname "$0")/common.sh"

input="$(cat || true)"
active="$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)"
[ "$active" = "true" ] && exit 0
has_mission || exit 0

root="$(oficina_root)"
dirty="$(git -C "$root" status --porcelain 2>/dev/null | grep -v '^?? .oficina/' | grep -v '^?? graphify-out/' | head -20 || true)"
[ -z "$dirty" ] && exit 0

jq -n --arg files "$dirty" '{
  decision: "block",
  reason: ("Hay cambios sin commit en la rama de misión. Commitea con un mensaje claro (o descarta lo que no sea tuyo) antes de terminar el turno:\n" + $files)
}'
