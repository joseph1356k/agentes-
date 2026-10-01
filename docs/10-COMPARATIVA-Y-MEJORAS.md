# Comparativa con sistemas en producción y mejoras adoptadas

Versión 1.0 · 1 de octubre de 2026. Objetivo: que la oficina pueda sacar funcionalidades complejas de principio a fin, no solo arreglos pequeños. Se comparó con agentes de programación que ya operan a escala y se adoptó lo que explica su utilidad real.

## 1. Qué hace útil a cada sistema (y qué nos faltaba)

| Sistema | Lo que lo hace útil | Teníamos | Brecha → mejora adoptada |
|---|---|---|---|
| **Claude Code** (interactivo + SDK) | Explorar → planear → implementar → verificar; subagentes con contexto propio; hooks; skills; memoria; worktrees; `/review` y `ultrareview`; plan mode con aprobación | subagentes, hooks, skills, worktrees, revisor | **Plan explícito antes de implementar** y gate de aprobación opcional para misiones grandes (M1) |
| **OpenAI Codex (cloud)** | Contenedor aislado por tarea con **script de setup**; AGENTS.md; corre las pruebas y cita evidencia en el PR; tareas paralelas; seguimiento en el mismo hilo | evidencia verificable, PR con informe | **Setup por repo/subproyecto** ejecutado por el ejecutor antes de la sesión (M2); **mensajes del humano en vivo** dentro de la sesión (M3) |
| **Devin (Cognition)** | Planner; **Playbooks** reutilizables por tipo de tarea; Wiki/DeepWiki del repo; snapshots de máquina; pregunta cuando la confianza es baja; sesiones paralelas | playbooks por área, inventario, Graphify | **Recetas por tipo de tarea** (feature, bugfix, migración, refactor, incidente, release) (M4); **herramientas de la oficina para el agente** (registrar decisiones, crear sub-misiones, pedir revisión) (M5) |
| **GitHub Copilot coding agent** | Issue → PR borrador con log de sesión; usa **CI** como juez; `copilot-setup-steps`; revisión de PR | PR idempotente | **Vigilar CI del PR y corregir una ronda** automáticamente (M6) |
| **Cursor background agents** | VM por tarea, `environment.json`, disparo desde Slack, PR | — | cubierto por M2; disparo externo queda para Fase 5 |
| **Aider** | Repo map compacto; bucle lint/test automático tras cada edición; commits automáticos | Graphify; `oficina-run` | **Verificación independiente del ejecutor** (corre test/lint/typecheck él mismo, no se fía del informe) con una ronda de corrección (M7) |
| **OpenHands / SWE-agent** | Evaluación con benchmarks; interfaz agente-computador acotada; microagents por repo | — | **Evals de la oficina**: misiones sintéticas con resultado conocido para medir prompts y modelos (M8) |
| **Jules (Google)** | Plan visible antes de ejecutar; resumen final | — | cubierto por M1 |
| **Anthropic, sistema multiagente de investigación** | Orquestador-trabajadores con encargos explícitos; evaluación con juez LLM + humanos; límites de paralelismo | encargos (handoff), límites | **Revisión independiente automática** (sesión aparte con el revisor) para riesgo ≥ medio o N3, con una ronda de corrección (M9) |

## 2. Las nueve mejoras (todas implementadas en esta iteración salvo indicación)

| # | Mejora | Qué cambia | Dónde |
|---|---|---|---|
| **M1** | Plan explícito y gate opcional | El tech lead escribe `.oficina/plan.md` (enfoque, archivos, contratos, riesgos, pruebas) y lo registra con la herramienta `oficina.plan_set`. Si la misión tiene `require_plan_approval`, pregunta "¿Apruebas el plan?" (se difiere si nadie responde) antes de tocar código. El dashboard muestra el plan | `missions.plan`, `require_plan_approval`; skill `mission`; MCP `plan_set` |
| **M2** | Setup reproducible | `repos.commands.setup` (y por subproyecto) lo ejecuta el ejecutor en el worktree antes de la sesión, con evidencia `ev_setup_*`. La misión de inventario lo descubre y verifica | `workspace.ts` `runSetup`; `seed.sql` |
| **M3** | Chat en vivo | La sesión usa entrada por streaming: los mensajes del humano que llegan mientras la misión corre se inyectan en la conversación sin esperar al siguiente turno | `providers/claude.ts` |
| **M4** | Recetas por tipo de tarea | `recipe-feature`, `recipe-bugfix`, `recipe-migration`, `recipe-refactor`, `recipe-incident`, `recipe-release`, `recipe-ui-verification`: pasos concretos, checklist de cierre y evidencia mínima | `office-kit/skills/recipe-*` |
| **M5** | Herramientas de la oficina para el agente | Servidor MCP en proceso del ejecutor (`oficina`): `mission_get`, `plan_set`, `acceptance_set`, `decision_record`, `learning_record`, `child_mission_create`, `review_request`, `attention`. El agente nunca ve credenciales; el ejecutor persiste en Supabase | `executor/src/office-tools.ts` |
| **M6** | CI del PR | Tras crear el PR, el ejecutor consulta `gh pr checks` hasta 30 min; si falla, reanuda la sesión con los logs una vez (`ci_fix_rounds`), empuja y vuelve a esperar | `executor/src/ci.ts` |
| **M7** | Verificación independiente | Tras la sesión, el ejecutor corre `test`, `lint`, `typecheck` del repo/subproyecto por su cuenta; registra `ev_exec_*`; si algo falla, una ronda de corrección (`verify_fix_rounds`) y, si persiste, `review` con `executor_checks` en rojo | `executor/src/verify.ts` |
| **M8** | Evals | `evals/`: **estáticas** (`static.sh`, 72 comprobaciones de consistencia entre kit, ejecutor, esquema, dashboard y docs; corren en CI sin modelo) y **dinámicas** (`run.mjs`: bug conocido, feature pequeña, pregunta obligatoria, sobre un repo fixture; el calificador corre las pruebas por su cuenta y detecta evidencia falsa o pruebas debilitadas). Las dinámicas se corren en un computador con `claude login` | `evals/` |
| **M9** | Revisión automática | Para riesgo ≥ medio, nivel N3 o `require_review`: sesión aparte con el perfil `revisor` (solo lectura, modelo fuerte, contexto limpio). Hallazgos bloqueantes → una ronda de corrección del lead; veredicto en `missions.review` y en el dashboard | `executor/src/review.ts` |

Además: **misiones padre/hijas con dependencias** (`depends_on`, `base_branch`, tipo `epic`): `/oficina:spec` escribe la spec (`docs/specs/<slug>.md`, plantilla `SPEC.md`: contratos explícitos, fases integrables, criterio por fase), la registra y crea las sub-misiones con `child_mission_create`; el ejecutor las atiende en orden (una hija no se reclama hasta que sus dependencias estén en `review`), cada una hace PR contra la rama del padre; cuando la última llega a `review`, un trigger reencola al padre para integrar, correr la suite completa y verificar la spec. **System prompts completos** de los 8 agentes y un estándar de ingeniería precargado (`oficina:estandar`): `docs/11-SYSTEM-PROMPTS.md` (generado con `scripts/build-prompts-doc.sh`).

## 3. Lo que seguimos sin hacer, a propósito

Contenedores por tarea (los ejecutores son las máquinas del equipo; sandbox opcional en Fase 5), disparo desde Slack, revisión de PRs ajenos, generación de wiki completa (Graphify + `docs/oficina/` bastan), agent teams, cambio automático de modelo o facturación.

## 4. Cómo se mide que ahora sí sirve

- Tasa de misiones que llegan a `review` con `result_verified = true` **y** `executor_checks` en verde al primer intento (objetivo > 70 % en misiones N0/N1 tras 20 misiones).
- Rondas de corrección por misión (verificación + CI + revisión): objetivo ≤ 1 de media.
- Tiempo humano por misión: preguntas respondidas + revisión; objetivo < 15 min en N0/N1.
- Evals: 3/3 misiones sintéticas completadas y verificadas con los modelos por defecto (`node evals/run.mjs`); `bash evals/static.sh --full` en verde en cada cambio del sistema.

## 5. Estado de verificación de esta iteración

| Pieza | Comprobación | Resultado |
|---|---|---|
| Kit | `claude plugin validate --strict` (plugin, agentes, skills); 56 pruebas de hooks | verde |
| Esquema | smoke test en Postgres 16 (`scripts/sql-smoke.sh`: claim con `depends_on`/plataforma, gating de sub-misiones, reencolado del padre, aprendizajes) | verde |
| Ejecutor | `tsc --noEmit`; 30 pruebas (estado, evidencia, worktrees, verificación, prompts e integración) | verde |
| Dashboard | `tsc --noEmit`; `next build`; humo HTTP en 7 rutas | verde |
| Evals | 72 comprobaciones estáticas; 6 pruebas del calificador (lead honesto vs tramposo) | verde |
| Con modelo | 3 evals dinámicas y primera misión real | **pendiente**: requiere `claude login` en un computador del equipo |
