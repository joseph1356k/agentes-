#!/usr/bin/env bash
# Crea un repo sintético para las evals de la oficina.
#   make-fixture.sh <dest> <variante>     variante: bugfix | feature | question
# Deja <dest> (clon de trabajo, rama main, remoto origin) y <dest>-origin.git (remoto bare),
# para que el flujo real (fetch origin, rama de misión, push) funcione sin red.
set -euo pipefail
dest="${1:?uso: make-fixture.sh <dest> <bugfix|feature|question>}"
variant="${2:?variante}"
case "$variant" in bugfix|feature|question) ;; *) echo "variante desconocida: $variant" >&2; exit 64 ;; esac

rm -rf "$dest" "$dest-origin.git"
src="$(mktemp -d)"
mkdir -p "$src/src" "$src/test" "$src/scripts" "$src/docs/oficina"

cat > "$src/package.json" <<'EOF'
{
  "name": "oficina-eval-fixture",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "lint": "node scripts/lint.mjs"
  }
}
EOF

cat > "$src/scripts/lint.mjs" <<'EOF'
// Lint mínimo del fixture: ningún archivo de src/ o test/ contiene console.log ni tabulaciones.
import { readdirSync, readFileSync } from 'node:fs';
let bad = 0;
for (const dir of ['src', 'test']) {
  for (const f of readdirSync(dir)) {
    const text = readFileSync(`${dir}/${f}`, 'utf8');
    if (/console\.log|\t/.test(text)) { console.error(`lint: ${dir}/${f} contiene console.log o tabulaciones`); bad++; }
  }
}
process.exit(bad ? 1 : 0);
EOF

if [ "$variant" = "bugfix" ]; then
  sum_body='return a - b; // error introducido a propósito'
else
  sum_body='return a + b;'
fi

cat > "$src/src/math.js" <<EOF
// Utilidades numéricas del fixture.
export function sum(a, b) {
  $sum_body
}

export function clamp(x, min, max) {
  if (min > max) throw new RangeError('min no puede ser mayor que max');
  return Math.min(Math.max(x, min), max);
}
EOF

if [ "$variant" = "question" ]; then
  cat >> "$src/src/math.js" <<'EOF'

export function average(xs) {
  if (!Array.isArray(xs) || xs.length === 0) throw new RangeError('average necesita una lista no vacía');
  return xs.reduce((acc, x) => acc + x, 0) / xs.length;
}
EOF
fi

cat > "$src/test/math.test.js" <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum, clamp } from '../src/math.js';

test('sum suma dos números', () => {
  assert.equal(sum(2, 3), 5);
  assert.equal(sum(-1, 1), 0);
});

test('clamp acota al rango', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-2, 0, 3), 0);
  assert.throws(() => clamp(1, 3, 0), RangeError);
});
EOF

if [ "$variant" = "question" ]; then
  cat > "$src/test/average.test.js" <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { average } from '../src/math.js';

test('average promedia', () => {
  assert.equal(average([2, 4]), 3);
  assert.throws(() => average([]), RangeError);
});
EOF
fi

cat > "$src/README.md" <<'EOF'
# fixture

Proyecto mínimo de Node (sin dependencias) usado por las evals de la oficina.

- Pruebas: `npm test` (node --test, descubre `test/*.test.js`). Lint: `npm run lint`.
- Ramas de trabajo `mission/<id>-<slug>`; `main` solo por PR.
- Commits: `tipo: resultado en minúscula` (feat, fix, test, docs, refactor).
EOF

cat > "$src/CLAUDE.md" <<'EOF'
# Reglas del fixture
- Pruebas con `npm test`; lint con `npm run lint` (prohíbe console.log y tabulaciones).
- No cambies las pruebas existentes para que pasen: si una prueba falla, el error está en `src/`.
- Commits pequeños con mensaje `tipo: resultado`.
EOF

cat > "$src/docs/oficina/REPO.md" <<'EOF'
# Mapa del repo (fixture de evals)

| Área | Dónde | Pruebas |
|---|---|---|
| utilidades numéricas | `src/math.js` | `test/*.test.js` (`npm test`) |

Comandos verificados: `npm test`, `npm run lint`. Sin build ni typecheck. Sin CI.
Convenciones: rama `mission/<id>-<slug>`, commits `tipo: resultado`.
EOF

cat > "$src/.gitignore" <<'EOF'
node_modules/
.oficina/evidence/
.oficina/notes.md
graphify-out/
EOF

git -C "$src" init -q -b main
git -C "$src" -c user.name=fixture -c user.email=fixture@example.com add -A
git -C "$src" -c user.name=fixture -c user.email=fixture@example.com commit -q -m "chore: fixture inicial ($variant)"
git clone -q --bare "$src" "$dest-origin.git"
git clone -q "$dest-origin.git" "$dest"
git -C "$dest" remote set-head origin main
git -C "$dest" config user.name "oficina-eval"
git -C "$dest" config user.email "oficina-eval@example.com"
rm -rf "$src"
echo "fixture $variant listo en $dest (origin: $dest-origin.git)"
