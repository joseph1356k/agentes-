import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Queue } from './queue.js';
import type { ExecutorConfig, MissionRow, MissionResult, MissionStatus, Provider, RepoRow, RunHandle, RunInput, RunSpec } from './types.js';
import { prepareWorkspace, writeMissionJson, headSha, pushBranch, commitsSince, graphifyUpdateIfStale } from './workspace.js';
import { readEvidenceDir, verifyResult, effectiveOutcome } from './evidence.js';
import { classifyApiError, nextStatusAfterFailure, shouldResumeSession } from './state.js';
import { createPrIfMissing } from './publish.js';

export interface RunnerContext {
  config: ExecutorConfig;
  queue: Queue;
  executorId: string;
  provider: Provider;
  log: (msg: string) => void;
}

interface FinalDecision { status: MissionStatus; reason: string; patch: Record<string, unknown>; result: MissionResult | null }

/** Prompt inicial de la misión (la sesión principal es el tech lead). */
export function buildInitialPrompt(mission: MissionRow, repo: RepoRow, resumedBranch: boolean): string {
  const parts: string[] = [];
  if (mission.kind === 'inventory') parts.push('/oficina:inventory');
  else if (mission.kind === 'triage') parts.push('/oficina:triage');
  else parts.push(`/oficina:mission "${mission.title.replace(/"/g, "'")}"`);
  parts.push('');
  parts.push(`Misión ${mission.id} en el repo ${repo.slug}.`);
  parts.push(`Objetivo: ${mission.goal}`);
  if (mission.acceptance?.length) parts.push(`Criterio de aceptación propuesto por el humano:\n${mission.acceptance.map(a => `- ${a}`).join('\n')}`);
  if (mission.decisions?.length) parts.push(`Decisiones ya tomadas:\n${mission.decisions.map(d => `- ${d.text}`).join('\n')}`);
  if (resumedBranch) parts.push('La rama de misión ya existe con trabajo previo: lee .oficina/notes.md, .oficina/report.md si existe y `git log`, y continúa desde ahí sin rehacer lo hecho.');
  parts.push('Trabaja en este worktree. Al terminar, el informe final debe cumplir el esquema de salida estructurada (status, tests con evidence_id reales, etc.).');
  return parts.join('\n');
}

export function buildResumePrompt(mission: MissionRow, previous: MissionStatus | null, userMessages: string[]): string {
  const parts: string[] = [];
  if (previous === 'waiting_answer') parts.push('El humano respondió tus preguntas (las recibes al reintentar AskUserQuestion). Continúa la misión.');
  else if (previous === 'changes_requested') parts.push('El revisor humano pidió cambios. Atiéndelos, vuelve a correr las pruebas con oficina-run y actualiza el informe.');
  else if (previous === 'paused_quota') parts.push('La sesión se pausó por cuota. Continúa exactamente donde ibas.');
  else if (previous === 'paused') parts.push('La misión fue pausada por el humano y ahora se reanuda. Continúa donde ibas.');
  else parts.push('Reanudación de la misión. Revisa el estado del árbol (git status, git log) y continúa.');
  if (userMessages.length) parts.push(`Mensajes del humano:\n${userMessages.map(m => `- ${m}`).join('\n')}`);
  parts.push(`Misión ${mission.id}. Termina con el informe estructurado.`);
  return parts.join('\n');
}

export async function runMission(ctx: RunnerContext, claimed: MissionRow): Promise<void> {
  const { config, queue, log } = ctx;
  let mission = claimed;
  const repo = await queue.getRepo(mission.repo_id);
  const local = config.repos.find(r => r.slug === repo.slug);
  if (!local) {
    await queue.transition(mission.id, 'queued', `ejecutor ${ctx.executorId} no tiene ruta local para ${repo.slug}`);
    return;
  }
  const handleRef: { current: RunHandle | null } = { current: null };
  let sessionId: string | null = mission.session_id;
  let costUsd = 0;
  let quotaHit: string | null = null;

  // Cancelación/pausa desde el dashboard
  const unsub = queue.onMissionChange(mission.id, (row) => {
    if (row.status === 'cancelled' || row.status === 'paused') {
      log(`[${mission.id}] ${row.status} desde el dashboard → interrumpiendo`);
      void handleRef.current?.interrupt();
      handleRef.current?.abort();
    }
  });

  try {
    mission = await queue.transition(mission.id, 'preparing', null, {});
    const ws = await prepareWorkspace(local.path, config.worktrees_root, repo, mission);
    await writeMissionJson(ws.worktree, mission, repo, ws, config.dashboard_url);
    const gf = await graphifyUpdateIfStale(ws.worktree, repo.graphify_enabled);
    await queue.event(mission.id, 'workspace', null, { worktree: ws.worktree, branch: ws.branch, base_sha: ws.baseSha, resumed_branch: ws.resumedBranch, graphify: gf });

    const previousStatus = await queue.lastRequeueFrom(mission.id);
    const sameExecutor = claimed.preferred_executor_id === ctx.executorId;
    const resume = shouldResumeSession(previousStatus, sameExecutor, sessionId);
    const sinceIso = resume ? await queue.lastEventTs(mission.id, 'result') : null;
    const userMessages = resume ? await queue.userMessagesSince(mission.id, sinceIso) : [];
    const input: RunInput = resume && sessionId
      ? { kind: 'resume', sessionId, text: buildResumePrompt(mission, previousStatus, userMessages) }
      : { kind: 'prompt', text: buildInitialPrompt(mission, repo, ws.resumedBranch) };

    const schema = JSON.parse(await readFile(join(config.office_kit_path, 'schemas', 'mission-result.schema.json'), 'utf8')) as Record<string, unknown>;
    const leadPrompt = await readFile(join(config.office_kit_path, 'agents', 'tech-lead.md'), 'utf8').then(s => s.replace(/^---[\s\S]*?---\s*/m, ''));

    const spec: RunSpec = {
      mission, repo, worktree: ws.worktree, officeKitPath: config.office_kit_path,
      model: mission.model ?? config.models.lead, fallbackModel: config.models.fallback, effort: config.effort,
      maxBudgetUsd: mission.max_budget_usd ?? config.max_budget_usd_default,
      maxTurns: mission.max_turns ?? config.max_turns_default,
      env: {
        OFICINA_ROOT: ws.worktree,
        OFICINA_EVIDENCE_DIR: join(ws.worktree, '.oficina', 'evidence'),
        OFICINA_MISSION_ID: mission.id,
        CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(config.max_concurrent_subagents),
        CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: String(config.max_subagent_depth),
      },
      resultSchema: schema,
      leadSystemPrompt: leadPrompt,
      answerWaitMs: config.answer_wait_ms,
    };

    mission = await queue.transition(mission.id, 'running', null, { branch: ws.branch, base_sha: ws.baseSha, model: spec.model });
    await queue.message(mission.id, 'system', input.kind === 'resume' ? `Sesión reanudada (${sessionId})` : 'Sesión iniciada');

    // latido + push periódico (head_sha se actualiza sin cambiar de estado)
    const beat = setInterval(() => {
      void queue.heartbeat(ctx.executorId, mission.id).catch(e => log(`heartbeat: ${e}`));
      void pushBranch(ws.worktree, ws.branch).then(async (pushed) => {
        if (pushed) await queue.patchMission(mission.id, { head_sha: await headSha(ws.worktree) }).catch(() => {});
      }).catch(() => {});
    }, config.heartbeat_ms);

    let decision: FinalDecision | null = null;
    const bridge = queue.questionBridge(mission.id, () => sessionId);

    try {
      for await (const ev of ctx.provider.run(spec, input, bridge, h => { handleRef.current = h; })) {
        switch (ev.type) {
          case 'init': {
            sessionId = ev.sessionId;
            if (!ev.plugins.includes('oficina')) {
              throw new Error(`el plugin 'oficina' no se cargó (plugins: ${ev.plugins.join(',') || 'ninguno'}; errores: ${JSON.stringify(ev.pluginErrors)})`);
            }
            if (config.billing_mode !== 'unknown' && ev.billing !== config.billing_mode) {
              log(`AVISO: billing declarado=${config.billing_mode} pero el SDK reporta=${ev.billing}`);
            }
            await queue.setExecutor(ctx.executorId, { billing: ev.billing });
            await queue.patchMission(mission.id, { session_id: sessionId, model: ev.model, billing: ev.billing }).catch(() => {});
            await queue.event(mission.id, 'init', 'tech-lead', { session_id: sessionId, model: ev.model, plugins: ev.plugins, billing: ev.billing });
            break;
          }
          case 'account': await queue.setExecutor(ctx.executorId, { billing_detail: JSON.stringify(ev.raw).slice(0, 500) }); break;
          case 'text': if (!ev.parentToolUseId) await queue.message(mission.id, 'lead', ev.text); else await queue.event(mission.id, 'text', ev.agent, { text: ev.text.slice(0, 2000), parent: ev.parentToolUseId }); break;
          case 'tool_use': await queue.event(mission.id, 'tool_use', ev.agent, { tool: ev.tool, input: summarizeInput(ev.tool, ev.input), id: ev.toolUseId, parent: ev.parentToolUseId }); break;
          case 'tool_result': if (ev.isError) await queue.event(mission.id, 'tool_result', null, { id: ev.toolUseId, error: true, preview: ev.preview }); break;
          case 'subagent_start': await queue.event(mission.id, 'subagent_start', ev.agentType, { agent_id: ev.agentId }); break;
          case 'subagent_stop': await queue.event(mission.id, 'subagent_stop', ev.agentType, { agent_id: ev.agentId, last: ev.lastMessage?.slice(0, 1500) ?? null }); break;
          case 'question_open': await queue.event(mission.id, 'question', 'tech-lead', { question_id: ev.questionId }); await queue.message(mission.id, 'system', `Pregunta abierta (${ev.questionId}); esperando respuesta hasta ${Math.round(config.answer_wait_ms / 60000)} min`); break;
          case 'question_answered': await queue.event(mission.id, 'answer', null, { question_id: ev.questionId }); break;
          case 'question_deferred': await queue.event(mission.id, 'question_deferred', null, { question_id: ev.questionId }); break;
          case 'api_retry': {
            const kind = classifyApiError(ev.error);
            await queue.event(mission.id, 'api_retry', null, { error: ev.error, attempt: ev.attempt, retry_delay_ms: ev.retryDelayMs, status: ev.status, kind });
            if (kind === 'quota' && ev.attempt >= 3) { quotaHit = ev.error; await handleRef.current?.interrupt(); }
            if (kind === 'auth') { quotaHit = `auth:${ev.error}`; handleRef.current?.abort(); }
            break;
          }
          case 'result': {
            costUsd = ev.costUsd;
            sessionId = ev.sessionId || sessionId;
            await queue.recordUsage({ executor_id: ctx.executorId, mission_id: mission.id, session_id: sessionId, provider: 'claude', billing: config.billing_mode, model: spec.model, cost_usd: ev.costUsd, num_turns: ev.numTurns, ...tokensOf(ev.usage) });
            await queue.event(mission.id, 'result', 'tech-lead', { subtype: ev.subtype, is_error: ev.isError, cost_usd: ev.costUsd, num_turns: ev.numTurns, deferred: ev.deferred?.name ?? null, has_structured: !!ev.structured });
            if (ev.deferred?.name === 'AskUserQuestion') {
              decision = { status: 'waiting_answer', reason: 'pregunta diferida; se reanuda al responder', patch: {}, result: null };
            } else if (quotaHit) {
              decision = quotaHit.startsWith('auth:')
                ? { status: 'failed', reason: `autenticación del proveedor: ${quotaHit}`, patch: {}, result: null }
                : { status: 'paused_quota', reason: `cuota agotada (${quotaHit})`, patch: {}, result: null };
            } else if (ev.isError || ev.subtype !== 'success') {
              const n = nextStatusAfterFailure(mission.attempt);
              decision = { status: n.status, reason: `${ev.subtype}: ${ev.text.slice(0, 300)} · ${n.reason}`, patch: {}, result: null };
            } else if (ev.structured) {
              const { records, corrupt } = await readEvidenceDir(join(ws.worktree, '.oficina', 'evidence'));
              const outcome = verifyResult(ev.structured, records);
              const eff = effectiveOutcome(ev.structured, outcome);
              decision = {
                status: eff.status,
                reason: eff.reason + (corrupt.length ? ` · evidencia corrupta: ${corrupt.join(',')}` : ''),
                patch: { result: ev.structured, result_verified: eff.verified, unverified_tests: outcome.unverified, level: readMissionField(ws.worktree, 'level'), risk: readMissionField(ws.worktree, 'risk') },
                result: ev.structured,
              };
            } else {
              decision = { status: 'review', reason: 'la sesión terminó sin informe estructurado; revisar manualmente', patch: { result_verified: false }, result: null };
            }
            break;
          }
          case 'error': {
            const n = nextStatusAfterFailure(mission.attempt);
            decision = { status: n.status, reason: `error del proveedor: ${ev.message.slice(0, 300)} · ${n.reason}`, patch: {}, result: null };
            break;
          }
        }
      }
    } finally {
      clearInterval(beat);
    }

    // Publicación: push, evidencia, PR
    await pushBranch(ws.worktree, ws.branch).catch(e => log(`push: ${e}`));
    const head = await headSha(ws.worktree).catch(() => null);
    const uploaded = await queue.uploadEvidence(mission.id, join(ws.worktree, '.oficina', 'evidence'));
    await queue.event(mission.id, 'evidence_uploaded', null, { files: uploaded });

    // Estado final (si el dashboard canceló/pausó mientras tanto, respetarlo)
    const current = await queue.getMission(mission.id);
    if (current.status === 'cancelled') return;
    if (current.status === 'paused') { await queue.event(mission.id, 'status', null, { note: 'pausada por el humano; sesión conservada' }); return; }

    const final: FinalDecision = decision ?? { status: 'failed', reason: 'la sesión terminó sin resultado', patch: {}, result: null };
    const patch: Record<string, unknown> = { ...final.patch, head_sha: head, session_id: sessionId, cost_usd: String(costUsd) };
    let prUrl: string | null = null;
    if (final.status === 'review' && config.create_pr) {
      const commits = await commitsSince(ws.worktree, ws.baseSha);
      if (commits.length) prUrl = await createPrIfMissing(queue, ws.worktree, repo, mission, ws.branch, final.result);
      if (prUrl) patch.pr_url = prUrl;
    }
    await queue.transition(mission.id, final.status, final.reason, patch);
    if (final.status === 'paused_quota') {
      await queue.setExecutor(ctx.executorId, { status: 'quota_exhausted' });
    }
    if (final.status === 'waiting_answer' || final.status === 'paused_quota') {
      await queue.event(mission.id, 'status', null, { note: `sesión ${sessionId} conservada en ${config.hostname}` });
    }
    await queue.message(mission.id, 'system', `Fin de ejecución: ${final.status} — ${final.reason}${prUrl ? ` · PR ${prUrl}` : ''}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[${mission.id}] error: ${msg}`);
    const n = nextStatusAfterFailure(mission.attempt);
    await queue.transition(mission.id, n.status, `${msg.slice(0, 400)} · ${n.reason}`, { session_id: sessionId }).catch(e => log(`transition tras error: ${e}`));
  } finally {
    unsub();
  }
}

export function summarizeInput(tool: string, input: unknown): unknown {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  switch (tool) {
    case 'Bash': return { command: String(r.command ?? '').slice(0, 300), description: r.description ?? null };
    case 'Edit': case 'Write': case 'Read': return { file_path: r.file_path ?? null };
    case 'Agent': return { subagent_type: r.subagent_type ?? null, description: r.description ?? null };
    case 'Skill': return { skill: r.skill ?? null };
    case 'AskUserQuestion': return { questions: Array.isArray(r.questions) ? (r.questions as Array<{ question?: string }>).map(q => q.question) : null };
    default: return {};
  }
}

function tokensOf(usage: unknown): Record<string, number | null> {
  const u = (usage && typeof usage === 'object' ? usage : {}) as Record<string, unknown>;
  const n = (k: string) => (typeof u[k] === 'number' ? (u[k] as number) : null);
  return { input_tokens: n('input_tokens'), output_tokens: n('output_tokens'), cache_read_tokens: n('cache_read_input_tokens'), cache_write_tokens: n('cache_creation_input_tokens') };
}

/** El lead escribe level/risk en mission.json durante la misión; lectura tolerante. */
function readMissionField(worktree: string, field: 'level' | 'risk'): string | null {
  try {
    const j = JSON.parse(readFileSync(join(worktree, '.oficina', 'mission.json'), 'utf8')) as Record<string, unknown>;
    const v = j[field];
    return typeof v === 'string' ? v : null;
  } catch { return null; }
}
