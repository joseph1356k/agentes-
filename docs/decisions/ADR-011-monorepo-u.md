# ADR-011 · La oficina respeta las convenciones del monorepo Ü (y de cualquier repo)

Estado: accepted · 2026-10-01

## Hechos (inspección del código, no deducción por nombre)
`ZevCorp/U-Windows-App` es desde el 2026-09-28 el monorepo **Ü** con todo Miracle: `apps/windows` (Ü Windows, C# .NET 8 WPF con SAP GUI), `apps/mac` (Swift), `apps/android` (Kotlin), `apps/web` (**Miracle Notes**, portal clínico, Next.js + Supabase) y `services/graph` (**Graph**, el cerebro: API, LLM, memoria, Provider Studio; Node + Python; Vercel). "Uno" del brief es "Ü" (dictado). Su `AGENTS.md` fija: ramas `<persona>/<que-hace>` desde `main` fresco; `main` solo por PR con squash; commits `tipo(ámbito): lo que el sistema ahora hace` en español y minúscula; portero `git config core.hooksPath .githooks`; trabajar desde la carpeta del proyecto (Claude Code no hereda hooks ni skills entre carpetas); Windows solo desde Windows y Mac solo desde Mac; `graphify` como grafo del código con `graphify-out/` sin versionar; Graph y el portal se despliegan solos al mergear a `main`.

`joseph1356k/Miracle-AI` es un repo Python aparte: "Miracle", notas contextualizadas con voz y chat contextual sobre el runtime OpenClaw (Deepgram para transcripción).

## Decisión
1. `repos.branch_prefix` por repo: `oficina/` en Ü (rama `oficina/<slug>-<id8>`), `mission/` por defecto. Las guardas aceptan ambos prefijos y la rama exacta de la misión.
2. `missions.subdir`: en monorepos la sesión corre desde la carpeta del proyecto; `.oficina/` sigue en la raíz del worktree (los hooks la localizan por `git rev-parse --show-toplevel`). Graphify se actualiza en la carpeta del proyecto.
3. `missions.required_platform` y `executors.platform`: `claim_mission` solo entrega misiones de `apps/windows` a ejecutores Windows y de `apps/mac` a Mac.
4. El ejecutor activa el portero (`core.hooksPath .githooks`) si el repo lo trae; el tech lead sigue la voz de commits del repo (sus `CLAUDE.md`/`AGENTS.md`/`.claude/rules` se cargan solos con `settingSources: ['project']`).
5. El PR lo crea el ejecutor con el cuerpo del informe; el merge (squash) lo hace un humano tras la aprobación por SHA.

## Consecuencias
Un solo repo cubre los tres productos del brief; la misión de inventario produce `docs/oficina/` por subproyecto. `miracle-el-rosario` y `ZevCorp/Miracle-AI` quedan sin identificar hasta inspeccionarlos.
