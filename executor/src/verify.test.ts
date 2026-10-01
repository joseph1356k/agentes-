import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureCommand, pickChecks, runIndependentChecks, describeFailures } from './verify.js';
import { readEvidenceDir } from './evidence.js';
import { parseReview } from './review.js';
import { summarizeChecks } from './ci.js';

let dir: string;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'verify-')); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('verificación independiente (M7)', () => {
  it('captura comando con evidencia compatible con oficina-run', async () => {
    const r = await captureCommand('echo hola && exit 0', { cwd: dir, evidenceDir: join(dir, 'ev'), label: 'exec-test' });
    expect(r.exit_code).toBe(0);
    expect(r.evidence_id).toMatch(/^ev_\d+_[0-9a-f]{6}$/);
    expect(r.tail).toContain('hola');
    const { records } = await readEvidenceDir(join(dir, 'ev'));
    expect(records.get(r.evidence_id)?.exit_code).toBe(0);
    const log = await readFile(join(dir, 'ev', `${r.evidence_id}.log`), 'utf8');
    expect(log).toContain('# label: exec-test');
  });
  it('propaga el código de salida y el timeout', async () => {
    const r = await captureCommand('echo fallo >&2; exit 3', { cwd: dir, evidenceDir: join(dir, 'ev'), label: 'x' });
    expect(r.exit_code).toBe(3);
    const t = await captureCommand('sleep 5', { cwd: dir, evidenceDir: join(dir, 'ev'), label: 'slow', timeoutMs: 300 });
    expect(t.exit_code).not.toBe(0);
  });
  it('elige test/lint/typecheck y build solo sin test', () => {
    expect(pickChecks({ test: 'a', lint: 'b', typecheck: 'c', build: 'd' }).map(c => c.name)).toEqual(['test', 'lint', 'typecheck']);
    expect(pickChecks({ build: 'd' }).map(c => c.name)).toEqual(['build']);
    expect(pickChecks({})).toEqual([]);
  });
  it('corre las comprobaciones y describe los fallos', async () => {
    const ec = await runIndependentChecks(dir, join(dir, 'ev'), { test: 'exit 0', lint: 'echo "x.ts:1 error" && exit 1' }, 1);
    expect(ec.ok).toBe(false);
    expect(ec.checks.map(c => c.exit_code)).toEqual([0, 1]);
    expect(describeFailures(ec)).toMatch(/lint falló \(exit 1\)/);
    const none = await runIndependentChecks(dir, join(dir, 'ev'), {}, 1);
    expect(none.ok).toBe(true);
    expect(none.skipped_reason).toBeTruthy();
  });
});

describe('revisión (M9) y CI (M6)', () => {
  it('parsea el veredicto y cuenta severidades', () => {
    const md = '## Veredicto\ncambios requeridos\n\n## Hallazgos\n- [bloqueante] src/a.ts:10 fuga entre usuarios\n- [alta] src/b.ts:3 sin prueba\n- [baja] nombre\n';
    expect(parseReview(md)).toMatchObject({ verdict: 'cambios_requeridos', blocking: 1, high: 1 });
    expect(parseReview('## Veredicto\naprobar\n').verdict).toBe('aprobar');
    expect(parseReview('nada').verdict).toBe('no_revisable');
  });
  it('resume los checks de gh', () => {
    expect(summarizeChecks([])).toBe('unknown');
    expect(summarizeChecks([{ name: 'a', state: 'SUCCESS', bucket: 'pass' }, { name: 'b', state: 'SKIPPED', bucket: 'skipping' }])).toBe('success');
    expect(summarizeChecks([{ name: 'a', state: 'SUCCESS', bucket: 'pass' }, { name: 'b', state: 'IN_PROGRESS', bucket: 'pending' }])).toBe('pending');
    expect(summarizeChecks([{ name: 'a', state: 'FAILURE', bucket: 'fail' }, { name: 'b', state: 'IN_PROGRESS', bucket: 'pending' }])).toBe('failure');
  });
});
