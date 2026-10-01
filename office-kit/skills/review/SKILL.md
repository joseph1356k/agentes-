---
name: review
description: Lanza una revisión independiente del diff de la misión con el agente oficina:revisor (contexto limpio, modelo fuerte, solo lectura) y aplica la política de cierre: hallazgos bloqueantes y altos se atienden antes de cerrar. Úsalo con /oficina:review [base_sha].
argument-hint: "[base_sha]"
---

# Revisión independiente

Base y diff:

```!
BASE="${ARGUMENTS:-$(jq -r .base_sha .oficina/mission.json 2>/dev/null)}"
echo "base=$BASE head=$(git rev-parse --short HEAD 2>/dev/null)"
git diff --stat "$BASE"...HEAD 2>/dev/null | tail -30
```

## Pasos

1. Si la base es desconocida, usa el `base_sha` de `.oficina/mission.json`; si tampoco existe, usa la rama por defecto.
2. Lanza el subagente **`oficina:revisor`** con este prompt (ajusta los valores):

   > Revisa la misión `<id>`: objetivo "<goal>", criterio de aceptación: <lista>. Diff: `git diff <base> ... HEAD`. Informe del autor en `.oficina/report.md` (si existe) y evidencia en `.oficina/evidence/`. Comandos de prueba del repo: <test/lint/build>. Devuelve `## Veredicto`, `## Hallazgos` (severidad, archivo:línea, escenario, propuesta), `## Evidencia`, `## Riesgos pendientes`, `## Parcial`.

3. Al recibir el veredicto:
   - Hallazgos `bloqueante` o `alta`: corrígelos (o encárgalos) y vuelve a correr las pruebas con `oficina-run`. Luego `SendMessage` al mismo revisor para que re-verifique solo esos puntos.
   - `media`/`baja`: corrige lo que sea barato y seguro; lo demás va a `next_steps` del informe con justificación.
   - `no revisable`: resuelve la causa (diff inaccesible, pruebas que no corren) antes de seguir.
4. Guarda el veredicto final en `.oficina/review.md` y referencia sus `ev_...` en el informe de misión.

Nunca cierres una misión de riesgo medio/alto o nivel N3 sin veredicto `aprobar`.
