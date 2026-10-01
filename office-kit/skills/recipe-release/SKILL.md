---
name: recipe-release
description: Receta para preparar una versión: integrar, verificar en staging, atar la aprobación al SHA, publicar según el mecanismo del repo y comprobar la señal después. Cárgala en misiones de tipo release o en la fase de integración de una spec.
user-invocable: true
---

# Receta · Versión y publicación

## Principios
La aprobación identifica un SHA probado; cualquier cambio posterior exige nueva verificación. Los agentes no despliegan: preparan, verifican y documentan; el ejecutor o un humano publican. Entre repos no hay merge atómico: se define un orden y no se declara completo hasta que todo esté publicado y comprobado.

## Pasos
1. **Qué entra**: lista de misiones/PRs (`mission_get` y `gh pr list`), con su evidencia y revisión. Lo que no tenga evidencia verificada no entra.
2. **Integración**: rama de integración solo si hay varias entregas; merge en orden, conflictos resueltos, suite completa (`oficina-run`), build de producción.
3. **Compatibilidad**: migraciones (orden respecto al código), contratos entre servicios/repos, variables de entorno nuevas documentadas (nombres, no valores), feature flags.
4. **Staging real**: despliegue de prueba según el repo (preview de Vercel, entorno de staging, rama de Supabase). Recorrido de humo documentado con capturas en evidencia. En el monorepo Ü, Graph y el portal se despliegan al mergear a `main` con prueba de humo y rollback (`vercel-desplegar.yml`): revisa qué cubre esa prueba.
5. **Notas de versión**: qué cambia para el usuario, riesgos, cómo revertir.
6. **Aprobación**: la pide el humano en el dashboard sobre el `head_sha`; si cambia algo después, se vuelve a verificar.
7. **Después de publicar**: comprobación de las señales de cada misión incluida (tickets, métricas, recorridos) durante la ventana acordada → `verified` o `regressed`.

## Checklist
- [ ] Todo lo incluido tiene evidencia verificada y revisión cuando aplicaba.
- [ ] Suite completa y build de producción en verde en el SHA aprobado.
- [ ] Orden de migraciones/servicios/repos escrito.
- [ ] Humo en staging con evidencia.
- [ ] Plan de reversión y señales posteriores escritos.

## Trampas
Mezclar "casi listo" · aprobar y seguir empujando · desplegar desde un agente · declarar completa una entrega entre repos cuando falta uno.
