// Proveedor Claude: Agent SDK (TypeScript). Una sesión principal por misión con el plugin `oficina` cargado.
// - Entrada por streaming (M3): el generador queda abierto; los mensajes del humano se inyectan en vivo.
// - Herramientas de la oficina (M5): servidor MCP en proceso `oficina`.
// - Preguntas: hook PreToolUse(AskUserQuestion) → registra → espera corta → allow con respuestas, o defer.
// - Reanudación: query({ resume }); el hook vuelve a disparar y encuentra la respuesta (o canUseTool la resuelve).
import { query, type HookCallback, type Options, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { BillingMode, MissionResult, Provider, QuestionBridge, RunEvent, RunHandle, RunInput, RunSpec } from '../types.js';
import { coerceResult } from '../evidence.js';
import { createOfficeServer, OFFICE_TOOL_NAMES } from '../office-tools.js';

type AnyRecord = Record<string, unknown>;
const asRecord = (v: unknown): AnyRecord => (v && typeof v === 'object' ? (v as AnyRecord) : {});

export function billingFromApiKeySource(src: unknown): BillingMode {
  if (src === 'none' || src === undefined || src === null) return 'subscription'; // sin API key → credenciales de `claude login`
  if (typeof src === 'string') return 'api_key';
  return 'unknown';
}

const LEAD_TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent', 'Skill', 'AskUserQuestion', 'TodoWrite', 'SendMessage', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'ToolSearch'];
const REVIEW_TOOLS = ['Bash', 'Read', 'Glob', 'Grep', 'Skill', 'ToolSearch'];

/** Cola con cierre: intercala eventos del stream del SDK con los emitidos por hooks, y sirve también de cola de entrada. */
export class EventQueue<T> {
  private items: T[] = [];
  private waiter: (() => void) | null = null;
  private closed = false;
  push(item: T): void { if (this.closed) return; this.items.push(item); this.waiter?.(); }
  close(): void { this.closed = true; this.waiter?.(); }
  get isClosed(): boolean { return this.closed; }
  async *drain(): AsyncGenerator<T, void, void> {
    for (;;) {
      const next = this.items.shift();
      if (next !== undefined) { yield next; continue; }
      if (this.closed) return;
      await new Promise<void>(res => { this.waiter = res; });
      this.waiter = null;
    }
  }
}

const userMessage = (text: string): SDKUserMessage => ({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' } as SDKUserMessage);

export class ClaudeProvider implements Provider {
  readonly name = 'claude' as const;

  async *run(spec: RunSpec, input: RunInput, bridge: QuestionBridge, onHandle: (h: RunHandle) => void): AsyncIterable<RunEvent> {
    const abort = new AbortController();
    const events = new EventQueue<RunEvent>();
    const inbox = new EventQueue<SDKUserMessage>();
    const emit = (e: RunEvent) => events.push(e);
    inbox.push(userMessage(input.text));

    // --- hook de preguntas (espera corta, luego defer) -----------------------------
    const onPreToolUse: HookCallback = async (hookInput, toolUseId, { signal }) => {
      const hi = asRecord(hookInput);
      if (hi.tool_name !== 'AskUserQuestion') return {};
      const toolInput = asRecord(hi.tool_input);
      const questions = toolInput.questions;
      const already = await bridge.findAnswered(toolUseId ?? null, questions);
      if (already) {
        emit({ type: 'question_answered', questionId: already.questionId });
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { questions, answers: already.answers, ...(already.response ? { response: already.response } : {}) } } };
      }
      const qid = await bridge.open(toolUseId ?? null, questions);
      emit({ type: 'question_open', questionId: qid, toolUseId: toolUseId ?? null, questions });
      const merged = AbortSignal.any([signal, abort.signal]);
      const answer = await bridge.waitAnswer(qid, spec.answerWaitMs, merged);
      if (answer) {
        emit({ type: 'question_answered', questionId: qid });
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { questions, answers: answer.answers, ...(answer.response ? { response: answer.response } : {}) } } };
      }
      emit({ type: 'question_deferred', questionId: qid });
      inbox.close(); // la consulta termina con el defer; no hay más entrada
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'defer', permissionDecisionReason: 'Pregunta registrada en el dashboard; la sesión se reanudará con la respuesta.' } };
    };

    const onSubagentStart: HookCallback = async (hookInput) => {
      const hi = asRecord(hookInput);
      emit({ type: 'subagent_start', agentId: String(hi.agent_id ?? ''), agentType: String(hi.agent_type ?? '') });
      return {};
    };
    const onSubagentStop: HookCallback = async (hookInput) => {
      const hi = asRecord(hookInput);
      emit({ type: 'subagent_stop', agentId: String(hi.agent_id ?? ''), agentType: String(hi.agent_type ?? ''), lastMessage: typeof hi.last_assistant_message === 'string' ? hi.last_assistant_message.slice(0, 4000) : null });
      return {};
    };

    const office = spec.tools && !spec.readOnly ? createOfficeServer(spec.tools) : null;
    const allowed = spec.readOnly ? REVIEW_TOOLS : [...LEAD_TOOLS, ...(office ? OFFICE_TOOL_NAMES : [])];

    const options: Options = {
      cwd: spec.cwd,
      model: spec.model,
      ...(spec.fallbackModel ? { fallbackModel: spec.fallbackModel } : {}),
      effort: spec.effort,
      permissionMode: spec.readOnly ? 'default' : 'acceptEdits',
      allowedTools: allowed,
      ...(spec.readOnly ? { disallowedTools: ['Edit', 'Write', 'NotebookEdit', 'Agent'] } : {}),
      plugins: [{ type: 'local', path: spec.officeKitPath }],
      settingSources: ['project'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: spec.systemPromptOverride ?? spec.leadSystemPrompt },
      maxBudgetUsd: spec.maxBudgetUsd,
      maxTurns: spec.maxTurns,
      env: { ...process.env, ...spec.env },
      abortController: abort,
      includePartialMessages: false,
      ...(spec.readOnly ? {} : { outputFormat: { type: 'json_schema', schema: spec.resultSchema } }),
      ...(office ? { mcpServers: { oficina: office } } : {}),
      hooks: {
        PreToolUse: [{ matcher: 'AskUserQuestion', hooks: [onPreToolUse], timeout: Math.ceil(spec.answerWaitMs / 1000) + 30 }],
        SubagentStart: [{ hooks: [onSubagentStart] }],
        SubagentStop: [{ hooks: [onSubagentStop] }],
      },
      // Segundo camino para preguntas (si el flujo de permisos llega aquí en lugar del hook) y política por defecto:
      // las guardas (hooks del plugin) deciden; lo demás se permite en modo desatendido. En revisión, nada que escriba.
      canUseTool: async (toolName, toolInput) => {
        if (toolName === 'AskUserQuestion') {
          const questions = asRecord(toolInput).questions;
          const found = await bridge.findAnswered(null, questions);
          if (found) return { behavior: 'allow', updatedInput: { questions, answers: found.answers, ...(found.response ? { response: found.response } : {}) } };
          return { behavior: 'deny', message: 'No hay respuesta todavía. Registra la pregunta en `questions` del informe, continúa con lo que no dependa de ella y termina con status "blocked".' };
        }
        if (spec.readOnly && ['Edit', 'Write', 'NotebookEdit'].includes(toolName)) return { behavior: 'deny', message: 'La revisión es de solo lectura.' };
        return { behavior: 'allow', updatedInput: toolInput };
      },
      ...(input.kind === 'resume' ? { resume: input.sessionId } : {}),
    };

    const q = query({ prompt: inbox.drain(), options });
    onHandle({
      interrupt: async () => { await q.interrupt(); },
      abort: () => { inbox.close(); abort.abort(); },
      send: (text: string) => inbox.push(userMessage(text)),
      finish: () => inbox.close(),
    });

    const pump = (async () => {
      try {
        for await (const m of q) {
          for (const e of mapMessage(m)) emit(e);
          if (m.type === 'system' && (m as unknown as AnyRecord).subtype === 'init') {
            try { emit({ type: 'account', raw: await q.accountInfo() }); } catch { /* opcional */ }
          }
        }
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        inbox.close();
        events.close();
      }
    })();

    yield* events.drain();
    await pump;
  }
}

/** Traduce un SDKMessage a eventos normalizados. */
export function mapMessage(m: SDKMessage): RunEvent[] {
  const r = m as unknown as AnyRecord;
  const out: RunEvent[] = [];
  const parent = (r.parent_tool_use_id as string | null | undefined) ?? null;
  switch (m.type) {
    case 'system': {
      if (r.subtype === 'init') {
        const plugins = Array.isArray(r.plugins) ? (r.plugins as AnyRecord[]).map(p => String(p.name)) : [];
        out.push({ type: 'init', sessionId: String(r.session_id ?? ''), model: String(r.model ?? ''), plugins, pluginErrors: Array.isArray(r.plugin_errors) ? (r.plugin_errors as unknown[]) : [], billing: billingFromApiKeySource(r.apiKeySource), raw: r });
      } else if (r.subtype === 'api_retry') {
        out.push({ type: 'api_retry', error: String(r.error ?? 'unknown'), attempt: Number(r.attempt ?? 0), retryDelayMs: Number(r.retry_delay_ms ?? 0), status: typeof r.error_status === 'number' ? r.error_status : null });
      }
      break;
    }
    case 'assistant': {
      const content = asRecord(r.message).content;
      if (Array.isArray(content)) {
        for (const block of content as AnyRecord[]) {
          if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) out.push({ type: 'text', agent: parent ? 'subagent' : 'tech-lead', text: block.text, parentToolUseId: parent });
          if (block.type === 'tool_use') out.push({ type: 'tool_use', agent: parent ? 'subagent' : 'tech-lead', tool: String(block.name), input: block.input, toolUseId: String(block.id), parentToolUseId: parent });
        }
      }
      break;
    }
    case 'user': {
      const content = asRecord(r.message).content;
      if (Array.isArray(content)) {
        for (const block of content as AnyRecord[]) {
          if (block.type === 'tool_result') {
            const c = block.content;
            const preview = typeof c === 'string' ? c : Array.isArray(c) ? (c as AnyRecord[]).map(x => (typeof x.text === 'string' ? x.text : '')).join('\n') : '';
            out.push({ type: 'tool_result', toolUseId: String(block.tool_use_id), preview: preview.slice(0, 600), parentToolUseId: parent, isError: block.is_error === true });
          }
        }
      }
      break;
    }
    case 'result': {
      const structured: MissionResult | null = coerceResult(r.structured_output);
      const deferredRaw = asRecord(r.deferred_tool_use);
      const deferred = r.deferred_tool_use ? { id: String(deferredRaw.id), name: String(deferredRaw.name), input: deferredRaw.input } : null;
      out.push({ type: 'result', subtype: String(r.subtype ?? ''), isError: r.is_error === true, costUsd: Number(r.total_cost_usd ?? 0), usage: r.usage, numTurns: Number(r.num_turns ?? 0), structured, deferred, text: typeof r.result === 'string' ? r.result : '', sessionId: String(r.session_id ?? '') });
      break;
    }
    default:
      break;
  }
  return out;
}
