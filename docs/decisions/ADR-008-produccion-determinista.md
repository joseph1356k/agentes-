# ADR-008 · Ingesta y alertas deterministas en nube; triage como misión en ejecutor

Estado: accepted · 2026-10-01

## Decisión
La nube registra, sanea, deduplica por huella y clasifica severidad **por reglas**, y dispara alertas críticas de inmediato (sin modelo). El razonamiento (categoría, agrupación semántica, propuestas) ocurre cada 3 horas como misión `triage` con modelo económico en un ejecutor. Las propuestas nacen `draft`; un humano decide.

## Justificación
La nube no necesita credenciales de modelo; cumple "fallos críticos: alertar inmediatamente, sin esperar al análisis periódico" y "un ticket no autoriza automáticamente un cambio en producción"; usa la capacidad de suscripción existente. Mover la clasificación a la nube con API key queda como política explícita posible.

## Consecuencias
Sin ejecutor encendido no hay triage (sí alertas). Los tickets llegan saneados; `raw_private` solo para humanos.
