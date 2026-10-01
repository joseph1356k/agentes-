import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile, appendFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { MissionRow, RepoRow } from './types.js';

const execFileP = promisify(execFile);

export async function git(cwd: string, args: string[], opts: { allowFail?: boolean } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileP('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    if (opts.allowFail) return { stdout: (err.stdout ?? '').trim(), stderr: (err.stderr ?? '').trim(), code: typeof err.code === 'number' ? err.code : 1 };
    throw new Error(`git ${args.join(' ')} falló: ${(err.stderr ?? '').trim() || String(e)}`);
  }
}

export function slugify(s: string, max = 40): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '') || 'mision';
}

/** Rama de la misión según el prefijo del repo: `mission/<id8>-<slug>` o, en repos con convención <persona>/<que-hace>, `oficina/<slug>-<id8>`. */
export function branchNameFor(mission: MissionRow, repo?: Pick<RepoRow, 'branch_prefix'>): string {
  if (mission.branch) return mission.branch;
  const id8 = mission.id.replace(/^m_/, '').slice(0, 8);
  const prefix = repo?.branch_prefix || 'mission/';
  return prefix === 'mission/' ? `mission/${id8}-${slugify(mission.title)}` : `${prefix}${slugify(mission.title)}-${id8}`;
}

export interface PreparedWorkspace {
  worktree: string;
  branch: string;
  baseSha: string;
  resumedBranch: boolean;
}

/**
 * Prepara el worktree de la misión sin tocar el checkout del humano:
 * fetch, rama mission/<id>-<slug> desde origin/<default> (o la existente si se retoma), git worktree add.
 */
export async function prepareWorkspace(repoPath: string, worktreesRoot: string, repo: RepoRow, mission: MissionRow): Promise<PreparedWorkspace> {
  const branch = branchNameFor(mission, repo);
  const worktree = join(worktreesRoot, repo.slug, mission.id);
  await git(repoPath, ['fetch', '--prune', 'origin']);
  // Portero del repo (p. ej. .githooks/pre-push): se activa en la config compartida del clon, como pide su README.
  try { await stat(join(repoPath, '.githooks')); await git(repoPath, ['config', 'core.hooksPath', '.githooks'], { allowFail: true }); } catch { /* sin portero */ }

  const remoteBranch = await git(repoPath, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], { allowFail: true });
  const localBranch = await git(repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { allowFail: true });
  const resumedBranch = remoteBranch.code === 0 || localBranch.code === 0;

  let exists = false;
  try { exists = (await stat(join(worktree, '.git'))).isFile() || (await stat(worktree)).isDirectory(); } catch { exists = false; }

  if (!exists) {
    await mkdir(join(worktreesRoot, repo.slug), { recursive: true });
    if (remoteBranch.code === 0) {
      // retomar: rama remota existente
      if (localBranch.code === 0) await git(repoPath, ['worktree', 'add', worktree, branch]);
      else await git(repoPath, ['worktree', 'add', '--track', '-b', branch, worktree, `origin/${branch}`]);
    } else if (localBranch.code === 0) {
      await git(repoPath, ['worktree', 'add', worktree, branch]);
    } else {
      await git(repoPath, ['worktree', 'add', '-b', branch, worktree, `origin/${repo.default_branch}`]);
    }
  } else {
    // worktree ya existe (p.ej. reanudación en la misma máquina): asegurar rama y traer cambios remotos
    const cur = await git(worktree, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (cur.stdout !== branch) throw new Error(`el worktree ${worktree} está en '${cur.stdout}', no en '${branch}'`);
    if (remoteBranch.code === 0) await git(worktree, ['pull', '--ff-only', 'origin', branch], { allowFail: true });
  }

  const baseSha = mission.base_sha ?? (await git(repoPath, ['rev-parse', `origin/${repo.default_branch}`])).stdout;
  await ensureExcludes(worktree);
  await mkdir(join(worktree, '.oficina', 'evidence'), { recursive: true });
  await mkdir(join(worktree, '.oficina', 'handoffs'), { recursive: true });
  return { worktree, branch, baseSha, resumedBranch };
}

async function ensureExcludes(worktree: string): Promise<void> {
  // En un worktree, .git es un archivo "gitdir: ..."; usamos git rev-parse para localizar info/exclude
  const gitDir = (await git(worktree, ['rev-parse', '--git-dir'])).stdout;
  const commonDir = (await git(worktree, ['rev-parse', '--git-common-dir'])).stdout;
  const excludePath = join(gitDir.startsWith('/') ? commonDir : join(worktree, commonDir), 'info', 'exclude');
  const lines = ['.oficina/evidence/', '.oficina/notes.md', '.oficina/tickets.json', '.oficina/triage-result.json', 'graphify-out/', '.oficina/graphify.stamp'];
  let current = '';
  try { current = await readFile(excludePath, 'utf8'); } catch { /* no existe */ }
  const missing = lines.filter(l => !current.split('\n').includes(l));
  if (missing.length) {
    await mkdir(join(excludePath, '..'), { recursive: true });
    await appendFile(excludePath, (current.endsWith('\n') || current === '' ? '' : '\n') + missing.join('\n') + '\n');
  }
}

export async function writeMissionJson(worktree: string, mission: MissionRow, repo: RepoRow, ws: PreparedWorkspace, dashboardUrl?: string): Promise<void> {
  const data = {
    id: mission.id,
    title: mission.title,
    goal: mission.goal,
    acceptance: mission.acceptance ?? [],
    decisions: mission.decisions ?? [],
    repo: { slug: repo.slug, default_branch: repo.default_branch, production_branch: repo.production_branch, commands: repo.commands ?? {} },
    branch: ws.branch,
    base_sha: ws.baseSha,
    level: mission.level,
    risk: mission.risk,
    scope: {},
    evidence_dir: '.oficina/evidence',
    dashboard_url: dashboardUrl ? `${dashboardUrl.replace(/\/$/, '')}/missions/${mission.id}` : null,
    created_by: mission.created_by,
    kind: mission.kind,
    attempt: mission.attempt,
    subdir: mission.subdir ?? null,
    branch_prefix: repo.branch_prefix ?? 'mission/',
  };
  await writeFile(join(worktree, '.oficina', 'mission.json'), JSON.stringify(data, null, 2) + '\n');
}

export async function headSha(worktree: string): Promise<string> {
  return (await git(worktree, ['rev-parse', 'HEAD'])).stdout;
}

export async function hasUnpushedCommits(worktree: string, branch: string): Promise<boolean> {
  const r = await git(worktree, ['rev-list', '--count', `origin/${branch}..HEAD`], { allowFail: true });
  if (r.code !== 0) return true; // la rama remota no existe aún
  return Number(r.stdout || '0') > 0;
}

export async function pushBranch(worktree: string, branch: string): Promise<boolean> {
  if (!(await hasUnpushedCommits(worktree, branch))) return false;
  await git(worktree, ['push', '-u', 'origin', `${branch}:${branch}`]);
  return true;
}

export async function commitsSince(worktree: string, baseSha: string): Promise<string[]> {
  const r = await git(worktree, ['rev-list', '--reverse', `${baseSha}..HEAD`], { allowFail: true });
  return r.code === 0 && r.stdout ? r.stdout.split('\n') : [];
}

/** Actualiza el índice de Graphify (en `dir`, que en monorepos es la carpeta del proyecto) si está instalado y el stamp no coincide con HEAD. Nunca falla la misión. */
export async function graphifyUpdateIfStale(worktree: string, enabled: boolean, dir: string = worktree): Promise<'updated' | 'fresh' | 'skipped'> {
  if (!enabled) return 'skipped';
  const which = await execFileP('bash', ['-lc', 'command -v graphify']).catch(() => null);
  if (!which) return 'skipped';
  const head = (await git(worktree, ['rev-parse', '--short', 'HEAD'])).stdout;
  const stampPath = join(worktree, '.oficina', 'graphify.stamp');
  const stamp = await readFile(stampPath, 'utf8').then(s => s.trim()).catch(() => '');
  if (stamp === head) return 'fresh';
  try {
    await execFileP('graphify', ['update', '.', '--no-viz'], { cwd: dir, maxBuffer: 50 * 1024 * 1024, timeout: 10 * 60 * 1000 });
    await writeFile(stampPath, head + '\n');
    return 'updated';
  } catch {
    return 'skipped';
  }
}
