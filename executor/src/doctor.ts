// `oficina-executor doctor`: comprueba lo que la máquina necesita antes de la primera misión. No asume nada por existir una sesión en el navegador.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { OFICINA_HOME, loadAuth, loadConfig, saveAuth } from './daemon.js';
import { Queue } from './queue.js';

const execFileP = promisify(execFile);
type Check = { name: string; ok: boolean; detail: string; fix?: string };

async function run(cmd: string, args: string[], cwd?: string): Promise<{ ok: boolean; out: string }> {
  try { const { stdout, stderr } = await execFileP(cmd, args, { cwd, timeout: 20000 }); return { ok: true, out: (stdout || stderr).trim() }; }
  catch (e) { const err = e as { stdout?: string; stderr?: string; message?: string }; return { ok: false, out: (err.stderr || err.stdout || err.message || '').trim() }; }
}

export async function doctor(): Promise<boolean> {
  const checks: Check[] = [];
  const node = process.versions.node;
  checks.push({ name: 'node >= 22', ok: Number(node.split('.')[0]) >= 22, detail: node, fix: 'instala Node 22 (nvm install 22)' });

  const claude = await run('claude', ['--version']);
  checks.push({ name: 'claude (Claude Code CLI)', ok: claude.ok, detail: claude.out.split('\n')[0] ?? '', fix: 'npm i -g @anthropic-ai/claude-code && claude (y /login con tu cuenta)' });
  const auth = await run('claude', ['auth', 'status']);
  checks.push({ name: 'claude auth status', ok: auth.ok && !/not logged|no credentials|logged out/i.test(auth.out), detail: auth.out.split('\n')[0] ?? '', fix: 'abre `claude` y ejecuta /login con la cuenta del dueño de este computador' });
  const gh = await run('gh', ['auth', 'status']);
  checks.push({ name: 'gh auth status (para crear PRs)', ok: gh.ok, detail: gh.out.split('\n').find(l => /Logged in|logged in/i.test(l)) ?? gh.out.split('\n')[0] ?? '', fix: 'gh auth login' });
  const git = await run('git', ['--version']);
  checks.push({ name: 'git', ok: git.ok, detail: git.out });
  const graphify = await run('graphify', ['--help']);
  checks.push({ name: 'graphify (opcional)', ok: graphify.ok, detail: graphify.ok ? 'instalado' : 'no instalado', fix: 'uv tool install graphifyy' });

  let config: Awaited<ReturnType<typeof loadConfig>> | null = null;
  try { config = await loadConfig(); checks.push({ name: 'config.json', ok: true, detail: join(OFICINA_HOME, 'config.json') }); }
  catch (e) { checks.push({ name: 'config.json', ok: false, detail: e instanceof Error ? e.message : String(e), fix: 'oficina-executor init y edita ~/.oficina/config.json' }); }

  if (config) {
    try { await stat(join(config.office_kit_path, '.claude-plugin', 'plugin.json')); checks.push({ name: 'office-kit', ok: true, detail: config.office_kit_path }); }
    catch { checks.push({ name: 'office-kit', ok: false, detail: `${config.office_kit_path} no contiene el plugin`, fix: 'apunta office_kit_path a <clon de agentes->/office-kit' }); }
    const validate = await run('claude', ['plugin', 'validate', config.office_kit_path]);
    checks.push({ name: 'claude plugin validate office-kit', ok: validate.ok && /passed/i.test(validate.out), detail: validate.out.split('\n').pop() ?? '' });
    for (const r of config.repos) {
      const top = await run('git', ['rev-parse', '--show-toplevel'], r.path);
      const remote = await run('git', ['remote', 'get-url', 'origin'], r.path);
      checks.push({ name: `repo ${r.slug}`, ok: top.ok, detail: top.ok ? `${r.path} → ${remote.out}` : `${r.path}: ${top.out}`, fix: 'clona el repo en esa ruta o corrige repos[].path' });
      const hooks = await run('git', ['config', 'core.hooksPath'], r.path);
      try { await stat(join(r.path, '.githooks')); checks.push({ name: `portero ${r.slug}`, ok: hooks.ok && hooks.out === '.githooks', detail: hooks.out || 'core.hooksPath sin definir', fix: `git -C ${r.path} config core.hooksPath .githooks` }); } catch { /* sin portero */ }
    }
    try {
      const authq = await loadAuth();
      const queue = await Queue.connect(config.supabase_url, config.supabase_anon_key, authq, saveAuth);
      const r = await queue.sb.from('team_members').select('email').eq('email', authq.email).maybeSingle();
      checks.push({ name: 'Supabase (sesión y team_members)', ok: !r.error && !!r.data, detail: r.error ? r.error.message : r.data ? `${authq.email} es miembro` : `${authq.email} no está en team_members`, fix: 'oficina-executor login; pide que añadan tu correo a team_members' });
    } catch (e) { checks.push({ name: 'Supabase (credenciales)', ok: false, detail: e instanceof Error ? e.message : String(e), fix: 'oficina-executor login' }); }
  }

  let allOk = true;
  for (const c of checks) {
    if (!c.ok) allOk = false;
    console.log(`${c.ok ? '  ok  ' : '  FALTA'} ${c.name.padEnd(38)} ${c.detail}${!c.ok && c.fix ? `\n        → ${c.fix}` : ''}`);
  }
  console.log(allOk ? '\nTodo listo para la primera misión.' : '\nResuelve lo marcado como FALTA antes de `oficina-executor start`.');
  return allOk;
}
