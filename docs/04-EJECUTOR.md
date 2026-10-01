# Ejecutor (`executor/`)

Programa local, no un modelo. Recibe misiones, prepara el espacio de trabajo, inicia la herramienta, transmite eventos, recoge resultados. Código en `executor/src/`; esqueleto v0 que compila y con pruebas de la lógica sin modelo.

## 1. Responsabilidades y límites

| Hace | No hace |
|---|---|
| Reclamar misiones elegibles (`claim_mission`) respetando capacidad y repos autorizados | Decidir prioridades (eso es del humano/dashboard) |
| Crear worktree y rama por misión; escribir `.oficina/mission.json`; actualizar Graphify | Tocar el checkout del humano |
| Lanzar la sesión con el Agent SDK, el plugin `oficina` y el perfil tech lead | Guardar credenciales de modelo (usa `claude login` de la máquina) |
| Transmitir eventos y mensajes; capturar preguntas; pausar/cancelar; latido | Exponer una terminal remota |
| Verificar evidencia; subir evidencia; empujar rama; crear PR idempotente | Desplegar a producción |
| Detectar cuota agotada y pausar; registrar costo | Cambiar de proveedor o de facturación |

## 2. Configuración (`~/.oficina/config.json`)

```json
{
  "supabase_url": "https://<proyecto>.supabase.co",
  "supabase_anon_key": "<anon key>",
  "office_kit_path": "/Users/dev/.oficina/office-kit",
  "worktrees_root": "/Users/dev/.oficina/wt",
  "repos": [{ "slug": "miracle", "path": "/Users/dev/repos/miracle" }],
  "max_parallel": 1,
  "billing_mode": "subscription",
  "answer_wait_ms": 900000,
  "heartbeat_ms": 30000,
  "poll_ms": 5000,
  "max_budget_usd_default": 15,
  "max_turns_default": 400,
  "models": { "lead": "opus", "fallback": "sonnet" },
  "effort": "high",
  "max_concurrent_subagents": 3,
  "max_subagent_depth": 2,
  "dashboard_url": "https://oficina-ia.vercel.app",
  "create_pr": true
}
```

Credenciales de la cola en `~/.oficina/credentials.json` (JWT de Supabase del desarrollador, modo 0600). Las credenciales de Claude son las de `claude login` del usuario del sistema; el ejecutor no las lee ni las copia.

## 3. Ciclo de vida de una misión (`src/runner.ts`)

1. `transition → preparing`; `prepareWorkspace()` (`src/workspace.ts`): `git fetch`, rama `mission/<id8>-<slug>` desde `origin/<default>` o la existente si se retoma, `git worktree add` bajo `worktrees_root/<repo>/<id>`, `info/exclude` para `.oficina/evidence/`, `graphify-out/`, etc.
2. `writeMissionJson()`; `graphifyUpdateIfStale()` (`graphify update . --no-viz` si el stamp ≠ HEAD; nunca falla la misión).
3. Decide entrada: **nueva** (`/oficina:mission "<título>"` + objetivo + criterio + decisiones) o **reanudación** (`resume: session_id` con un prompt de continuación) cuando la misión viene de `waiting_answer`, `paused`, `paused_quota`, `changes_requested`, `blocked` o `failed` y el ejecutor es el mismo (la sesión vive en su disco). Si es otro ejecutor, sesión nueva con instrucción de retomar desde la rama y `.oficina/notes.md`.
4. `transition → running`; latido cada 30 s con push de la rama si hay commits nuevos (y actualización de `head_sha`).
5. Consume los eventos del proveedor y persiste: texto del lead → `mission_messages`; herramientas, subagentes, preguntas, reintentos, resultado → `mission_events`.
6. Al `result`: registra uso y costo; decide estado final:
   - `deferred_tool_use.name == AskUserQuestion` → `waiting_answer`.
   - cuota (`rate_limit`/`billing_error` con ≥3 reintentos) → `paused_quota` y ejecutor `quota_exhausted`.
   - error/`subtype ≠ success` → `failed` (1er intento) o `blocked` (2º).
   - informe estructurado → `verifyResult()` cruza `tests[]` con `.oficina/evidence/ev_*.json` → `review` (verificado o con flag `unverified`) o `blocked`.
7. Push final, subida de evidencia a Storage (`evidence/<mission>/`), PR idempotente (`operations` clave `mission:<id>:pr`), `transition` final con `head_sha`, `session_id`, `cost_usd`, `result`, `pr_url`.

## 4. Sesión con el Agent SDK (`src/providers/claude.ts`)

Opciones usadas (todas documentadas): `cwd` (worktree), `model`, `fallbackModel`, `effort`, `permissionMode: 'acceptEdits'`, `allowedTools` (Bash, Read, Edit, Write, Glob, Grep, WebFetch, WebSearch, Agent, Skill, AskUserQuestion, Task*, SendMessage), `plugins: [{type:'local', path: office_kit}]`, `settingSources: ['project']` (carga `CLAUDE.md` y `.claude/` del repo, no los del usuario, para que el resultado no dependa de la máquina), `systemPrompt: {type:'preset', preset:'claude_code', append: <cuerpo de agents/tech-lead.md>}`, `maxBudgetUsd`, `maxTurns`, `env` (`OFICINA_ROOT`, `OFICINA_EVIDENCE_DIR`, `OFICINA_MISSION_ID`, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=3`, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2`), `abortController`, `outputFormat: {type:'json_schema', schema: mission-result}`, `hooks` (PreToolUse·AskUserQuestion, SubagentStart, SubagentStop), `canUseTool`, `resume`.

Verificación obligatoria en `system/init`: `plugins` debe incluir `oficina`; si no, la misión falla antes de trabajar (nunca se corre sin guardas). `apiKeySource === 'none'` ⇒ facturación por suscripción (`claude login`); cualquier otro valor ⇒ `api_key`. Se contrasta con `billing_mode` declarado y se publica en `executors.billing`.

### Preguntas (`AskUserQuestion`)

```
hook PreToolUse(AskUserQuestion)
  ├─ ¿hay respuesta ya registrada para estas preguntas? → allow + updatedInput{questions, answers}
  ├─ registra `questions` (status open) → dashboard la muestra
  ├─ espera hasta answer_wait_ms (15 min) → allow + answers
  └─ sin respuesta → defer → la consulta termina con result.deferred_tool_use → misión waiting_answer
reanudación (respuesta llegó): query({resume}) → el hook se reinvoca y encuentra la respuesta → allow
segundo camino: si el flujo de permisos llega a canUseTool, responde con la respuesta registrada o deniega con instrucción de reportar la pregunta en el informe
```

Qué verificar en la primera misión real (no se pudo probar sin cuenta en este entorno): que `defer` termina la consulta con `deferred_tool_use`, que al reanudar el hook se reinvoca (si no, el prompt de reanudación ya lleva las respuestas), y que `updatedInput` con `answers` es aceptado por la herramienta.

### Pausa y cancelación

El dashboard cambia `missions.status` (`paused`/`cancelled`) por `transition_mission`; el ejecutor está suscrito (Realtime) y llama `interrupt()` y aborta. La sesión queda en disco; `paused → queued` reanuda con preferencia por el mismo ejecutor. `cancelled` conserva la rama.

### Cuota y errores del proveedor

`system/api_retry` con `error ∈ {rate_limit, billing_error, account_on_hold}` tres veces seguidas ⇒ se interrumpe y la misión pasa a `paused_quota`; el ejecutor queda `quota_exhausted` (el dashboard lo muestra; `quota_reset_at` solo si el proveedor lo expone). `authentication_failed`/`oauth_org_not_allowed` ⇒ `failed` con motivo claro. Transitorios (`overloaded`, `server_error`) los reintenta el SDK; no cuentan como intentos de solución.

## 5. Latido, orfandad y dos escritores

Latido cada 30 s (`heartbeat` RPC). `mark_orphans()` (pg_cron, cada minuto) marca `orphaned` las misiones activas de ejecutores sin latido > 2 min y las reencola; el ejecutor caído, al volver, no retoma nada por su cuenta: solo lo que reclame. `claim_mission` usa `FOR UPDATE SKIP LOCKED`: una misión nunca tiene dos ejecutores. Parada ordenada (`SIGINT`/`SIGTERM`): misiones activas → `paused` → `queued` con preferencia por este ejecutor; `executors.status = offline`.

## 6. Evidencia y verificación (`src/evidence.ts`)

`readEvidenceDir()` lee `ev_*.json`; `verifyResult()` exige para cada `tests[]` con `pass` un registro con `exit_code 0` (y existencia para `fail`); `completed` sin pruebas no se verifica. `effectiveOutcome()` decide `review` (verificado o no) o `blocked`. Pruebas unitarias en `src/evidence.test.ts`.

## 7. Publicación (`src/publish.ts`)

`createPrIfMissing()`: clave `mission:<id>:pr` en `operations`; si existe `done`, devuelve la URL; si no, consulta `gh pr list --head`; si no hay, `gh pr create --base <default> --head <rama>` con cuerpo generado del informe. Requiere `gh` autenticado en la máquina. Nunca crea dos PRs.

## 8. Empaquetado y servicio

`pnpm build` → `dist/cli.js`. Como servicio de usuario:

- macOS: `launchd` (`~/Library/LaunchAgents/com.oficina.executor.plist` con `KeepAlive`), o `pm2 start dist/cli.js --name oficina -- start && pm2 save`.
- Linux: `systemd --user` con `Restart=always`.
- Windows: `pm2` o Tarea programada al iniciar sesión.

Cerrar el navegador o la terminal no afecta al daemon. Apagar el computador sí: la misión queda `orphaned` → `queued` y otro ejecutor la retoma desde la rama.

## 9. Pruebas incluidas y pendientes

| Ya probado aquí | Pendiente (Fase 1, con cuenta real) |
|---|---|
| máquina de estados (`state.test.ts`) | `query()` con plugin: `init.plugins` incluye `oficina` |
| verificación de evidencia (`evidence.test.ts`) | `defer`/reanudación de `AskUserQuestion` |
| worktrees y push con git real (`workspace.test.ts`) | `outputFormat` devuelve `structured_output` conforme al esquema |
| esquema SQL y RPCs (smoke test en Postgres 16) | costo/uso en `result` con suscripción |
| hooks del kit con payloads reales | `accountInfo()` y `apiKeySource` |

## 10. Adaptador Codex (diferido)

Misma interfaz `Provider` (`src/types.ts`). Plan: `codex exec --json` (eventos JSONL) con `-C <worktree>`, `--output-schema` para el informe, `codex exec resume <id>` para reanudar, sandbox `workspace-write`; autenticación `codex login` del desarrollador. Se implementa cuando se verifique la documentación vigente (bloqueada desde este entorno) y la política de uso del plan de ChatGPT para automatización. Una misión usa un solo proveedor; cambiar de proveedor = nueva misión con traspaso (`notes.md`, `report.md`).
