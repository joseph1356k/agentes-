import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BillingMode, ExecutorStatus, MissionRow, MissionStatus, RepoRow, QuestionBridge } from './types.js';

export interface QueueAuth { access_token: string; refresh_token: string; email: string }

/** Cliente de la cola: todo pasa por RPCs e inserts bajo RLS con el JWT del desarrollador. */
export class Queue {
  readonly sb: SupabaseClient;
  readonly email: string;

  constructor(url: string, anonKey: string, auth: QueueAuth) {
    this.sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: true } });
    this.email = auth.email;
    void this.sb.auth.setSession({ access_token: auth.access_token, refresh_token: auth.refresh_token });
  }

  private unwrap<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data as T;
  }

  // ---- ejecutores -------------------------------------------------------------
  async registerExecutor(hostname: string, patch: { billing: BillingMode; max_parallel: number; version: string; providers: string[]; platform: string }): Promise<string> {
    const existing = await this.sb.from('executors').select('id').eq('owner_email', this.email).eq('hostname', hostname).maybeSingle();
    if (existing.error) throw new Error(`executors: ${existing.error.message}`);
    if (existing.data?.id) {
      this.unwrap(await this.sb.from('executors').update({ ...patch, status: 'online', last_heartbeat: new Date().toISOString() }).eq('id', existing.data.id), 'executors.update');
      return existing.data.id as string;
    }
    const ins = await this.sb.from('executors').insert({ owner_email: this.email, hostname, ...patch, status: 'online', last_heartbeat: new Date().toISOString() }).select('id').single();
    return this.unwrap(ins, 'executors.insert').id as string;
  }

  async linkRepos(executorId: string, repos: Array<{ slug: string; path: string }>): Promise<RepoRow[]> {
    const rows = this.unwrap(await this.sb.from('repos').select('*').in('slug', repos.map(r => r.slug)), 'repos.select') as RepoRow[];
    for (const repo of rows) {
      const local = repos.find(r => r.slug === repo.slug)!;
      this.unwrap(await this.sb.from('executor_repos').upsert({ executor_id: executorId, repo_id: repo.id, local_path: local.path }), 'executor_repos.upsert');
    }
    return rows;
  }

  async heartbeat(executorId: string, missionId: string | null, status: ExecutorStatus = 'online'): Promise<void> {
    this.unwrap(await this.sb.rpc('heartbeat', { p_executor_id: executorId, p_mission_id: missionId, p_status: status }), 'heartbeat');
  }

  async setExecutor(executorId: string, patch: Record<string, unknown>): Promise<void> {
    this.unwrap(await this.sb.from('executors').update(patch).eq('id', executorId), 'executors.update');
  }

  // ---- misiones ---------------------------------------------------------------
  async claim(executorId: string): Promise<MissionRow | null> {
    const r = await this.sb.rpc('claim_mission', { p_executor_id: executorId });
    if (r.error) throw new Error(`claim_mission: ${r.error.message}`);
    const row = r.data as MissionRow | null;
    return row && row.id ? row : null;
  }

  async transition(missionId: string, to: MissionStatus, reason: string | null = null, patch: Record<string, unknown> = {}): Promise<MissionRow> {
    return this.unwrap(await this.sb.rpc('transition_mission', { p_mission_id: missionId, p_to: to, p_reason: reason, p_patch: patch }), `transition_mission(${to})`) as MissionRow;
  }

  async childMissions(parentId: string): Promise<MissionRow[]> {
    return this.unwrap(await this.sb.from('missions').select('*').eq('parent_mission_id', parentId).order('created_at'), 'missions.children') as MissionRow[];
  }

  async insertMission(row: Record<string, unknown>): Promise<MissionRow> {
    return this.unwrap(await this.sb.from('missions').insert(row).select('*').single(), 'missions.insert') as MissionRow;
  }

  async insertDecision(row: Record<string, unknown>): Promise<string> {
    return (this.unwrap(await this.sb.from('decisions').insert(row).select('id').single(), 'decisions.insert') as { id: string }).id;
  }

  async insertLearning(row: Record<string, unknown>): Promise<string> {
    return (this.unwrap(await this.sb.from('learnings').insert(row).select('id').single(), 'learnings.insert') as { id: string }).id;
  }

  /** Mensajes nuevos del humano mientras la misión corre (M3). */
  onUserMessage(missionId: string, cb: (content: string) => void): () => void {
    const ch = this.sb.channel(`oficina-msgs-${missionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mission_messages', filter: `mission_id=eq.${missionId}` }, (p) => {
        const row = p.new as { role?: string; content?: string };
        if (row.role === 'user' && typeof row.content === 'string') cb(row.content);
      })
      .subscribe();
    return () => { void this.sb.removeChannel(ch); };
  }

  /** Actualiza columnas informativas sin cambiar de estado (session_id, model, billing, head_sha...). */
  async patchMission(missionId: string, patch: Record<string, unknown>): Promise<void> {
    this.unwrap(await this.sb.from('missions').update(patch).eq('id', missionId), 'missions.update');
  }

  /** Estado desde el que la misión volvió a la cola por última vez (waiting_answer, paused, ...), o null. */
  async lastRequeueFrom(missionId: string): Promise<MissionStatus | null> {
    const r = await this.sb.from('mission_events').select('payload').eq('mission_id', missionId).eq('type', 'status').order('ts', { ascending: false }).limit(20);
    if (r.error || !r.data) return null;
    for (const row of r.data as Array<{ payload: { from?: string; to?: string } }>) {
      if (row.payload?.to === 'queued' && row.payload.from) return row.payload.from as MissionStatus;
    }
    return null;
  }

  /** Marca de tiempo del último evento de un tipo (p.ej. 'result'), o null. */
  async lastEventTs(missionId: string, type: string): Promise<string | null> {
    const r = await this.sb.from('mission_events').select('ts').eq('mission_id', missionId).eq('type', type).order('ts', { ascending: false }).limit(1).maybeSingle();
    return r.error ? null : (r.data?.ts as string | undefined) ?? null;
  }

  async getMission(missionId: string): Promise<MissionRow> {
    return this.unwrap(await this.sb.from('missions').select('*').eq('id', missionId).single(), 'missions.select') as MissionRow;
  }

  async getRepo(repoId: string): Promise<RepoRow> {
    return this.unwrap(await this.sb.from('repos').select('*').eq('id', repoId).single(), 'repos.select') as RepoRow;
  }

  async event(missionId: string, type: string, agent: string | null, payload: unknown): Promise<void> {
    const r = await this.sb.from('mission_events').insert({ mission_id: missionId, type, agent, payload: payload ?? {} });
    if (r.error) console.error(`[queue] mission_events: ${r.error.message}`);
  }

  async message(missionId: string, role: 'user' | 'lead' | 'system', content: string, author: string | null = null): Promise<void> {
    const r = await this.sb.from('mission_messages').insert({ mission_id: missionId, role, content, author });
    if (r.error) console.error(`[queue] mission_messages: ${r.error.message}`);
  }

  /** Mensajes del humano posteriores a una marca de tiempo (p.ej. cambios pedidos en review). */
  async userMessagesSince(missionId: string, sinceIso: string | null): Promise<string[]> {
    let q = this.sb.from('mission_messages').select('content, created_at').eq('mission_id', missionId).eq('role', 'user').order('created_at');
    if (sinceIso) q = q.gt('created_at', sinceIso);
    const rows = this.unwrap(await q, 'mission_messages.select') as Array<{ content: string }>;
    return rows.map(r => r.content);
  }

  async recordUsage(row: Record<string, unknown>): Promise<void> {
    const r = await this.sb.from('usage_ledger').insert(row);
    if (r.error) console.error(`[queue] usage_ledger: ${r.error.message}`);
  }

  async recordOperation(missionId: string, kind: string, key: string, patch: Record<string, unknown>): Promise<{ existed: boolean; url?: string }> {
    const ex = await this.sb.from('operations').select('url,status').eq('idempotency_key', key).maybeSingle();
    if (ex.error) throw new Error(`operations: ${ex.error.message}`);
    if (ex.data && ex.data.status === 'done') return { existed: true, url: ex.data.url ?? undefined };
    this.unwrap(await this.sb.from('operations').upsert({ mission_id: missionId, kind, idempotency_key: key, ...patch }, { onConflict: 'idempotency_key' }), 'operations.upsert');
    return { existed: false };
  }

  // ---- evidencia ---------------------------------------------------------------
  async uploadEvidence(missionId: string, dir: string): Promise<number> {
    let names: string[] = [];
    try { names = await readdir(dir); } catch { return 0; }
    let n = 0;
    for (const name of names) {
      const buf = await readFile(join(dir, name)).catch(() => null);
      if (!buf) continue;
      const up = await this.sb.storage.from('evidence').upload(`${missionId}/${name}`, buf, { upsert: true, contentType: name.endsWith('.json') || name.endsWith('.jsonl') ? 'application/json' : 'text/plain' });
      if (up.error) { console.error(`[queue] storage ${name}: ${up.error.message}`); continue; }
      n++;
      if (name.startsWith('ev_') && name.endsWith('.json')) {
        try {
          const rec = JSON.parse(buf.toString('utf8')) as { id: string; label?: string; command?: string; exit_code?: number; duration_ms?: number };
          await this.sb.from('evidence').upsert({ mission_id: missionId, evidence_id: rec.id, label: rec.label ?? null, command: rec.command ?? null, exit_code: rec.exit_code ?? null, duration_ms: rec.duration_ms ?? null, storage_path: `${missionId}/${rec.id}.log` }, { onConflict: 'mission_id,evidence_id' });
        } catch { /* ignorar */ }
      }
    }
    return n;
  }

  // ---- preguntas ---------------------------------------------------------------
  questionBridge(missionId: string, sessionId: () => string | null): QuestionBridge {
    const sb = this.sb;
    return {
      async open(toolUseId, questions) {
        const r = await sb.from('questions').insert({ mission_id: missionId, session_id: sessionId(), tool_use_id: toolUseId, questions }).select('id').single();
        if (r.error) throw new Error(`questions.insert: ${r.error.message}`);
        return r.data.id as string;
      },
      async waitAnswer(questionId, timeoutMs, signal) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline && !signal.aborted) {
          const r = await sb.from('questions').select('status,answers,response').eq('id', questionId).single();
          if (!r.error && r.data?.status === 'answered') return { answers: (r.data.answers ?? {}) as Record<string, unknown>, response: r.data.response ?? undefined };
          if (!r.error && (r.data?.status === 'cancelled' || r.data?.status === 'expired')) return null;
          await new Promise(res => setTimeout(res, 4000));
        }
        return null;
      },
      async findAnswered(toolUseId, questions) {
        let q = sb.from('questions').select('id,answers,response,questions,tool_use_id').eq('mission_id', missionId).eq('status', 'answered').order('answered_at', { ascending: false }).limit(5);
        const r = await q;
        if (r.error || !r.data) return null;
        const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
        const hit = r.data.find(row => (toolUseId && row.tool_use_id === toolUseId) || same(row.questions, questions));
        return hit ? { questionId: hit.id as string, answers: (hit.answers ?? {}) as Record<string, unknown>, response: hit.response ?? undefined } : null;
      },
    };
  }

  /** Suscripción a misiones recién encoladas; devuelve una función para cancelar. */
  onQueued(cb: () => void): () => void {
    const ch = this.sb.channel('oficina-missions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions', filter: 'status=eq.queued' }, () => cb())
      .subscribe();
    return () => { void this.sb.removeChannel(ch); };
  }

  /** Cambios de estado de una misión en curso (pausa/cancelación desde el dashboard). */
  onMissionChange(missionId: string, cb: (row: MissionRow) => void): () => void {
    const ch = this.sb.channel(`oficina-mission-${missionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'missions', filter: `id=eq.${missionId}` }, (p) => cb(p.new as MissionRow))
      .subscribe();
    return () => { void this.sb.removeChannel(ch); };
  }
}
