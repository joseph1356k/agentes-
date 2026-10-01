---
name: handoff
description: Redacta un encargo completo para un especialista de la oficina (objetivo, alcance, archivos propios, contratos, evidencia requerida, criterio de finalización, presupuesto), lo guarda en .oficina/handoffs/, registra el alcance en .oficina/scopes.json y lanza el subagente con ese encargo. Úsalo con /oficina:handoff <agente> "<objetivo>".
argument-hint: "<agente> \"<objetivo>\""
arguments: [agente, objetivo]
---

# Encargo para `$agente`

Objetivo recibido: $objetivo

Misión y encargos previos:

```!
[ -f .oficina/mission.json ] && jq -c '{id,title,branch,base_sha,level,risk}' .oficina/mission.json 2>/dev/null || echo "sin mission.json"
ls .oficina/handoffs 2>/dev/null || echo "sin encargos previos"
[ -f .oficina/scopes.json ] && cat .oficina/scopes.json || echo "sin scopes.json"
```

Agentes válidos: `memoria-contexto`, `voz-conversacion`, `computer-use`, `backend-agentes`, `frontend-experiencia`, `calidad`, `revisor`. Si `$agente` no es uno de ellos, detente y dilo.

## Pasos

1. **Decide si delegar.** Delega solo si hay entrega clara, poca dependencia continua, contexto separable y ventaja real. Si no, dilo y hazlo tú.
2. **Escribe el encargo** en `.oficina/handoffs/<agente>-<n>.md` con exactamente estas secciones (plantilla en `${CLAUDE_PLUGIN_ROOT}/templates/HANDOFF.md`):
   - `# Encargo: <título corto>`
   - `## Objetivo` (una frase) · `## Comportamiento esperado` (observable, con ejemplos)
   - `## Repo y base` (`slug`, rama de misión, `base_sha`)
   - `## Contexto` (archivos relevantes con ruta, resultados de `graphify query`, decisiones ya tomadas, dónde están las pruebas)
   - `## Alcance y archivos propios` (globs que puede editar; lo demás es solo lectura)
   - `## Restricciones` (contratos intocables, estilo, i18n, datos sensibles, `PORT` si corre servicios)
   - `## Dependencias y contratos` (qué entrega otro agente, formatos acordados)
   - `## Evidencia requerida` (comandos exactos con `oficina-run -- ...`)
   - `## Criterio de finalización` (qué debe ser verdad para devolver "completado")
   - `## Escalamiento` (cuándo parar y devolver `parcial`)
   - `## Presupuesto` (turnos aproximados; el agente tiene `maxTurns`)
3. **Registra el alcance**: añade/actualiza `"<agente>": [globs]` en `.oficina/scopes.json`. El guarda del plugin impedirá ediciones fuera de esos globs.
4. **Lanza el subagente** `oficina:<agente>` con el contenido completo del encargo como prompt (no un resumen). Si lanzas dos, hazlo en el mismo turno y con archivos propios disjuntos.
5. **Al recibir el retorno**, comprueba que trae `## Resumen · ## Cambios · ## Evidencia · ## Referencias · ## Bloqueos · ## Parcial · ## Aprendizajes propuestos`. Verifica que cada `ev_...` existe en `.oficina/evidence/` con `exit_code 0` cuando se declara pass. Si falta algo, devuélvelo con `SendMessage` al mismo agente (conserva su contexto) indicando exactamente qué falta.
6. Integra, corre la suite completa con `oficina-run`, y registra en `notes.md` decisiones y aprendizajes propuestos.
