import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, hostname as osHostname } from 'node:os';
import { Queue, type QueueAuth } from './queue.js';
import { runMission } from './runner.js';
import { ClaudeProvider } from './providers/claude.js';
import type { ExecutorConfig, MissionRow, Provider } from './types.js';

export const OFICINA_HOME = process.env.OFICINA_HOME ?? join(homedir(), '.oficina');

export async function loadConfig(): Promise<ExecutorConfig> {
  const raw = JSON.parse(await readFile(join(OFICINA_HOME, 'config.json'), 'utf8')) as Partial<ExecutorConfig>;
  const cfg: ExecutorConfig = {
    supabase_url: raw.supabase_url ?? process.env.OFICINA_SUPABASE_URL ?? '',
    supabase_anon_key: raw.supabase_anon_key ?? process.env.OFICINA_SUPABASE_ANON_KEY ?? '',
    office_kit_path: raw.office_kit_path ?? join(OFICINA_HOME, 'office-kit'),
    worktrees_root: raw.worktrees_root ?? join(OFICINA_HOME, 'wt'),
    repos: raw.repos ?? [],
    max_parallel: raw.max_parallel ?? 1,
    billing_mode: raw.billing_mode ?? 'subscription',
    answer_wait_ms: raw.answer_wait_ms ?? 15 * 60 * 1000,
    heartbeat_ms: raw.heartbeat_ms ?? 30_000,
    poll_ms: raw.poll_ms ?? 5_000,
    max_budget_usd_default: raw.max_budget_usd_default ?? 15,
    max_turns_default: raw.max_turns_default ?? 400,
    models: raw.models ?? { lead: 'opus' },
    effort: raw.effort ?? 'high',
    max_concurrent_subagents: raw.max_concurrent_subagents ?? 3,
    max_subagent_depth: raw.max_subagent_depth ?? 2,
    dashboard_url: raw.dashboard_url,
    create_pr: raw.create_pr ?? true,
    hostname: raw.hostname ?? osHostname(),
  };
  if (!cfg.supabase_url || !cfg.supabase_anon_key) throw new Error('config.json: faltan supabase_url / supabase_anon_key');
  if (!cfg.repos.length) throw new Error('config.json: declara al menos un repo {slug, path}');
  return cfg;
}

export async function loadAuth(): Promise<QueueAuth> {
  return JSON.parse(await readFile(join(OFICINA_HOME, 'credentials.json'), 'utf8')) as QueueAuth;
}

export async function startDaemon(opts: { provider?: Provider; version: string } = { version: '0.1.0' }): Promise<void> {
  const config = await loadConfig();
  const auth = await loadAuth();
  const queue = new Queue(config.supabase_url, config.supabase_anon_key, auth);
  const provider = opts.provider ?? new ClaudeProvider();
  const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

  const executorId = await queue.registerExecutor(config.hostname, { billing: config.billing_mode, max_parallel: config.max_parallel, version: opts.version, providers: [provider.name] });
  const repos = await queue.linkRepos(executorId, config.repos);
  log(`ejecutor ${executorId} (${config.hostname}) en línea · repos: ${repos.map(r => r.slug).join(', ') || 'ninguno registrado en la nube'} · facturación declarada: ${config.billing_mode}`);

  const active = new Map<string, Promise<void>>();
  let stopping = false;

  const tryClaim = async () => {
    if (stopping) return;
    while (active.size < config.max_parallel) {
      let claimed: MissionRow | null = null;
      try { claimed = await queue.claim(executorId); } catch (e) { log(`claim: ${e instanceof Error ? e.message : e}`); return; }
      if (!claimed) return;
      const m = claimed;
      log(`misión ${m.id} reclamada: ${m.title}`);
      const p = runMission({ config, queue, executorId, provider, log }, m).finally(() => { active.delete(m.id); void tryClaim(); });
      active.set(m.id, p);
    }
  };

  const unsub = queue.onQueued(() => { void tryClaim(); });
  const poll = setInterval(() => { void tryClaim(); }, config.poll_ms);
  const beat = setInterval(() => { void queue.heartbeat(executorId, null).catch(e => log(`heartbeat: ${e}`)); }, config.heartbeat_ms);
  await tryClaim();

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`${signal}: deteniendo (${active.size} misión(es) activa(s))`);
    clearInterval(poll); clearInterval(beat); unsub();
    // Las misiones en curso quedan pausadas y reencoladas con preferencia por este ejecutor (sesión conservada en disco).
    for (const id of active.keys()) {
      await queue.transition(id, 'paused', 'ejecutor detenido').catch(() => {});
      await queue.transition(id, 'queued', 'reencolada tras parada del ejecutor').catch(() => {});
    }
    await queue.setExecutor(executorId, { status: 'offline' }).catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
