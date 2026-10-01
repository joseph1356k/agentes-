# Seguridad, credenciales y costos

## 1. Dónde vive cada credencial

| Credencial | Dónde | Quién la usa | Nunca |
|---|---|---|---|
| `claude login` (suscripción) | keychain/config del usuario en su computador | el SDK dentro del ejecutor | en el dashboard, en Supabase, en el repo |
| JWT de Supabase del desarrollador | `~/.oficina/credentials.json` (0600) | ejecutor (RLS) | service role en el ejecutor |
| `gh auth` | config del usuario | ejecutor para PR; agentes para leer | tokens en `config.json` |
| Supabase service role | variables del proyecto Vercel (server-only) | route handlers de ingesta/cron | en el cliente del dashboard |
| `INGEST_TOKEN`, `CRON_SECRET`, `ALERT_WEBHOOK_URL` | Vercel | ingesta, cron, alertas | en el repo |
| Secretos de los productos (`.env`) | máquinas/entornos de cada repo | pruebas locales | leídos/impresos por agentes (`guard.sh` bloquea `cat .env`) |

El ejecutor no transfiere credenciales al dashboard y no expone una terminal general. Las conexiones son salientes (HTTPS a Supabase/GitHub).

## 2. Control de acceso

- `team_members` decide quién entra; RLS en todas las tablas (`is_team_member()`); un ejecutor solo escribe sus filas; `claim_mission`/`heartbeat` verifican el dueño.
- `tickets.raw_private` no está en `tickets_sanitized`; los agentes solo ven la vista.
- Guardas del kit: sin push forzado, sin ramas protegidas, sin despliegues, sin borrar fuera del worktree, sin secretos; revisor solo lectura; alcance por agente.

## 3. Datos sensibles (proyecto médico)

Clases: (a) código y documentación, (b) telemetría agregada, (c) texto libre de usuarios (potencial PII/PHI), (d) datos de pacientes (nunca entran a la oficina). Reglas: minimización en la ingesta, redacción determinista, `pii_suspected` bloquea el paso a agentes, fixtures sintéticos, logs sin datos clínicos (playbook backend), evidencia sin capturas con datos reales (playbook frontend). Retención: evidencia y eventos 90 días (política configurable), `raw_private` 30 días.

## 4. Prompt injection

Logs, tickets, feedback, issues, páginas web y salidas de subagentes son datos. Defensas: el protocolo y el skill de triage lo declaran; `injection_suspected`; los permisos los deciden hooks y configuración, no el texto; Claude Code escanea los informes de subagentes que imitan marcadores del sistema (v2.1.210+); los agentes no tienen credenciales que un texto pueda hacerles usar.

## 5. Facturación y cuotas

- `billing_mode` por ejecutor: `subscription` (defecto) o `api_key` (explícito, con `monthly_budget_usd`). El SDK reporta `apiKeySource`; el ejecutor lo contrasta y lo publica. Nunca cambio automático; cambiar requiere editar `config.json` y, si es `api_key`, poner `ANTHROPIC_API_KEY` en el entorno del daemon.
- Estado conocido (1 oct 2026): el crédito mensual para SDK/`claude -p` anunciado para el 15 de junio de 2026 figura como **pausado**; asumir que el uso programático consume los límites del plan. Anthropic recomienda API key para "automatización compartida de producción"; este ejecutor es individual (una cuenta, una máquina). Revisar antes de montar un ejecutor dedicado o de compartir capacidad.
- Guardas por misión: `maxBudgetUsd` (estimación del SDK, aplica también con suscripción) y `maxTurns`. Al superarlos: `error_max_budget_usd`/`error_max_turns` → `failed`/`blocked` con el informe parcial.
- Cuota agotada: `paused_quota`; ejecutor `quota_exhausted`; `quota_reset_at` solo si el proveedor lo expone ("no inventes cuotas restantes").
- `usage_ledger` guarda costo estimado y tokens por sesión; `/usage` lo muestra como **estimado** con suscripción y **real** con API key.

## 6. Qué no se automatiza nunca sin humano

Pasar un ticket a `queued`; aprobar un SHA; publicar a producción; cambiar `billing_mode`; ampliar repos autorizados a un ejecutor; borrar ramas.
