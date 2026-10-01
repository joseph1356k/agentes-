#!/usr/bin/env bash
# Instala el ejecutor de la oficina en este computador (macOS/Linux). Idempotente.
#   bash scripts/install-executor.sh [ruta-local-del-monorepo-U]
# Requisitos: node >= 22, pnpm (o npm), git, claude (con /login hecho), gh (gh auth login).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${OFICINA_HOME:-$HOME/.oficina}"
REPO_U="${1:-${OFICINA_REPO_U:-}}"

echo "== oficina: instalando ejecutor desde $HERE"
mkdir -p "$HOME_DIR/wt"

# 1) kit: enlace simbólico al office-kit del clon (así `git pull` lo actualiza)
ln -sfn "$HERE/office-kit" "$HOME_DIR/office-kit"
echo "   kit → $HOME_DIR/office-kit (enlace a $HERE/office-kit)"

# 2) ejecutor: dependencias y build
cd "$HERE/executor"
if command -v pnpm >/dev/null 2>&1; then pnpm install --frozen-lockfile >/dev/null && pnpm build >/dev/null; else npm install >/dev/null && npm run build >/dev/null; fi
echo "   ejecutor compilado en $HERE/executor/dist"

# 3) lanzador en el PATH del usuario
BIN="$HOME/.local/bin"; mkdir -p "$BIN"
cat > "$BIN/oficina-executor" <<EOF
#!/usr/bin/env bash
exec node "$HERE/executor/dist/cli.js" "\$@"
EOF
chmod +x "$BIN/oficina-executor"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "   AVISO: añade $BIN a tu PATH (export PATH=\"$BIN:\$PATH\")";; esac

# 4) config inicial (no sobrescribe)
OFICINA_KIT="$HOME_DIR/office-kit" OFICINA_REPO_U="${REPO_U:-/ruta/a/U-Windows-App}" node "$HERE/executor/dist/cli.js" init

# 5) graphify (opcional)
if ! command -v graphify >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then uv tool install graphifyy >/dev/null 2>&1 && echo "   graphify instalado (uv)"; else echo "   graphify no instalado (opcional): uv tool install graphifyy"; fi
fi

cat <<EOF

Siguiente:
  1. Edita $HOME_DIR/config.json: supabase_url, supabase_anon_key, repos[].path (ruta local del monorepo Ü y otros).
  2. oficina-executor login       # enlace/código por correo (Supabase Auth)
  3. oficina-executor register    # registra este computador y sus repos
  4. oficina-executor doctor      # comprueba claude, gh, git, graphify, repos y acceso a la cola
  5. oficina-executor start       # o como servicio: pm2 start "oficina-executor start" --name oficina
EOF
