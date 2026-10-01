import { describe, expect, it } from 'vitest';
import { buildInitialPrompt, buildResumePrompt, integrationPhase } from './runner.js';
import type { MissionRow, RepoRow } from './types.js';

const repo = { id: 'r1', slug: 'u', name: 'Ü', remote_url: '', default_branch: 'main', production_branch: 'main', commands: {}, staging: {}, branch_prefix: 'oficina/', subprojects: [], graphify_enabled: true, sensitive_data: true } as RepoRow;
const base = {
  id: 'm_1', repo_id: 'r1', parent_mission_id: null, kind: 'feature', subdir: null, required_platform: null, base_branch: null, depends_on: [],
  plan: null, spec_path: null, require_plan_approval: false, require_review: false, auto_queue_children: true, executor_checks: null, review: null, ci: null,
  title: 'Recordar corrección "por voz"', goal: 'objetivo', acceptance: ['a1'], decisions: [], priority: 50, status: 'claimed', status_reason: null,
  level: null, risk: null, provider: 'claude', model: null, branch: null, base_sha: null, head_sha: null, pr_url: null, executor_id: null,
  preferred_executor_id: null, session_id: null, attempt: 1, max_budget_usd: null, max_turns: null, cost_usd: 0, result: null, created_by: 'dev',
} as MissionRow;

describe('integrationPhase', () => {
  it('es falsa sin hijas o con alguna hija pendiente', () => {
    expect(integrationPhase([])).toBe(false);
    expect(integrationPhase([{ status: 'review' }, { status: 'running' }])).toBe(false);
    expect(integrationPhase([{ status: 'cancelled' }])).toBe(false);
  });
  it('es verdadera cuando todas las hijas están entregadas (las canceladas no cuentan en contra)', () => {
    expect(integrationPhase([{ status: 'review' }, { status: 'approved' }])).toBe(true);
    expect(integrationPhase([{ status: 'review' }, { status: 'cancelled' }])).toBe(true);
  });
});

describe('buildInitialPrompt', () => {
  it('abre con la skill según el tipo y escapa comillas del título', () => {
    expect(buildInitialPrompt(base, repo, false)).toMatch(/^\/oficina:mission "Recordar corrección 'por voz'"/);
    expect(buildInitialPrompt({ ...base, kind: 'epic' }, repo, false)).toMatch(/^\/oficina:spec /);
    expect(buildInitialPrompt({ ...base, kind: 'inventory' }, repo, false)).toMatch(/^\/oficina:inventory/);
  });
  it('incluye subdir, criterio, gate de plan y sub-misión cuando aplican', () => {
    const p = buildInitialPrompt({ ...base, subdir: 'apps/web', require_plan_approval: true, parent_mission_id: 'm_0' }, repo, true);
    expect(p).toContain('proyecto apps/web');
    expect(p).toContain('- a1');
    expect(p).toContain('¿Apruebas el plan?');
    expect(p).toContain('sub-misión de m_0');
    expect(p).toContain('La rama de misión ya existe');
    expect(p).toContain('mcp__oficina__*');
  });
  it('en fase de integración usa /oficina:mission aunque sea epic y añade la instrucción de integrar', () => {
    const p = buildInitialPrompt({ ...base, kind: 'epic' }, repo, true, true);
    expect(p).toMatch(/^\/oficina:mission /);
    expect(p).toContain('FASE DE INTEGRACIÓN');
  });
});

describe('buildResumePrompt', () => {
  it('explica el motivo de la reanudación y adjunta mensajes del humano', () => {
    const p = buildResumePrompt(base, 'changes_requested', ['usa el componente existente']);
    expect(p).toContain('pidió cambios');
    expect(p).toContain('- usa el componente existente');
    expect(p).toContain('Misión m_1');
  });
  it('en integración la instrucción de integrar sustituye al motivo genérico', () => {
    const p = buildResumePrompt(base, 'blocked', [], true);
    expect(p).toContain('FASE DE INTEGRACIÓN');
    expect(p).not.toContain('Reanudación de la misión');
  });
});
