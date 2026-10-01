---
name: mission
description: Crea o retoma una misión de la oficina a partir de una petición en lenguaje natural: define objetivo y criterio de aceptación, clasifica nivel y riesgo, pregunta solo lo que cambia la solución, prepara la rama y ejecuta según la política de delegación. Úsalo con /oficina:mission "<petición>".
argument-hint: "<petición en una frase>"
disable-model-invocation: true
---

# Misión: $ARGUMENTS

Estado actual del árbol y la misión (si existe):

```!
echo "branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo none)"
echo "head=$(git rev-parse --short HEAD 2>/dev/null || echo none)"
echo "default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#origin/##' || echo unknown)"
echo "dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
echo "mission_json=$([ -f .oficina/mission.json ] && echo yes || echo no)"
[ -f .oficina/mission.json ] && cat .oficina/mission.json
echo "graphify_index=$([ -f graphify-out/graph.json ] && echo yes || echo no)"
echo "repo_doc=$([ -f docs/oficina/REPO.md ] && echo yes || echo no)"
```

## Pasos

1. **Retomar o crear.** Si `mission_json=yes`, esta es la misión: lee `acceptance`, `decisions`, `notes.md` y continúa donde quedó. Si no, crea la misión:
   - `id`: `m_` + 8 caracteres hex aleatorios (`openssl rand -hex 4`).
   - `title`: cinco a ocho palabras. `goal`: la petición reformulada como comportamiento observable.
   - `branch`: `mission/<8hex>-<slug>` (slug ascii, guiones, máximo 40 caracteres). Si el repo documenta la convención `<persona>/<que-hace>` (p. ej. en `.claude/rules/ramas-y-commits.md`), usa `oficina/<slug>` y respeta su voz de commits.
   - `base_sha`: HEAD de la rama por defecto actualizada (`git fetch origin` primero).
   - Escribe `.oficina/mission.json` siguiendo `${CLAUDE_PLUGIN_ROOT}/templates/mission.json` y crea `.oficina/notes.md`. Añade `.oficina/evidence/` y `.oficina/notes.md` a `.git/info/exclude` si no están en `.gitignore` (la evidencia no se commitea; `mission.json` sí).
   - Si el árbol está limpio y no estás ya en una rama `mission/`, crea la rama: `git switch -c <branch> <base_sha>`. Si el árbol está sucio, no cambies de rama: pregunta qué hacer con los cambios.
2. **Contexto.** Sigue el orden del protocolo (`docs/oficina/`, `CLAUDE.md`, Graphify, ADRs, archivos). Anota en `notes.md` qué encontraste y qué supones.
3. **Criterio de aceptación.** Escribe de 2 a 6 condiciones comprobables (qué prueba o recorrido lo demuestra). Guárdalas en `mission.json.acceptance`.
4. **Preguntas.** Solo si falta una decisión que cambia la solución: una llamada a `AskUserQuestion` con hasta 4 preguntas y opciones concretas (incluye tu recomendación como primera opción). Registra las respuestas en `decisions` con `by: "humano"`. Lo rutinario lo decides tú y lo registras con `by: "lead"`.
5. **Nivel y riesgo.** Clasifica `level` (N0–N3) y `risk` (low/medium/high) y escríbelos en `mission.json`. Riesgo alto: datos, auth, migraciones, pagos, acciones sobre sistemas clínicos, cambios transversales.
6. **Ejecutar según nivel.**
   - N0: hazlo tú. N1: carga el playbook (`/oficina:playbook-<área>`) y hazlo tú.
   - N2: define archivos propios por especialista, escribe `.oficina/scopes.json`, lanza hasta 2 encargos con `/oficina:handoff` en paralelo, integra y prueba el conjunto.
   - N3: investiga con el subagente `Explore` (preguntas concretas), acuerda contratos (escríbelos en `notes.md` y en el encargo), implementa en unidades integrables, revisión obligatoria.
7. **Pruebas.** Todo con `oficina-run -- <comando>`. Suite completa del repo al final, no solo lo tocado.
8. **Revisión.** Si `risk` es medium/high o `level` es N3, lanza `/oficina:review`. Atiende los hallazgos bloqueantes y altos antes de cerrar.
9. **Cierre.** Commits hechos, árbol limpio. Informe final con `/oficina:evidence`. Si el entorno pide salida estructurada, el JSON del informe es tu última respuesta.

## Reglas rápidas

No preguntes para confirmar lo obvio. No delegues lo trivial. Máximo 3 subagentes activos. Dos intentos fallidos → `blocked` con evidencia. Nunca toques la rama por defecto.
