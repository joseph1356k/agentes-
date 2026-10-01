// M6: vigilar el CI del PR con `gh pr checks` y devolver el estado (y los logs que se puedan obtener) para una ronda de corrección.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CiOutcome } from './types.js';

const execFileP = promisify(execFile);

interface GhCheck { name: string; state: string; link?: string; bucket?: string; workflow?: string }

export function summarizeChecks(checks: GhCheck[]): CiOutcome['state'] {
  if (checks.length === 0) return 'unknown';
  const states = checks.map(c => (c.bucket ?? c.state ?? '').toLowerCase());
  if (states.some(s => ['fail', 'failure', 'error', 'cancelled', 'timed_out', 'action_required'].includes(s))) return 'failure';
  if (states.some(s => ['pending', 'queued', 'in_progress', 'waiting', 'requested'].includes(s))) return 'pending';
  if (states.every(s => ['pass', 'success', 'skipping', 'skipped', 'neutral'].includes(s))) return 'success';
  return 'pending';
}

export async function fetchChecks(worktree: string, prUrl: string): Promise<GhCheck[]> {
  const { stdout } = await execFileP('gh', ['pr', 'checks', prUrl, '--json', 'name,state,link,bucket,workflow'], { cwd: worktree, timeout: 60_000 });
  const parsed = JSON.parse(stdout) as GhCheck[];
  return Array.isArray(parsed) ? parsed : [];
}

/** Espera hasta `waitMs` a que el CI termine; devuelve el estado final. Sin `gh` o sin checks → unknown. */
export async function waitForCi(worktree: string, prUrl: string, waitMs: number, rounds: number, pollMs = 120_000, log: (m: string) => void = () => {}): Promise<CiOutcome> {
  const deadline = Date.now() + waitMs;
  let last: GhCheck[] = [];
  while (Date.now() < deadline) {
    try { last = await fetchChecks(worktree, prUrl); } catch (e) { log(`gh pr checks: ${e instanceof Error ? e.message : e}`); return { pr_url: prUrl, state: 'unknown', checks: [], rounds, checked_at: new Date().toISOString() }; }
    const state = summarizeChecks(last);
    if (state !== 'pending') return { pr_url: prUrl, state, checks: last.map(c => ({ name: c.name, state: c.bucket ?? c.state, link: c.link })), rounds, checked_at: new Date().toISOString() };
    await new Promise(r => setTimeout(r, pollMs));
  }
  return { pr_url: prUrl, state: 'timeout', checks: last.map(c => ({ name: c.name, state: c.bucket ?? c.state, link: c.link })), rounds, checked_at: new Date().toISOString() };
}

/** Logs de los jobs fallidos (acotados) para dárselos al tech lead. */
export async function failedLogs(worktree: string, prUrl: string): Promise<string> {
  try {
    const { stdout } = await execFileP('gh', ['pr', 'checks', prUrl, '--json', 'name,state,link,bucket'], { cwd: worktree, timeout: 60_000 });
    const checks = JSON.parse(stdout) as GhCheck[];
    const failed = checks.filter(c => ['fail', 'failure', 'error'].includes((c.bucket ?? c.state ?? '').toLowerCase()));
    const parts: string[] = [];
    for (const c of failed.slice(0, 3)) {
      const runId = c.link?.match(/\/actions\/runs\/(\d+)/)?.[1];
      let body = '';
      if (runId) {
        try { body = (await execFileP('gh', ['run', 'view', runId, '--log-failed'], { cwd: worktree, timeout: 90_000, maxBuffer: 5 * 1024 * 1024 })).stdout; } catch { body = '(no se pudo obtener el log)'; }
      }
      parts.push(`## ${c.name} (${c.bucket ?? c.state}) ${c.link ?? ''}\n\`\`\`\n${body.split('\n').slice(-80).join('\n').slice(0, 6000)}\n\`\`\``);
    }
    return parts.join('\n\n') || 'CI en rojo sin detalle disponible.';
  } catch (e) {
    return `No se pudieron leer los checks: ${e instanceof Error ? e.message : e}`;
  }
}
