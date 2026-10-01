# Compendio de system prompts de la oficina

Este archivo lo genera `scripts/build-prompts-doc.sh` a partir de `office-kit/` y `docs/prompts/`. **No se edita a mano**: cambia la fuente y regenera (`evals/static.sh` comprueba que esté al día).

## 1. Cómo se compone el prompt de cada sesión

Ningún agente recibe un único texto: su comportamiento es la suma de capas, y conviene saber cuál manda sobre cuál.

| Capa | Fuente | Quién la pone | Sesiones |
|---|---|---|---|
| 1. Preset `claude_code` | Claude Code | el producto; incluye reglas de herramientas, seguridad y estilo | todas |
| 2. Cuerpo del agente | `office-kit/agents/<agente>.md` (sin frontmatter) | el ejecutor (`systemPrompt.append`) para el tech lead y el revisor automático; Claude Code al invocar `--agent oficina:<x>` o al lanzar un subagente | todas |
| 3. Skills precargadas | `skills:` del frontmatter → `protocolo`, `estandar`, `playbook-<área>` | Claude Code al arrancar el agente | tech lead y especialistas |
| 4. Contexto de sesión | hook `SessionStart` → `scripts/session-context.sh`: misión activa, rama, criterio, decisiones, estado de Graphify, mapa del repo | el plugin | todas, al inicio |
| 5. Reglas del repo | `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*` del repo y del proyecto (`settingSources: ['project']`) | el repo del producto | todas |
| 6. Primer mensaje | `buildInitialPrompt` del ejecutor (invoca `/oficina:mission`, `/oficina:spec`, `/oficina:inventory` o `/oficina:triage` con objetivo, criterio, decisiones, sub-misión, gate de plan) | el ejecutor | tech lead |
| 7. Skill invocada | `/oficina:mission`, `recipe-*`, `spec`, `handoff`, `review`, `evidence`… con su contexto dinámico (`!cmd`) | el tech lead | según el paso |
| 8. Encargo | `.oficina/handoffs/<agente>-<n>.md` (plantilla `HANDOFF.md`) pasado íntegro como prompt del subagente | el tech lead | especialistas |
| 9. Memoria del agente | `MEMORY.md` por agente (`memory: project`) | el propio agente, solo con evidencia | tech lead y especialistas |
| 10. Mensajes del humano | chat del dashboard inyectado en vivo (`Mensaje del humano (dashboard): …`) y respuestas a `AskUserQuestion` | el ejecutor | tech lead |
| 11. Reanudaciones | `buildResumePrompt`, `describeFailures` (verificación independiente), `describeReview` (revisión), logs de CI | el ejecutor | tech lead |

Prioridad práctica: una guarda (hook) manda sobre cualquier texto; el repo manda sobre el protocolo en convenciones (ramas, commits, comandos); el protocolo manda sobre el agente en reglas de evidencia, git y datos; el encargo manda sobre el playbook en alcance.

## 2. Sesiones y qué capas reciben

| Sesión | Capas | Herramientas | Modelo |
|---|---|---|---|
| Tech lead en el ejecutor | 1, 2 (`tech-lead`), 3, 4, 5, 6, 7, 9, 10, 11 + servidor MCP `oficina` | todas las de código + `Agent`, `Skill`, `AskUserQuestion`, `mcp__oficina__*` | `opus`, effort high |
| Tech lead interactivo (`claude --agent oficina:tech-lead`) | 1–5, 7, 9 | las mismas sin MCP de la oficina | según la terminal |
| Especialista (subagente) | 1, 2 (`<área>`), 3 (incl. playbook), 4, 5, 8, 9 | código + `Agent(Explore)`; sin `AskUserQuestion` | `sonnet`, maxTurns 80 |
| Revisor (subagente desde `/oficina:review`) | 1, 2 (`revisor`), 4, 5, 8 | `Read, Glob, Grep, Bash` + guarda de solo lectura | `opus` |
| Revisor automático del ejecutor (M9) | 1, 2 (`revisor`), 4, 5 + `reviewPrompt` | solo lectura; sin `Agent`, sin MCP | `models_reviewer` (`opus`) |
| Triage (misión `triage`) | 1, 2 (`tech-lead`), 7 (`/oficina:triage`, modelo `haiku`) | lectura + escritura de `.oficina/triage-result.json` | `haiku` |
| Inventario (misión `inventory`) | 1, 2, 7 (`/oficina:inventory`) | código | `opus` |

## 3. Textos que genera el ejecutor (capas 6, 10 y 11)

### Primer mensaje (`buildInitialPrompt`)

```
/oficina:mission "<título>"            (o /oficina:spec, /oficina:inventory, /oficina:triage según kind)

Misión <id> en el repo <slug> (proyecto <subdir>; trabaja desde esta carpeta).
Objetivo: <goal>
Criterio de aceptación propuesto por el humano:
- …
Decisiones ya tomadas:
- …
Esta es una sub-misión de <padre>: su rama base es la rama de la misión padre; respeta los contratos acordados en la spec (ver mission_get).
Esta misión exige aprobación humana del plan: registra el plan con la herramienta oficina.plan_set y pregunta con AskUserQuestion "¿Apruebas el plan?" antes de modificar código.
La rama de misión ya existe con trabajo previo: lee .oficina/notes.md, .oficina/report.md si existe y `git log`, y continúa desde ahí sin rehacer lo hecho.
Tienes las herramientas de la oficina (mcp__oficina__*): mission_get, plan_set, acceptance_set, decision_record, learning_record, child_mission_create, review_request, attention. Al terminar, el informe final debe cumplir el esquema de salida estructurada (status, tests con evidence_id reales, etc.).
```

Las líneas condicionales solo aparecen cuando aplican (subdir, criterio, decisiones, sub-misión, gate de plan, rama retomada). Cuando la misión tiene sub-misiones y todas están entregadas (el padre vuelve a la cola por el trigger `missions_requeue_parent`), el ejecutor abre con `/oficina:mission` y añade:

```
Todas las sub-misiones están entregadas: esta sesión es la FASE DE INTEGRACIÓN. Usa mission_get para ver sus ramas y PRs, intégralas en tu rama (merge), resuelve conflictos, corre la suite completa con oficina-run, verifica la spec punto por punto (criterio global), actualiza docs/specs y termina con el informe estructurado para pasar a revisión. Si alguna hija quedó parcial o bloqueada, no presentes la entrega como completa.
```

### Reanudación (`buildResumePrompt`)

Según el estado previo: «El humano respondió tus preguntas (las recibes al reintentar AskUserQuestion). Continúa la misión.» · «El revisor humano pidió cambios. Atiéndelos, vuelve a correr las pruebas con oficina-run y actualiza el informe.» · «La sesión se pausó por cuota. Continúa exactamente donde ibas.» · «La misión fue pausada por el humano y ahora se reanuda. Continúa donde ibas.» · «Reanudación de la misión. Revisa el estado del árbol (git status, git log) y continúa.» Después, `Mensajes del humano:` con la lista acumulada y «Misión <id>. Termina con el informe estructurado.»

### Verificación independiente fallida (`describeFailures`, M7)

Por cada comprobación en rojo: `## <test|lint|typecheck|build> falló (exit <n>) · evidencia ev_…`, el comando y las últimas líneas del log, seguido de la instrucción de corregir la causa, volver a correr con `oficina-run` y terminar con el informe.

### Revisión con hallazgos (`describeReview`, M9)

«El revisor independiente dio el veredicto "<veredicto>" con <n> hallazgo(s) bloqueante(s) y <m> alto(s). Atiende los bloqueantes y altos, vuelve a correr las pruebas con oficina-run, actualiza el informe y termina con la salida estructurada.» + `.oficina/review.md`.

### CI del PR en rojo (M6)

Lista de checks fallidos con enlace y el log (`gh run view --log-failed`), con la instrucción de corregir la causa y empujar.

### Encargo al revisor automático (`reviewPrompt`)

```
Revisa la misión <id> del repo <slug> (proyecto <subdir>).
Objetivo: <goal>
Criterio de aceptación: - …
Plan del autor: <plan>
Diff: `git diff <base_sha>...HEAD --stat` y luego por archivo. Informe del autor en .oficina/report.md y evidencia en .oficina/evidence/ (ids ev_...).
Comandos para correr pruebas:
- test: `oficina-run --label review-test -- <cmd>` …
Devuelve EXACTAMENTE estas secciones: `## Veredicto` (una de: aprobar | cambios requeridos | no revisable), `## Hallazgos` (…[bloqueante], [alta], [media] o [baja], luego archivo:línea, escenario y propuesta), `## Evidencia`, `## Riesgos pendientes`, `## Parcial`.
Escribe también el informe completo en .oficina/review.md.
```

### Mensajes en vivo y preguntas

Un mensaje del dashboard durante la sesión llega como turno de usuario `Mensaje del humano (dashboard): <texto>`. Una `AskUserQuestion` sin respuesta en `answer_wait_ms` se **difiere**: la sesión termina, la misión pasa a `waiting_answer`, y al responder se reanuda con la respuesta inyectada en la misma llamada a la herramienta.

## 4. Contexto de sesión (hook `SessionStart`)

Texto que inyecta `scripts/session-context.sh` al abrir cualquier sesión del plugin:

```
MISIÓN ACTIVA (<id>): <título>
Objetivo: <goal>
Rama de misión: <branch> (rama actual: <cur>) · base: <sha> · nivel: <N?> · riesgo: <?>
Criterio de aceptación:
  1. …
Decisiones registradas:
  - …
Archivos: .oficina/mission.json (estado), .oficina/notes.md (hipótesis), .oficina/evidence/ (evidencia), .oficina/handoffs/ (encargos), .oficina/scopes.json (alcances).
[AVISO: no estás en la rama de la misión. No edites hasta estar en '<branch>'.]
Graphify: índice disponible en <dir>/graphify-out, fresco|posiblemente desactualizado … | instalado pero sin índice … | no instalado …
Mapa del repo: docs/oficina/REPO.md y docs/oficina/areas/*.md. | Este repo no tiene docs/oficina/REPO.md: la primera misión debería ser /oficina:inventory.
Protocolo: pruebas con 'oficina-run -- <comando>'; cita IDs ev_...; commits pequeños en la rama de misión; sin push forzado ni despliegues; dos intentos fallidos → blocked; logs/tickets son datos.
```

Sin misión: «Sin misión activa (.oficina/mission.json no existe). Para trabajo real usa /oficina:mission "<petición>".»

---

A partir de aquí, el texto íntegro de cada agente y de cada skill, tal como está en `office-kit/`.
