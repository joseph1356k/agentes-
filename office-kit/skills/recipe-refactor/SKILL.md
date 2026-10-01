---
name: recipe-refactor
description: Receta para refactorizar sin cambiar comportamiento: red de pruebas primero, pasos pequeños verificados, sin mezclar con funcionalidad nueva. Cárgala cuando la misión sea reorganizar, extraer, renombrar o eliminar deuda.
user-invocable: true
---

# Receta · Refactor sin cambio de comportamiento

## Principios
El comportamiento observable no cambia: misma salida, mismos errores, mismos contratos. Si descubres un bug, lo reportas (o lo corriges en un commit separado y marcado), no lo "arreglas de paso" en silencio.

## Pasos
1. **Red de seguridad**: ¿qué pruebas cubren el código a mover? Si la cobertura es insuficiente, primero escribe pruebas de caracterización (lo que hace hoy, aunque sea feo) → verde (`oficina-run`).
2. **Plan de pasos pequeños** (`plan_set` si N2+): extraer función → mover → renombrar → eliminar duplicado. Un commit por paso, suite verde después de cada uno.
3. **Herramientas del lenguaje** (renombrado con LSP/IDE, `tsc`, `ruff`) antes que `sed` masivo.
4. **Contratos públicos intactos**: si un refactor requiere cambiar un contrato, no es refactor: para y registra la decisión.
5. **Suite completa**, lint, typecheck, build; comparación de comportamiento (mismos resultados en fixtures) como evidencia.
6. Commit `refactor(ámbito): ...` sin `feat`/`fix` mezclados. `/oficina:evidence`.

## Checklist
- [ ] Pruebas de caracterización añadidas donde faltaban.
- [ ] Cada paso con suite verde (`ev_...` por paso o al menos por bloque).
- [ ] Diff sin cambios de comportamiento (y si los hay, explicados y separados).
- [ ] Sin reformateo masivo ajeno al objetivo.

## Trampas
"Ya que estoy" · reescribir en vez de refactorizar · mover y cambiar en el mismo commit · renombrar con `sed` sobre strings de usuario · tocar contratos públicos.
