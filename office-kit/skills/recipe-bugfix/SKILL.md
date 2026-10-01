---
name: recipe-bugfix
description: Receta para corregir un error con reproducción determinista, prueba de regresión y verificación de la señal. Cárgala en misiones de tipo bugfix o nacidas de un ticket de producción.
user-invocable: true
---

# Receta · Corrección de error

## Pasos
1. **Reproduce antes de tocar nada.** Convierte el síntoma (ticket, log, descripción) en una reproducción determinista: una prueba automatizada si es posible (`oficina-run` en rojo), o un procedimiento manual documentado si no. Sin reproducción no hay corrección, hay adivinanza.
2. **Delimita.** `graphify affected`, `git log -S`, bisect si el repo tiene historia útil. Escribe la hipótesis de causa en `.oficina/notes.md`.
3. **Causa, no síntoma.** Corrige donde nace el error. Si la causa es un contrato roto o un dato corrupto, dilo y registra la decisión.
4. **Prueba de regresión** con nombre por el comportamiento ("no duplica la nota al reintentar"), en verde tras la corrección.
5. **Busca hermanos**: el mismo patrón en otros sitios (`grep`, `graphify path`). Corrige o reporta en `next_steps`.
6. **Suite completa**, lint, typecheck.
7. **Señal posterior**: en el informe (`next_steps` o `acceptance`), cómo se comprobará en producción que el síntoma desapareció (huella de log, métrica, recorrido).
8. Commit `fix(ámbito): lo que ya no pasa`. `/oficina:evidence`.

## Checklist
- [ ] Reproducción (`ev_...` en rojo antes, verde después, o procedimiento manual).
- [ ] Prueba de regresión añadida.
- [ ] Causa explicada en una frase en el `summary`.
- [ ] Hermanos buscados.
- [ ] Señal de verificación posterior escrita.

## Trampas
Arreglar el síntoma con un `if` · ampliar un timeout · silenciar la prueba que fallaba · "no pude reproducir, pero creo que es X" (eso es `blocked` con lo que necesitas) · cambiar comportamiento público sin registrarlo.
