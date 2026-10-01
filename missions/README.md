# Misiones en archivo (uso sin dashboard)

Mientras no exista el dashboard (Fase 1), una misión puede describirse en un archivo y pegarse al tech lead. La fuente de verdad durante la ejecución es `.oficina/mission.json` en el worktree, que `/oficina:mission` crea.

Plantilla: `TEMPLATE.md`. Ejemplo: `EJEMPLO-correccion-por-voz.md`.

Flujo manual:

```bash
cd ~/repos/<repo> && git fetch origin && git switch -c mission/<8hex>-<slug> origin/main
claude --plugin-dir ~/oficina/office-kit --agent oficina:tech-lead
> /oficina:mission "<título>"      # luego pega el contenido del archivo si tiene decisiones o criterio
```

Al terminar, `.oficina/report.json` y `.oficina/report.md` contienen el informe; la evidencia queda en `.oficina/evidence/`.
