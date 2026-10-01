---
name: playbook-calidad
description: Playbook de la especialidad Calidad y confiabilidad. Cárgalo cuando la sesión principal vaya a diseñar pruebas, evaluaciones de comportamiento, análisis de regresiones o de incidentes sin delegar. Se complementa con docs/oficina/areas/calidad.md del repo.
user-invocable: true
---

# Playbook · Calidad y confiabilidad

## Mapa del área (genérico; el real está en `docs/oficina/areas/calidad.md`)

- **Pirámide real del repo**: qué hay de unitario, integración, componente, e2e; cómo se corre cada nivel y cuánto tarda.
- **Recorridos críticos**: los 5–10 flujos que no pueden romperse (definidos en `docs/oficina/areas/calidad.md`).
- **Evaluaciones de comportamiento**: casos repetibles para voz (transcripción, interrupciones), memoria (recuerdo, corrección, aislamiento) y computer use (acción verificada, recuperación); métrica y umbral por caso.
- **Regresiones**: comparar contra la rama base; suite completa; no debilitar pruebas (skips, timeouts, asserts).
- **Incidentes**: reproducir, delimitar, criterio de resolución, señal a comprobar tras publicar.
- **Datos**: fixtures sintéticos; jamás datos de pacientes o usuarios reales.

## Decisiones vigentes

Las del repo. Si no hay, propón ADR `proposed` para: umbrales de las evaluaciones, política de flaky tests, qué bloquea un merge.

## Comandos y pruebas

Siempre con `oficina-run --label <tipo> -- <comando>`: `test` (suite completa), `lint`, `typecheck`, `build`, `e2e` si existe, `eval:<área>` si existen evaluaciones.

| Caso | Entrada | Esperado |
|---|---|---|
| Suite completa | rama de misión | exit 0; comparación con base |
| Flaky | prueba inestable | se identifica la causa; no se silencia |
| Evaluación | casos del área | métrica dentro del umbral |
| Incidente | ticket | reproducción determinista + criterio de resolución |

## Riesgos típicos

"Pasó en mi máquina" sin evidencia; pruebas que no corren en CI; evaluaciones sin umbral; tickets que inducen cambios sin reproducción; datos sensibles en fixtures.

## Referencias

`docs/oficina/areas/calidad.md`, CI del repo, `graphify affected "<símbolo>"` para delimitar impacto, ADRs.
