# Plan maestro — Oficina de desarrollo con IA

Versión 1.0 · 1 de octubre de 2026 · Estado: **decidido y listo para ejecutar**.
Base: `Plan_Oficina_IA_Desarrollador.md` y `Contexto_Maestro_Oficina_IA_Claude_Code.md` (29 sep 2026).

Este documento toma las decisiones que el brief dejó abiertas, las justifica con lo que comprobé hoy en el entorno y en la documentación vigente, y deja el sistema listo para empezar a asignar misiones. Lo que aquí se decide manda sobre los documentos de detalle (`01`–`08`) y sobre el kit (`office-kit/`).

---

## 0. Resumen ejecutivo

**Qué construimos.** Una oficina de agentes de desarrollo con un tech lead que entiende el objetivo, pregunta solo lo que cambia la solución, trabaja o delega en seis especialidades, y entrega código en una rama con evidencia verificable. Tres piezas: un **kit** (plugin de Claude Code con los 7 perfiles, el protocolo de misión y los guardas), un **ejecutor** local (daemon en los computadores del equipo que corre misiones con la suscripción propia de cada desarrollador) y un **dashboard** en nube (Supabase + Vercel) con cola persistente, preguntas, evidencia, tickets y aprobaciones.

**Qué decidí.** Subagentes nativos de Claude Code en lugar de "agent teams" (los teams son experimentales, no funcionan en modo programático y no se reanudan). Agent SDK TypeScript como motor del ejecutor (expone preguntas, permisos, reanudación, costos y estructura de salida). Supabase como única persistencia (Postgres + Realtime + Storage + Auth) y Next.js en Vercel como interfaz. Git worktrees por misión. Evidencia **capturada por hooks, no autodeclarada**. Facturación por suscripción de cada ejecutor, sin cambio silencioso a API.

**Qué entrego hoy.** El kit completo y validado (usable ya en cualquier repo con `claude --plugin-dir`), el esquema SQL validado en Postgres, el esqueleto tipado del ejecutor, el inventario comprobado, y este plan con fases, pruebas de aceptación y métricas.

**Qué sigue.** Fase 1 (1–2 semanas): crear el proyecto Supabase, terminar ejecutor y dashboard mínimos y cerrar el primer recorrido completo sobre un repo real.

---

## 1. Qué entendí del brief

1. Prioridad: entregar código útil y probado con poca coordinación. No seis agentes conversando; una startup pequeña con especialistas fuertes que entran cuando aportan.
2. Unidad de trabajo: la **misión** (objetivo, decisiones, tareas, rama, pruebas, resultado). No un chat eterno.
3. Un tech lead como punto de contacto que también programa; seis especialidades reutilizables (memoria, voz, computer use, backend, frontend, calidad) que actúan como conocimiento cargado o como subagente delimitado.
4. Normalmente 1–3 agentes activos por misión; el paralelismo solo para partes independientes; límites globales por capacidad y cuota.
5. Híbrido: dashboard y vigilancia en nube; ejecución en los computadores del equipo con su autenticación oficial. Cerrar el navegador no cancela nada. Sin ejecutor encendido, las tareas esperan.
6. Producción alimenta la cola: feedback registrado al llegar, logs cada 3 horas, fallos críticos inmediatos, mejoras con evidencia. Un ticket no autoriza un cambio en producción.
7. Rama por misión, worktrees si hay edición paralela, staging real, aprobación atada al commit probado, comprobación posterior.
8. No son requisitos: Temporal, Kubernetes, bases vectoriales, microservicios, apps de terceros completas, equipos permanentes, mezclar Claude y Codex por misión.

---

## 2. Qué comprobé hoy (hechos) y qué sigue siendo supuesto

| Tema | Hecho comprobado (1 oct 2026) | Fuente |
|---|---|---|
| Claude Code instalado | v2.1.286. Soporta `-p`, `--output-format stream-json`, `--resume`, `--fork-session`, `--agents`, `--worktree`, `--bg`, `--json-schema`, `--max-budget-usd`, `--permission-prompts none`, `--effort`, `--fallback-model`, `--plugin-dir` | `claude --help` en el entorno |
| Subagentes | Archivos `agents/*.md` con `name, description, tools, disallowedTools, model, permissionMode, maxTurns, skills, memory, hooks, background, effort, isolation`. Contexto propio. **Reanudables** por `SendMessage`. Memoria persistente por agente. 3 niveles de anidación y 20 concurrentes por defecto (configurables) | docs `sub-agents` |
| Agent teams | **Experimentales**, desactivados por defecto, **no funcionan en `-p`/SDK**, no se reanudan, un equipo por sesión | docs `agent-teams` |
| Agent SDK (TS) | `query()` con `canUseTool` (preguntas `AskUserQuestion` incluidas), `hooks`, `plugins`, `resume`, `forkSession`, `maxBudgetUsd`, `maxTurns`, `effort`, `outputFormat` (JSON Schema), `interrupt()`, `accountInfo()`; `result.total_cost_usd`, `usage`, `permission_denials`, `deferred_tool_use`. Un hook `PreToolUse` puede devolver `defer`: la sesión termina y se reanuda después | docs `agent-sdk/typescript`, `user-input`, `hooks`, `sessions` |
| Plugins | Layout `.claude-plugin/plugin.json` + `agents/ skills/ hooks/ bin/`; `claude plugin validate --strict` existe; en el SDK se cargan con `plugins: [{type:'local', path}]` y el `system/init` lista `plugins`/`plugin_errors` | docs `plugins-reference`, `agent-sdk/plugins`; CLI |
| Suscripción y SDK | Anthropic anunció un crédito mensual para Agent SDK/`claude -p` (Pro $20, Max 5x $100, Max 20x $200, Team/Enterprise según asiento) **y actualmente dice que esos cambios están pausados**. Nota explícita: "Teams running shared production automation should use Claude Platform with an API key". Y en el SDK: no se permite ofrecer login de claude.ai a terceros sin aprobación | support.claude.com artículo 15036540; docs `agent-sdk/overview` |
| Graphify | Paquete PyPI `graphifyy` (v0.9.73), comando `graphify`. Instalado hoy y verificado: `install`, `update`, `watch`, `query`, `path`, `explain`, `affected`, `god-nodes`, `merge-graphs`, servidor MCP `graphify-mcp`. Salida en `graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `graph.html`) | `graphify --help` en el entorno; repo Graphify-Labs |
| Codex | **No instalado** en este entorno y la documentación de OpenAI está bloqueada por el proxy de red. No lo verifiqué | entorno |
| Repos del equipo | 34 repos accesibles. Candidatos a Uno / Miracle / Miracle Notes identificados pero **no confirmados** (ver `01-INVENTARIO.md`) | `list_repos` |
| Supabase | Org "miracle web site clients". Proyectos: `miracle-app` (activo), `medicion-interna` (activo), `level-up-claude` y `linkedin-posts-cms` (inactivos) | MCP Supabase |
| Vercel | Equipo "Jose David 's projects" con 25 proyectos (`miracle-web`, `miracle-web-testing`, `u-windows-backend`, `capturador-notas-panel`, `graph`, ...) | MCP Vercel |

**Actualización Fase 1 (misma fecha, segunda sesión):** la correspondencia repo↔producto quedó identificada por inspección del código: `ZevCorp/U-Windows-App` es el monorepo Ü con Ü (Windows/Mac/Android), Miracle Notes (`apps/web`) y Graph (`services/graph`); `joseph1356k/Miracle-AI` es Miracle (notas con voz sobre OpenClaw). "Graphify" es la herramienta de Graphify-Labs (confirmado en su `AGENTS.md`). La oficina se adaptó a las convenciones del monorepo (ADR-011). El proyecto Supabase `oficina-ia` **no se pudo crear**: la organización está en plan free y el usuario tiene 2 proyectos activos (límite); requiere subir a Pro o pausar uno. Siguen como supuestos: el plan de Claude de cada desarrollador y los comandos reales de cada subproyecto (los verifica la misión de inventario).

---

## 3. Decisiones

| # | Tema | Decisión | Por qué | Descartado |
|---|---|---|---|---|
| D1 | Mecanismo de especialización | **Subagentes** de Claude Code definidos en el plugin, más **playbooks** (skills) que la sesión principal carga sin delegar | Reanudables, con memoria propia, hooks propios y funcionan en modo programático; implementan literalmente las "dos formas de especialización" del brief | Agent teams (experimentales, solo interactivos, no reanudables); orquestador externo paso a paso |
| D2 | Motor del ejecutor | **Claude Agent SDK (TypeScript)** sobre Node 22 | Expone en código lo que necesitamos: preguntas, permisos, `defer`, reanudación, presupuesto, costo, salida estructurada, plugins, hooks | Parsear `claude -p` a mano; Python SDK (sin `SessionStart` ni varios hooks) |
| D3 | Dónde corre la IA | **Computadores del equipo**, un ejecutor por desarrollador, con su `claude login` | Es lo acordado; aprovecha suscripciones; sin credenciales en la nube | Modelo en la nube con API key desde el día 1 |
| D4 | Persistencia | **Supabase** (Postgres + Realtime + Storage + Auth + pg_cron) en un **proyecto nuevo y separado** `oficina-ia` | Una sola pieza cubre cola, eventos en vivo, archivos de evidencia, acceso y tareas programadas; el equipo ya lo usa. Separado de `miracle-app` por datos médicos | SQLite local (no da dashboard ni cola compartida); Temporal; colas dedicadas |
| D5 | Interfaz | **Next.js (App Router) en Vercel** con Supabase Realtime | Mismo stack del equipo; despliegue en minutos; previews por PR | App de escritorio; app de terceros completa |
| D6 | Unidad y estado | Tabla `missions` con máquina de estados explícita (§6) y `mission_events` como bitácora | Estado recuperable, pausable, visible; evita dos escritores | Estado implícito en la sesión de Claude |
| D7 | Aislamiento de código | **Rama `mission/<id>-<slug>` + git worktree** bajo `~/.oficina/wt/<repo>/<id>`; el árbol del humano no se toca | Varias misiones por repo sin colisiones; cumple "coexistencia con trabajo humano" | Clonar el repo por misión (lento, pesado) |
| D8 | Edición paralela dentro de una misión | Mismo worktree con **propiedad de archivos declarada** en el encargo y verificada por hook (`scope-guard`) | Simple y suficiente para 1–3 agentes; rama de integración solo si hay sub-misiones | `isolation: worktree` por subagente (se ramifica desde la rama por defecto, no desde la misión) |
| D9 | Evidencia | **Capturada por el sistema**: `oficina-run` registra comando, código de salida y log; el informe final (JSON Schema) debe citar IDs de evidencia; el ejecutor cruza ambos | "No declarar pruebas aprobadas si no se ejecutaron" se vuelve verificable, no una promesa | Confiar en el texto del agente |
| D10 | Preguntas al humano | `AskUserQuestion` → hook espera un rato corto; si no hay respuesta, **difiere** (`defer`), libera el ejecutor y la misión queda en `waiting_answer`; al responder se reanuda la sesión | Sin procesos colgados; preguntas visibles en el dashboard; estado explícito | Mantener el proceso esperando indefinidamente |
| D11 | Delegación | Política de 4 niveles (§7): directo / directo con playbook / hasta 2 especialistas en paralelo / transversal con contratos. Máx. **3 subagentes concurrentes por misión**, **1 misión activa por ejecutor** al inicio | Es la política del brief, con límites que se miden antes de subirlos | Delegar por capas siempre; investigadores indefinidos |
| D12 | Revisión independiente | Agente `revisor` (perfil de calidad en modo lectura, modelo fuerte, contexto limpio) para cambios de riesgo medio/alto; obligatorio en misiones transversales y antes de aprobar | "Evaluación independiente" sin otro proveedor | Revisión por el mismo contexto que escribió el código |
| D13 | Modelos iniciales | Tech lead `opus` (esfuerzo alto); especialistas `sonnet`; revisor `opus`; triage `haiku`. Todo configurable | Equilibrio costo/calidad razonable para empezar; se mide (§15) | Fijar un modelo único |
| D14 | Facturación | `billing_mode` por ejecutor: `subscription` (defecto) o `api_key` (explícito, con tope mensual). Nunca cambio automático. El dashboard muestra el modo y el costo estimado | Lo exige el brief; el estado del crédito SDK está pausado y debe verificarse por cuenta | Cuenta compartida; rotación de cuentas |
| D15 | Codex | **Adaptador diferido** (Fase 5). La interfaz `Provider` queda definida hoy; se implementa cuando se verifique `codex exec --json` y su política de autenticación | No verificable desde este entorno; el brief no exige ambos proveedores | Implementar a ciegas |
| D16 | Graphify | `graphifyy` instalado por ejecutor; índice local por repo (`graphify-out/` ignorado en git), actualizado incrementalmente antes de cada misión; hook `SessionStart` informa frescura; servidor MCP `graphify-mcp` opcional | Verificado hoy; contexto bajo demanda sin cargar todo el repo | Inventar un MCP; indexar en cada prompt |
| D17 | Memoria de desarrollo | Cuatro capas separadas: ADRs en `docs/decisions/` (aceptado), notas de misión en la rama (hipótesis), memoria por agente `.claude/agent-memory/<agente>/` (aprendizajes con evidencia), y **nunca** memoria personal de usuarios del producto | Cumple §9 del brief con mecanismos nativos | Un único "cerebro" compartido |
| D18 | Circuito de producción | Ingesta determinista en nube (dedupe por huella, severidad por reglas, **sin LLM**) → alertas críticas inmediatas; triage con modelo económico **como misión** cada 3 h en un ejecutor; mejoras y correcciones nacen como misiones en `draft` que un humano prioriza | La nube no necesita credenciales de modelo; cumple "ticket ≠ orden" | Agente permanente por fuente; clasificación LLM en la nube desde el día 1 |
| D19 | Idempotencia | Tabla `operations` con clave `mission:<id>:<op>` para PR, despliegue y publicación | Evita duplicar PRs al reintentar | Confiar en el agente |
| D20 | Datos sensibles | Minimización en la ingesta (lista blanca de campos), texto libre separado en columna privada, logs y tickets tratados como datos no confiables por skill y por CLAUDE.md | Proyecto médico; prompt injection por logs | Pasar logs crudos a los agentes |

---

## 4. Arquitectura en una página

```
                         ┌──────────────────────────── NUBE (Vercel + Supabase) ────────────────────────────┐
                         │                                                                                  │
  Equipo (navegador) ───►│  Dashboard Next.js            Supabase: Postgres + Realtime + Storage + Auth     │
   · pide misiones       │  · misiones / chat por misión  · missions, mission_events, questions, evidence   │
   · responde preguntas  │  · preguntas pendientes        · tickets, alerts, approvals, operations          │
   · aprueba versiones   │  · evidencia y resultado       · executors (latido), usage_ledger                │
                         │  · tickets y consumo           · RPC claim_mission / heartbeat; pg_cron huérfanas│
  Producción ───────────►│  Ingesta: /api/ingest/{feedback,vercel-logs,supabase-logs}  → tickets/alerts     │
  (feedback, log drains) │  Cron 3 h: encola misión `triage` si hay tickets nuevos (sin LLM en la nube)     │
                         └───────────────────────────────▲──────────────────────────────────────────────────┘
                                                         │ HTTPS saliente, JWT de usuario (RLS), Realtime
                         ┌───────────────────────────────┴───────── COMPUTADOR DEL DESARROLLADOR ───────────┐
                         │  Ejecutor (`oficina-executor`, daemon Node 22)                                   │
                         │   1. reclama misión (claim)  2. prepara worktree  3. actualiza Graphify          │
                         │   4. lanza sesión con Agent SDK + plugin `oficina`  5. transmite eventos         │
                         │   6. captura preguntas (defer/resume)  7. verifica evidencia  8. empuja rama     │
                         │                                                                                  │
                         │  Sesión principal = tech-lead ──► subagentes: memoria | voz | computer-use |     │
                         │  (Claude Code, `claude login`)      backend | frontend | calidad | revisor       │
                         │  Worktree ~/.oficina/wt/<repo>/<id>  rama mission/<id>-<slug>  .oficina/evidence │
                         └──────────────────────────────────────────────────────────────────────────────────┘
```

Tres componentes, tres responsabilidades:

- **`office-kit/`** (plugin): quién es cada agente, cómo se encarga y devuelve trabajo, qué se puede y no se puede hacer (hooks), cómo se registra evidencia. Funciona solo, de forma interactiva, sin ejecutor ni nube.
- **`executor/`**: convierte una fila de `missions` en una sesión de Claude Code reanudable, con latido, preguntas, pausa, cancelación, presupuesto y evidencia subida.
- **`dashboard/`** + **`supabase/`**: cola persistente, visibilidad, decisiones humanas (respuestas, prioridad, aprobación) y entrada de producción.

Detalle en `02-ARQUITECTURA.md`.

---

## 5. El equipo

| Agente (`oficina:`) | Rol | Modelo | Herramientas | Memoria | Entra cuando |
|---|---|---|---|---|---|
| `tech-lead` | Sesión principal. Entiende, pregunta, define criterio de aceptación, programa, delega, integra, redacta el informe | opus · esfuerzo alto | todas + `Agent` limitado a los 7 perfiles | project | siempre |
| `memoria-contexto` | Recuerdos, recuperación, selección de contexto, preferencias y correcciones del usuario, enseñanzas | sonnet | Read, Edit, Write, Bash, Glob, Grep, Agent(Explore) | project | la misión toca memoria/contexto del producto |
| `voz-conversacion` | Captura, transcripción, síntesis, interrupciones, latencia, reconexión | sonnet | ídem | project | cambia audio/transcripción/turnos |
| `computer-use` | Acciones sobre apps, permisos, verificación, recuperación de fallos | sonnet | ídem | project | cambia cómo el asistente actúa sobre el computador |
| `backend-agentes` | Servicios, datos, auth, APIs, comunicación entre agentes del producto | sonnet | ídem | project | cambia servicios/esquemas/contratos |
| `frontend-experiencia` | Interfaz, estados, configuración, feedback, visibilidad | sonnet | ídem | project | cambia UI/estados |
| `calidad` | Pruebas completas, regresiones, evaluaciones de comportamiento, incidentes; ejecuta triage | sonnet (triage: haiku) | ídem | project | siempre que haya riesgo o antes de aprobar |
| `revisor` | El perfil de calidad en **modo lectura**: revisión independiente del diff con contexto limpio | opus | Read, Glob, Grep, Bash (solo correr pruebas) | — | riesgo medio/alto y misiones transversales |

Cada especialidad tiene un **playbook** (`office-kit/skills/playbook-<área>/SKILL.md`): mapa del área, decisiones vigentes, comandos, pruebas, referencias. El playbook genérico se completa con `docs/oficina/areas/<área>.md` en cada repo, que produce la **misión de inventario** (la primera misión de cada repo). Así cada agente llega con instrucciones breves, mapa, comandos y pruebas, y comprueba el estado real del código en lugar de "ser experto".

Detalle, prompts y protocolos en `03-EQUIPO-Y-DELEGACION.md` y en `office-kit/agents/`.

---

## 6. Cómo fluye una misión

```
 draft ──► queued ──► claimed ──► preparing ──► running ◄──► waiting_answer
                                                 │  ▲
                 (humano) paused ◄───────────────┤  │ (respuesta / reanudar)
                                                 ▼  │
             blocked ◄── (2 intentos fallidos, acceso faltante, decisión que cambia la solución)
                                                 │
                                   review ──► changes_requested ──► running
                                     │
                                   staging ──► approved(sha) ──► released ──► verified
                                                                       └──► regressed ──► (nueva misión)
 cualquiera ──► cancelled        claimed/running ──► orphaned (sin latido 2 min) ──► queued (otro ejecutor retoma desde la rama)
 running ──► paused_quota (cuota agotada) ──► queued (al reiniciar la cuota)   running ──► failed (error de proveedor / presupuesto)
```

1. **Intake.** El humano crea la misión en el dashboard (título, objetivo, repo, criterio de aceptación si lo sabe) o llega un ticket de producción. Estado `queued`.
2. **Claim.** Un ejecutor conectado con ese repo autorizado y capacidad libre la reclama (`claim_mission`, `FOR UPDATE SKIP LOCKED`): nunca dos ejecutores sobre la misma misión.
3. **Preparación.** `git fetch`; worktree nuevo en `mission/<id>-<slug>` desde la rama base (o checkout de la rama existente si se retoma); `.oficina/mission.json`; `graphify update` si el índice está viejo.
4. **Sesión.** El ejecutor lanza `query()` con el plugin y el perfil `tech-lead`. El hook `SessionStart` inyecta la misión. El tech lead consulta contexto, **pregunta solo si falta una decisión que cambie la solución**, define resultado esperado y cómo comprobarlo, y trabaja directo o delega (§7). Todo evento relevante (texto, herramienta, subagente, commit) se transmite a `mission_events`; el chat con el tech lead son los `mission_messages`.
5. **Preguntas.** `AskUserQuestion` llega al dashboard. Si nadie responde en 15 minutos, la sesión se difiere y el ejecutor queda libre; al responder, se reanuda exactamente donde iba.
6. **Evidencia.** Las pruebas se corren con `oficina-run` (registra comando, salida, código). El informe final cumple `mission-result.schema.json` y cita IDs de evidencia. El ejecutor verifica: una prueba "pass" sin evidencia con código 0 marca el resultado como **no verificado** y la misión va a `review` con advertencia, nunca a "completada".
7. **Review.** El ejecutor empuja la rama, crea el PR (idempotente) y sube la evidencia. El dashboard muestra diff, pruebas, decisiones, bloqueos. Si hubo riesgo medio/alto, el `revisor` ya dejó su informe; si no, se puede pedir desde el dashboard.
8. **Staging.** Preview de Vercel por PR (frontend) o entorno de staging del repo; migraciones de datos con tratamiento explícito (ver `02`).
9. **Aprobación.** Botón en el dashboard → fila en `approvals` con el **SHA probado**. Un push posterior invalida la aprobación (trigger) y vuelve a `review`.
10. **Release y verificación.** Merge/despliegue según el repo; después, una comprobación de la señal que originó la misión (ticket, métrica, recorrido) → `verified` o `regressed`.

La misión conserva: objetivo, decisiones, preguntas y respuestas, eventos, evidencia, costo, SHA aprobado y resultado. Cerrar el navegador no afecta nada: el estado vive en Supabase y la sesión en el disco del ejecutor.

---

## 7. Protocolo de encargo y de retorno (resumen)

**Política de delegación del tech lead** (en su prompt y en `/oficina:mission`):

| Nivel | Situación | Qué hace |
|---|---|---|
| N0 | Cambio pequeño y claro | Lo hace directo con las pruebas pertinentes. No delega. |
| N1 | Cambio dentro de una especialidad | Carga el playbook del área y lo hace directo; `revisor` si riesgo ≥ medio |
| N2 | Dos partes independientes y separables | Hasta 2 especialistas en paralelo con archivos propios declarados; el lead integra y prueba el conjunto |
| N3 | Cambio transversal | Investiga (Explore), acuerda contratos, implementa en unidades integrables; `revisor` obligatorio |

Delega solo si hay entrega clara, poca dependencia continua, contexto separable y ventaja real. Nunca delega cambios triviales ni abre investigaciones sin fin. Después de **dos intentos** fallidos de resolver algo, escala con evidencia (estado `blocked`), no insiste.

**Encargo** (`/oficina:handoff`, archivo `.oficina/handoffs/<agente>-<n>.md`): objetivo y comportamiento esperado · repo, SHA base y contexto (archivos, consultas Graphify) · alcance y archivos propios · restricciones · dependencias y contratos · evidencia requerida (comandos exactos) · criterio de finalización · motivos de escalamiento · presupuesto de turnos.

**Retorno** (todos los agentes, sin excepción): resumen · cambios o hallazgos · evidencia (IDs de `oficina-run`) · referencias a archivos/commits · bloqueos · `parcial: sí/no` · aprendizajes propuestos con su evidencia. No se declara una prueba aprobada si no se ejecutó.

La comunicación pasa por el tech lead y por artefactos (`.oficina/`, ADRs, memoria de agente). Una consulta directa entre especialistas es válida si resuelve una dependencia, pero la decisión queda registrada. No hay chat permanente.

---

## 8. Evidencia y confianza

Cuatro capas, de más barata a más fuerte:

1. **Ledger de comandos** (`hooks/hooks.json` → `scripts/ledger.sh`): cada `Bash` queda en `.oficina/evidence/commands.jsonl` con marca de tiempo, agente y comando.
2. **`oficina-run <comando>`** (en `bin/`, por tanto en el `PATH` del Bash tool): ejecuta, guarda `log` completo, código de salida y duración, y devuelve un recibo `EVIDENCE id=... exit=...`. Los playbooks obligan a usarlo para pruebas, lint y build.
3. **Informe estructurado** (`schemas/mission-result.schema.json` vía `outputFormat`): `status`, `changes`, `tests[{evidence_id, verdict}]`, `not_tested`, `decisions`, `learnings`, `blockers`, `questions`, `risk`, `delegations`.
4. **Verificación cruzada en el ejecutor**: para cada `tests[]` con `verdict: pass` debe existir `.oficina/evidence/<id>.json` con `exit_code: 0`; de lo contrario el resultado se marca `unverified` y la misión no pasa de `review`. Un `Stop` hook impide terminar el turno con cambios sin commit.

---

## 9. Git, ambientes y entrega

- Rama por misión: `mission/<id8>-<slug>`. Base: la rama por defecto del repo (configurable por repo).
- Worktrees bajo `~/.oficina/wt/<repo>/<id>`; el checkout del humano nunca se toca. Guardas (`scripts/guard.sh`): sin `push --force`, sin push a ramas protegidas, sin `checkout`/`switch` fuera de la rama de misión, sin `vercel --prod`, sin `npm publish`, sin `rm -rf` fuera del worktree.
- Commits frecuentes por el agente (regla de CLAUDE.md); el ejecutor empuja la rama al terminar cada turno y en cada latido si hay commits nuevos. Si la máquina muere, lo no commiteado se pierde y se dice así.
- Rama de integración `mission/<padre>-integration` solo cuando una misión tiene varias sub-misiones integrables.
- PR por misión, creado por el ejecutor con clave idempotente. Puertos y recursos de prueba separados por agente cuando corren pruebas en paralelo (`PORT` desplazado, declarado en el encargo).
- Staging real por repo (`repos.staging`): preview de Vercel por PR, entorno de staging dedicado, o ramas de Supabase para cambios de esquema. Migraciones de datos y compatibilidad entre servicios: tratamiento explícito en el encargo y en la revisión.
- Aprobación atada al SHA; un push posterior la invalida. Después de publicar, comprobación de la señal original.
- Tareas entre repos: el tech lead identifica compatibilidad y orden; cada repo es su misión; una misión padre coordina y **no se declara completa** hasta que todas las partes están publicadas y comprobadas.

---

## 10. Producción aporta trabajo

| Entrada | Nube (determinista, sin LLM) | Ejecutor (modelo económico, como misión) |
|---|---|---|
| Feedback de usuarios | `POST /api/ingest/feedback` → ticket con huella (`repo+ruta+tipo`), duplicados agrupados, severidad por reglas | Misión `triage` cada 3 h: clasifica, agrupa, propone misiones en `draft` con criterio de resolución |
| Logs y métricas | Log drain de Vercel y consulta de logs de Supabase → agregados por ventana (tasa 5xx, errores nuevos, latencia) | La misión `triage` lee los agregados y las muestras saneadas; propone correcciones con evidencia |
| Fallos críticos | Reglas inmediatas (umbral 5xx/5 min, excepción no controlada, caída de health check) → `alerts` + notificación (webhook/email). Dedupe por huella y ventana | Opcional: misión urgente creada por un humano desde la alerta |
| Mejoras | — | Revisión acotada con evidencia y forma de medir; nace como misión `draft` |

Reglas: los tickets y logs son **datos no confiables** (los skills los envuelven como datos; CLAUDE.md prohíbe seguir instrucciones incrustadas). Datos mínimos y saneados antes de llegar a un agente (lista blanca de campos; texto libre en columna privada solo para humanos). Ningún ticket crea un cambio en producción sin la cadena misión → review → aprobación. Después de publicar se comprueba la señal original (`verified`/`regressed`).

---

## 11. Costos, cuotas y credenciales

- Cada ejecutor usa **su** `claude login`. `billing_mode: subscription` por defecto. El SDK reporta `accountInfo()` y el ejecutor lo publica en `executors`; el dashboard muestra "suscripción (estimado)" o "API key (real)".
- Estado verificado hoy: Anthropic anunció un crédito mensual para SDK/`claude -p` desde el 15 de junio de 2026 y **actualmente indica que esos cambios están pausados**. Hasta nuevo aviso, asumir que el uso programático consume los límites normales del plan de cada cuenta. Verificar en cada cuenta antes de prometer capacidad; no inventar cuotas restantes.
- La restricción de Anthropic sobre ofrecer login de claude.ai a terceros aplica a productos; este ejecutor es herramienta interna que cada titular corre en su propia máquina con su propia cuenta. Aun así: una cuenta por ejecutor, sin compartir ni rotar, y se revisan los términos al cambiar de alcance (por ejemplo, un ejecutor dedicado 24/7 → cuenta propia o API key explícita).
- Al recibir `rate_limit`/`billing_error`: misión `paused_quota`, ejecutor `quota_exhausted` (con hora de reinicio si el proveedor la expone; si no, "desconocida"). Nunca se cambia a API de pago sin que el ejecutor tenga `billing_mode: api_key` configurado explícitamente y un tope mensual.
- Presupuesto por misión: `maxBudgetUsd` y `maxTurns` (también con suscripción, como guardas). Costo estimado por misión en `usage_ledger`.
- Credenciales: ninguna en el dashboard. El ejecutor habla con Supabase con el JWT del desarrollador (RLS); `gh` y los CLIs usan las sesiones ya existentes en su máquina. No se expone una terminal general.

---

## 12. Fiabilidad mínima: pruebas de aceptación del sistema → mecanismo

| Prueba (brief §16) | Resultado esperado | Mecanismo |
|---|---|---|
| Desconexión del ejecutor en plena misión | Misión `orphaned` tras 2 min sin latido; rama empujada hasta el último commit; otro ejecutor la retoma desde la rama con un resumen de traspaso; nunca dos escritores | Latido cada 30 s; `pg_cron` marca huérfanas; `claim_mission` con bloqueo; push por latido |
| Agotamiento de cuota | Misión `paused_quota`, ejecutor `quota_exhausted`, dashboard lo muestra; se reanuda sola cuando vuelve la cuota | Detección en `system/api_retry` y en `result`; reintento programado |
| Alerta duplicada | Un solo ticket/alerta con contador; sin spam | Huella + ventana; índice único |
| Aprobación sobre código cambiado | La aprobación queda invalidada; vuelve a `review` | `approvals.sha` vs HEAD; trigger en push |
| Coexistencia con trabajo humano | El árbol del humano no cambia; sin pushes a ramas protegidas | Worktrees separados; `guard.sh` |
| Reintentos | Dos intentos de solución → `blocked` con evidencia; reintentos de red no cuentan | `attempt` en `missions`; política en el prompt del lead |
| Resultado parcial | Nunca "completado" por recibir texto del modelo | Verificación cruzada de evidencia; `status: partial` explícito |

---

## 13. Interfaz mínima (dashboard v0)

Rutas: `/` tablero de misiones por estado · `/missions/new` intake · `/missions/[id]` chat con el tech lead + eventos + preguntas + evidencia + resultado + acciones (pausar, cancelar, pedir revisión, aprobar SHA) · `/executors` estado y método de facturación · `/tickets` producción · `/usage` consumo cuando haya datos fiables. La "oficina animada" es opcional y posterior; sus estados saldrían de `mission_events`.

---

## 14. Fases

| Fase | Alcance | Criterio de aceptación | Estimación |
|---|---|---|---|
| **0 · Hoy** | Plan, inventario comprobado, `office-kit` validado, esquema SQL validado, esqueleto del ejecutor compilando, especificaciones | Este repo. Un desarrollador puede abrir Claude Code en un repo con `--plugin-dir` y correr `/oficina:mission` | hecho |
| **1 · Primer recorrido (B)** | Proyecto Supabase `oficina-ia` + migración; ejecutor v0 (claim, worktree, sesión, eventos, preguntas, pausa, evidencia, push, PR); dashboard v0 (misiones, detalle, preguntas, evidencia); un repo confirmado | Una petición real → rama con cambios → actividad visible → evidencia y resultado persistidos → cerrar el navegador no pierde nada → método de facturación visible | 1–2 semanas |
| **2 · Especialización (C)** | Misión de inventario en los 3 repos → `docs/oficina/areas/*.md`; Graphify por repo; afinar los 6 playbooks; una misión que justifique delegación y otra que no | Delegación N2 funciona con archivos propios; una misión N0 sin delegar; memoria de agente con aprendizajes verificados | 1 semana |
| **3 · Integración (D)** | `revisor`; staging por repo; aprobación por SHA; release; verificación posterior; misiones padre entre repos | Aprobación invalidada por push; entrega parcial nunca marcada completa; orden de publicación entre repos | 1–2 semanas |
| **4 · Producción (E)** | Ingesta de feedback y logs; alertas críticas; misión `triage` cada 3 h; métricas | Un fallo controlado genera ticket útil, misión, corrección y verificación de la señal; alerta duplicada no se repite | 1–2 semanas |
| **5 · Opcional** | Ejecutor dedicado 24/7; adaptador Codex; oficina animada; notificaciones push | Según necesidad medida | — |

---

## 15. Métricas (desde Fase 1, vista `mission_metrics`)

Entregas aceptadas (misiones `verified`/`released`), tiempo hasta resultado (`queued`→`review`), regresiones (tickets ligados a una misión publicada en 7 días), tiempo de coordinación (`waiting_answer` + `review` + `changes_requested`), misiones bloqueadas y por qué, consumo por misión y por ejecutor cuando sea medible. El número de agentes lanzados o de líneas escritas **no** es métrica de éxito.

---

## 16. Lo que no vamos a construir

Temporal, Kubernetes, base vectorial adicional, microservicios, una app de terceros completa, equipos de agentes permanentes, chat de todos con todos, mezcla de Claude y Codex por misión, clasificación LLM en la nube desde el día 1, terminal remota general, credenciales en el dashboard.

---

## 17. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El crédito/limites de `claude -p` cambian o la cuota no alcanza | `billing_mode` explícito, pausa por cuota, tope por misión, medición desde el primer día; opción `api_key` con política |
| `defer`/reanudación se comporta distinto a lo documentado | Doble camino en el ejecutor (reinvocación del hook o respuesta como primer mensaje); se verifica en la primera misión real |
| Playbooks genéricos sin mapa real del repo | La primera misión por repo es el inventario que escribe `docs/oficina/areas/*.md` |
| Colisiones entre especialistas | Archivos propios declarados + `scope-guard`; máximo 2 en paralelo |
| Logs con datos de pacientes | Lista blanca, columna privada, saneado determinista, política de no enviar datos de pacientes en feedback |
| El agente "declara" pruebas | `oficina-run` + verificación cruzada; resultado `unverified` bloquea |
| Repos no confirmados | Candidatos listados; se confirma al registrar cada repo (Fase 1), nunca por nombre parecido |

---

## 18. Primer día: cómo usar lo que hay hoy

```bash
# 1) Clonar este repo junto a los repos de producto
git clone https://github.com/joseph1356k/agentes- ~/oficina
cd ~/oficina && claude plugin validate office-kit --strict     # debe pasar

# 2) En un repo de producto, abrir Claude Code con el kit y crear una misión interactiva
cd ~/repos/<repo>
claude --plugin-dir ~/oficina/office-kit --agent oficina:tech-lead
> /oficina:mission "Que el asistente recuerde una corrección enseñada por voz y la use al manejar el computador"

# 3) Inventariar un repo (produce docs/oficina/REPO.md y areas/*.md)
> /oficina:inventory
```

El ejecutor y el dashboard se completan en Fase 1 (`04-EJECUTOR.md`, `05-DASHBOARD.md`).

---

## Apéndice: mapa del repo

```
docs/            00 plan · 01 inventario · 02 arquitectura · 03 equipo · 04 ejecutor · 05 dashboard
                 06 producción · 07 seguridad y costos · 08 fases y aceptación · decisions/ADR-*
office-kit/      plugin de Claude Code: agents/ skills/ hooks/ scripts/ bin/ schemas/ templates/
supabase/        migrations/0001_oficina.sql (validado en Postgres 16)
executor/        esqueleto TypeScript (Agent SDK + Supabase) que compila
scripts/         inventory.sh (inventario determinista de un repo)
missions/        plantilla y ejemplo de misión en archivo
```
