---
name: playbook-backend
description: Playbook de la especialidad Backend e integración de agentes. Cárgalo cuando la sesión principal vaya a trabajar directamente en servicios, datos, autenticación, APIs o comunicación entre agentes del producto sin delegar. Se complementa con docs/oficina/areas/backend.md del repo.
user-invocable: true
---

# Playbook · Backend e integración de agentes

## Mapa del área (genérico; el real está en `docs/oficina/areas/backend.md`)

- **Servicios y APIs**: rutas/handlers, tipos compartidos, versionado, errores tipados, idempotencia en operaciones externas.
- **Datos**: esquema, migraciones (numeradas, reversibles o con plan de compatibilidad), RLS/permisos, backups.
- **Autenticación/autorización**: proveedor, sesiones, roles, políticas por fila; secretos por entorno.
- **Agentes del producto**: cómo se comunican (colas, eventos, llamadas), reintentos, trazas, límites.
- **Observabilidad**: logs estructurados sin datos sensibles, métricas y cómo se consultan (Vercel/Supabase).
- **Entornos**: dev, staging (ramas de Supabase o proyecto aparte), producción; cómo se promueve.

## Decisiones vigentes

Las del repo. Si no hay, propón ADR `proposed` para: convención de migraciones, manejo de errores de API, política de idempotencia.

## Comandos y pruebas

| Caso | Entrada | Esperado |
|---|---|---|
| Contrato | petición válida/inválida | respuesta y error tipados según contrato |
| Migración | base limpia + migraciones | aplica sin error; `down`/plan de compatibilidad documentado |
| Permisos | usuario sin rol | 403/denegado por política, no por UI |
| Idempotencia | misma operación dos veces | un solo efecto |
| Agentes | mensaje entre agentes con fallo transitorio | reintento y traza; sin duplicados |

## Riesgos típicos

Migraciones destructivas; cambios de contrato sin versión; secretos en código; RLS ausente; logs con datos clínicos; operaciones externas sin clave idempotente.

## Referencias

`graphify query "api servicios esquema auth"`, `graphify affected "<tabla o servicio>"`, migraciones existentes, ADRs.
