# @oficina/executor

Daemon local que convierte filas de `missions` (Supabase) en sesiones de Claude Code con el plugin `oficina`, transmite eventos, captura preguntas, verifica evidencia y publica la rama y el PR. Especificación completa en `docs/04-EJECUTOR.md`.

Estado: **esqueleto v0** — compila (`pnpm typecheck`) y la lógica sin modelo tiene pruebas (`pnpm test`: máquina de estados, verificación de evidencia, worktrees con git real). La integración con el Agent SDK sigue la documentación vigente y **se valida en la primera misión real** (Fase 1).

```bash
cd executor && pnpm install
pnpm typecheck && pnpm test
pnpm build
node dist/cli.js init        # escribe ~/.oficina/config.json de ejemplo
node dist/cli.js login       # magic link de Supabase → ~/.oficina/credentials.json (0600)
node dist/cli.js register    # registra este computador y sus repos
node dist/cli.js start       # bucle: claim → worktree → sesión → evidencia → push/PR
node dist/cli.js status
```

Configuración (`~/.oficina/config.json`): `supabase_url`, `supabase_anon_key`, `office_kit_path`, `worktrees_root`, `repos[{slug,path}]`, `max_parallel` (1), `billing_mode` (`subscription`), `answer_wait_ms` (900000), `models.lead` (`opus`), `effort` (`high`), `max_budget_usd_default` (15), `max_turns_default` (400), `dashboard_url`, `create_pr`.

Para que sobreviva al cierre de la terminal: `pm2 start dist/cli.js --name oficina -- start`, o un `launchd`/`systemd --user` (ver `docs/04-EJECUTOR.md`).
