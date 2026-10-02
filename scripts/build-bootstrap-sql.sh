#!/usr/bin/env bash
# Genera supabase/bootstrap.sql = 0001 + 0002 + seed, para aplicar en un proyecto nuevo en un solo paso
# (SQL Editor de Supabase, `psql`, o la herramienta apply_migration). Idempotente.
#   bash scripts/build-bootstrap-sql.sh            escribe supabase/bootstrap.sql
#   OUT=/ruta bash scripts/build-bootstrap-sql.sh  escribe en otra ruta (lo usa evals/static.sh para comparar)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="${OUT:-$root/supabase/bootstrap.sql}"
{
  echo "-- Oficina IA · bootstrap generado por scripts/build-bootstrap-sql.sh. NO editar a mano."
  echo "-- Proyecto Supabase PROPIO de la oficina (nunca el del producto). Después de aplicarlo:"
  echo "--   select public._oficina_set_password('dev@itsmiracleai.com', '<contraseña de al menos 10 caracteres>');"
  echo "-- y entra al dashboard con ese correo y contraseña (cámbiala en /account)."
  echo
  for f in "$root"/supabase/migrations/*.sql "$root/supabase/seed.sql"; do
    echo "-- ============================================================================"
    echo "-- $(basename "$f")"
    echo "-- ============================================================================"
    cat "$f"
    echo
  done
} > "$out"
echo "escrito $out ($(wc -l < "$out") líneas)"
