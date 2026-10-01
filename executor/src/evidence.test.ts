import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEvidenceDir, verifyResult, effectiveOutcome, coerceResult } from './evidence.js';
import type { MissionResult } from './types.js';

let dir: string;
const base: MissionResult = {
  status: 'completed', summary: 'Hecho con pruebas.', changes: [], commits: ['abc1234'], tests: [], not_tested: [],
  decisions: [], learnings: [], blockers: [], questions: [], next_steps: [], risk: 'low', delegations: [],
};
const rec = (id: string, exit_code: number) => JSON.stringify({ id, label: 'test', command: 'pnpm test', cwd: '/x', started_at: 'now', duration_ms: 10, exit_code, log_path: `${id}.log`, agent: null, session_id: null });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ev-'));
  await writeFile(join(dir, 'ev_1_aa.json'), rec('ev_1_aa', 0));
  await writeFile(join(dir, 'ev_2_bb.json'), rec('ev_2_bb', 1));
  await writeFile(join(dir, 'ev_3_cc.json'), '{corrupto');
  await writeFile(join(dir, 'commands.jsonl'), '{"event":"PostToolUse"}\n');
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('evidencia', () => {
  it('lee registros válidos e informa corruptos', async () => {
    const { records, corrupt } = await readEvidenceDir(dir);
    expect(records.size).toBe(2);
    expect(corrupt).toEqual(['ev_3_cc.json']);
  });
  it('acepta pass con exit 0 y fail con exit != 0', async () => {
    const { records } = await readEvidenceDir(dir);
    const r = { ...base, tests: [{ evidence_id: 'ev_1_aa', command: 'pnpm test', verdict: 'pass' as const }, { evidence_id: 'ev_2_bb', command: 'pnpm lint', verdict: 'fail' as const }] };
    const out = verifyResult(r, records);
    expect(out.verified).toBe(true);
    expect(effectiveOutcome(r, out)).toMatchObject({ status: 'review', verified: true });
  });
  it('rechaza pass sin evidencia o con exit != 0', async () => {
    const { records } = await readEvidenceDir(dir);
    const r = { ...base, tests: [{ evidence_id: 'ev_2_bb', command: 'x', verdict: 'pass' as const }, { evidence_id: 'ev_9_zz', command: 'y', verdict: 'pass' as const }] };
    const out = verifyResult(r, records);
    expect(out.verified).toBe(false);
    expect(out.unverified.map(u => u.evidence_id).sort()).toEqual(['ev_2_bb', 'ev_9_zz']);
    const eff = effectiveOutcome(r, out);
    expect(eff.status).toBe('review');
    expect(eff.verified).toBe(false);
    expect(eff.reason).toMatch(/NO verificada/);
  });
  it('completed sin pruebas no se verifica', () => {
    const out = verifyResult(base, new Map());
    expect(out.verified).toBe(false);
  });
  it('blocked va a blocked aunque la evidencia esté bien', () => {
    const r = { ...base, status: 'blocked' as const, blockers: [{ what: 'falta acceso a staging', needs: 'access' as const }] };
    expect(effectiveOutcome(r, verifyResult(r, new Map())).status).toBe('blocked');
  });
  it('coerceResult tolera salida incompleta y rechaza basura', () => {
    expect(coerceResult(null)).toBeNull();
    expect(coerceResult({ status: 'nope' })).toBeNull();
    const c = coerceResult({ status: 'partial', summary: 's', tests: [{ evidence_id: 'ev_1_aa', command: 'c', verdict: 'pass' }, { bad: true }] });
    expect(c?.status).toBe('partial');
    expect(c?.tests.length).toBe(1);
    expect(c?.risk).toBe('low');
  });
});
