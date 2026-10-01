#!/usr/bin/env node
// oficina-executor: login | register | start | status
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { OFICINA_HOME, loadConfig, loadAuth, startDaemon } from './daemon.js';
import { Queue } from './queue.js';

const VERSION = '0.1.0';

async function ask(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(q);
  rl.close();
  return a.trim();
}

async function login(): Promise<void> {
  const config = await loadConfig();
  const sb = createClient(config.supabase_url, config.supabase_anon_key, { auth: { persistSession: false } });
  const email = await ask('Email del equipo: ');
  const sent = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (sent.error) throw new Error(`signInWithOtp: ${sent.error.message}`);
  const token = await ask('Código recibido por correo: ');
  const v = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (v.error || !v.data.session) throw new Error(`verifyOtp: ${v.error?.message ?? 'sin sesión'}`);
  await mkdir(OFICINA_HOME, { recursive: true });
  await writeFile(join(OFICINA_HOME, 'credentials.json'), JSON.stringify({ email, access_token: v.data.session.access_token, refresh_token: v.data.session.refresh_token }, null, 2), { mode: 0o600 });
  console.log(`Credenciales guardadas en ${join(OFICINA_HOME, 'credentials.json')} (solo lectura para tu usuario).`);
}

async function register(): Promise<void> {
  const config = await loadConfig();
  const queue = new Queue(config.supabase_url, config.supabase_anon_key, await loadAuth());
  const id = await queue.registerExecutor(config.hostname, { billing: config.billing_mode, max_parallel: config.max_parallel, version: VERSION, providers: ['claude'] });
  const repos = await queue.linkRepos(id, config.repos);
  console.log(`ejecutor ${id} registrado · repos enlazados: ${repos.map(r => r.slug).join(', ') || 'ninguno (crea las filas en repos primero)'}`);
}

async function status(): Promise<void> {
  const config = await loadConfig();
  const queue = new Queue(config.supabase_url, config.supabase_anon_key, await loadAuth());
  const r = await queue.sb.from('executor_capacity').select('*').order('hostname');
  if (r.error) throw new Error(r.error.message);
  for (const e of r.data ?? []) console.log(`${e.hostname.padEnd(20)} ${String(e.status).padEnd(16)} ${String(e.billing).padEnd(13)} libres ${e.free_slots}/${e.max_parallel} latido ${e.last_heartbeat ?? '-'}`);
  const m = await queue.sb.from('missions').select('id,status,title,executor_id').in('status', ['queued', 'claimed', 'preparing', 'running', 'waiting_answer', 'paused_quota']).order('priority', { ascending: false });
  for (const row of m.data ?? []) console.log(`${row.id}  ${String(row.status).padEnd(15)} ${row.title}${row.executor_id ? ` @${row.executor_id}` : ''}`);
}

async function initConfig(): Promise<void> {
  await mkdir(OFICINA_HOME, { recursive: true });
  const p = join(OFICINA_HOME, 'config.json');
  try { await readFile(p); console.log(`${p} ya existe`); return; } catch { /* crear */ }
  const example = {
    supabase_url: 'https://<proyecto>.supabase.co',
    supabase_anon_key: '<anon key>',
    office_kit_path: join(OFICINA_HOME, 'office-kit'),
    worktrees_root: join(OFICINA_HOME, 'wt'),
    repos: [{ slug: 'miracle', path: '/ruta/a/miracle' }],
    max_parallel: 1,
    billing_mode: 'subscription',
    answer_wait_ms: 900000,
    models: { lead: 'opus' },
    effort: 'high',
    dashboard_url: 'https://oficina-ia.vercel.app',
    create_pr: true,
  };
  await writeFile(p, JSON.stringify(example, null, 2) + '\n');
  console.log(`plantilla escrita en ${p}; edítala y luego: oficina-executor login && oficina-executor register && oficina-executor start`);
}

const cmd = process.argv[2];
const run: Record<string, () => Promise<void>> = {
  init: initConfig,
  login,
  register,
  status,
  start: () => startDaemon({ version: VERSION }),
};
if (!cmd || !run[cmd]) {
  console.log(`oficina-executor ${VERSION}\nuso: oficina-executor <init|login|register|start|status>`);
  process.exit(cmd ? 64 : 0);
}
run[cmd]!().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
