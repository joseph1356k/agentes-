---
name: playbook-computer-use
description: Playbook de la especialidad Computer use y herramientas. Cárgalo cuando la sesión principal vaya a trabajar directamente en acciones sobre aplicaciones o sistemas, permisos, verificación o recuperación de fallos sin delegar. Se complementa con docs/oficina/areas/computer-use.md del repo.
user-invocable: true
---

# Playbook · Computer use y herramientas

## Mapa del área (genérico; el real está en `docs/oficina/areas/computer-use.md`)

- **Catálogo de acciones**: nombre, precondiciones, parámetros, efecto observable, reversibilidad, nivel de riesgo.
- **Permisos**: qué acciones piden confirmación siempre (irreversibles, envío de datos, sistemas clínicos), cómo se recuerda un permiso concedido y cómo se revoca.
- **Ejecución**: localización de elementos, esperas, reintentos acotados, tiempo máximo.
- **Verificación**: comprobar el efecto (estado de pantalla, respuesta del sistema, registro), nunca asumir.
- **Recuperación**: estados intermedios, deshacer si existe, reporte claro al usuario, no repetir acciones no idempotentes.
- **Aprendizaje aplicado**: cómo una corrección enseñada cambia una acción (contrato con memoria).
- **Simulación**: simuladores/fixtures de los sistemas (por ejemplo, un simulador de HIS) para pruebas sin tocar producción.

## Decisiones vigentes

Las del repo. Si no hay, propón ADR `proposed` para: niveles de riesgo y confirmación, política de reintentos, formato del registro de acciones.

## Comandos y pruebas

| Caso | Entrada | Esperado |
|---|---|---|
| Acción completada | simulador en estado inicial | efecto verificado y registrado |
| Fallo y recuperación | elemento ausente | reintento acotado, estado consistente, mensaje claro |
| Permiso denegado | acción de riesgo sin confirmación | no se ejecuta; se explica |
| Corrección aplicada | recuerdo "usa el campo X" | la acción usa X |
| No idempotente | reintento tras timeout | no se duplica el efecto |

## Riesgos típicos

Acciones repetidas; verificación por "intenté" en lugar de "ocurrió"; permisos demasiado amplios; pruebas contra sistemas reales; datos de pacientes en capturas.

## Referencias

`graphify query "acciones computer use permisos verificación"`, simuladores del repo, ADRs.
