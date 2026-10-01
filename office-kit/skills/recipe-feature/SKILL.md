---
name: recipe-feature
description: Receta para implementar una funcionalidad nueva de tamaño medio (N1/N2) de principio a fin con evidencia. Cárgala al empezar una misión de tipo feature que cabe en una sesión; si no cabe, usa /oficina:spec.
user-invocable: true
---

# Receta · Funcionalidad nueva

## Cuándo
Comportamiento nuevo que cabe en una sesión, toca una o dos áreas y no exige contratos nuevos compartidos. Si cruza tres áreas o requiere migración + API + UI, es `/oficina:spec`.

## Pasos
1. **Criterio de aceptación** (2–6 condiciones comprobables) → `acceptance_set`. Si el humano no lo dio, propónlo tú y sigue.
2. **Mapa**: dónde vive lo que vas a tocar (`docs/oficina/areas`, `graphify affected`), qué pruebas existen para esa zona, qué convenciones usa.
3. **Plan corto** (N2 o riesgo ≥ medio: `plan_set`): archivos, orden, qué prueba demuestra cada condición.
4. **Promesa**: escribe las pruebas de la condición 1 → rojo (`oficina-run`).
5. **Implementa** la condición 1 → verde. Commit `feat(ámbito): lo que el sistema ahora hace`.
6. Repite 4–5 por condición. Estados de error/vacío/carga si hay UI; manejo de errores en el borde si hay API.
7. **Suite completa** del proyecto (`oficina-run --label test`), `lint`, `typecheck`, `build`.
8. **Riesgo**: si tocaste datos, auth, acciones sobre sistemas o contratos → `review_request`.
9. **Cierre**: `decision_record` por cada supuesto relevante; `learning_record` solo con evidencia; `/oficina:evidence`.

## Checklist de cierre
- [ ] Cada condición del criterio tiene prueba y `ev_...` en verde.
- [ ] Suite completa, lint, typecheck y build en verde (ids).
- [ ] Sin datos sensibles en pruebas/fixtures/logs.
- [ ] Docs del repo tocadas si cambió un comportamiento visible (README, `docs/oficina/areas`).
- [ ] Informe con `not_tested` honesto.

## Trampas
Implementar antes de tener la prueba en rojo · "ya que estoy" refactorizar lo vecino · copiar un componente en vez de reutilizarlo · olvidar los estados no felices · declarar completado con una condición "casi".
