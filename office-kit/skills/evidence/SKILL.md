---
name: evidence
description: Produce el informe final de una misión con evidencia verificable, cumpliendo schemas/mission-result.schema.json. Cruza cada prueba declarada con los archivos de evidencia reales de .oficina/evidence y marca como no verificado lo que no tenga respaldo. Úsalo al cerrar una misión con /oficina:evidence.
disable-model-invocation: false
---

# Informe de misión

Evidencia registrada en este worktree (solo cuenta lo que esté aquí):

```!
if ls .oficina/evidence/ev_*.json >/dev/null 2>&1; then
  for f in .oficina/evidence/ev_*.json; do jq -c '{id,label,exit_code,duration_ms,command}' "$f" 2>/dev/null; done
else
  echo "SIN EVIDENCIA: no hay archivos .oficina/evidence/ev_*.json"
fi
echo "---commits en la rama---"
git log --oneline "$(jq -r .base_sha .oficina/mission.json 2>/dev/null || echo HEAD~5)"..HEAD 2>/dev/null | head -50
echo "---estado del arbol---"
git status --porcelain 2>/dev/null | head -20
```

## Pasos

1. Si el árbol tiene cambios sin commit, **commitea primero** (mensajes claros). El informe describe lo commiteado.
2. Construye el informe siguiendo `${CLAUDE_PLUGIN_ROOT}/schemas/mission-result.schema.json`:
   - `status`: `completed` solo si **todo** el criterio de aceptación está cumplido y cada prueba relevante tiene `evidence_id` con `exit_code: 0`. Si falta algo → `partial`. Si necesitas al humano o un acceso → `blocked`. Si no se pudo → `failed`.
   - `tests[]`: una entrada por comprobación, con el `evidence_id` real de la lista de arriba, el comando, `verdict` (`pass` solo con exit 0) y notas. **No inventes IDs.** Una prueba sin ID va a `not_tested` con el motivo.
   - `changes[]`: archivo, tipo (`added|modified|deleted`), por qué.
   - `commits[]`: SHAs de la rama desde `base_sha`.
   - `decisions[]`: con `scope: mission|shared` y justificación. Las `shared` deben tener ADR `proposed` en `docs/decisions/`.
   - `learnings[]`: solo con evidencia y procedencia; indica si lo guardaste en memoria de agente.
   - `blockers[]`, `questions[]` (lo que el humano debe decidir), `next_steps[]`, `risk`, `delegations[]` (agente, tarea, resultado).
3. Escribe el informe en `.oficina/report.json` (JSON válido) y un resumen legible en `.oficina/report.md` con las secciones `Resumen · Cambios · Evidencia · Decisiones · Bloqueos · Siguientes pasos`.
4. Termina tu respuesta con el JSON del informe tal cual (sin comentarios ni texto después). Si el entorno exige salida estructurada, ese JSON es la respuesta final.
