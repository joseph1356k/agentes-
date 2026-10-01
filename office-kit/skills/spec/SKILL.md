---
name: spec
description: Funcionalidades complejas (varias áreas, contratos nuevos, migraciones y UI, o más de una sesión de trabajo). Escribe la spec en docs/specs/<slug>.md, la registra como plan, define contratos y fases, y crea sub-misiones integrables con dependencias. Úsalo con /oficina:spec "<título>".
argument-hint: "<título de la funcionalidad>"
disable-model-invocation: true
---

# Spec: $ARGUMENTS

Estado:

```!
[ -f .oficina/mission.json ] && jq -c '{id,title,goal,level,risk,branch}' .oficina/mission.json || echo "sin mission.json: usa /oficina:mission primero"
ls docs/specs 2>/dev/null | head -20
```

Una funcionalidad compleja no se "hace de un tirón": se especifica, se parte en unidades integrables, cada una se entrega con su propia evidencia y al final se integra y se verifica el conjunto. Esto es lo que hacen los equipos que entregan cosas grandes sin romper producción (y lo que exige el flujo SDD del monorepo: una spec = una rama).

## Pasos

1. **Entiende y acota.** Objetivo como comportamiento observable; qué NO entra. Si falta una decisión que cambie la solución, una sola `AskUserQuestion` (máx. 4 preguntas).
2. **Investiga lo justo.** `Explore` con preguntas concretas (dónde vive cada pieza, contratos actuales, pruebas existentes). Graphify (`query`, `affected`) para el impacto. Resultados a `.oficina/notes.md`.
3. **Escribe `docs/specs/<slug>.md`** con la plantilla `${CLAUDE_PLUGIN_ROOT}/templates/SPEC.md`: objetivo, alcance y no-alcance, decisiones, **contratos explícitos** (tipos, endpoints, eventos, esquemas, formatos de recuerdo), fases (cada una integrable y probable por sí sola), criterio de aceptación por fase y global, plan de integración, plan de verificación en staging, riesgos y plan de reversión. Commitea la spec en la rama de misión.
4. **Regístrala**: `plan_set` con un resumen y `level: N3`, `risk` real; `decision_record` (`shared`) por cada contrato nuevo, con su ADR `proposed` en `docs/decisions/`.
5. **Crea las sub-misiones** con `child_mission_create`, una por fase/unidad integrable: título, objetivo con el contrato que debe cumplir, criterio de aceptación de esa fase, `subdir` si aplica, `depends_on` cuando una necesita a otra, `required_platform` si solo se puede verificar en Windows o Mac. Dos sub-misiones paralelas nunca editan los mismos archivos: dilo en sus objetivos. Máximo 6 sub-misiones; si necesitas más, la funcionalidad está mal partida.
6. **Termina esta sesión** con `/oficina:evidence` y `status: blocked`, `blockers: [{what: "esperando sub-misiones <ids>", needs: "dependency"}]`, `next_steps` con el plan de integración. La oficina te reencola cuando todas las sub-misiones estén en revisión.
7. **Al volver (integración)**: `mission_get` para ver el estado de las hijas; integra sus ramas (merge en tu rama o merge de sus PRs), resuelve conflictos, corre la suite completa con `oficina-run`, verifica la spec punto por punto (criterio global), actualiza la spec con lo que cambió, y entrega a revisión con PR hacia la rama por defecto. Si una hija quedó parcial o bloqueada, no presentes la entrega como completa.

## Reglas

Contratos antes que código dependiente. Una fase = una entrega probable. Sin "fase 0: refactor general". Ninguna sub-misión toca producción ni cambia contratos sin registro.
