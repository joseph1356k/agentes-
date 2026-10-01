#!/usr/bin/env bash
# Atajo: inventario determinista de un repo. Uso: scripts/inventory.sh <ruta-al-repo> [--json]
exec bash "$(cd "$(dirname "$0")/.." && pwd)/office-kit/scripts/inventory.sh" "$@"
