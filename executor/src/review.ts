// M9: revisión independiente automática. Sesión aparte con el perfil `revisor` (solo lectura, contexto limpio).
// El veredicto se parsea del Markdown del revisor; los hallazgos bloqueantes/altos disparan una ronda de corrección del lead.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MissionRow, Provider, QuestionBridge, RepoRow, ReviewOutcome, RunEvent, RunSpec } from './types.js';

export function reviewPrompt(mission: MissionRow, repo: RepoRow, baseSha: string, commands: Record<string, string>): string {
  const cmds = Object.entries(commands).filter(([k]) => ['test', 'lint', 'typecheck', 'build'].includes(k)).map(([k, v]) => `- ${k}: \`oficina-run --label review-${k} -- ${v}\``).join('\n') || '- (sin comandos declarados; revisa qué existe)';
  return [
    `Revisa la misión ${mission.id} del repo ${repo.slug}${mission.subdir ? ` (proyecto ${mission.subdir})` : ''}.`,
    `Objetivo: ${mission.goal}`,
    mission.acceptance?.length ? `Criterio de aceptación:\n${mission.acceptance.map(a => `- ${a}`).join('\n')}` : '',
    mission.plan ? `Plan del autor:\n${mission.plan.slice(0, 4000)}` : '',
    `Diff: \`git diff ${baseSha}...HEAD --stat\` y luego por archivo. Informe del autor en .oficina/report.md y evidencia en .oficina/evidence/ (ids ev_...).`,
    `Comandos para correr pruebas:\n${cmds}`,
    'Devuelve EXACTAMENTE estas secciones: `## Veredicto` (una de: aprobar | cambios requeridos | no revisable), `## Hallazgos` (lista; cada uno empieza con [bloqueante], [alta], [media] o [baja], luego archivo:línea, escenario y propuesta), `## Evidencia`, `## Riesgos pendientes`, `## Parcial`.',
    'Escribe también el informe completo en .oficina/review.md.',
  ].filter(Boolean).join('\n\n');
}

export function parseReview(text: string): Pick<ReviewOutcome, 'verdict' | 'blocking' | 'high' | 'summary'> {
  const v = text.match(/##\s*Veredicto\s*\n+([^\n]+)/i)?.[1]?.toLowerCase() ?? '';
  const verdict: ReviewOutcome['verdict'] = v.includes('no revisable') ? 'no_revisable' : v.includes('cambios') ? 'cambios_requeridos' : v.includes('aprobar') ? 'aprobar' : 'no_revisable';
  const blocking = (text.match(/\[bloqueante\]/gi) ?? []).length;
  const high = (text.match(/\[alta\]/gi) ?? []).length;
  const summary = text.match(/##\s*Veredicto\s*\n+([\s\S]{0,600}?)(?:\n##|$)/i)?.[1]?.trim() ?? text.slice(0, 600);
  return { verdict, blocking, high, summary };
}

/** Ejecuta la sesión del revisor y devuelve el veredicto. Nunca edita código (herramientas de solo lectura). */
export async function runReview(provider: Provider, base: RunSpec, mission: MissionRow, repo: RepoRow, baseSha: string, commands: Record<string, string>, reviewerPrompt: string, bridge: QuestionBridge, round: number, onEvent: (e: RunEvent) => Promise<void>): Promise<ReviewOutcome> {
  const spec: RunSpec = { ...base, readOnly: true, systemPromptOverride: reviewerPrompt, tools: undefined, model: base.model, maxTurns: 60 };
  let text = '';
  let cost = 0;
  let sessionId: string | null = null;
  for await (const ev of provider.run(spec, { kind: 'prompt', text: reviewPrompt(mission, repo, baseSha, commands) }, bridge, () => {})) {
    await onEvent(ev);
    if (ev.type === 'text' && !ev.parentToolUseId) text += ev.text + '\n';
    if (ev.type === 'result') { cost = ev.costUsd; sessionId = ev.sessionId; if (ev.text) text += '\n' + ev.text; }
  }
  const path = join(base.worktree, '.oficina', 'review.md');
  let fileText = '';
  try { fileText = await readFile(path, 'utf8'); } catch { await writeFile(path, text).catch(() => {}); }
  const parsed = parseReview(fileText || text);
  return { ...parsed, path: '.oficina/review.md', round, cost_usd: cost, session_id: sessionId };
}

export function describeReview(r: ReviewOutcome, reviewMd: string): string {
  return `El revisor independiente dio el veredicto "${r.verdict}" con ${r.blocking} hallazgo(s) bloqueante(s) y ${r.high} alto(s). Atiende los bloqueantes y altos, vuelve a correr las pruebas con oficina-run, actualiza el informe y termina con la salida estructurada.\n\n${reviewMd.slice(0, 8000)}`;
}
