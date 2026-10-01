# ADR-001 · Subagentes y playbooks en lugar de agent teams

Estado: accepted · 2026-10-01

## Contexto
El brief pide un tech lead que programe, seis especialidades reutilizables y delegación nativa selectiva, con 1–3 agentes activos por misión y ejecución desde un ejecutor local no interactivo.

## Decisión
Las especialidades son subagentes de Claude Code (`office-kit/agents/*.md`) más playbooks (skills) que la sesión principal carga sin delegar. Los agent teams no se usan en el flujo del ejecutor.

## Justificación (verificada en docs el 2026-10-01)
Agent teams: experimentales, desactivados por defecto, **no funcionan en `-p`/SDK**, no se reanudan, un equipo por sesión. Subagentes: contexto propio, reanudables (`SendMessage`), memoria persistente por agente, hooks por agente, modelo y herramientas por agente, funcionan en modo programático.

## Consecuencias
Un especialista no puede preguntar al humano (`AskUserQuestion` no está disponible en subagentes): devuelve preguntas en `## Bloqueos`. La comunicación pasa por el lead y artefactos. Los teams quedan disponibles para sesiones interactivas humanas de investigación.
