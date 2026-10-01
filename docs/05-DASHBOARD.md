# Dashboard (`dashboard/`, Fase 1)

Interfaz mínima para entender qué pasa y decidir: misiones, chat con el tech lead, preguntas pendientes, agentes/ejecutores, evidencia, aprobaciones, tickets y consumo. Sin credenciales de modelo ni de repos.

## 1. Stack y despliegue

- Next.js 15 (App Router, TypeScript), Tailwind, shadcn/ui, `@supabase/ssr` (cookies) y `@supabase/supabase-js` (Realtime en cliente).
- Proyecto Vercel nuevo `oficina-ia` en el equipo existente; variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (solo en route handlers de ingesta y cron, nunca en cliente), `INGEST_TOKEN` (para las fuentes de producción), `CRON_SECRET`.
- Auth: magic link de Supabase; solo emails presentes en `team_members` (RLS lo garantiza; la UI además redirige).

## 2. Rutas

| Ruta | Qué muestra | Acciones (→ RPC) |
|---|---|---|
| `/` | tablero por estado (`queued`, `running`, `waiting_answer`, `review`, `blocked`, ...) con repo, ejecutor, edad, costo | crear misión, priorizar (`priority`), pausar/cancelar (`transition_mission`) |
| `/missions/new` | intake: título, objetivo, repo y subproyecto, plataforma requerida, tipo (`feature`, `epic`, `bugfix`, `inventory`, `research`, `verify`), criterio de aceptación (opcional), prioridad, controles (`require_plan_approval`, `require_review`, `auto_queue_children`) | insert en `missions` con `status: draft`/`queued` |
| `/missions/[id]` | **chat** (`mission_messages`: humano ⇄ tech lead, en vivo si está `running`), línea de tiempo (`mission_events`), **preguntas** (`questions` abiertas; banner si es la aprobación del plan), **plan/spec** (`plan`, `spec_path`), **sub-misiones** (hijas con estado, dependencias y PR; enlace al padre), **verificación de la oficina** (`executor_checks`, `review`, `ci` con banners cuando fallan), evidencia, informe (`result`), aprendizajes de la misión, estado y motivo | responder pregunta, enviar mensaje, pedir cambios, aprobar SHA (`approve_mission`), marcar released/verified/regressed, pausar, cancelar, prioridad |
| `/executors` | `executor_capacity`: estado, latido, facturación (suscripción/API key), capacidad, repos | editar `max_parallel` (dueño) |
| `/tickets` | `tickets_sanitized` por severidad/estado, duplicados agrupados, alertas | crear misión desde ticket (`draft`), ignorar, vincular |
| `/learnings` | `learnings`: aprendizajes verificados por repo y ámbito, con evidencia y misión de origen | — |
| `/usage` | `usage_ledger` por misión/ejecutor/modelo; costo estimado vs real según facturación | — |
| `/repos` | `repos`: comandos verificados, staging, flags | editar |

## 3. Tiempo real

Suscripciones a `missions`, `mission_events`, `mission_messages`, `questions` (publicación `supabase_realtime`). La página de misión muestra lo que ocurre sin recargar; la "oficina animada" (opcional, posterior) se alimentaría de `mission_events` (`subagent_start/stop`, `tool_use`, `status`).

## 4. Ingesta y cron (route handlers)

| Ruta | Método | Entrada | Efecto |
|---|---|---|---|
| `/api/ingest/feedback` | POST (`Authorization: Bearer INGEST_TOKEN`) | `{repo, service?, version?, route?, category?, message, user_ref_hash?, meta?}` | saneado (lista blanca, longitud, redacción determinista de identificadores) → `upsert_ticket(...)`; `raw_private` guarda el original |
| `/api/ingest/vercel-logs` | POST (log drain de Vercel, firma verificada) | lotes de logs | agregados por ventana (5 min): tasa 5xx, errores nuevos por huella, latencia p95 → reglas críticas → `fire_alert(...)`; muestras saneadas → `upsert_ticket(source: logs)` |
| `/api/ingest/supabase-logs` | POST (cron interno o webhook) | consulta `query_logs` del proyecto del producto vía API de gestión con token del equipo | mismas reglas |
| `/api/cron/triage` | GET (Vercel Cron `0 */3 * * *`, `CRON_SECRET`) | — | `enqueue_triage_if_needed(repo)` por cada repo con `sensitive_data`-aware |
| `/api/cron/orphans` | GET (cada minuto, respaldo si no hay pg_cron) | — | `mark_orphans()` |

Las alertas críticas notifican por webhook configurable (`ALERT_WEBHOOK_URL`: Slack/Discord/n8n) y aparecen como banner; no esperan al triage.

## 5. Componentes clave

`MissionBoard` (columnas por estado, Realtime) · `MissionChat` (mensajes + input; el tech lead "responde" en la siguiente ejecución o en vivo si está `running`) · `QuestionCard` (renderiza `questions[].options`, soporta "Otra respuesta" en texto libre y `response` general) · `EventTimeline` (agrupa por subagente con `parent`) · `EvidencePanel` (lista `ev_*`, exit code, duración, enlace al log; marca `unverified_tests`) · `ReportView` · `ApproveDialog` (muestra `head_sha`, llama `approve_mission`; si el SHA cambió, lo dice) · `ExecutorCard` (latido, facturación, capacidad).

## 6. Alcance v0 (Fase 1) vs después

Hecho: tablero, intake con controles, detalle con chat/eventos/preguntas/plan/sub-misiones/verificación/revisión/CI/evidencia/informe/aprendizajes, ejecutores, tickets, aprendizajes, ingesta de feedback, auth. Después: usage con datos fiables, repos editables, oficina animada, notificaciones push, log drains.
