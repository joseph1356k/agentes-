# Inventario comprobado — 1 de octubre de 2026

Todo lo que aparece como **comprobado** se verificó en este entorno o en documentación vigente el 1 de octubre de 2026. Lo marcado **pendiente** no se verificó y no debe asumirse.

## 1. Herramientas en el entorno de trabajo

| Herramienta | Estado | Versión / detalle |
|---|---|---|
| Claude Code CLI | comprobado | 2.1.286 (`/opt/node22/bin/claude`) |
| Node.js / npm / pnpm / bun | comprobado | 22.22.0 / 10.9.4 / 10.28.0 / 1.3.14 |
| Python / uv / pip | comprobado | 3.11.15 / 0.8.17 / 24.0 |
| git | comprobado | 2.43.0 |
| gh CLI | comprobado | 2.89.0 (en el entorno de desarrollo del equipo debe verificarse `gh auth status`) |
| Docker | comprobado | 29.6.2 |
| PostgreSQL local | comprobado | 16.14 (usado para validar la migración) |
| `@anthropic-ai/claude-agent-sdk` | comprobado (npm) | 0.3.286 |
| `@supabase/supabase-js` | comprobado (npm) | 2.117.2 |
| Graphify (`graphifyy`) | comprobado (instalado con `uv tool install graphifyy`) | 0.9.73; ejecutables `graphify` y `graphify-mcp` |
| Codex CLI | **pendiente** | no instalado; documentación de OpenAI bloqueada por el proxy de red de este entorno |
| Supabase CLI / Vercel CLI | **pendiente** | no instalados aquí; en las máquinas del equipo se instalan en Fase 1 |

## 2. Capacidades de Claude Code y del Agent SDK (verificadas en docs)

- Subagentes: `.claude/agents/*.md` o `agents/` en plugin; frontmatter `name, description, tools, disallowedTools, model, permissionMode, maxTurns, skills, memory, mcpServers, hooks, background, omitClaudeMd, effort, isolation, initialPrompt`. Reanudables (`SendMessage`), memoria por agente, hooks por agente, 3 niveles de anidación (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), 20 concurrentes (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`), modelo forzable con `CLAUDE_CODE_SUBAGENT_MODEL(_FORCE)`. `AskUserQuestion` **no** está disponible dentro de subagentes (solo en la sesión principal).
- Agent teams: experimentales (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), solo interactivos, no reanudables, un equipo por sesión, sin anidación. **No se usan como columna vertebral.**
- Modo programático: `claude -p` con `--output-format json|stream-json`, `--json-schema`, `--resume`, `--fork-session`, `--session-id`, `--max-budget-usd`, `--max-turns`, `--permission-mode`, `--permission-prompts none`, `--agents`, `--plugin-dir`, `--append-system-prompt(-file)`, `--effort`, `--fallback-model`, `--bare` (solo API key), `--include-hook-events`, `--forward-subagent-text`. Eventos `system/init` (plugins, plugin_errors, mcp_servers), `system/api_retry` (categorías `rate_limit`, `billing_error`, `authentication_failed`, ...), `result` (`total_cost_usd`, `usage`, `permission_denials`, `structured_output`).
- Agent SDK TypeScript: `query({prompt, options})` con `cwd, model, fallbackModel, permissionMode, allowedTools, disallowedTools, canUseTool, hooks, agents, settingSources, plugins[{type:'local',path}], mcpServers, resume, forkSession, continue, systemPrompt (preset claude_code + append), maxTurns, maxBudgetUsd, effort, env, abortController, outputFormat {type:'json_schema'}, persistSession`. Métodos: `interrupt(), setPermissionMode(), setModel(), streamInput(), accountInfo(), initializationResult(), getContextUsage(), close()`. `canUseTool` recibe `AskUserQuestion` con `questions[]` y devuelve `{behavior:'allow', updatedInput:{questions, answers}}`. Hook `PreToolUse` puede devolver `permissionDecision: 'defer'`: la consulta termina para reanudarla después. Sesiones en `~/.claude/projects/<cwd-codificado>/<session>.jsonl`, reanudables desde cualquier directorio de la misma máquina.
- Plugins: `.claude-plugin/plugin.json` opcional; `agents/`, `skills/<n>/SKILL.md`, `hooks/hooks.json`, `bin/` (en el PATH del Bash tool), `scripts/`; variables `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PROJECT_DIR}`; `claude plugin validate [--strict]`.
- Hooks: eventos `SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStart, SubagentStop, PermissionRequest, Notification, SessionEnd` y más; entrada JSON por stdin (`session_id, cwd, hook_event_name, tool_name, tool_input, tool_response, tool_use_id, agent_id, agent_type`), salida JSON (`continue, stopReason, systemMessage, hookSpecificOutput{permissionDecision, permissionDecisionReason, updatedInput, additionalContext, sessionTitle}`), exit 2 = bloquear con stderr como razón.

## 3. Suscripción y facturación (estado verificado en support.claude.com, artículo 15036540)

- Texto vigente: "We're pausing the changes to Claude Agent SDK usage described below."
- Cambios descritos (en pausa): desde el 15 de junio de 2026, uso de Agent SDK y `claude -p` dejaría de contar contra los límites del plan y usaría un crédito mensual (Pro $20; Max 5x $100; Max 20x $200; Team estándar $20 / premium $100; Enterprise premium $200). Cubriría SDK en proyectos propios, `claude -p`, GitHub Actions y apps de terceros autenticadas con la suscripción. Al agotarse, pasaría a créditos de uso a tarifa API **solo si el usuario los activa**.
- Advertencia explícita: "The Agent SDK monthly credit is sized for individual experimentation and automation. Teams running shared production automation should use Claude Platform with an API key for predictable pay-as-you-go billing."
- Docs del SDK: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK."
- Conclusión operativa: el ejecutor corre con la cuenta del propio desarrollador, en su máquina; se mide consumo desde el día 1; `billing_mode` explícito; se vuelve a verificar el artículo antes de cada fase y antes de montar un ejecutor dedicado.

## 4. Repositorios: mapa identificado por inspección del código (1 oct 2026, Fase 1)

Se clonaron y leyeron `ZevCorp/U-Windows-App` (público) y `joseph1356k/Miracle-AI` (privado, acceso de lectura). La correspondencia sale de sus README/AGENTS.md, no del nombre.

| Producto del brief | Dónde vive | Stack y comandos (de package.json/README; verificar con `oficina-run`) | Reglas que la oficina respeta |
|---|---|---|---|
| **Uno = Ü** | monorepo `ZevCorp/U-Windows-App` (desde 2026-09-28): `apps/windows` (C# .NET 8 WPF con SAP GUI), `apps/mac` (Swift), `apps/android` (Kotlin, Gradle) | Windows: `dotnet build/test` solo desde Windows (contratos en `tests/ContratoDelGrafo`); Mac solo desde Mac | `required_platform` por misión; ejecutores con `platform` |
| **Miracle Notes** | mismo monorepo, `apps/web` (Next.js + Supabase, Sentry) | `pnpm dev` (puerto 3100), `pnpm test` (vitest), `pnpm lint`, `pnpm typecheck`, `pnpm build` | misión con `subdir: apps/web` |
| **Graph (cerebro de Miracle)** | mismo monorepo, `services/graph` (Node + Python; Vercel; `supabase/` propio) | `npm test` (suite de scripts verify-*), `npm run test:privacy`, `test:evals`, `build:vercel`; tiene su propio `CLAUDE.md` con reglas de Graphify | `subdir: services/graph`; `graphify-out/` sin versionar |
| **Miracle (notas con voz)** | `joseph1356k/Miracle-AI` (Python, uv): notas contextualizadas, chat `/api/chat`, voz con Deepgram, runtime upstream OpenClaw; `orchestration/` es tooling del equipo | `uv sync --extra dev`, `PYTHONPATH=src python -m miracle_agent notes`, `pytest` | repo aparte (`slug: miracle-ai`) |
| **Graphify** | **confirmado**: `AGENTS.md` del monorepo usa `graphify` (guía en `docs/herramientas/`) y `services/graph/CLAUDE.md` tiene sus reglas. `joseph1356k/Graph` es el repo de origen de Graph (el producto), no la herramienta | — | ADR-009 se mantiene |

Convenciones del monorepo (`AGENTS.md`, `.claude/rules/`): ramas `<persona>/<que-hace>` desde `main` fresco → la oficina usa `oficina/<slug>-<id8>`; `main` solo por PR con squash; commits `tipo(ámbito): lo que el sistema ahora hace` en español y minúscula; portero `git config core.hooksPath .githooks` (bloquea push a `main` y exige compilar/contratos en Windows y Android); trabajar desde la carpeta del proyecto; Graph y el portal se despliegan solos al mergear a `main` (`vercel-desplegar.yml`, con humo y rollback); producción actual `graph-eight-pied`, `itsmiracleai.com.co` hasta el corte (`docs/monorepo/despliegue.md`). Detalle en ADR-011 y `supabase/seed.sql`.

Sin identificar aún: `joseph1356k/miracle-el-rosario` (privado, 2026-09-29; posible despliegue por cliente), `ZevCorp/Miracle-AI` (público, 2026-06-18; posible copia anterior del privado), `ZevCorp/IU`, `carita-U-`, `miracle-his-simulator` (simulador de HIS: útil para pruebas de computer use).

### 4b. Nube: proyecto Supabase de la oficina (bloqueado por plan)

Intento de `create_project('oficina-ia', us-east-1)` el 1 oct 2026: rechazado. Motivo textual: "joseph1356k (2 project limit)… these users will need to either delete, pause or upgrade one or more of these projects". La organización está en plan **free** con 2 proyectos activos (`miracle-app`, `medicion-interna`). Opciones (decisión humana): (a) pasar la organización a Pro (≈ 25 USD/mes) y crear `oficina-ia`; (b) pausar `medicion-interna` u otro proyecto activo. En cuanto exista el proyecto: aplicar `supabase/migrations/0001_oficina.sql` y `supabase/seed.sql`, y poner URL y anon key en el dashboard (Vercel) y en `~/.oficina/config.json` de cada ejecutor.

Repos con acceso de escritura que no parecen productos de este brief (no se tocan): `sistema-interno-de-medici-n`, `App-de-Medici-n`, `Pagina-web-clientes-final`, `presentacion-*`, `articulos-linkedlin`, `landing-descargas`, `oficina-legal-mente`, `meditaci-n`, `UPBpagina-web`, `Hotelsanmarino`, `umo-global-dossier`, `RPOecommerce`, `Conciencia-organizacional`, `emprendehub-colombia`, `skills-antropic` (fork), `medicalautomation`, `you-experimento-loco`, `proyectos-Jero-`, `Presentaciones-hospitales-`, `presentaci-n-capital-semilla-`, `ZevCorp/Android`, `ribuzzco-coder/pagina-web-startco`, `isapantoja1/comercializadora-pantoja`.

Alcance de GitHub en esta sesión: solo `joseph1356k/agentes-`. Los demás repos no se leyeron.

## 5. Nube del equipo

**Supabase** — organización `miracle web site clients` (`oegihyuijqjgmxfykjrv`):

| Proyecto | Ref | Región | Estado | Postgres |
|---|---|---|---|---|
| miracle-app | `zyvfamlhlmztliexvmej` | us-east-1 | ACTIVE_HEALTHY | 17 |
| medicion-interna | `sxohqtdarmiomnvwhsqp` | eu-west-1 | ACTIVE_HEALTHY | 17 |
| level-up-claude | `qalopgumtvydlkbvcuim` | us-east-1 | INACTIVE | 17 |
| linkedin-posts-cms | `wxpquqvcgbwszzbpxori` | us-east-1 | INACTIVE | 17 |

Decisión: la oficina usa un proyecto **nuevo** (`oficina-ia`), nunca `miracle-app` (datos clínicos). Crearlo es un acto facturable: lo hace un humano o se aprueba explícitamente en Fase 1.

**Vercel** — equipo `Jose David 's projects` (`team_CtaJyE2ae5OQmPvQkyjqyPZC`), 25 proyectos. Relevantes: `miracle-web`, `miracle-web-testing`, `miracle-work-hub`, `viewer-feedback-loop`, `u-windows-backend`, `capturador-notas-panel`, `graph`, `medicion-interna`, `medicion`. El dashboard se desplegará como proyecto nuevo `oficina-ia`.

**GitHub**: app de Claude conectada; `gh` disponible en las máquinas del equipo (verificar).

## 6. Inventario por repo (plantilla a completar en Fase 1–2)

La **misión de inventario** (`/oficina:inventory`) produce por repo `docs/oficina/REPO.md` con esta tabla y `docs/oficina/areas/<área>.md` por especialidad. `scripts/inventory.sh` genera la parte determinista.

| Dato | Qué identificar | Cómo |
|---|---|---|
| Identidad | nombre real, ruta local, remoto, rama por defecto y de producción | `git remote -v`, `gh repo view` |
| Función | producto/componente | README, `package.json`, estructura |
| Entorno | lenguajes, gestores, versiones, comandos (`install/dev/test/lint/build/typecheck`) | `scripts/inventory.sh` |
| Calidad | pruebas existentes, cobertura aproximada, recorridos críticos | carpetas de test, CI |
| Integraciones | MCP, servicios, permisos | `.mcp.json`, `.env.example` (solo nombres), `vercel.json`, `supabase/` |
| Git | políticas de rama, protección, estado del árbol | `gh api repos/.../branches/<default>/protection` |
| Despliegue | dev/staging/prod y cómo se promueve | Vercel/Supabase MCP, CI |
| Contexto | Graphify (`graphify-out/`), `CLAUDE.md`, ADRs | presencia y frescura |
| Dependencias | contratos compartidos con otros repos | búsqueda de clientes/SDKs internos |

## 7. Accesos que deben comprobarse en cada máquina ejecutora (Fase 1)

`claude --version` y `claude auth status` (o `/login`); `gh auth status`; `git` con acceso push a los repos autorizados; `graphify --help`; `node >= 22`; permisos de red salientes a Supabase; `vercel`/`supabase` CLIs si el repo los usa en pruebas. Nada de esto se asume por existir una sesión en el navegador.
