// M7: verificación independiente. El ejecutor corre por su cuenta los comandos del repo/subproyecto y deja evidencia
// con el mismo formato que oficina-run (ev_<ts>_<hex>.json + .log), de modo que el verificador cruzado los reconoce.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { CheckResult, ExecutorChecks } from './types.js';

export interface CaptureOptions { cwd: string; evidenceDir: string; label: string; timeoutMs?: number; env?: Record<string, string> }

/** Ejecuta `command` con bash -lc, guarda log y meta de evidencia, devuelve el resultado. Nunca lanza por fallo del comando. */
export async function captureCommand(command: string, opts: CaptureOptions): Promise<CheckResult> {
  await mkdir(opts.evidenceDir, { recursive: true });
  const id = `ev_${Math.floor(Date.now() / 1000)}_${randomBytes(3).toString('hex')}`;
  const logPath = join(opts.evidenceDir, `${id}.log`);
  const started = new Date();
  const t0 = Date.now();
  const chunks: string[] = [];
  const code: number = await new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], { cwd: opts.cwd, env: { ...process.env, ...(opts.env ?? {}), CI: '1', FORCE_COLOR: '0' } });
    const timer = setTimeout(() => { child.kill('SIGKILL'); chunks.push('\n# oficina: timeout\n'); }, opts.timeoutMs ?? 20 * 60 * 1000);
    child.stdout.on('data', d => chunks.push(String(d)));
    child.stderr.on('data', d => chunks.push(String(d)));
    child.on('error', e => { chunks.push(`\n# oficina: ${e.message}\n`); });
    child.on('close', (c, signal) => { clearTimeout(timer); resolve(c ?? (signal ? 137 : 1)); });
  });
  const dur = Date.now() - t0;
  const out = chunks.join('');
  const header = `# oficina-executor ${id}\n# label: ${opts.label}\n# cwd: ${opts.cwd}\n# started: ${started.toISOString()}\n# command: ${command}\n# ----\n`;
  await writeFile(logPath, `${header}${out}\n# ----\n# exit: ${code} · duration_ms: ${dur}\n`);
  await writeFile(join(opts.evidenceDir, `${id}.json`), JSON.stringify({ id, label: opts.label, command, cwd: opts.cwd, started_at: started.toISOString(), duration_ms: dur, exit_code: code, log_path: logPath, agent: 'executor', session_id: null }, null, 2) + '\n');
  const lines = out.trim().split('\n');
  return { name: opts.label, command, evidence_id: id, exit_code: code, duration_ms: dur, tail: lines.slice(-25).join('\n').slice(0, 4000) };
}

/** Comandos a verificar: test, lint, typecheck (los que existan). `build` solo si no hay test. */
export function pickChecks(commands: Record<string, string> | undefined | null): Array<{ name: string; command: string }> {
  const c = commands ?? {};
  const out: Array<{ name: string; command: string }> = [];
  for (const name of ['test', 'lint', 'typecheck']) if (c[name]) out.push({ name, command: c[name]! });
  if (!c.test && c.build) out.push({ name: 'build', command: c.build });
  return out;
}

export async function runIndependentChecks(cwd: string, evidenceDir: string, commands: Record<string, string> | undefined | null, round: number): Promise<ExecutorChecks> {
  const picked = pickChecks(commands);
  const ran_at = new Date().toISOString();
  if (picked.length === 0) return { ok: true, ran_at, cwd, checks: [], round, skipped_reason: 'el repo/subproyecto no declara comandos test/lint/typecheck/build (la misión de inventario debería fijarlos)' };
  const checks: CheckResult[] = [];
  for (const p of picked) checks.push(await captureCommand(p.command, { cwd, evidenceDir, label: `exec-${p.name}` }));
  return { ok: checks.every(c => c.exit_code === 0), ran_at, cwd, checks, round };
}

/** Texto que se le pasa al tech lead cuando la verificación falla (ronda de corrección). */
export function describeFailures(ec: ExecutorChecks): string {
  const failed = ec.checks.filter(c => c.exit_code !== 0);
  return failed.map(c => `## ${c.name} falló (exit ${c.exit_code}) · evidencia ${c.evidence_id}\n\`${c.command}\`\n\`\`\`\n${c.tail}\n\`\`\``).join('\n\n');
}
