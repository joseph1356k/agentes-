#!/usr/bin/env bash
# inventory.sh — inventario determinista de un repositorio para la oficina.
# Uso: inventory.sh [ruta] [--json]
# Imprime Markdown con lo detectado (sin ejecutar nada del repo) y, al final, un bloque JSON
# con la propuesta de fila para `repos` (comandos a VERIFICAR con oficina-run; aquí solo se detectan).
set -uo pipefail

repo="${1:-.}"
mode="md"; [ "${2:-}" = "--json" ] && mode="json"
cd "$repo" 2>/dev/null || { echo "inventory.sh: ruta no válida: $repo" >&2; exit 64; }
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root"

EXCL='(^|/)(node_modules|\.git|dist|build|\.next|\.turbo|coverage|\.venv|venv|__pycache__|\.expo|android/build|ios/Pods|graphify-out)(/|$)'
have() { [ -e "$1" ]; }
jqr() { jq -r "$1" "$2" 2>/dev/null || true; }

# --- git ---------------------------------------------------------------------
remote="$(git remote get-url origin 2>/dev/null || echo "")"
default_branch="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
[ -z "$default_branch" ] && default_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
cur_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
head_sha="$(git rev-parse --short HEAD 2>/dev/null || echo "")"
last_commit="$(git log -1 --format='%cs %s' 2>/dev/null || echo "")"
dirty="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
branches="$(git branch -r 2>/dev/null | grep -vc HEAD | tr -d ' ')"

# --- lenguajes por extensión --------------------------------------------------
langs="$(git ls-files 2>/dev/null | grep -Ev "$EXCL" | sed -n 's/.*\.\([A-Za-z0-9]\{1,8\}\)$/\1/p' | tr 'A-Z' 'a-z' \
  | grep -E '^(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|swift|dart|rb|php|cs|cpp|c|h|sql|vue|svelte|sh|yml|yaml|json|md|css|scss|html)$' \
  | sort | uniq -c | sort -rn | head -10 | awk '{printf "%s:%s ", $2, $1}')"

# --- gestores y manifiestos ---------------------------------------------------
pm=""; install_cmd=""
if have package.json; then
  if have pnpm-lock.yaml; then pm="pnpm"; install_cmd="pnpm install --frozen-lockfile"
  elif have yarn.lock; then pm="yarn"; install_cmd="yarn install --frozen-lockfile"
  elif have bun.lockb || have bun.lock; then pm="bun"; install_cmd="bun install"
  elif have package-lock.json; then pm="npm"; install_cmd="npm ci"
  else pm="npm"; install_cmd="npm install"; fi
fi
py=""; [ -f pyproject.toml ] && py="pyproject"; [ -f requirements.txt ] && py="${py:+$py+}requirements"
[ -f uv.lock ] && py="${py}+uv"; [ -f poetry.lock ] && py="${py}+poetry"
others=""
for f in go.mod Cargo.toml Gemfile pubspec.yaml Podfile build.gradle settings.gradle; do have "$f" && others="$others $f"; done
ls *.sln *.csproj >/dev/null 2>&1 && others="$others dotnet"

# --- node: scripts, frameworks ------------------------------------------------
scripts=""; frameworks=""; testfw=""; lint=""; ts="no"; workspaces=""
if have package.json; then
  scripts="$(jqr '.scripts // {} | keys | join(", ")' package.json)"
  deps="$(jq -r '((.dependencies // {}) + (.devDependencies // {})) | keys | .[]' package.json 2>/dev/null || true)"
  for d in next react react-native expo electron vite vue svelte @sveltejs/kit nuxt express fastify hono @nestjs/core tauri @tauri-apps/api remix @remix-run/react astro; do
    printf '%s\n' "$deps" | grep -qx "$d" && frameworks="$frameworks $d"
  done
  for d in vitest jest @playwright/test playwright cypress mocha ava; do printf '%s\n' "$deps" | grep -qx "$d" && testfw="$testfw $d"; done
  for d in eslint @biomejs/biome prettier; do printf '%s\n' "$deps" | grep -qx "$d" && lint="$lint $d"; done
  printf '%s\n' "$deps" | grep -qx typescript && ts="yes"
  workspaces="$(jqr '.workspaces // [] | if type=="array" then join(", ") else (.packages // [] | join(", ")) end' package.json)"
  [ -f pnpm-workspace.yaml ] && workspaces="${workspaces:-pnpm-workspace.yaml}"
fi
pick_script() { # imprime "<pm> run <nombre>" para el primer script existente de la lista
  have package.json || return 0
  for s in "$@"; do
    if jq -e --arg s "$s" '.scripts[$s]' package.json >/dev/null 2>&1; then
      case "$pm" in pnpm) echo "pnpm $s";; yarn) echo "yarn $s";; bun) echo "bun run $s";; *) echo "npm run $s";; esac
      return 0
    fi
  done
}
test_cmd="$(pick_script test test:unit test:ci vitest jest)"
lint_cmd="$(pick_script lint lint:ci check)"
type_cmd="$(pick_script typecheck type-check tsc check-types)"
build_cmd="$(pick_script build build:ci)"
dev_cmd="$(pick_script dev start:dev start)"
e2e_cmd="$(pick_script test:e2e e2e playwright)"
if [ -n "$py" ]; then
  [ -z "$test_cmd" ] && { grep -q pytest pyproject.toml requirements.txt 2>/dev/null && test_cmd="pytest"; }
  [ -z "$lint_cmd" ] && { grep -q ruff pyproject.toml requirements.txt 2>/dev/null && lint_cmd="ruff check ."; }
  [ -z "$type_cmd" ] && { grep -q mypy pyproject.toml requirements.txt 2>/dev/null && type_cmd="mypy ."; }
  [ -z "$install_cmd" ] && { [ -f uv.lock ] && install_cmd="uv sync" || install_cmd="pip install -r requirements.txt"; }
fi

# --- pruebas ------------------------------------------------------------------
test_files="$(git ls-files 2>/dev/null | grep -Ev "$EXCL" | grep -Ec '(\.test\.|\.spec\.|_test\.|/tests?/|/__tests__/|/e2e/|/spec/)' | tr -d ' ')"
test_dirs="$(git ls-files 2>/dev/null | grep -Ev "$EXCL" | grep -Eo '(^|/)(tests?|__tests__|e2e|spec)/' | sort -u | tr '\n' ' ')"

# --- infra, CI, despliegue ----------------------------------------------------
ci=""
[ -d .github/workflows ] && ci="$(ls .github/workflows 2>/dev/null | tr '\n' ' ')"
[ -f .gitlab-ci.yml ] && ci="$ci .gitlab-ci.yml"
deploy=""
have vercel.json && deploy="$deploy vercel.json"
have supabase/config.toml && deploy="$deploy supabase/config.toml"
[ -d supabase/migrations ] && deploy="$deploy supabase/migrations($(ls supabase/migrations 2>/dev/null | wc -l | tr -d ' '))"
[ -d supabase/functions ] && deploy="$deploy supabase/functions($(ls supabase/functions 2>/dev/null | wc -l | tr -d ' '))"
for f in Dockerfile docker-compose.yml docker-compose.yaml fly.toml render.yaml netlify.toml app.json eas.json; do have "$f" && deploy="$deploy $f"; done

# --- variables de entorno (solo nombres) y MCP ---------------------------------
envnames=""
for f in .env.example .env.sample .env.template .env.local.example; do
  [ -f "$f" ] && envnames="$envnames $(grep -Eo '^[A-Z][A-Z0-9_]+=' "$f" | tr -d '=' | tr '\n' ' ')"
done
mcp=""; have .mcp.json && mcp="$(jqr '.mcpServers // {} | keys | join(", ")' .mcp.json)"

# --- contexto para agentes ----------------------------------------------------
ctx=""
have CLAUDE.md && ctx="$ctx CLAUDE.md"
have AGENTS.md && ctx="$ctx AGENTS.md"
[ -d .claude ] && ctx="$ctx .claude/($(ls .claude 2>/dev/null | tr '\n' ',' | sed 's/,$//'))"
[ -d docs/decisions ] && ctx="$ctx docs/decisions($(ls docs/decisions 2>/dev/null | wc -l | tr -d ' '))"
have docs/oficina/REPO.md && ctx="$ctx docs/oficina/REPO.md"
graph="no"
if have graphify-out/graph.json; then
  graph="sí ($(du -h graphify-out/graph.json 2>/dev/null | cut -f1)$( [ -f .oficina/graphify.stamp ] && printf ', indexado en %s' "$(cat .oficina/graphify.stamp)"))"
fi
readme="no"; ls README* >/dev/null 2>&1 && readme="sí"

# --- salida -------------------------------------------------------------------
json="$(jq -n \
  --arg slug "$(basename "$root")" --arg remote "$remote" --arg default_branch "$default_branch" \
  --arg install "$install_cmd" --arg dev "$dev_cmd" --arg test "$test_cmd" --arg lint "$lint_cmd" \
  --arg typecheck "$type_cmd" --arg build "$build_cmd" --arg e2e "$e2e_cmd" \
  --arg pm "$pm" --arg frameworks "$(echo $frameworks)" --arg testfw "$(echo $testfw)" --arg langs "$(echo $langs)" \
  --arg ci "$(echo $ci)" --arg deploy "$(echo $deploy)" --arg mcp "$mcp" --arg head "$head_sha" \
  '{slug:$slug, remote_url:$remote, default_branch:$default_branch, head:$head,
    stack:{package_manager:$pm, frameworks:$frameworks, test_frameworks:$testfw, languages:$langs},
    commands:{install:$install, dev:$dev, test:$test, lint:$lint, typecheck:$typecheck, build:$build, e2e:$e2e},
    ci:$ci, deploy:$deploy, mcp:$mcp, commands_verified:false}')"

if [ "$mode" = "json" ]; then printf '%s\n' "$json"; exit 0; fi

cat <<EOF
## Inventario determinista — $(basename "$root")

| Dato | Detectado |
|---|---|
| Ruta | \`$root\` |
| Remoto | ${remote:-desconocido} |
| Rama por defecto / actual | ${default_branch:-?} / ${cur_branch:-?} (HEAD ${head_sha:-?}, ramas remotas: ${branches:-0}) |
| Último commit | ${last_commit:-?} |
| Árbol sucio | ${dirty} archivos |
| Lenguajes (archivos) | ${langs:-ninguno detectado} |
| Gestor Node / Python / otros | ${pm:-no} / ${py:-no} /${others:- no} |
| Workspaces | ${workspaces:-no} |
| Frameworks | ${frameworks:- ninguno detectado} |
| TypeScript | $ts |
| Scripts package.json | ${scripts:-no} |
| Pruebas | ${test_fw:-}${testfw:- sin framework detectado}; archivos de prueba: ${test_files:-0}; carpetas: ${test_dirs:-ninguna} |
| Lint/format | ${lint:- no detectado} |
| CI | ${ci:-no} |
| Despliegue/infra | ${deploy:-no detectado} |
| Variables de entorno (nombres) | ${envnames:-sin .env.example} |
| MCP | ${mcp:-no} |
| README | $readme |
| Contexto para agentes | ${ctx:-ninguno} |
| Graphify | $graph |

### Comandos candidatos (VERIFICAR con \`oficina-run\`; aquí no se ejecutaron)

| Acción | Comando |
|---|---|
| install | ${install_cmd:-?} |
| dev | ${dev_cmd:-?} |
| test | ${test_cmd:-?} |
| e2e | ${e2e_cmd:-?} |
| lint | ${lint_cmd:-?} |
| typecheck | ${type_cmd:-?} |
| build | ${build_cmd:-?} |

### Propuesta de fila \`repos\` (JSON)

\`\`\`json
$json
\`\`\`
EOF
