import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Queue } from './queue.js';
import type { ExecutorChecks, ExecutorConfig, MissionRow, MissionResult, MissionStatus, OfficeToolsBackend, Provider, RepoRow, ReviewOutcome, RunEvent, RunHandle, RunInput, RunSpec } from './types.js';
export type { ExecutorChecks, ReviewOutcome };
import { prepareWorkspace, writeMissionJson, headSha, pushBranch, commitsSince, graphifyUpdateIfStale, git } from './workspace.js';
import { readEvidenceDir, verifyResult, effectiveOutcome } from './evidence.js';
import { classifyApiError, nextStatusAfterFailure, shouldResumeSession } from './state.js';
import { createPrIfMissing } from './publish.js';
import { captureCommand, describeFailures, runIndependentChecks } from './verify.js';
import { describeReview, runReview } from './review.js';
import { failedLogs, waitForCi } from './ci.js';

export interface RunnerContext {
  config: ExecutorConfig;
  queue: Queue;
  executorId: string;
  provider: Provider;
  log: (msg: string) => void;
}

interface SessionOutcome {
  kind: 'report' | 'deferred' | 'quota' | 'auth' | 'error' | 'empty';
  result: MissionResult | null;
  sessionId: string | null;
  costUsd: number;
  reason: string;
}

/** Prompt inicial de la misión (la sesión principal es el tech lead). */
export function buildInitialPrompt(mission: MissionRow, repo: RepoRow, resumedBranch: boolean): string {
  const parts: string[] = [];
  if (mission.kind === 'inventory') parts.push('/oficina:inventory');
  else if (mission.kind === 'triage') parts.push('/oficina:triage');
  else if (mission.kind === 'epic') parts.push(`/oficina:spec "${mission.title.replace(/"/g, "'")}"`);
  else parts.push(`/oficina:mission "${mission.title.replace(/"/g, "'")}"`);
  parts.push('');
  parts.push(`Misión ${mission.id} en el repo ${repo.slug}${mission.subdir ? ` (proyecto ${mission.subdir}; trabaja desde esta carpeta)` : ''}.`);
  parts.push(`Objetivo: ${mission.goal}`);
  if (mission.acceptance?.length) parts.push(`Criterio de aceptación propuesto por el humano:\n${mission.acceptance.map(a => `- ${a}`).join('\n')}`);
  if (mission.decisions?.length) parts.push(`Decisiones ya tomadas:\n${mission.decisions.map(d => `- ${d.text}`).join('\n')}`);
  if (mission.parent_mission_id) parts.push(`Esta es una sub-misión de ${mission.parent_mission_id}: su rama base es la rama de la misión padre; respeta los contratos acordados en la spec (ver mission_get).`);
  if (mission.require_plan_approval) parts.push('Esta misión exige aprobación humana del plan: registra el plan con la herramienta oficina.plan_set y pregunta con AskUserQuestion "¿Apruebas el plan?" antes de modificar código.');
  if (resumedBranch) parts.push('La rama de misión ya existe con trabajo previo: lee .oficina/notes.md, .oficina/report.md si existe y `git log`, y continúa desde ahí sin rehacer lo hecho.');
  parts.push('Tienes las herramientas de la oficina (mcp__oficina__*): mission_get, plan_set, acceptance_set, decision_record, learning_record, child_mission_create, review_request, attention. Al terminar, el informe final debe cumplir el esquema de salida estructurada (status, tests con evidence_id reales, etc.).');
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
  let totalCost = 0;
  let cancelledByHuman = false;
  const pendingUser: string[] = [];

  // Cancelación/pausa desde el dashboard y mensajes del humano en vivo (M3)
  const unsubMission = queue.onMissionChange(mission.id, (row) => {
    if (row.status === 'cancelled' || row.status === 'paused') {
      cancelledByHuman = true;
      log(`[${mission.id}] ${row.status} desde el dashboard → interrumpiendo`);
      void handleRef.current?.interrupt();
      handleRef.current?.abort();
    }
  });
  const unsubMessages = queue.onUserMessage(mission.id, (content) => {
    if (handleRef.current) { handleRef.current.send(`Mensaje del humano (dashboard): ${content}`); void queue.event(mission.id, 'user_message_injected', null, { preview: content.slice(0, 200) }); }
    else pendingUser.push(content);
  });

  try {
    mission = await queue.transition(mission.id, 'preparing', null, {});
    const ws = await prepareWorkspace(local.path, config.worktrees_root, repo, mission);
    await writeMissionJson(ws.worktree, mission, repo, ws, config.dashboard_url);
    const sub = (mission.subdir ?? '').replace(/^\/+|\/+$/g, '');
    if (sub.includes('..')) throw new Error(`subdir inválido: ${mission.subdir}`);
    const cwd = sub ? join(ws.worktree, sub) : ws.worktree;
    const subproject = sub ? repo.subprojects?.find(s => s.subdir.replace(/^\/+|\/+$/g, '') === sub) : undefined;
    const commands: Record<string, string> = { ...(repo.commands ?? {}), ...(subproject?.commands ?? {}) };
    const evidenceDir = join(ws.worktree, '.oficina', 'evidence');
    const gf = await graphifyUpdateIfStale(ws.worktree, subproject ? subproject.graphify !== false : repo.graphify_enabled, cwd);
    await queue.event(mission.id, 'workspace', null, { worktree: ws.worktree, cwd, branch: ws.branch, base_sha: ws.baseSha, resumed_branch: ws.resumedBranch, graphify: gf });

    // M2: setup reproducible antes de la sesión (con evidencia)
    if (commands.setup) {
      const setup = await captureCommand(commands.setup, { cwd, evidenceDir, label: 'setup', timeoutMs: 20 * 60 * 1000 });
      await queue.event(mission.id, 'setup', null, { evidence_id: setup.evidence_id, exit_code: setup.exit_code, duration_ms: setup.duration_ms });
      if (setup.exit_code !== 0) {
        await queue.transition(mission.id, 'blocked', `el setup del repo falló (exit ${setup.exit_code}, evidencia ${setup.evidence_id}): ${setup.tail.slice(-400)}`);
        return;
      }
    }

    const previousStatus = await queue.lastRequeueFrom(mission.id);
    const sameExecutor = claimed.preferred_executor_id === ctx.executorId;
    const resume = shouldResumeSession(previousStatus, sameExecutor, sessionId);
    const sinceIso = resume ? await queue.lastEventTs(mission.id, 'result') : null;
    const userMessages = resume ? await queue.userMessagesSince(mission.id, sinceIso) : [];
    const firstInput: RunInput = resume && sessionId
      ? { kind: 'resume', sessionId, text: buildResumePrompt(mission, previousStatus, userMessages) }
      : { kind: 'prompt', text: buildInitialPrompt(mission, repo, ws.resumedBranch) };

    const schema = JSON.parse(await readFile(join(config.office_kit_path, 'schemas', 'mission-result.schema.json'), 'utf8')) as Record<string, unknown>;
    const stripFrontmatter = (s: string) => s.replace(/^---[\s\S]*?---\s*/m, '');
    const leadPrompt = stripFrontmatter(await readFile(join(config.office_kit_path, 'agents', 'tech-lead.md'), 'utf8'));
    const reviewerPrompt = stripFrontmatter(await readFile(join(config.office_kit_path, 'agents', 'revisor.md'), 'utf8'));

    const backend = officeBackend(ctx, () => mission, repo, ws.branch);
    const spec: RunSpec = {
      mission, repo, worktree: ws.worktree, cwd, officeKitPath: config.office_kit_path,
      model: mission.model ?? config.models.lead, fallbackModel: config.models.fallback, effort: config.effort,
      maxBudgetUsd: mission.max_budget_usd ?? config.max_budget_usd_default,
      maxTurns: mission.max_turns ?? config.max_turns_default,
      env: {
        OFICINA_ROOT: ws.worktree,
        OFICINA_EVIDENCE_DIR: evidenceDir,
        OFICINA_MISSION_ID: mission.id,
        CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(config.max_concurrent_subagents),
        CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: String(config.max_subagent_depth),
      },
      resultSchema: schema,
      leadSystemPrompt: leadPrompt,
      answerWaitMs: config.answer_wait_ms,
      tools: backend,
    };

    mission = await queue.transition(mission.id, 'running', null, { branch: ws.branch, base_sha: ws.baseSha, model: spec.model });
    await queue.message(mission.id, 'system', firstInput.kind === 'resume' ? `Sesión reanudada (${sessionId})` : 'Sesión iniciada');

    const beat = setInterval(() => {
      void queue.heartbeat(ctx.executorId, mission.id).catch(e => log(`heartbeat: ${e}`));
      void pushBranch(ws.worktree, ws.branch).then(async (pushed) => {
        if (pushed) await queue.patchMission(mission.id, { head_sha: await headSha(ws.worktree) }).catch(() => {});
      }).catch(() => {});
    }, config.heartbeat_ms);

    const bridge = queue.questionBridge(mission.id, () => sessionId);
    const persistEvent = makeEventPersister(ctx, mission.id, (sid) => { sessionId = sid; }, spec, (c) => { totalCost += c; });

    const runSession = async (input: RunInput): Promise<SessionOutcome> => {
      let outcome: SessionOutcome = { kind: 'empty', result: null, sessionId, costUsd: 0, reason: 'la sesión terminó sin resultado' };
      let quotaHit: string | null = null;
      for await (const ev of ctx.provider.run(spec, input, bridge, h => { handleRef.current = h; for (const m of pendingUser.splice(0)) h.send(`Mensaje del humano (dashboard): ${m}`); })) {
        await persistEvent(ev);
        if (ev.type === 'api_retry') {
          const kind = classifyApiError(ev.error);
          if (kind === 'quota' && ev.attempt >= 3) { quotaHit = ev.error; await handleRef.current?.interrupt(); handleRef.current?.finish(); }
          if (kind === 'auth') { quotaHit = `auth:${ev.error}`; handleRef.current?.abort(); }
        }
        if (ev.type === 'result') {
          outcome.costUsd += ev.costUsd;
          sessionId = ev.sessionId || sessionId;
          if (ev.deferred?.name === 'AskUserQuestion') outcome = { ...outcome, kind: 'deferred', reason: 'pregunta diferida; se reanuda al responder' };
          else if (quotaHit) outcome = { ...outcome, kind: quotaHit.startsWith('auth:') ? 'auth' : 'quota', reason: quotaHit };
          else if (ev.isError || ev.subtype !== 'success') outcome = { ...outcome, kind: 'error', reason: `${ev.subtype}: ${ev.text.slice(0, 300)}` };
          else if (ev.structured) outcome = { ...outcome, kind: 'report', result: ev.structured, reason: `informe ${ev.structured.status}` };
          else outcome = { ...outcome, kind: 'empty', reason: 'turno sin informe estructurado' };
          outcome.sessionId = sessionId;
          // M3: si no hay mensajes humanos pendientes, cerramos la entrada; si los hay, el provider ya los encoló y habrá otro turno.
          handleRef.current?.finish();
        }
        if (ev.type === 'error') outcome = { ...outcome, kind: 'error', reason: `error del proveedor: ${ev.message.slice(0, 300)}` };
      }
      handleRef.current = null;
      return outcome;
    };

    let decision: Decision | null = null;
    let executorChecks: ExecutorChecks | null = null;
    let review: ReviewOutcome | null = null;

    try {
      let outcome = await runSession(firstInput);

      if (outcome.kind === 'report' && !cancelledByHuman) {
        // M7: verificación independiente con rondas de corrección
        for (let round = 1; round <= config.verify_fix_rounds + 1; round++) {
          executorChecks = await runIndependentChecks(cwd, evidenceDir, commands, round);
          await queue.patchMission(mission.id, { executor_checks: executorChecks });
          await queue.event(mission.id, 'executor_checks', null, { ok: executorChecks.ok, round, checks: executorChecks.checks.map(c => ({ name: c.name, exit: c.exit_code, ev: c.evidence_id })), skipped: executorChecks.skipped_reason ?? null });
          if (executorChecks.ok || round > config.verify_fix_rounds || !sessionId) break;
          await queue.message(mission.id, 'system', `Verificación independiente falló (ronda ${round}); el tech lead corrige.`);
          outcome = await runSession({ kind: 'resume', sessionId, text: `La verificación independiente del ejecutor falló. Corrige la causa real (no debilites pruebas), vuelve a correr con oficina-run y termina con el informe estructurado.\n\n${describeFailures(executorChecks)}` });
          if (outcome.kind !== 'report') break;
        }
      }

      if (outcome.kind === 'report' && !cancelledByHuman) {
        // M9: revisión independiente automática
        const current = await queue.getMission(mission.id);
        const risk = outcome.result?.risk ?? readMissionField(ws.worktree, 'risk');
        const level = readMissionField(ws.worktree, 'level');
        const needsReview = current.require_review || risk === 'medium' || risk === 'high' || level === 'N3';
        if (needsReview && (await commitsSince(ws.worktree, ws.baseSha)).length > 0) {
          for (let round = 1; round <= config.review_fix_rounds + 1; round++) {
            await queue.message(mission.id, 'system', `Revisión independiente (ronda ${round})`);
            const reviewSpec: RunSpec = { ...spec, model: config.models_reviewer };
            review = await runReview(ctx.provider, reviewSpec, current, repo, ws.baseSha, commands, reviewerPrompt, bridge, round, async (e) => { if (e.type === 'result') totalCost += e.costUsd; if (e.type === 'text' && !e.parentToolUseId) await queue.event(mission.id, 'review_text', 'revisor', { text: e.text.slice(0, 2000) }); });
            await queue.patchMission(mission.id, { review });
            await queue.event(mission.id, 'review', 'revisor', { verdict: review.verdict, blocking: review.blocking, high: review.high, round });
            const r: ReviewOutcome = review;
            const mustFix = r.verdict === 'cambios_requeridos' && (r.blocking > 0 || r.high > 0);
            if (!mustFix || round > config.review_fix_rounds || !sessionId) break;
            const reviewMd = await readFile(join(ws.worktree, '.oficina', 'review.md'), 'utf8').catch(() => r.summary);
            outcome = await runSession({ kind: 'resume', sessionId, text: describeReview(r, reviewMd) });
            if (outcome.kind !== 'report') break;
          }
        }
      }

      decision = await decide(outcome, mission.attempt, ws.worktree, evidenceDir);
      if (decision.status === 'review' && executorChecks && !executorChecks.ok) {
        decision.reason += ` · verificación del ejecutor en rojo (${executorChecks.checks.filter(c => c.exit_code !== 0).map(c => c.name).join(', ')})`;
        decision.patch.result_verified = false;
      }
      if (decision.status === 'review' && review && review.verdict === 'cambios_requeridos' && review.blocking > 0) {
        decision.reason += ` · el revisor mantiene ${review.blocking} hallazgo(s) bloqueante(s)`;
      }
    } finally {
      clearInterval(beat);
    }

    // Publicación: push, evidencia, PR, CI
    await pushBranch(ws.worktree, ws.branch).catch(e => log(`push: ${e}`));
    const head = await headSha(ws.worktree).catch(() => null);
    const uploaded = await queue.uploadEvidence(mission.id, evidenceDir);
    await queue.event(mission.id, 'evidence_uploaded', null, { files: uploaded });

    const current = await queue.getMission(mission.id);
    if (current.status === 'cancelled') return;
    if (current.status === 'paused') { await queue.event(mission.id, 'status', null, { note: 'pausada por el humano; sesión conservada' }); return; }

    const final = decision ?? { status: 'failed' as MissionStatus, reason: 'la sesión terminó sin resultado', patch: {}, result: null };
    const patch: Record<string, unknown> = { ...final.patch, head_sha: head, session_id: sessionId, cost_usd: String(totalCost) };
    let prUrl: string | null = current.pr_url;
    if (final.status === 'review' && config.create_pr) {
      const commits = await commitsSince(ws.worktree, ws.baseSha);
      if (commits.length) prUrl = await createPrIfMissing(queue, ws.worktree, repo, { ...mission, base_branch: mission.base_branch }, ws.branch, final.result, mission.base_branch ?? repo.default_branch);
      if (prUrl) patch.pr_url = prUrl;
    }
    await queue.transition(mission.id, final.status, final.reason, patch);
    if (final.status === 'paused_quota') await queue.setExecutor(ctx.executorId, { status: 'quota_exhausted' });
    if (final.status === 'waiting_answer' || final.status === 'paused_quota') await queue.event(mission.id, 'status', null, { note: `sesión ${sessionId} conservada en ${config.hostname}` });
    await queue.message(mission.id, 'system', `Fin de ejecución: ${final.status} — ${final.reason}${prUrl ? ` · PR ${prUrl}` : ''}`);

    // M6: CI del PR con una ronda de corrección
    if (final.status === 'review' && prUrl && config.ci_wait_ms > 0) {
      for (let round = 0; round <= config.ci_fix_rounds; round++) {
        const ci = await waitForCi(ws.worktree, prUrl, config.ci_wait_ms, round, 120_000, log);
        await queue.patchMission(mission.id, { ci });
        await queue.event(mission.id, 'ci', null, { state: ci.state, round, checks: ci.checks.slice(0, 20) });
        if (ci.state !== 'failure' || round >= config.ci_fix_rounds || !sessionId) break;
        const logs = await failedLogs(ws.worktree, prUrl);
        const requeued = await queue.getMission(mission.id);
        if (requeued.status !== 'review') break; // el humano movió la misión; no interferir
        await queue.message(mission.id, 'system', `CI en rojo; el tech lead corrige (ronda ${round + 1}).`);
        const fixOutcome = await runSession({ kind: 'resume', sessionId, text: `El CI del PR ${prUrl} falló. Corrige la causa real, vuelve a correr las pruebas afectadas con oficina-run, commitea y termina con el informe estructurado.\n\n${logs}` });
        await pushBranch(ws.worktree, ws.branch).catch(e => log(`push: ${e}`));
        await queue.patchMission(mission.id, { head_sha: await headSha(ws.worktree).catch(() => null), cost_usd: String(totalCost), ...(fixOutcome.result ? { result: fixOutcome.result } : {}) });
        await queue.uploadEvidence(mission.id, evidenceDir);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[${mission.id}] error: ${msg}`);
    const n = nextStatusAfterFailure(mission.attempt);
    await queue.transition(mission.id, n.status, `${msg.slice(0, 400)} · ${n.reason}`, { session_id: sessionId }).catch(e => log(`transition tras error: ${e}`));
  } finally {
    unsubMission();
    unsubMessages();
  }
}

type Decision = { status: MissionStatus; reason: string; patch: Record<string, unknown>; result: MissionResult | null };

async function decide(outcome: SessionOutcome, attempt: number, worktree: string, evidenceDir: string): Promise<Decision> {
  switch (outcome.kind) {
    case 'deferred': return { status: 'waiting_answer', reason: outcome.reason, patch: {}, result: null };
    case 'quota': return { status: 'paused_quota', reason: `cuota agotada (${outcome.reason})`, patch: {}, result: null };
    case 'auth': return { status: 'failed', reason: `autenticación del proveedor: ${outcome.reason}`, patch: {}, result: null };
    case 'error': { const n = nextStatusAfterFailure(attempt); return { status: n.status, reason: `${outcome.reason} · ${n.reason}`, patch: {}, result: null }; }
    case 'empty': return { status: 'review', reason: 'la sesión terminó sin informe estructurado; revisar manualmente', patch: { result_verified: false }, result: null };
    case 'report': {
      const result = outcome.result!;
      const { records, corrupt } = await readEvidenceDir(evidenceDir);
      const verification = verifyResult(result, records);
      const eff = effectiveOutcome(result, verification);
      return {
        status: eff.status,
        reason: eff.reason + (corrupt.length ? ` · evidencia corrupta: ${corrupt.join(',')}` : ''),
        patch: { result, result_verified: eff.verified, unverified_tests: verification.unverified, level: readMissionField(worktree, 'level'), risk: readMissionField(worktree, 'risk') },
        result,
      };
    }
  }
}

function makeEventPersister(ctx: RunnerContext, missionId: string, setSession: (s: string) => void, spec: RunSpec, addCost: (c: number) => void) {
  const { queue, config, log } = ctx;
  return async (ev: RunEvent): Promise<void> => {
    switch (ev.type) {
      case 'init': {
        setSession(ev.sessionId);
        if (!ev.plugins.includes('oficina')) throw new Error(`el plugin 'oficina' no se cargó (plugins: ${ev.plugins.join(',') || 'ninguno'}; errores: ${JSON.stringify(ev.pluginErrors)})`);
        if (config.billing_mode !== 'unknown' && ev.billing !== config.billing_mode) log(`AVISO: billing declarado=${config.billing_mode} pero el SDK reporta=${ev.billing}`);
        await queue.setExecutor(ctx.executorId, { billing: ev.billing });
        await queue.patchMission(missionId, { session_id: ev.sessionId, model: ev.model, billing: ev.billing }).catch(() => {});
        await queue.event(missionId, 'init', 'tech-lead', { session_id: ev.sessionId, model: ev.model, plugins: ev.plugins, billing: ev.billing });
        break;
      }
      case 'account': await queue.setExecutor(ctx.executorId, { billing_detail: JSON.stringify(ev.raw).slice(0, 500) }); break;
      case 'text': if (!ev.parentToolUseId) await queue.message(missionId, 'lead', ev.text); else await queue.event(missionId, 'text', ev.agent, { text: ev.text.slice(0, 2000), parent: ev.parentToolUseId }); break;
      case 'tool_use': await queue.event(missionId, 'tool_use', ev.agent, { tool: ev.tool, input: summarizeInput(ev.tool, ev.input), id: ev.toolUseId, parent: ev.parentToolUseId }); break;
      case 'tool_result': if (ev.isError) await queue.event(missionId, 'tool_result', null, { id: ev.toolUseId, error: true, preview: ev.preview }); break;
      case 'subagent_start': await queue.event(missionId, 'subagent_start', ev.agentType, { agent_id: ev.agentId }); break;
      case 'subagent_stop': await queue.event(missionId, 'subagent_stop', ev.agentType, { agent_id: ev.agentId, last: ev.lastMessage?.slice(0, 1500) ?? null }); break;
      case 'question_open': await queue.event(missionId, 'question', 'tech-lead', { question_id: ev.questionId }); await queue.message(missionId, 'system', `Pregunta abierta (${ev.questionId}); esperando respuesta hasta ${Math.round(config.answer_wait_ms / 60000)} min`); break;
      case 'question_answered': await queue.event(missionId, 'answer', null, { question_id: ev.questionId }); break;
      case 'question_deferred': await queue.event(missionId, 'question_deferred', null, { question_id: ev.questionId }); break;
      case 'api_retry': await queue.event(missionId, 'api_retry', null, { error: ev.error, attempt: ev.attempt, retry_delay_ms: ev.retryDelayMs, status: ev.status, kind: classifyApiError(ev.error) }); break;
      case 'result': {
        addCost(ev.costUsd);
        await queue.recordUsage({ executor_id: ctx.executorId, mission_id: missionId, session_id: ev.sessionId, provider: 'claude', billing: config.billing_mode, model: spec.model, cost_usd: ev.costUsd, num_turns: ev.numTurns, ...tokensOf(ev.usage) });
        await queue.event(missionId, 'result', 'tech-lead', { subtype: ev.subtype, is_error: ev.isError, cost_usd: ev.costUsd, num_turns: ev.numTurns, deferred: ev.deferred?.name ?? null, has_structured: !!ev.structured });
        break;
      }
      case 'error': await queue.event(missionId, 'error', null, { message: ev.message.slice(0, 500) }); break;
    }
  };
}

/** M5: backend de las herramientas de la oficina para esta misión. */
function officeBackend(ctx: RunnerContext, mission: () => MissionRow, repo: RepoRow, branch: string): OfficeToolsBackend {
  const { queue } = ctx;
  return {
    async missionGet() {
      const m = await queue.getMission(mission().id);
      const children = await queue.childMissions(m.id);
      return { id: m.id, title: m.title, goal: m.goal, status: m.status, acceptance: m.acceptance, decisions: m.decisions, plan: m.plan, level: m.level, risk: m.risk, branch: m.branch, base_branch: m.base_branch, subdir: m.subdir, parent_mission_id: m.parent_mission_id, spec_path: m.spec_path, children: children.map(c => ({ id: c.id, title: c.title, status: c.status, depends_on: c.depends_on })) };
    },
    async planSet(plan, patch) {
      await queue.patchMission(mission().id, { plan, ...(patch.acceptance ? { acceptance: patch.acceptance } : {}), ...(patch.level ? { level: patch.level } : {}), ...(patch.risk ? { risk: patch.risk } : {}) });
      await queue.event(mission().id, 'plan', 'tech-lead', { chars: plan.length, level: patch.level ?? null, risk: patch.risk ?? null });
      await queue.message(mission().id, 'lead', `Plan registrado:\n\n${plan.slice(0, 3000)}`);
    },
    async acceptanceSet(acceptance) { await queue.patchMission(mission().id, { acceptance }); await queue.event(mission().id, 'acceptance', 'tech-lead', { acceptance }); },
    async decisionRecord(d) {
      const id = await queue.insertDecision({ mission_id: mission().id, repo_id: repo.id, scope: d.scope, text: d.text, rationale: d.rationale, adr_path: d.adr_path ?? null, decided_by: 'tech-lead' });
      const m = await queue.getMission(mission().id);
      await queue.patchMission(m.id, { decisions: [...(m.decisions ?? []), { text: d.text, by: 'lead', at: new Date().toISOString() }] });
      await queue.event(m.id, 'decision', 'tech-lead', { id, scope: d.scope, text: d.text.slice(0, 300) });
      return id;
    },
    async learningRecord(l) { const id = await queue.insertLearning({ mission_id: mission().id, repo_id: repo.id, scope: l.scope, area: l.area ?? null, text: l.text, evidence: l.evidence, recorded_by: 'tech-lead' }); await queue.event(mission().id, 'learning', 'tech-lead', { id, text: l.text.slice(0, 300) }); return id; },
    async childMissionCreate(c) {
      const parent = await queue.getMission(mission().id);
      const row = await queue.insertMission({
        repo_id: repo.id, parent_mission_id: parent.id, kind: 'feature', title: c.title, goal: c.goal, acceptance: c.acceptance ?? [],
        subdir: c.subdir ?? parent.subdir, required_platform: c.required_platform ?? null, depends_on: c.depends_on ?? [],
        priority: c.priority ?? parent.priority, base_branch: branch, status: parent.auto_queue_children ? 'queued' : 'draft', created_by: `tech-lead:${parent.id}`,
        require_review: parent.require_review, spec_path: parent.spec_path,
      });
      await queue.event(parent.id, 'child_created', 'tech-lead', { id: row.id, title: c.title, status: row.status, depends_on: c.depends_on ?? [] });
      return { id: row.id, status: row.status };
    },
    async reviewRequest(reason) { await queue.patchMission(mission().id, { require_review: true }); await queue.event(mission().id, 'review_requested', 'tech-lead', { reason }); },
    async attention(text) { await queue.message(mission().id, 'lead', `⚠ Atención: ${text}`); await queue.event(mission().id, 'attention', 'tech-lead', { text: text.slice(0, 500) }); },
  };
}

export function summarizeInput(tool: string, input: unknown): unknown {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  switch (tool) {
    case 'Bash': return { command: String(r.command ?? '').slice(0, 300), description: r.description ?? null };
    case 'Edit': case 'Write': case 'Read': return { file_path: r.file_path ?? null };
    case 'Agent': return { subagent_type: r.subagent_type ?? null, description: r.description ?? null };
    case 'Skill': return { skill: r.skill ?? null };
    case 'AskUserQuestion': return { questions: Array.isArray(r.questions) ? (r.questions as Array<{ question?: string }>).map(q => q.question) : null };
    default: return tool.startsWith('mcp__oficina__') ? { args: JSON.stringify(r).slice(0, 300) } : {};
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

export { git };
