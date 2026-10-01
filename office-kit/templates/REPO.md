# <nombre del repo> — mapa para la oficina

Última verificación: <fecha> · por: <agente/humano> · commit: <sha>

| Dato | Valor comprobado | Fuente |
|---|---|---|
| Identidad | nombre, remoto, ruta local típica | `git remote -v` |
| Función | qué producto/componente contiene | README, código |
| Rama por defecto / producción | `main` / `main` | `gh repo view`, protecciones |
| Lenguajes y gestores | | `inventory.sh` |
| Comandos verificados | `install:` · `dev:` · `test:` (ev_...) · `lint:` (ev_...) · `typecheck:` (ev_...) · `build:` (ev_...) | `oficina-run` |
| Pruebas existentes | tipos, carpetas, duración | |
| Recorridos críticos | 1. … 2. … | |
| CI | archivo y qué ejecuta | |
| Integraciones | servicios por nombre de variable (sin valores), MCP | `.env.example`, `.mcp.json` |
| Despliegue | dev / staging / producción y cómo se promueve | `vercel.json`, Supabase |
| Contexto | `CLAUDE.md`, ADRs, Graphify (`graphify-out/`, fresco a <sha>) | |
| Dependencias con otros repos | contratos compartidos | |
| Desconocido | lo que no se pudo comprobar y por qué | |

## Áreas

- [memoria](areas/memoria.md) · [voz](areas/voz.md) · [computer-use](areas/computer-use.md) · [backend](areas/backend.md) · [frontend](areas/frontend.md) · [calidad](areas/calidad.md)

## Notas

<convenciones observadas, trampas conocidas, cosas que un agente nuevo debe saber>
