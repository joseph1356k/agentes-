# Arquitectura

Complementa `00-PLAN-MAESTRO.md` §4–§9. Describe componentes, contratos y modelo de datos con el nivel necesario para implementar la Fase 1.

## 1. Componentes y responsabilidades

| Componente | Vive en | Responsabilidad | No hace |
|---|---|---|---|
| `office-kit` (plugin) | repo `agentes-`, copiado o enlazado en cada máquina ejecutora | perfiles, playbooks, protocolo de misión, hooks de guarda y evidencia, `oficina-run`, esquema del informe | no habla con la nube; no conoce Supabase |
| `executor` | cada computador del equipo (daemon) | reclamar misiones, worktrees, sesión Agent SDK, eventos, preguntas, pausa/cancelación, cuota, evidencia, push, PR idempotente, latido | no decide prioridades; no guarda credenciales de modelo fuera de `claude login` |
| `dashboard` + `supabase` | Vercel + Supabase (proyecto `oficina-ia`) | cola persistente, visibilidad en vivo, preguntas, aprobaciones, tickets, alertas, consumo, cron de triage | no ejecuta modelos; no guarda secretos de los repos |

## 2. Flujo detallado de una misión (secuencia)

```
Humano/Dashboard        Supabase                 Ejecutor                      Claude Code (SDK)
     │ crea misión ─────► missions(queued)
     │                       │  Realtime/poll ───────► ve misión para repo autorizado
     │                       │ ◄── rpc claim_mission(executor) [SKIP LOCKED] → claimed
     │                       │                         prepara worktree + rama + .oficina/mission.json → preparing
     │                       │                         graphify update (si stale)
     │                       │                         query({plugins:[kit], agent:'oficina:tech-lead', resume?}) ──► system/init
     │                       │ ◄── events(init: plugins ok, session_id, modelo, cuenta)                     running
     │                       │ ◄── mission_messages(lead text), mission_events(tool_use, subagent, commit)
     │ ve actividad ◄────────┤
     │                       │ ◄── questions(open)  ◄── hook PreToolUse(AskUserQuestion)
     │ responde ───────────► questions(answered) ──────► hook devuelve allow+answers (si <15 min)
     │                       │                         ó hook devuelve defer → result(deferred_tool_use) → waiting_answer
     │ responde ───────────► questions(answered) ──────► query({resume}) → hook reinvocado → allow+answers → running
     │                       │ ◄── result(structured_output, cost)  → verificación de evidencia
     │                       │                         git push; gh pr create (operations: mission:<id>:pr)
     │                       │ ◄── evidence(storage), missions(review | blocked | partial-unverified)
     │ revisa / aprueba ───► approvals(sha) → trigger valida sha == head
     │                       │                         (fase 3) release → verified/regressed
```

## 3. Contratos

### 3.1 `.oficina/mission.json` (escrito por el ejecutor o por `/oficina:mission`)

```json
{
  "id": "m_8f3a2c1d",
  "title": "Recordar corrección enseñada por voz",
  "goal": "Que el asistente recuerde una corrección enseñada por voz y la use al manejar el computador",
  "acceptance": ["...", "..."],
  "decisions": [{"text": "...", "by": "humano|lead", "at": "2026-10-01T10:00:00Z"}],
  "repo": {"slug": "miracle", "default_branch": "main", "commands": {"test": "pnpm test", "lint": "pnpm lint", "build": "pnpm build"}},
  "branch": "mission/8f3a2c1d-recordar-correccion-voz",
  "base_sha": "abc123",
  "level": "N0|N1|N2|N3|null",
  "risk": "low|medium|high|null",
  "scope": {"frontend-experiencia": ["apps/web/src/**"], "backend-agentes": ["services/api/**"]},
  "evidence_dir": ".oficina/evidence",
  "dashboard_url": "https://oficina.../missions/m_8f3a2c1d",
  "created_by": "dev@itsmiracleai.com"
}
```

El hook `SessionStart` lo lee y lo inyecta como contexto. Si no existe, el kit sigue funcionando en modo interactivo y `/oficina:mission` lo crea.

### 3.2 Encargo (`/oficina:handoff`) → `.oficina/handoffs/<agente>-<n>.md`

Secciones obligatorias: Objetivo · Comportamiento esperado · Repo y SHA base · Contexto (archivos, consultas Graphify, decisiones) · Alcance y archivos propios · Restricciones · Dependencias y contratos · Evidencia requerida (comandos exactos con `oficina-run`) · Criterio de finalización · Motivos de escalamiento · Presupuesto (turnos). El contenido se pasa tal cual como prompt del subagente. Los `scope` del encargo se escriben también en `.oficina/scopes.json` para el `scope-guard`.

### 3.3 Retorno de todo agente

Markdown con encabezados fijos: `## Resumen`, `## Cambios`, `## Evidencia` (IDs `ev_...`), `## Referencias` (archivos, commits), `## Bloqueos`, `## Parcial` (sí/no y qué falta), `## Aprendizajes propuestos` (con evidencia). El tech lead no acepta un retorno sin estas secciones.

### 3.4 Informe final de misión (`office-kit/schemas/mission-result.schema.json`)

Lo exige el ejecutor con `outputFormat: {type:'json_schema'}`. Campos: `status` (`completed|partial|blocked|failed`), `summary`, `changes[]`, `commits[]`, `tests[] {evidence_id, command, verdict, notes}`, `not_tested[]`, `decisions[] {text, rationale, scope}`, `learnings[] {text, evidence, scope}`, `blockers[] {what, needs, detail}`, `questions[]`, `next_steps[]`, `risk`, `delegations[] {agent, task, outcome}`.

### 3.5 Evidencia (`oficina-run`)

`oficina-run [--label test] -- <comando>` → `.oficina/evidence/<ev_id>.json` `{id, label, command, cwd, started_at, duration_ms, exit_code, log_path, agent}` + `<ev_id>.log`. Imprime `EVIDENCE id=ev_... exit=0 log=...` (y las últimas líneas de salida) para que el agente lo cite. El ejecutor sube la carpeta a Storage `evidence/<mission>/` y cruza con `tests[]`.

### 3.6 Interfaz `Provider` (ejecutor)

```ts
interface Provider {
  start(run: RunSpec): AsyncIterable<RunEvent>;        // nueva sesión
  resume(run: RunSpec, sessionId: string, input: ResumeInput): AsyncIterable<RunEvent>;
  interrupt(handle: RunHandle): Promise<void>;         // pausa / cancelación
  account(): Promise<{ provider: 'claude'|'codex'; billing: 'subscription'|'api_key'|'unknown'; detail?: string }>;
}
```

`RunEvent` normaliza: `init`, `text`, `tool_use`, `tool_result`, `subagent_start/stop`, `question_open`, `question_deferred`, `api_retry`, `result`, `error`. Codex se implementará contra la misma interfaz cuando se verifique.

## 4. Modelo de datos (Supabase, `supabase/migrations/0001_oficina.sql`)

| Tabla | Para qué | Claves |
|---|---|---|
| `team_members` | quién puede entrar (email) y rol | `email` único |
| `repos` | repos autorizados, rama base/producción, comandos, staging, flags | `slug` único |
| `executors` | máquinas ejecutoras: dueño, estado, capacidad, proveedores, método de facturación, latido | `owner_email`, `last_heartbeat` |
| `executor_repos` | qué repos puede atender cada ejecutor y en qué ruta local | (`executor_id`, `repo_id`) |
| `missions` | la unidad de trabajo y su estado | `status`, `repo_id`, `executor_id`, `session_id`, `attempt`, `parent_mission_id`, `approved_sha` |
| `mission_messages` | chat por misión (humano ⇄ tech lead) | `mission_id, created_at` |
| `mission_events` | bitácora de eventos reales (base de cualquier "oficina animada") | `mission_id, ts, type` |
| `questions` | preguntas abiertas/respondidas con el payload original de `AskUserQuestion` | `mission_id, status` |
| `evidence` | índice de evidencias subidas (ruta en Storage, exit code, resumen) | `mission_id, evidence_id` |
| `decisions` | decisiones registradas (misión o compartidas) con estado | `scope, status` |
| `approvals` | aprobaciones por SHA y entorno | `mission_id, sha` |
| `operations` | idempotencia de PR/deploy/release | `idempotency_key` único |
| `tickets` | entradas de producción (feedback, logs, alertas, mejoras) con huella y duplicados | `fingerprint`, `status`, `mission_id` |
| `alerts` | alertas críticas deduplicadas por ventana | (`rule`, `fingerprint`, `window_start`) único |
| `usage_ledger` | costo/tokens por sesión y misión | `mission_id, executor_id` |
| vistas | `mission_metrics`, `executor_capacity` | — |

Funciones: `claim_mission(executor_id)` (`FOR UPDATE SKIP LOCKED`, respeta capacidad y repos autorizados), `heartbeat(executor_id, mission_id)`, `mark_orphans()` (pg_cron cada minuto), `invalidate_approvals_on_push()` (trigger al cambiar `head_sha`). RLS: miembros del equipo leen/escriben; cada ejecutor solo actualiza sus filas (`owner_email = auth.email()`). Realtime en `missions`, `mission_events`, `mission_messages`, `questions`.

## 5. Máquina de estados (autoritativa en `missions.status`)

| Desde | Evento | Hacia |
|---|---|---|
| `draft` | humano prioriza | `queued` |
| `queued` | `claim_mission` | `claimed` |
| `claimed` | worktree listo | `preparing` → `running` |
| `running` | pregunta sin respuesta en 15 min (defer) | `waiting_answer` |
| `waiting_answer` | respuesta | `queued` (prioridad alta, preferencia por el mismo ejecutor) → `running` |
| `running` | humano pausa | `paused` |
| `paused` | humano reanuda | `queued` |
| `running` | cuota agotada | `paused_quota` |
| `paused_quota` | hora de reinicio o reintento programado | `queued` |
| `running` | informe `completed`/`partial` con evidencia verificada | `review` |
| `running` | informe con pruebas no verificadas | `review` (flag `unverified`) |
| `running` | informe `blocked` o 2º intento fallido | `blocked` |
| `blocked` | humano decide/aporta | `queued` |
| `review` | humano pide cambios | `changes_requested` → `queued` |
| `review` | staging listo | `staging` |
| `staging` | aprobación con SHA == head | `approved` |
| `approved` | push nuevo | `review` (aprobación invalidada) |
| `approved` | merge/deploy | `released` |
| `released` | comprobación de señal | `verified` / `regressed` |
| `claimed`/`running` | sin latido 2 min | `orphaned` → `queued` |
| cualquiera | humano cancela | `cancelled` |
| `running` | error de proveedor / presupuesto | `failed` (reintentable → `queued`, `attempt+1`) |

## 6. Ejecutor: estructura

```
executor/
  src/types.ts          tipos de misión, eventos, resultado, proveedor
  src/state.ts          máquina de estados y transiciones válidas
  src/queue.ts          cliente Supabase: claim, heartbeat, eventos, preguntas, evidencia
  src/workspace.ts      worktrees, ramas, mission.json, push
  src/evidence.ts       verificación cruzada tests[] ⇄ .oficina/evidence
  src/providers/claude.ts  Agent SDK: query, canUseTool, hooks (defer), resume, interrupt, accountInfo
  src/runner.ts         ciclo de vida de una misión (prepare → run → verify → publish)
  src/daemon.ts         bucle principal, capacidad, cuota, señales
  src/cli.ts            `oficina-executor login|register|start|status`
```

Configuración por máquina en `~/.oficina/config.json`: `supabase_url`, `office_kit_path`, `repos: [{slug, path}]`, `max_parallel: 1`, `billing_mode`, `answer_wait_ms: 900000`, `max_budget_usd_default`, `max_turns_default`, `models: {lead, specialist, reviewer, triage}`.

## 7. Dashboard: estructura

```
dashboard/ (Next.js 15, App Router, TypeScript, Tailwind, shadcn/ui, @supabase/ssr)
  app/(auth)/login
  app/page.tsx                         tablero por estado (Realtime)
  app/missions/new/page.tsx            intake (título, objetivo, repo, criterio, prioridad)
  app/missions/[id]/page.tsx           chat + eventos + preguntas + evidencia + resultado + acciones
  app/executors/page.tsx               estado, capacidad, facturación, repos
  app/tickets/page.tsx                 producción
  app/usage/page.tsx                   consumo
  app/api/ingest/feedback/route.ts     POST → tickets (dedupe, saneado)
  app/api/ingest/vercel-logs/route.ts  log drain → agregados + alertas
  app/api/cron/triage/route.ts         cada 3 h → encola misión triage si hay novedades
```

## 8. Graphify por repo

- Instalación por ejecutor: `uv tool install graphifyy`; una vez por repo `graphify install --platform claude` (añade el skill `/graphify`).
- Antes de cada misión: si `graphify-out/graph.json` no existe o su marca (`.oficina/graphify.stamp` con el SHA indexado) difiere de HEAD, `graphify update .` (sin LLM). `graphify-out/` se ignora en git.
- Uso por agentes (playbooks): `graphify query "<pregunta>" --budget 2000`, `graphify explain "<símbolo>"`, `graphify affected "<símbolo>"` antes de leer archivos a ciegas; `graphify god-nodes` para orientarse.
- Opcional: `graphify-mcp` como servidor MCP en `.mcp.json` del repo.

## 9. Separación de memorias

| Capa | Dónde | Quién escribe | Cuándo |
|---|---|---|---|
| Arquitectura y decisiones aceptadas | `docs/decisions/ADR-*.md` del repo (y `decisions` en Supabase) | tech lead, tras aprobación humana | al cerrar misión o en review |
| Hipótesis y resultados provisionales | `.oficina/notes.md` en la rama de misión | cualquier agente | durante la misión |
| Aprendizajes verificados | `.claude/agent-memory/<agente>/MEMORY.md` en el repo (scope `project`) | cada agente, con evidencia y procedencia | tras verificación |
| Memoria personal de usuarios del producto | base de datos del producto | el producto | **nunca** entra a la oficina |
