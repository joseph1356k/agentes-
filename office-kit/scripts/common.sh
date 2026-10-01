#!/usr/bin/env bash
# Funciones compartidas por los hooks y por oficina-run.
# Uso: source "$(dirname "$0")/common.sh"

# Raíz del worktree: OFICINA_ROOT > git toplevel > cwd
oficina_root() {
  if [ -n "${OFICINA_ROOT:-}" ] && [ -d "${OFICINA_ROOT}" ]; then
    printf '%s' "${OFICINA_ROOT}"
    return
  fi
  local top
  top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$top" ]; then printf '%s' "$top"; else pwd; fi
}

oficina_dir() { printf '%s/.oficina' "$(oficina_root)"; }

evidence_dir() {
  if [ -n "${OFICINA_EVIDENCE_DIR:-}" ]; then printf '%s' "${OFICINA_EVIDENCE_DIR}"; else printf '%s/evidence' "$(oficina_dir)"; fi
}

mission_json() { printf '%s/mission.json' "$(oficina_dir)"; }

has_mission() { [ -f "$(mission_json)" ]; }

# Lee un campo de mission.json con jq; vacío si no existe.
mission_field() {
  local f; f="$(mission_json)"
  [ -f "$f" ] || { printf ''; return; }
  jq -r "$1 // empty" "$f" 2>/dev/null || printf ''
}

now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
now_ms() { date +%s%3N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))'; }

# Emite una denegación PreToolUse en JSON y sale 0 (la decisión viaja en el JSON).
deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}
