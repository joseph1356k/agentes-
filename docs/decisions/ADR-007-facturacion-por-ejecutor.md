# ADR-007 · Facturación por suscripción de cada ejecutor; sin cambio silencioso

Estado: accepted · 2026-10-01

## Decisión
Cada ejecutor corre con el `claude login` de su dueño (`billing_mode: subscription`). `api_key` solo por configuración explícita con tope mensual. El ejecutor publica el método que el SDK reporta (`apiKeySource`) y pausa la misión al agotarse la cuota (`paused_quota`). Nunca se comparten ni rotan cuentas.

## Hechos verificados (2026-10-01)
Anthropic anunció un crédito mensual para Agent SDK/`claude -p` (15 jun 2026) y actualmente indica que esos cambios están **pausados**; recomienda API key para automatización compartida de producción; prohíbe ofrecer login de claude.ai a terceros sin aprobación. Este ejecutor es herramienta interna individual.

## Consecuencias
Capacidad real = suma de cuotas individuales; se mide desde el primer día; un ejecutor dedicado 24/7 necesita cuenta propia o `api_key` explícita; se revisa el artículo de soporte antes de cada fase.
