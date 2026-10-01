#!/usr/bin/env bash
# Ledger de evidencia: registra cada comando Bash (PostToolUse) y cada inicio/fin de subagente
# en .oficina/evidence/commands.jsonl. No bloquea nunca.
set -uo pipefail
. "$(dirname "$0")/common.sh"

input="$(cat || true)"
[ -z "$input" ] && exit 0
dir="$(evidence_dir)"
mkdir -p "$dir" 2>/dev/null || exit 0

printf '%s' "$input" | jq -c --arg ts "$(now_iso)" '
  {
    ts: $ts,
    event: .hook_event_name,
    session_id: .session_id,
    agent_id: (.agent_id // null),
    agent_type: (.agent_type // null),
    tool_use_id: (.tool_use_id // null),
    command: (.tool_input.command // null),
    description: (.tool_input.description // null),
    response_preview: (
      if .tool_response == null then null
      elif (.tool_response|type) == "string" then (.tool_response | .[0:400])
      else ((.tool_response|tostring) | .[0:400]) end
    )
  }' >> "$dir/commands.jsonl" 2>/dev/null || true
exit 0
