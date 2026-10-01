# Decisiones (ADR)

Una decisión por archivo, numerada, con estado `proposed | accepted | superseded`. Las de este repo son `accepted` el 1 de octubre de 2026 salvo indicación. Los repos de producto llevan sus propios ADR en `docs/decisions/`.

| ADR | Decisión |
|---|---|
| [001](ADR-001-subagentes-no-teams.md) | Subagentes y playbooks en lugar de agent teams u orquestador externo |
| [002](ADR-002-agent-sdk-typescript.md) | Claude Agent SDK (TypeScript) como motor del ejecutor |
| [003](ADR-003-supabase-vercel.md) | Supabase (proyecto separado) + Next.js en Vercel |
| [004](ADR-004-worktrees-y-alcances.md) | Rama + worktree por misión; alcances por agente verificados por hook |
| [005](ADR-005-evidencia-verificable.md) | Evidencia capturada por el sistema y verificada por el ejecutor |
| [006](ADR-006-preguntas-diferidas.md) | Preguntas al humano con espera corta y `defer` |
| [007](ADR-007-facturacion-por-ejecutor.md) | Facturación por suscripción de cada ejecutor; sin cambio silencioso |
| [008](ADR-008-produccion-determinista.md) | Ingesta y alertas deterministas en nube; triage como misión en ejecutor |
| [009](ADR-009-graphify.md) | Graphify local por repo, incremental, con stamp de frescura |
| [010](ADR-010-codex-diferido.md) | Adaptador Codex diferido tras la interfaz `Provider` |
