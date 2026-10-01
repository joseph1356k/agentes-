# ADR-010 · Adaptador Codex diferido tras la interfaz `Provider`

Estado: accepted · 2026-10-01

## Contexto
El brief quiere aprovechar Claude Code y Codex, sin obligar a mezclarlos por misión. Codex no está instalado en el entorno de diseño y la documentación de OpenAI no fue accesible (proxy de red).

## Decisión
La interfaz `Provider` (`executor/src/types.ts`) es el único punto de contacto; `ClaudeProvider` es el primero. `CodexProvider` se implementa en Fase 5 tras verificar `codex exec --json`, `--output-schema`, `codex exec resume` y la política de autenticación del plan de ChatGPT para automatización. Una misión usa un proveedor; cambiar de proveedor es una misión nueva con traspaso por artefactos.

## Consecuencias
Sin dependencia de funciones no verificadas; el dashboard ya muestra `provider` por misión.
