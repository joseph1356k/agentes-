# office-kit — plugin `oficina` para Claude Code

El equipo de la oficina en forma de plugin: un tech lead como sesión principal, seis especialidades como subagentes, un revisor independiente, el protocolo de misión, guardas de git y evidencia verificable. Funciona solo (modo interactivo) y es lo que el ejecutor carga en cada misión.

## Uso inmediato

```bash
# validar
claude plugin validate ./office-kit --strict

# en un repo de producto
cd ~/repos/<repo>
claude --plugin-dir ~/oficina/office-kit --agent oficina:tech-lead
> /oficina:inventory                       # primera vez en un repo
> /oficina:mission "<petición>"            # trabajo real
> /oficina:handoff frontend-experiencia "<objetivo>"   # lo usa el lead al delegar
> /oficina:review                          # revisión independiente
> /oficina:evidence                        # informe final
```

## Contenido

| Ruta | Qué es |
|---|---|
| `agents/tech-lead.md` | sesión principal (opus): entiende, pregunta, programa, delega, integra |
| `agents/{memoria-contexto,voz-conversacion,computer-use,backend-agentes,frontend-experiencia,calidad}.md` | especialistas (sonnet) con memoria por proyecto y alcance verificado |
| `agents/revisor.md` | el perfil de calidad en modo lectura (opus), con guarda de solo lectura |
| `skills/protocolo` | reglas operativas (precargadas en todos los agentes) |
| `skills/mission`, `handoff`, `evidence`, `review`, `triage`, `inventory` | protocolo de misión |
| `skills/playbook-*` | conocimiento por área que la sesión principal carga sin delegar |
| `hooks/hooks.json` | `SessionStart` contexto de misión · `PreToolUse` guardas de git/despliegue y de alcance · `PostToolUse` ledger · `Stop` sin cambios sin commit |
| `bin/oficina-run` | ejecuta comandos dejando evidencia (`ev_...`) |
| `schemas/mission-result.schema.json` | informe final estructurado |
| `templates/` | `mission.json`, `HANDOFF.md`, `REPO.md`, `area.md`, `CLAUDE.md.template` |
| `scripts/inventory.sh` | inventario determinista de un repo |

## Variables

`OFICINA_ROOT` (raíz del worktree; por defecto `git rev-parse --show-toplevel`), `OFICINA_EVIDENCE_DIR` (por defecto `.oficina/evidence`), `OFICINA_AGENT` (etiqueta opcional en los recibos de evidencia).

## Artefactos por misión (`.oficina/`)

`mission.json` (estado, se commitea) · `notes.md` (hipótesis) · `handoffs/` (encargos) · `scopes.json` (alcances) · `evidence/` (ledger, `ev_*.json`, `ev_*.log`; no se commitea) · `report.json` / `report.md` (informe) · `review.md` (veredicto del revisor) · `graphify.stamp` (SHA indexado).

Añade a `.gitignore` del repo: `.oficina/evidence/`, `.oficina/notes.md`, `graphify-out/`.
