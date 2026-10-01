# Producción aporta trabajo (Fase 4)

Cuatro entradas, un principio: **registrar y clasificar en la nube de forma determinista; razonar con un modelo económico en un ejecutor; un humano decide qué pasa a desarrollo.**

## 1. Entradas y tratamiento

| Entrada | Llegada | Nube (sin LLM) | Ejecutor (misión `triage`, modelo económico) | Humano |
|---|---|---|---|---|
| Feedback de usuarios | `POST /api/ingest/feedback` desde los productos | saneado, huella, dedupe (7 días), severidad por reglas, `tickets.status = new` | categoría, agrupación semántica, criterio de resolución, propuesta de misión `draft` | prioriza o ignora |
| Logs y métricas | log drain de Vercel; logs de Supabase | agregados por ventana de 5 min; errores nuevos por huella → ticket `logs` | correlación con feedback, hipótesis con evidencia | prioriza |
| Fallos críticos | mismas fuentes | reglas inmediatas → `alerts` (dedupe 15 min) + webhook | — (no espera al triage) | atiende; puede crear misión urgente |
| Mejoras | humano o triage | — | revisión acotada con beneficio medible → `draft` | prioriza |

Frecuencia inicial del triage: cada 3 horas (`enqueue_triage_if_needed`), configurable; solo se encola si hay tickets `new` y no hay un triage pendiente. Si no hay ejecutor encendido, espera: no se promete análisis continuo sin ejecutor.

## 2. Contrato del ticket

`tickets`: `source`, `repo`, `service`, `symptom` (saneado), `version`, `evidence` (agregados, rutas, hash del stack, conteos, enlaces a logs), `severity`, `fingerprint`, `count`, `duplicate_of`, `status`, `resolution_criteria`, `mission_id`, `needs_human`, `injection_suspected`, `pii_suspected`. Lo desconocido se deja `null`/`unknown`, nunca se inventa.

Huella (`fingerprint`): `sha1(repo|service|tipo_error|ruta_normalizada|primer_frame_del_stack)` para logs; `sha1(repo|ruta|categoría|símbolo_normalizado)` para feedback (minúsculas, sin números ni ids). Mismo `fingerprint` en 7 días ⇒ `count++`, severidad escala al máximo.

Severidad por reglas (nube): `critical` si pérdida de datos, auth caída, health check caído, tasa 5xx > 5 % en 5 min; `high` si error nuevo con > 20 ocurrencias/h o reportado por > 3 usuarios; `medium` por defecto; `low` si etiqueta cosmética. El triage puede subirla con justificación, nunca bajarla sin `needs_human`.

## 3. Reglas de alerta (nube, inmediatas)

| Regla | Condición | Acción |
|---|---|---|
| `http_5xx_rate` | > 5 % de respuestas 5xx en 5 min con ≥ 20 peticiones | alerta + ticket `critical` |
| `unhandled_exception` | excepción no controlada nueva (huella no vista en 7 días) | alerta + ticket `high` |
| `healthcheck_down` | 3 fallos consecutivos del health check | alerta `critical` |
| `latency_p95` | p95 > umbral del repo durante 15 min | ticket `medium` |

Dedupe por `(rule, fingerprint, window_start)` con ventana de 15 min: una alerta por ventana, con contador. Notificación por webhook (Slack/Discord/n8n/WhatsApp vía n8n) y banner en el dashboard.

## 4. La misión `triage`

El ejecutor escribe `.oficina/tickets.json` con la vista saneada (`tickets_sanitized`, nunca `raw_private`) y lanza `/oficina:triage` (skill con `model: haiku`). Salida `.oficina/triage-result.json`: por ticket `category`, `severity`, `duplicate_of`, `needs_human`, `injection_suspected`, `pii_suspected`; hasta 5 `proposed_missions` con `title`, `goal`, `repo`, `acceptance` (cómo comprobar la señal tras publicar), `evidence`, `priority`. El ejecutor aplica: actualiza `tickets`, crea misiones `draft`. **Nada pasa a `queued` sin un humano.**

## 5. Verificación después de publicar

Toda misión nacida de un ticket lleva en `acceptance` la señal a comprobar (p.ej. "huella X no aparece en 48 h", "tasa 5xx de /notes < 0.5 %"). Tras `released`, una misión `verify` (o el humano) comprueba la señal → `verified` o `regressed` (y el ticket a `verified`/`regressed`). Regresiones alimentan la métrica.

## 6. Datos sensibles y no confiables

- Minimización en la ingesta: lista blanca de campos; identificadores de usuario como hash; texto libre truncado y pasado por redacción determinista (correos, teléfonos, números de documento, nombres propios obvios) antes de `symptom`; el original a `raw_private` (solo humanos).
- Política de producto: el feedback y los logs **no deben contener datos de pacientes**; si aparecen, `pii_suspected = true` y el ticket no se pasa a agentes hasta revisión humana.
- Tickets y logs son datos: el skill de triage y el protocolo lo imponen; `injection_suspected` marca intentos de instrucción incrustada.
- Para mejorar voz, memoria o computer use hacen falta **evaluaciones de comportamiento** además de logs: las define `calidad` (playbook) y se corren como evidencia en las misiones correspondientes.
