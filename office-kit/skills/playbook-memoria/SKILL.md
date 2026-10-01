---
name: playbook-memoria
description: Playbook de la especialidad Memoria, contexto y aprendizaje. Cárgalo cuando la sesión principal vaya a trabajar directamente en recuerdos, recuperación, contexto por tarea, preferencias o correcciones del usuario sin delegar. Se complementa con docs/oficina/areas/memoria.md del repo.
user-invocable: true
---

# Playbook · Memoria, contexto y aprendizaje

## Mapa del área (genérico; el real está en `docs/oficina/areas/memoria.md`)

- **Captura**: qué eventos generan un recuerdo (enseñanza explícita, corrección, preferencia inferida) y con qué confianza.
- **Almacenamiento**: estructura (tipo, contenido, procedencia, usuario, fecha, confianza, estado), índices, cifrado si hay datos sensibles.
- **Recuperación**: criterio de relevancia (tarea actual, recencia, confianza), presupuesto de tokens, deduplicación.
- **Aplicación**: cómo un recuerdo cambia el comportamiento (prompt, parámetros, acción) y cómo se audita.
- **Corrección y olvido**: el usuario puede corregir o borrar; una corrección reemplaza, no acumula contradicciones.
- **Aislamiento**: por usuario y por contexto; nunca memoria personal en el contexto compartido de desarrollo.

## Decisiones vigentes

Las del repo (`docs/decisions/`). Si no hay, propón ADR `proposed` para: formato del recuerdo, política de relevancia, política de olvido.

## Comandos y pruebas

Los del repo (`docs/oficina/REPO.md`). Pruebas mínimas que debes dejar o pedir:

| Caso | Entrada | Esperado |
|---|---|---|
| Recuerdo correcto | enseñanza → nueva sesión | se recupera y aplica |
| Corrección | recuerdo A, corrección a B → nueva interacción | aplica B, A no reaparece |
| Aislamiento | usuario 1 enseña X | usuario 2 no ve X |
| Sin memoria | almacenamiento caído | el asistente funciona sin inventar recuerdos |
| Presupuesto | 1000 recuerdos | recuperación bajo el límite de tokens y latencia definido |

## Riesgos típicos

Fugas entre usuarios; recuerdos contradictorios; contexto obsoleto tras un cambio de versión; recuerdos de baja confianza aplicados como ciertos; datos clínicos en recuerdos sin control de retención.

## Referencias

`graphify query "memoria recuperación contexto"`, `graphify affected "<módulo de memoria>"`; pruebas existentes del área; ADRs.
