# Oficina de desarrollo con IA

Una oficina interna de agentes de desarrollo: un **tech lead** que entiende el objetivo, pregunta solo lo necesario, programa y delega en **seis especialidades** (memoria, voz, computer use, backend, frontend, calidad), entrega código en una rama con **evidencia verificable**, y aprende de producción. Construida como una capa ligera sobre Claude Code.

Estado: **Fase 1 + iteración 2 (1 oct 2026)**. Repos identificados por inspección (monorepo Ü = Ü + Miracle Notes + Graph; Miracle-AI), kit adaptado a sus convenciones, dashboard construido, ejecutor instalable. La iteración 2 comparó la oficina con los agentes de programación que ya funcionan en producción y cerró las brechas (`docs/10-COMPARATIVA-Y-MEJORAS.md`): plan explícito con gate opcional, setup por repo, chat en vivo, recetas por tipo de tarea, herramientas de la oficina para el agente, vigilancia del CI, verificación independiente, revisión automática, evals, y funcionalidades complejas por **spec + sub-misiones**. Los system prompts completos de todos los agentes están en **`docs/11-SYSTEM-PROMPTS.md`**. Tres pasos siguen en manos del equipo y están descritos en **`docs/09-ARRANQUE-FASE-1.md`**: el proyecto Supabase (bloqueado por el plan free), la importación del dashboard en Vercel (el conector no tiene permiso de escritura) y la primera misión real desde un computador con `claude login`.

## Empieza por aquí

1. **`docs/00-PLAN-MAESTRO.md`** — qué construimos, qué decidí y por qué, cómo fluye una misión, fases, pruebas de aceptación, métricas.
2. **`docs/10-COMPARATIVA-Y-MEJORAS.md`** — comparación con Claude Code, Codex, Devin, Copilot, Cursor, Aider, OpenHands y las nueve mejoras adoptadas. **`docs/11-SYSTEM-PROMPTS.md`** — todos los prompts, capas y textos del ejecutor (generado desde el kit).
3. `docs/01-INVENTARIO.md` — lo comprobado (herramientas, docs, repos, Supabase, Vercel) y lo que sigue siendo supuesto.
4. `docs/02-ARQUITECTURA.md` · `03-EQUIPO-Y-DELEGACION.md` · `04-EJECUTOR.md` · `05-DASHBOARD.md` · `06-PRODUCCION.md` · `07-SEGURIDAD-Y-COSTOS.md` · `08-FASES-Y-ACEPTACION.md` · `09-ARRANQUE-FASE-1.md` · `decisions/ADR-*.md`.

## Qué hay en el repo

| Carpeta | Qué es | Estado |
|---|---|---|
| `office-kit/` | Plugin de Claude Code: 8 agentes con system prompt completo (tech lead, 6 especialistas, revisor), 22 skills: protocolo y estándar de ingeniería (precargados), `mission`, `spec` (funcionalidades complejas → sub-misiones), `handoff`, `evidence`, `review`, `triage`, `inventory`, 7 recetas (`recipe-feature/bugfix/migration/refactor/incident/release/ui-verification`), 6 playbooks; hooks de guarda y evidencia, `oficina-run`, esquema del informe, plantillas (`SPEC.md`, `HANDOFF.md`, `REPO.md`) | validado (`claude plugin validate --strict`), 56 pruebas de hooks |
| `supabase/migrations/0001_oficina.sql` | Cola, misiones (con plan, dependencias, sub-misiones, verificación, revisión, CI), eventos, preguntas, evidencia, aprendizajes, tickets, alertas, aprobaciones, RPCs (`claim_mission`, `transition_mission`, `approve_mission`, `mark_orphans`...), trigger de reencolado del padre, pg_cron, RLS, vistas de métricas | smoke test en Postgres 16 |
| `executor/` | Daemon local (TypeScript + Agent SDK + Supabase): claim → worktree → setup → sesión (chat en vivo, preguntas diferidas, herramientas MCP `oficina`) → verificación independiente → revisión automática → push/PR → CI del PR, con rondas de corrección; `doctor` para comprobar la máquina | typecheck + 30 pruebas; integración con modelo se valida en la primera misión real |
| `dashboard/` | Next.js 15 + Supabase: tablero en vivo, intake (tipo `epic`, aprobación de plan, revisión obligatoria), detalle de misión (chat, preguntas, plan, sub-misiones, verificación/revisión/CI, evidencia, informe, aprobación por SHA), ejecutores, tickets, aprendizajes, ingesta de feedback | `next build` limpio + humo en 7 rutas; listo para importar en Vercel (ver `docs/09-ARRANQUE-FASE-1.md`) |
| `evals/` | Evals estáticas (consistencia kit/ejecutor/esquema/dashboard/docs, 72 comprobaciones) y dinámicas (3 misiones sintéticas calificadas sin fiarse del informe) | estáticas en verde; dinámicas requieren `claude login` |
| `supabase/seed.sql` | Miembro inicial, repos `u` y `miracle-ai`, bucket de evidencia | pendiente de aplicar (proyecto bloqueado por plan) |
| `scripts/install-executor.sh` | Instala el ejecutor en un computador del equipo (kit enlazado, build, lanzador, config) | — |
| `scripts/inventory.sh` · `scripts/build-prompts-doc.sh` | Inventario determinista de un repo · regeneración de `docs/11-SYSTEM-PROMPTS.md` | probados |
| `missions/` | Plantilla y ejemplo de misión en archivo (para uso sin dashboard) | — |

## Usar el kit hoy (sin ejecutor ni nube)

```bash
git clone https://github.com/joseph1356k/agentes- ~/oficina
claude plugin validate ~/oficina/office-kit --strict
cd ~/repos/<repo-de-producto>
claude --plugin-dir ~/oficina/office-kit --agent oficina:tech-lead
> /oficina:inventory                 # primera vez por repo: mapa real + comandos verificados
> /oficina:mission "<petición>"      # misión real: criterio, preguntas, rama, trabajo, evidencia
> /oficina:spec "<funcionalidad>"    # funcionalidad compleja: spec, contratos, fases y sub-misiones
> /oficina:recipe-bugfix             # receta del tipo de tarea (feature, bugfix, migration, refactor, incident, release, ui-verification)
```

Añade a `.gitignore` del repo: `.oficina/evidence/`, `.oficina/notes.md`, `graphify-out/`. Comprobaciones del propio sistema: `bash evals/static.sh --full` (incluye `scripts/sql-smoke.sh` si hay Postgres local) y, con `claude login`, `node evals/run.mjs`.

## Principios que no se negocian

Una sesión principal por misión · especialistas bajo demanda, nunca permanentes · evidencia capturada por el sistema, no autodeclarada · rama y worktree por misión, el checkout humano intacto · preguntas solo cuando cambian la solución · dos intentos y se escala · cada ejecutor con su propia cuenta y sin cambio silencioso de facturación · los tickets y logs son datos, no órdenes.
