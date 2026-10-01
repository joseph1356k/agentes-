#!/usr/bin/env bash
# PreToolUse(Bash) guard: bloquea operaciones peligrosas de git, despliegues y borrados fuera del worktree.
# Siempre sale 0; la decisión va en el JSON (permissionDecision: deny). Si no hay nada que objetar, no imprime nada.
set -uo pipefail
. "$(dirname "$0")/common.sh"

input="$(cat || true)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0

root="$(oficina_root)"
branch="$(mission_field .branch)"
default_branch="$(mission_field .repo.default_branch)"
prod_branch="$(mission_field .repo.production_branch)"
protected="main master develop production release staging ${default_branch} ${prod_branch}"

# Normaliza espacios para los patrones
c=" $(printf '%s' "$cmd" | tr '\n' ' ' | tr -s ' ') "

# 1) push forzado
if printf '%s' "$c" | grep -Eq ' git [^|;&]*push [^|;&]*(--force|-f |--force-with-lease|-f$|\+[a-zA-Z])'; then
  deny "Push forzado bloqueado por la oficina. Usa commits normales en la rama de misión."
fi

# 2) push a ramas protegidas (push explícito a la rama o push estando en ella)
if printf '%s' "$c" | grep -Eq ' git [^|;&]*push '; then
  for b in $protected; do
    [ -z "$b" ] && continue
    if printf '%s' "$c" | grep -Eq " git [^|;&]*push [^|;&]*(origin|upstream)?[ :]*(refs/heads/)?$b( |$|:)"; then
      deny "Push a la rama protegida '$b' bloqueado. Solo se empuja la rama de misión."
    fi
  done
  cur="$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  for b in $protected; do
    [ -z "$b" ] && continue
    if [ "$cur" = "$b" ] && ! printf '%s' "$c" | grep -Eq ' git [^|;&]*push [^|;&]* [^ ]+:[^ ]+'; then
      deny "Estás en la rama protegida '$cur'. No se hace push desde ramas protegidas; cambia a la rama de misión."
    fi
  done
fi

# 3) cambiar de rama / borrar ramas / reescribir historia compartida
if printf '%s' "$c" | grep -Eq ' git [^|;&]*(checkout|switch) ' && ! printf '%s' "$c" | grep -Eq ' git [^|;&]*(checkout|switch) [^|;&]*(-- |-b |-c |--create |--orphan|mission/)'; then
  # permitir checkout de archivos (-- ruta) y creación de ramas mission/
  deny "Cambio de rama bloqueado. Trabaja en la rama de misión${branch:+ ($branch)}; para restaurar archivos usa 'git checkout -- <ruta>' o 'git restore'."
fi
if printf '%s' "$c" | grep -Eq ' git [^|;&]*branch [^|;&]*(-D|-d|--delete) '; then
  deny "Borrado de ramas bloqueado."
fi
if printf '%s' "$c" | grep -Eq ' git [^|;&]*(reset --hard [^|;&]*(origin|upstream|main|master)|rebase [^|;&]*(-i|--interactive)|push [^|;&]*--delete|filter-branch|update-ref -d)'; then
  deny "Reescritura de historia o borrado de refs bloqueado."
fi

# 4) despliegues y publicación
if printf '%s' "$c" | grep -Eq ' (vercel|vc) [^|;&]*(--prod|deploy --prod|promote)|npm publish|pnpm publish|yarn publish|gh release create|supabase db push|supabase functions deploy|supabase link|eas submit|fastlane '; then
  deny "Despliegue o publicación bloqueados: los hace el ejecutor o un humano tras aprobación."
fi

# 5) borrados masivos fuera del worktree
if printf '%s' "$c" | grep -Eq ' rm -[a-zA-Z]*r[a-zA-Z]* '; then
  targets="$(printf '%s' "$c" | sed -E 's/.* rm -[a-zA-Z]+ //; s/[|;&].*//')"
  for t in $targets; do
    case "$t" in
      -*) continue ;;
      /|/*|'~'|'~/'*|..|../*|'$HOME'*|'${HOME}'*) deny "rm recursivo fuera del worktree bloqueado ($t)." ;;
    esac
  done
fi

# 6) secretos obvios
if printf '%s' "$c" | grep -Eq ' (cat|echo|printf) [^|;&]*(\.env|id_rsa|credentials\.json|\.npmrc)'; then
  deny "Lectura/impresión de archivos de secretos bloqueada."
fi

exit 0
