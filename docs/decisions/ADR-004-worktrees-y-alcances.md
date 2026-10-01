# ADR-004 · Rama + worktree por misión; alcances por agente verificados por hook

Estado: accepted · 2026-10-01

## Decisión
Cada misión trabaja en `mission/<id8>-<slug>` dentro de un `git worktree` bajo `~/.oficina/wt/<repo>/<id>`. Dentro de una misión, los especialistas comparten el worktree con **archivos propios declarados** en el encargo (`.oficina/scopes.json`) y un hook `PreToolUse` que deniega ediciones fuera de alcance. Rama de integración solo cuando hay sub-misiones.

## Alternativas descartadas
`isolation: worktree` por subagente (se ramifica desde la rama por defecto, no desde la rama de misión, y obliga a fusionar después); clonar el repo por misión (lento); confiar en instrucciones sin verificación.

## Consecuencias
Edición paralela limitada a 2 especialistas con alcances disjuntos; puertos separados cuando corren servicios; `guard.sh` protege ramas; el checkout humano nunca se toca.
