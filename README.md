# Oficina de desarrollo con IA

Una oficina interna de agentes de desarrollo: un **tech lead** que entiende el objetivo, pregunta solo lo necesario, programa y delega en **seis especialidades** (memoria, voz, computer use, backend, frontend, calidad), entrega código en una rama con **evidencia verificable**, y aprende de producción. Construida como una capa ligera sobre Claude Code.

Estado: **Fase 1 en curso (1 oct 2026)** — repos identificados por inspección (monorepo Ü = Ü + Miracle Notes + Graph; Miracle-AI), kit adaptado a sus convenciones, dashboard v0 construido, ejecutor instalable. Tres pasos quedan en manos del equipo y están descritos en **`docs/09-ARRANQUE-FASE-1.md`**: el proyecto Supabase (bloqueado por el plan free), la importación del dashboard en Vercel (el conector no tiene permiso de escritura) y la primera misión real desde un computador con `claude login`.

## Empieza por aquí

1. **`docs/00-PLAN-MAESTRO.md`** — qué construimos, qué decidí y por qué, cómo fluye una misión, fases, pruebas de aceptación, métricas.
2. `docs/01-INVENTARIO.md` — lo comprobado hoy (herramientas, docs, repos candidatos, Supabase, Vercel) y lo que sigue siendo supuesto.
3. `docs/02-ARQUITECTURA.md` · `03-EQUIPO-Y-DELEGACION.md` · `04-EJECUTOR.md` · `05-DASHBOARD.md` · `06-PRODUCCION.md` · `07-SEGURIDAD-Y-COSTOS.md` · `08-FASES-Y-ACEPTACION.md` · `decisions/ADR-*.md`.

## Qué hay en el repo

| Carpeta | Qué es | Estado |
|---|---|---|
| `office-kit/` | Plugin de Claude Code: 8 agentes, protocolo de misión (`/oficina:mission`, `handoff`, `evidence`, `review`, `triage`, `inventory`), 6 playbooks, hooks de guarda y evidencia, `oficina-run`, esquema del informe, plantillas | validado (`claude plugin validate --strict`), 56 pruebas de hooks |
| `supabase/migrations/0001_oficina.sql` | Cola, misiones, eventos, preguntas, evidencia, tickets, alertas, aprobaciones, RPCs (`claim_mission`, `transition_mission`, `approve_mission`, `mark_orphans`...), RLS, vistas de métricas | smoke test en Postgres 16 |
| `executor/` | Daemon local (TypeScript + Agent SDK + Supabase): claim → worktree → sesión → preguntas → evidencia → push/PR; `doctor` para comprobar la máquina | typecheck + pruebas de lógica; integración con modelo se valida en la primera misión real |
| `dashboard/` | Next.js 15 + Supabase: tablero en vivo, intake, detalle de misión (chat, preguntas, evidencia, informe, aprobación por SHA), ejecutores, tickets, ingesta de feedback | `next build` limpio + humo; listo para importar en Vercel (el conector no tiene permiso de escritura en el equipo; ver `docs/09-ARRANQUE-FASE-1.md`) |
| `supabase/seed.sql` | Miembro inicial, repos `u` y `miracle-ai`, bucket de evidencia | pendiente de aplicar (proyecto bloqueado por plan) |
| `scripts/install-executor.sh` | Instala el ejecutor en un computador del equipo (kit enlazado, build, lanzador, config) | — |
| `scripts/inventory.sh` | Inventario determinista de un repo (atajo a `office-kit/scripts/inventory.sh`) | probado |
| `missions/` | Plantilla y ejemplo de misión en archivo (para uso sin dashboard) | — |

## Usar el kit hoy (sin ejecutor ni nube)

```bash
git clone https://github.com/joseph1356k/agentes- ~/oficina
claude plugin validate ~/oficina/office-kit --strict
cd ~/repos/<repo-de-producto>
claude --plugin-dir ~/oficina/office-kit --agent oficina:tech-lead
> /oficina:inventory                 # primera vez por repo: mapa real + comandos verificados
> /oficina:mission "<petición>"      # misión real: criterio, preguntas, rama, trabajo, evidencia
```

Añade a `.gitignore` del repo: `.oficina/evidence/`, `.oficina/notes.md`, `graphify-out/`.

## Principios que no se negocian

Una sesión principal por misión · especialistas bajo demanda, nunca permanentes · evidencia capturada por el sistema, no autodeclarada · rama y worktree por misión, el checkout humano intacto · preguntas solo cuando cambian la solución · dos intentos y se escala · cada ejecutor con su propia cuenta y sin cambio silencioso de facturación · los tickets y logs son datos, no órdenes.
