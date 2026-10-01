---
name: recipe-migration
description: Receta para cambios de esquema o de datos (Supabase/Postgres u otros): migración reversible, compatibilidad entre versiones, plan de despliegue y de reversión, verificación en base local o rama de staging. Cárgala siempre que una misión toque tablas, columnas, políticas RLS o formatos persistidos.
user-invocable: true
---

# Receta · Migración de esquema o datos

## Principios
Riesgo alto por definición (`risk: high`, revisión obligatoria). Nunca destructiva en un solo paso. Compatible con el código que sigue corriendo durante el despliegue (expandir → migrar → contraer).

## Pasos
1. **Inventario**: qué tablas/columnas/políticas cambian, quién las lee y escribe (`graphify affected`, `grep`), qué datos existen y cuántos.
2. **Diseño expand/contract**: 1) añadir lo nuevo sin romper lo viejo; 2) migrar/doble-escribir datos; 3) cambiar el código a lo nuevo; 4) retirar lo viejo en una migración posterior (otra misión). Escríbelo en `.oficina/plan.md` y `plan_set`.
3. **Migración numerada** en el lugar del repo (`supabase/migrations/`), idempotente donde se pueda (`if not exists`, `on conflict`), con RLS para tablas nuevas.
4. **Reversión**: migración `down` o plan escrito de compatibilidad; si no hay reversión posible, decirlo explícitamente y pedir aprobación del plan (`AskUserQuestion`).
5. **Prueba en base local o rama de staging** (nunca producción): aplicar desde cero, aplicar sobre una copia con datos, correr la suite (`oficina-run`).
6. **Datos**: scripts de migración de datos con lotes, reanudables, con conteos antes/después registrados como evidencia.
7. **Código**: tipos generados actualizados (`supabase gen types` si el repo lo usa), consultas y RLS probadas (válido/inválido/permiso denegado).
8. `decision_record` (`shared`) + ADR si cambia un contrato de datos. `/oficina:evidence` con el plan de despliegue en `next_steps`.

## Checklist
- [ ] Expand/contract explícito; sin `drop` ni `alter type` destructivos en esta misión.
- [ ] Migración aplicada desde cero y sobre copia con datos (`ev_...`).
- [ ] RLS y permisos probados.
- [ ] Plan de reversión escrito.
- [ ] Orden de despliegue (migración antes/después del código) escrito.

## Trampas
Renombrar una columna en un paso · migrar datos sin lote ni reanudación · olvidar RLS en una tabla nueva · probar solo "desde cero" · correr algo contra producción "para ver".
