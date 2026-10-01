---
name: recipe-ui-verification
description: Receta para verificar interfaz de usuario con evidencia real: Playwright (o la herramienta e2e del repo) con capturas en .oficina/evidence, estados no felices, accesibilidad básica. Cárgala cuando una misión toque UI y haya que demostrar el recorrido, no solo el build.
user-invocable: true
---

# Receta · Verificación de UI con evidencia

## Pasos
1. **Qué demostrar**: el recorrido principal del cambio y sus estados (carga, error, vacío, permiso denegado). Lista corta en `.oficina/notes.md`.
2. **Herramienta**: la del repo (`test:e2e`, Playwright, Cypress). Si no hay, usa Playwright instalado en la máquina (`npx playwright --version`); si tampoco, captura manual descrita en `not_tested`.
3. **Entorno**: levanta la app con el comando `dev` del repo en un puerto libre (`PORT` del encargo), con datos sintéticos; nunca contra producción.
4. **Script de recorrido** (en `tests/e2e/` del repo si existe la convención; si no, en `.oficina/e2e/` sin commitear): navega, actúa, espera estados, y guarda capturas en `.oficina/evidence/<nombre>.png`. Ejecútalo con `oficina-run --label e2e -- <comando>`.
5. **Estados no felices**: simula error de API (interceptación), vacío, lento; captura cada uno.
6. **Accesibilidad básica**: navegación por teclado del recorrido; foco visible; textos de botones accionables. Si el repo tiene `axe`, úsalo.
7. Cita las capturas y el `ev_...` del e2e en el informe. No dejes datos reales en ninguna captura.

## Checklist
- [ ] Recorrido principal grabado (`ev_...` + capturas).
- [ ] Al menos un estado no feliz demostrado.
- [ ] Teclado/foco comprobados.
- [ ] Build y typecheck en verde.

## Trampas
"Compila, luego funciona" · capturas con datos de pacientes · probar solo en escritorio cuando el producto se usa en móvil · pruebas e2e inestables por esperas fijas (usa esperas por estado).
