#!/usr/bin/env bash
# Smoke test del esquema de la oficina en un Postgres local (crea y destruye la base `oficina_test`).
#   bash scripts/sql-smoke.sh                 # root con usuario postgres local (su postgres), o psql del PATH con PG* en el entorno
#   bash scripts/sql-smoke.sh -h localhost -U postgres
# Simula auth.email() de Supabase con un GUC; no requiere Supabase. Imprime "SMOKE OK" al final si todo pasa.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; chmod 755 "$tmp"
cp "$root/supabase/migrations/0001_oficina.sql" "$tmp/0001_oficina.sql"
cp "$root/supabase/smoke.sql" "$tmp/smoke.sql"
chmod 644 "$tmp"/*.sql
trap 'rm -rf "$tmp"' EXIT
if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1 && [ $# -eq 0 ]; then
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -v migration=$tmp/0001_oficina.sql -f $tmp/smoke.sql"
else
  psql -q -v ON_ERROR_STOP=1 -v "migration=$tmp/0001_oficina.sql" -f "$tmp/smoke.sql" "$@"
fi
