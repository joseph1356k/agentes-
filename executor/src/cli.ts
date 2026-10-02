#!/usr/bin/env node
// oficina-executor: login | register | start | status
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { OFICINA_HOME, connectQueue, loadConfig, saveAuth, startDaemon } from './daemon.js';
import { doctor } from './doctor.js';

const VERSION = '0.1.0';

async function ask(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(q);
  rl.close();
  return a.trim();
}

/** Pide un dato sin mostrarlo en pantalla (contraseñas). Sin TTY (p. ej. OFICINA_PASSWORD por tubería) lee una línea normal. */
async function askHidden(q: string): Promise<string> {
  if (!process.stdin.isTTY) return ask(q);
  process.stdout.write(q);
  return new Promise((resolve) => {
    let value = '';
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData);
          process.stdout.write('\n'); resolve(value); return;
        }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); continue; }
        value += ch;
      }
    };
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', onData);
  });
}

/** oficina-executor login [--otp]: por defecto correo + contraseña (la misma del dashboard); --otp usa código por correo. */
async function login(): Promise<void> {
  const config = await loadConfig();
  const sb = createClient(config.supabase_url, config.supabase_anon_key, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = (process.env.OFICINA_EMAIL ?? await ask('Correo del equipo: ')).trim().toLowerCase();
  let session: { access_token: string; refresh_token: string } | null = null;
  if (process.argv.includes('--otp')) {
    const sent = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (sent.error) throw new Error(`no se pudo enviar el código: ${sent.error.message}`);
    const token = await ask('Código recibido por correo: ');
    const v = await sb.auth.verifyOtp({ email, token, type: 'email' });
    if (v.error || !v.data.session) throw new Error(`código no válido: ${v.error?.message ?? 'sin sesión'}`);
    session = v.data.session;
  } else {
    const password = process.env.OFICINA_PASSWORD ?? await askHidden('Contraseña (la del dashboard): ');
    const r = await sb.auth.signInWithPassword({ email, password });
    if (r.error || !r.data.session) throw new Error(r.error?.message === 'Invalid login credentials' ? 'correo o contraseña incorrectos' : `no se pudo entrar: ${r.error?.message ?? 'sin sesión'}`);
    session = r.data.session;
  }
  await saveAuth({ email, access_token: session.access_token, refresh_token: session.refresh_token });
  const member = await sb.from('team_members').select('role').eq('email', email).maybeSingle();
  console.log(`Sesión guardada en ${join(OFICINA_HOME, 'credentials.json')} (solo tu usuario puede leerla).`);
  console.log(member.data ? `Eres ${(member.data as { role: string }).role} del equipo. Siguiente: oficina-executor register` : 'AVISO: tu correo no figura en el equipo; pide a un owner que te dé de alta en /team.');
}

async function register(): Promise<void> {
  const config = await loadConfig();
  const queue = await connectQueue(config);
  const id = await queue.registerExecutor(config.hostname, { billing: config.billing_mode, max_parallel: config.max_parallel, version: VERSION, providers: ['claude'], platform: process.platform });
  const repos = await queue.linkRepos(id, config.repos);
  console.log(`ejecutor ${id} registrado · repos enlazados: ${repos.map(r => r.slug).join(', ') || 'ninguno (crea las filas en repos primero)'}`);
}

async function status(): Promise<void> {
  const queue = await connectQueue();
  const r = await queue.sb.from('executor_capacity').select('*').order('hostname');
  if (r.error) throw new Error(r.error.message);
  for (const e of r.data ?? []) console.log(`${e.hostname.padEnd(20)} ${String(e.status).padEnd(16)} ${String(e.billing).padEnd(13)} libres ${e.free_slots}/${e.max_parallel} latido ${e.last_heartbeat ?? '-'}`);
  const m = await queue.sb.from('missions').select('id,status,title,executor_id').in('status', ['queued', 'claimed', 'preparing', 'running', 'waiting_answer', 'paused_quota']).order('priority', { ascending: false });
  for (const row of m.data ?? []) console.log(`${row.id}  ${String(row.status).padEnd(15)} ${row.title}${row.executor_id ? ` @${row.executor_id}` : ''}`);
}

/** config/oficina.public.json: URL del proyecto, clave publicable y URL del dashboard (públicos por diseño; RLS protege los datos). */
async function loadPublicConfig(): Promise<{ supabase_url?: string; supabase_anon_key?: string; dashboard_url?: string }> {
  const candidates = [process.env.OFICINA_PUBLIC_CONFIG, join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'oficina.public.json')].filter(Boolean) as string[];
  for (const p of candidates) {
    try { return JSON.parse(await readFile(p, 'utf8')); } catch { /* siguiente */ }
  }
  return {};
}

async function initConfig(): Promise<void> {
  await mkdir(OFICINA_HOME, { recursive: true });
  const p = join(OFICINA_HOME, 'config.json');
  try { await readFile(p); console.log(`${p} ya existe`); return; } catch { /* crear */ }
  // Valores públicos del proyecto (config/oficina.public.json del repo) o del entorno:
  // OFICINA_SUPABASE_URL, OFICINA_SUPABASE_ANON_KEY, OFICINA_DASHBOARD_URL, OFICINA_KIT, OFICINA_REPOS ("slug=/ruta,slug2=/ruta2")
  const pub = await loadPublicConfig();
  const repos = (process.env.OFICINA_REPOS ?? (process.env.OFICINA_REPO_U ? `u=${process.env.OFICINA_REPO_U}` : ''))
    .split(',').map(s => s.trim()).filter(Boolean).map(s => { const [slug, ...rest] = s.split('='); return { slug: slug!.trim(), path: rest.join('=').trim() }; });
  const example = {
    supabase_url: process.env.OFICINA_SUPABASE_URL ?? pub.supabase_url ?? 'https://<proyecto>.supabase.co',
    supabase_anon_key: process.env.OFICINA_SUPABASE_ANON_KEY ?? pub.supabase_anon_key ?? '<clave publicable>',
    office_kit_path: process.env.OFICINA_KIT ?? join(OFICINA_HOME, 'office-kit'),
    worktrees_root: join(OFICINA_HOME, 'wt'),
    repos: repos.length ? repos : [{ slug: 'u', path: '/ruta/a/U-Windows-App' }],
    max_parallel: 1,
    billing_mode: 'subscription',
    answer_wait_ms: 900000,
    models: { lead: 'opus' },
    effort: 'high',
    dashboard_url: process.env.OFICINA_DASHBOARD_URL ?? pub.dashboard_url ?? 'https://oficina-ia.vercel.app',
    create_pr: true,
  };
  await writeFile(p, JSON.stringify(example, null, 2) + '\n');
  const pending = example.supabase_url.includes('<') || example.repos.some(r => r.path.startsWith('/ruta'));
  console.log(`config escrita en ${p}${pending ? ' — revisa los valores marcados con <...> o /ruta' : ''}.\nSiguiente: oficina-executor login && oficina-executor register && oficina-executor doctor && oficina-executor start`);
}

const cmd = process.argv[2];
const run: Record<string, () => Promise<void>> = {
  init: initConfig,
  login,
  register,
  status,
  doctor: async () => { const ok = await doctor(); if (!ok) process.exitCode = 1; },
  start: () => startDaemon({ version: VERSION }),
};
if (!cmd || !run[cmd]) {
  console.log(`oficina-executor ${VERSION}\nuso: oficina-executor <init|login [--otp]|register|doctor|start|status>`);
  process.exit(cmd ? 64 : 0);
}
run[cmd]!()
  // los comandos puntuales terminan aquí (el cliente de Supabase deja temporizadores de renovación); `start` sigue corriendo
  .then(() => { if (cmd !== 'start') process.exit(process.exitCode ?? 0); })
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
