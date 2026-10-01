# Fases, aceptación y métricas

## Fase 0 · Hoy (hecha)

Entregado: plan, inventario, arquitectura, equipo (`office-kit` validado con `claude plugin validate --strict` y 56 pruebas de hooks), esquema SQL (smoke test en Postgres 16), esqueleto del ejecutor (typecheck + pruebas de lógica), especificaciones de dashboard, producción, seguridad.

Uso inmediato: `claude --plugin-dir <ruta>/office-kit --agent oficina:tech-lead` en un repo y `/oficina:inventory` o `/oficina:mission "<petición>"`.

## Fase 1 · Primer recorrido completo (Entrega B) — 1 a 2 semanas

Estado al 1 de octubre de 2026 (segunda sesión):

| Paso | Estado | Detalle |
|---|---|---|
| 1. Repos identificados y registrados | **hecho** (por inspección de código) | monorepo Ü (`u`: Ü Windows/Mac/Android, Miracle Notes en `apps/web`, Graph en `services/graph`) y `miracle-ai`; filas en `supabase/seed.sql` con comandos a verificar; convenciones del monorepo incorporadas (ADR-011) |
| 2. Proyecto Supabase `oficina-ia` | **bloqueado por plan free** (2 proyectos activos; límite por usuario) | decisión humana: subir la organización a Pro o pausar un proyecto activo; luego aplicar migración + seed (un paso) |
| 3. Ejecutor | **listo para instalar** | `scripts/install-executor.sh`, `oficina-executor doctor`, `subdir`, `branch_prefix`, `platform`; falta correrlo con `claude login` real |
| 4. Dashboard v0 | **construido** (`next build` limpio, prueba de humo) · despliegue en Vercel con variables provisionales | tablero, intake, detalle (chat, eventos, preguntas, evidencia, informe, acciones, aprobación por SHA), ejecutores, tickets, ingesta de feedback |
| 5. Misión real | **pendiente del paso 2 y de un computador con `claude login`** | la primera: `kind: inventory` sobre `u` con `subdir: apps/web` (Miracle Notes) |

Checklist original:
1. Confirmar el primer repo; registrar `repos` con `scripts/inventory.sh` + verificación de comandos.
2. Crear el proyecto Supabase `oficina-ia` (acto facturable, lo hace un humano); aplicar `supabase/migrations/0001_oficina.sql` y `supabase/seed.sql`.
3. Ejecutor: `bash scripts/install-executor.sh <ruta-monorepo>`; `login/register/doctor/start`; servicio con `pm2`/`launchd`.
4. Dashboard v0 en Vercel con las variables del proyecto.
5. Misión real: una petición pequeña (N0/N1) sobre el repo.

Aceptación (todas deben cumplirse):
- La petición creada en el dashboard llega al ejecutor, produce commits en `mission/<id>-<slug>` y un PR; el árbol del humano no cambia.
- Actividad visible en vivo (mensajes y eventos) y resultado persistido con `tests[]` cruzados contra evidencia subida.
- Una pregunta del tech lead aparece en el dashboard; al responder, la misión continúa (verificar el comportamiento de `defer`/reanudación).
- Cerrar el navegador durante la misión no pierde nada; reiniciar el daemon reencola con preferencia y reanuda.
- `executors.billing` muestra el método real reportado por el SDK; `usage_ledger` tiene el costo estimado.

## Fase 2 · Especialización selectiva (Entrega C) — 1 semana

1. `/oficina:inventory` en los tres repos → `docs/oficina/REPO.md` + `areas/*.md` + `CLAUDE.md` propuesto; filas `repos` con comandos verificados.
2. Graphify por repo (`graphify update`), stamp y hook de frescura.
3. Afinar playbooks con lo encontrado (decisiones vigentes, comandos, recorridos críticos).
4. Dos misiones de prueba: una N0 (sin delegar) y una N2 (dos especialistas con alcances disjuntos).

Aceptación: la N0 termina sin lanzar subagentes; la N2 muestra `subagent_start/stop` de exactamente dos agentes, `scope-guard` bloquea una edición fuera de alcance (probar a propósito), la suite completa pasa con evidencia; memoria de agente con al menos un aprendizaje con evidencia.

## Fase 3 · Integración y varios repos (Entrega D) — 1 a 2 semanas

1. `revisor` en misiones de riesgo medio/alto; `/oficina:review` desde el dashboard.
2. Staging real por repo (`repos.staging`): previews de Vercel por PR, ramas de Supabase donde aplique; migraciones con plan explícito.
3. `approve_mission` por SHA; invalidación por push (ya en SQL); `released`/`verified`/`regressed`.
4. Misiones padre/hijo para cambios entre repos con orden de publicación.

Aceptación: aprobar, empujar un commit nuevo y comprobar que la aprobación se invalida; una misión padre con dos hijos no se marca completa hasta que ambos están `released`; un hallazgo bloqueante del revisor impide cerrar.

## Fase 4 · Aprendizaje desde producción (Entrega E) — 1 a 2 semanas

1. `POST /api/ingest/feedback` en un producto; log drain de Vercel; reglas de alerta; webhook.
2. Cron de triage cada 3 h; misión `triage`; propuestas `draft`.
3. Misión `verify` tras release.

Aceptación: un fallo controlado (p.ej. endpoint que devuelve 500 a propósito en staging) genera alerta única (repetirlo en la misma ventana no duplica), ticket útil con huella, triage que propone una misión con criterio de verificación, corrección vía misión y verificación de la señal; métricas visibles.

## Fase 5 · Opcional

Ejecutor dedicado (mini PC/VM con cuenta propia o `api_key` explícita), adaptador Codex, oficina animada sobre `mission_events`, notificaciones push, políticas de retención automatizadas.

## Pruebas de aceptación del sistema (brief §16) y cómo ejecutarlas

| Prueba | Cómo provocarla | Resultado esperado |
|---|---|---|
| Desconexión del ejecutor | `kill -9` del daemon en plena misión | ≤ 2 min después: `orphaned` → `queued`; otro ejecutor (o el mismo al volver) retoma desde la rama; eventos lo registran |
| Agotamiento de cuota | ejecutar con una cuenta al límite (o simular `rate_limit` en el proveedor de pruebas) | `paused_quota`, ejecutor `quota_exhausted`, sin cambio de facturación; reanuda al liberarse |
| Alerta duplicada | enviar el mismo error 5 veces en 15 min | una fila en `alerts` con `count = 5`; una notificación |
| Aprobación sobre código cambiado | aprobar, luego push a la rama | aprobación invalidada; estado `review`; UI lo explica |
| Coexistencia con trabajo humano | tener cambios sin commit en el checkout humano durante una misión | intactos; la misión trabajó en `~/.oficina/wt/...` |
| Dos intentos | misión imposible a propósito (prueba que siempre falla) | `failed` en el 1º, `blocked` en el 2º, con evidencia de ambos |
| Evidencia falsa | informe con `evidence_id` inexistente (prueba manual del verificador) | `result_verified = false`, `unverified_tests` listado, misión en `review` con advertencia, nunca `completed` |

## Métricas (vista `mission_metrics` + consultas)

| Métrica | Definición |
|---|---|
| Entregas aceptadas | misiones `released`+`verified` por semana |
| Tiempo hasta resultado | `queued → review` (mediana y p90) |
| Regresiones | tickets `regressed` ligados a misiones publicadas en los 7 días siguientes |
| Tiempo de coordinación | suma de `waiting_answer` + `review` + `changes_requested` por misión |
| Bloqueadas | misiones `blocked` y `needs` más frecuente |
| Consumo | `usage_ledger` por misión/ejecutor (estimado con suscripción) |
| Verificación | % de misiones con `result_verified = true` al primer intento |

Explícitamente **no** son métricas: subagentes lanzados, líneas escritas, tokens consumidos por sí solos.

## Decisiones de ajuste de modelos (medir antes de cambiar)

Empezar: lead `opus`, especialistas `sonnet`, revisor `opus`, triage `haiku`. Revisar tras 20 misiones: si `result_verified` y regresiones son buenas con `sonnet` en el lead para N0/N1, bajar; si el revisor deja pasar hallazgos reales, subir a `fable` donde el plan lo permita.
