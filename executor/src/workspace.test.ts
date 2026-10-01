import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, prepareWorkspace, writeMissionJson, branchNameFor, slugify, pushBranch, hasUnpushedCommits } from './workspace.js';
import type { MissionRow, RepoRow } from './types.js';

let root: string; let remote: string; let clone: string; let wtRoot: string;
const repo: RepoRow = { id: 'repo_1', slug: 'demo', name: 'Demo', remote_url: '', default_branch: 'main', production_branch: 'main', commands: { test: 'true' }, staging: {}, branch_prefix: 'mission/', subprojects: [], graphify_enabled: false, sensitive_data: false };
const mission = (over: Partial<MissionRow> = {}): MissionRow => ({
  id: 'm_abcd1234', repo_id: 'repo_1', parent_mission_id: null, kind: 'feature', subdir: null, required_platform: null, title: 'Recordar corrección por voz: ¡ñandú!', goal: 'g', acceptance: ['a'], decisions: [],
  priority: 50, status: 'claimed', status_reason: null, level: null, risk: null, provider: 'claude', model: null, branch: null, base_sha: null, head_sha: null, pr_url: null,
  executor_id: 'ex_1', preferred_executor_id: null, session_id: null, attempt: 1, max_budget_usd: null, max_turns: null, cost_usd: 0, result: null, created_by: 'dev@x', ...over,
});

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ws-'));
  remote = join(root, 'remote.git'); clone = join(root, 'clone'); wtRoot = join(root, 'wt');
  await git(root, ['init', '--bare', '-b', 'main', remote]);
  await git(root, ['clone', remote, clone]);
  await git(clone, ['config', 'user.email', 't@t']); await git(clone, ['config', 'user.name', 't']);
  await writeFile(join(clone, 'README.md'), '# demo\n');
  await git(clone, ['add', '.']); await git(clone, ['commit', '-qm', 'init']); await git(clone, ['push', '-q', 'origin', 'main']);
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe('workspace', () => {
  it('slug y nombre de rama', () => {
    expect(slugify('Recordar corrección por voz: ¡ñandú!')).toBe('recordar-correccion-por-voz-nandu');
    expect(branchNameFor(mission())).toBe('mission/abcd1234-recordar-correccion-por-voz-nandu');
    expect(branchNameFor(mission({ branch: 'mission/x' }))).toBe('mission/x');
    expect(branchNameFor(mission(), { branch_prefix: 'oficina/' })).toBe('oficina/recordar-correccion-por-voz-nandu-abcd1234');
  });
  it('crea worktree y rama sin tocar el clone del humano', async () => {
    const ws = await prepareWorkspace(clone, wtRoot, repo, mission());
    expect(ws.worktree).toBe(join(wtRoot, 'demo', 'm_abcd1234'));
    expect(ws.resumedBranch).toBe(false);
    expect((await git(ws.worktree, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout).toBe(ws.branch);
    expect((await git(clone, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout).toBe('main');
    await writeMissionJson(ws.worktree, mission(), repo, ws, 'https://oficina.test/');
    const mj = JSON.parse(await readFile(join(ws.worktree, '.oficina', 'mission.json'), 'utf8'));
    expect(mj.branch).toBe(ws.branch);
    expect(mj.dashboard_url).toBe('https://oficina.test/missions/m_abcd1234');
    const exclude = await readFile(join(clone, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toContain('.oficina/evidence/');
  });
  it('push solo cuando hay commits nuevos y reanuda desde la rama remota', async () => {
    const ws = await prepareWorkspace(clone, wtRoot, repo, mission());
    await git(ws.worktree, ['config', 'user.email', 't@t']); await git(ws.worktree, ['config', 'user.name', 't']);
    expect(await hasUnpushedCommits(ws.worktree, ws.branch)).toBe(true); // rama remota aún no existe
    await git(ws.worktree, ['add', '.oficina/mission.json']); await git(ws.worktree, ['commit', '-qm', 'chore: mission']);
    expect(await pushBranch(ws.worktree, ws.branch)).toBe(true);
    expect(await pushBranch(ws.worktree, ws.branch)).toBe(false);
    // otro ejecutor (otro clone) retoma la rama existente
    const clone2 = join(root, 'clone2'); await git(root, ['clone', '-q', remote, clone2]);
    const ws2 = await prepareWorkspace(clone2, join(root, 'wt2'), repo, mission());
    expect(ws2.resumedBranch).toBe(true);
    expect((await git(ws2.worktree, ['log', '--oneline'])).stdout).toContain('chore: mission');
  });
});
