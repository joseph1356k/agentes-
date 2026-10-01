import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Queue } from './queue.js';
import type { MissionRow, MissionResult, RepoRow } from './types.js';

const execFileP = promisify(execFile);

/** Crea el PR de la misión una sola vez (idempotente por operations.idempotency_key). Requiere `gh` autenticado. */
export async function createPrIfMissing(queue: Queue, worktree: string, repo: RepoRow, mission: MissionRow, branch: string, result: MissionResult | null): Promise<string | null> {
  const key = `mission:${mission.id}:pr`;
  const op = await queue.recordOperation(mission.id, 'pr', key, { status: 'pending' });
  if (op.existed && op.url) return op.url;

  // ¿Ya existe un PR para la rama? (reintento tras fallo parcial)
  try {
    const { stdout } = await execFileP('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'url', '--jq', '.[0].url'], { cwd: worktree });
    const existing = stdout.trim();
    if (existing) {
      await queue.recordOperation(mission.id, 'pr', key, { status: 'done', url: existing });
      return existing;
    }
  } catch { /* gh no disponible o sin auth: se reporta abajo */ }

  const body = prBody(mission, result);
  try {
    const { stdout } = await execFileP('gh', ['pr', 'create', '--base', repo.default_branch, '--head', branch, '--title', `${mission.title} (${mission.id})`, '--body', body], { cwd: worktree });
    const url = stdout.trim().split('\n').pop() ?? '';
    await queue.recordOperation(mission.id, 'pr', key, { status: 'done', url });
    return url || null;
  } catch (e) {
    await queue.recordOperation(mission.id, 'pr', key, { status: 'failed', payload: { error: e instanceof Error ? e.message : String(e) } });
    return null;
  }
}

export function prBody(mission: MissionRow, result: MissionResult | null): string {
  const lines: string[] = [];
  lines.push(`## Misión ${mission.id}`, '', mission.goal, '');
  if (mission.acceptance?.length) {
    lines.push('### Criterio de aceptación');
    for (const a of mission.acceptance) lines.push(`- ${a}`);
    lines.push('');
  }
  if (result) {
    lines.push(`### Resultado: ${result.status}`, '', result.summary, '');
    if (result.tests.length) {
      lines.push('### Evidencia');
      for (const t of result.tests) lines.push(`- \`${t.evidence_id}\` ${t.verdict} · \`${t.command}\``);
      lines.push('');
    }
    if (result.not_tested.length) {
      lines.push('### No probado');
      for (const n of result.not_tested) lines.push(`- ${n.what}: ${n.why}`);
      lines.push('');
    }
    if (result.decisions.length) {
      lines.push('### Decisiones');
      for (const d of result.decisions) lines.push(`- [${d.scope}] ${d.text} — ${d.rationale}`);
      lines.push('');
    }
    if (result.blockers.length) {
      lines.push('### Bloqueos');
      for (const b of result.blockers) lines.push(`- ${b.what} (${b.needs})`);
      lines.push('');
    }
  }
  lines.push('---', '_Generado por la oficina de desarrollo con IA_');
  return lines.join('\n');
}
