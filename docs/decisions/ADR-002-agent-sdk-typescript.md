# ADR-002 · Claude Agent SDK (TypeScript) como motor del ejecutor

Estado: accepted · 2026-10-01

## Contexto
Alternativas: parsear `claude -p --output-format stream-json`, Agent SDK Python, Agent SDK TypeScript, Codex app-server.

## Decisión
`@anthropic-ai/claude-agent-sdk` (0.3.x) en Node 22.

## Justificación
Expone en código lo que la oficina necesita: `canUseTool` y hooks (`AskUserQuestion`, `defer`), `plugins`, `resume`/`forkSession`, `maxBudgetUsd`/`maxTurns`, `outputFormat` (JSON Schema), `interrupt()`, `accountInfo()`, eventos `system/init` (plugins, `apiKeySource`) y `result` (costo, uso, `deferred_tool_use`). El SDK TypeScript tiene `SessionStart`/`SessionEnd` y más hooks que el Python. Misma base que el ejecutor y el dashboard (TypeScript).

## Consecuencias
Dependencia de un SDK que evoluciona rápido: versión fijada en `package.json`, verificación de comportamiento en la primera misión real (`docs/04-EJECUTOR.md` §9).
