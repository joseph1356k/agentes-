# ADR-006 · Preguntas al humano con espera corta y `defer`

Estado: accepted (verificar en Fase 1) · 2026-10-01

## Decisión
El tech lead pregunta con `AskUserQuestion` solo cuando una decisión cambia la solución. Un hook `PreToolUse` registra la pregunta en `questions`, espera hasta 15 minutos una respuesta del dashboard y, si no llega, devuelve `defer`: la sesión termina, la misión pasa a `waiting_answer` y el ejecutor queda libre. Al responder, la misión vuelve a la cola con preferencia por el mismo ejecutor y se reanuda con `resume`.

## Justificación
Documentado en el SDK: "If you return defer, the query ends so you can resume it later". Evita procesos colgados y mantiene el estado explícito.

## Riesgo y mitigación
El comportamiento exacto al reanudar (reinvocación del hook vs. nueva evaluación de permisos) se verifica en la primera misión real; el ejecutor implementa ambos caminos (`canUseTool` también devuelve la respuesta registrada y el prompt de reanudación la describe).
