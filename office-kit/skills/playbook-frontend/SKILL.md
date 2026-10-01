---
name: playbook-frontend
description: Playbook de la especialidad Frontend y experiencia. Cárgalo cuando la sesión principal vaya a trabajar directamente en interfaz, estados, configuración, feedback o visibilidad de acciones sin delegar. Se complementa con docs/oficina/areas/frontend.md del repo.
user-invocable: true
---

# Playbook · Frontend y experiencia

## Mapa del área (genérico; el real está en `docs/oficina/areas/frontend.md`)

- **Estructura**: framework, enrutado, sistema de componentes, estado global, data fetching, i18n.
- **Estados**: carga, error, vacío, sin conexión, permiso denegado, en progreso (acciones del asistente).
- **Visibilidad del asistente**: qué escuchó, qué va a hacer, qué hizo, cómo deshacer; indicadores de voz.
- **Configuración y feedback**: formularios, validación, mensajes accionables, envío de feedback (sin datos de pacientes).
- **Calidad**: pruebas de componente y de recorrido (Playwright si existe), accesibilidad básica, rendimiento percibido.
- **Contratos**: tipos compartidos con backend, manejo de errores de API.

## Decisiones vigentes

Las del repo. Si no hay, propón ADR `proposed` para: patrón de estados de carga/error, convención de componentes, estrategia de pruebas de UI.

## Comandos y pruebas

| Caso | Entrada | Esperado |
|---|---|---|
| Recorrido | usuario completa la tarea principal | pasa en Playwright/pruebas de componente |
| Estados | API falla / responde vacío / tarda | UI muestra el estado correcto, sin pantallas rotas |
| Visibilidad | asistente ejecuta una acción | el usuario ve qué pasó y puede deshacer si aplica |
| Build | `build` + `typecheck` + `lint` | exit 0 |
| Accesibilidad | navegación por teclado del recorrido | posible y con foco visible |

## Riesgos típicos

Estados de error no manejados; texto hardcodeado; componentes acoplados a la API; pruebas que solo cubren el camino feliz; capturas con datos reales.

## Referencias

`graphify query "componentes estados recorrido"`, pruebas e2e existentes, sistema de diseño, ADRs.
