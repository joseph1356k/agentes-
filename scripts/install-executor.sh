#!/usr/bin/env bash
# Instala el ejecutor de la oficina en este computador (macOS/Linux). Idempotente.
#   bash scripts/install-executor.sh u=/ruta/al/monorepo-U [miracle-ai=/ruta/a/Miracle-AI]
#   bash scripts/install-executor.sh /ruta/al/monorepo-U          (forma corta: solo el repo u)
# Requisitos: node >= 22, pnpm (o npm), git, claude (con /login hecho), gh (gh auth login).
# La URL del proyecto, la clave publicable y la URL del dashboard salen de config/oficina.public.json.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${OFICINA_HOME:-$HOME/.oficina}"
REPOS=""
for a in "$@"; do
  case "$a" in
    *=*) REPOS="${REPOS:+$REPOS,}$a" ;;
    *) REPOS="${REPOS:+$REPOS,}u=$a" ;;
  esac
done
[ -z "$REPOS" ] && [ -n "${OFICINA_REPO_U:-}" ] && REPOS="u=$OFICINA_REPO_U"
command -v node >/dev/null 2>&1 || { echo "falta node >= 22"; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || { echo "node >= 22 requerido (tienes $(node -v))"; exit 1; }

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
OFICINA_KIT="$HOME_DIR/office-kit" OFICINA_REPOS="$REPOS" node "$HERE/executor/dist/cli.js" init

# 5) graphify (opcional)
if ! command -v graphify >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then uv tool install graphifyy >/dev/null 2>&1 && echo "   graphify instalado (uv)"; else echo "   graphify no instalado (opcional): uv tool install graphifyy"; fi
fi

cat <<EOF

Siguiente:
  1. Revisa $HOME_DIR/config.json (repos[].path apunta a tus clones locales; añade más con slug=/ruta).
  2. oficina-executor login       # correo y contraseña del dashboard (cámbiala en Cuenta)
  3. oficina-executor register    # registra este computador y enlaza sus repos
  4. oficina-executor doctor      # comprueba claude, gh, git, graphify, repos y acceso a la cola
  5. oficina-executor start       # o como servicio: pm2 start "oficina-executor start" --name oficina
EOF
