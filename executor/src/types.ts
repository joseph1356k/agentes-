// Tipos del ejecutor. Espejo de supabase/migrations/0001_oficina.sql y de office-kit/schemas/mission-result.schema.json.

export type MissionStatus =
  | 'draft' | 'queued' | 'claimed' | 'preparing' | 'running' | 'waiting_answer' | 'paused' | 'paused_quota'
  | 'blocked' | 'review' | 'changes_requested' | 'staging' | 'approved' | 'released' | 'verified' | 'regressed'
  | 'orphaned' | 'failed' | 'cancelled';

export type MissionKind = 'feature' | 'bugfix' | 'inventory' | 'triage' | 'verify' | 'research';
export type BillingMode = 'subscription' | 'api_key' | 'unknown';
export type ExecutorStatus = 'offline' | 'online' | 'busy' | 'quota_exhausted' | 'error';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export interface RepoRow {
  id: string;
  slug: string;
  name: string;
  remote_url: string;
  default_branch: string;
  production_branch: string;
  commands: Record<string, string>;
  staging: Record<string, unknown>;
  branch_prefix: string;              // 'mission/' por defecto; 'oficina/' en repos con convención <persona>/<que-hace>
  subprojects: Array<{ subdir: string; name: string; platform: string | null; commands: Record<string, string>; graphify?: boolean }>;
  graphify_enabled: boolean;
  sensitive_data: boolean;
}

export interface MissionRow {
  id: string;
  repo_id: string;
  parent_mission_id: string | null;
  kind: MissionKind;
  subdir: string | null;              // monorepos: carpeta del proyecto donde corre la sesión
  required_platform: 'darwin' | 'linux' | 'win32' | null;
  title: string;
  goal: string;
  acceptance: string[];
  decisions: Array<{ text: string; by?: string; at?: string }>;
  priority: number;
  status: MissionStatus;
  status_reason: string | null;
  level: 'N0' | 'N1' | 'N2' | 'N3' | null;
  risk: Severity | null;
  provider: string;
  model: string | null;
  branch: string | null;
  base_sha: string | null;
  head_sha: string | null;
  pr_url: string | null;
  executor_id: string | null;
  preferred_executor_id: string | null;
  session_id: string | null;
  attempt: number;
  max_budget_usd: number | null;
  max_turns: number | null;
  cost_usd: number;
  result: MissionResult | null;
  created_by: string;
}

export interface ExecutorConfig {
  supabase_url: string;
  supabase_anon_key: string;
  office_kit_path: string;
  worktrees_root: string;             // ~/.oficina/wt
  repos: Array<{ slug: string; path: string }>;
  max_parallel: number;               // 1 al inicio
  billing_mode: BillingMode;          // declarado por el humano; se contrasta con lo que reporta el SDK
  answer_wait_ms: number;             // 15 min: espera corta antes de diferir una pregunta
  heartbeat_ms: number;               // 30 s
  poll_ms: number;                    // 5 s
  max_budget_usd_default: number;     // guarda por misión (estimación)
  max_turns_default: number;
  models: { lead: string; fallback?: string };
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  max_concurrent_subagents: number;   // 3
  max_subagent_depth: number;         // 2
  dashboard_url?: string;
  create_pr: boolean;                 // requiere gh autenticado
  hostname: string;
}

// ---- Informe final (mission-result.schema.json) ------------------------------
export interface MissionResult {
  status: 'completed' | 'partial' | 'blocked' | 'failed';
  summary: string;
  changes: Array<{ path: string; kind: 'added' | 'modified' | 'deleted' | 'renamed'; why: string }>;
  commits: string[];
  tests: Array<{ evidence_id: string; command: string; verdict: 'pass' | 'fail'; label?: string; notes?: string }>;
  not_tested: Array<{ what: string; why: string; manual_procedure?: string }>;
  decisions: Array<{ text: string; rationale: string; scope: 'mission' | 'shared'; adr_path?: string }>;
  learnings: Array<{ text: string; evidence: string; scope?: 'repo' | 'area' | 'team'; stored_in_memory?: boolean }>;
  blockers: Array<{ what: string; needs: 'user_decision' | 'access' | 'dependency' | 'other_repo' | 'quota' | 'unknown'; detail?: string }>;
  questions: string[];
  next_steps: string[];
  risk: 'low' | 'medium' | 'high';
  delegations: Array<{ agent: string; task: string; outcome: 'completed' | 'partial' | 'blocked' | 'failed'; handoff_path?: string }>;
}

// ---- Evidencia (.oficina/evidence/ev_*.json) ------------------------------------
export interface EvidenceRecord {
  id: string;
  label: string;
  command: string;
  cwd: string;
  started_at: string;
  duration_ms: number;
  exit_code: number;
  log_path: string;
  agent: string | null;
  session_id: string | null;
}

export interface VerificationOutcome {
  verified: boolean;
  unverified: Array<{ evidence_id: string; reason: string }>;
  checked: number;
}

// ---- Proveedor ---------------------------------------------------------------
export interface RunSpec {
  mission: MissionRow;
  repo: RepoRow;
  worktree: string;                   // raíz del worktree (OFICINA_ROOT)
  cwd: string;                        // carpeta donde corre la sesión (worktree o worktree/subdir)
  officeKitPath: string;
  model: string;
  fallbackModel?: string;
  effort: ExecutorConfig['effort'];
  maxBudgetUsd: number;
  maxTurns: number;
  env: Record<string, string>;
  resultSchema: Record<string, unknown>;
  leadSystemPrompt: string;
  answerWaitMs: number;
}

export type RunInput =
  | { kind: 'prompt'; text: string }
  | { kind: 'resume'; sessionId: string; text: string };

export type RunEvent =
  | { type: 'init'; sessionId: string; model: string; plugins: string[]; pluginErrors: unknown[]; billing: BillingMode; raw: unknown }
  | { type: 'account'; raw: unknown }
  | { type: 'text'; agent: string | null; text: string; parentToolUseId: string | null }
  | { type: 'tool_use'; agent: string | null; tool: string; input: unknown; toolUseId: string; parentToolUseId: string | null }
  | { type: 'tool_result'; toolUseId: string; preview: string; parentToolUseId: string | null; isError: boolean }
  | { type: 'subagent_start'; agentId: string; agentType: string }
  | { type: 'subagent_stop'; agentId: string; agentType: string; lastMessage: string | null }
  | { type: 'question_open'; questionId: string; toolUseId: string | null; questions: unknown }
  | { type: 'question_answered'; questionId: string }
  | { type: 'question_deferred'; questionId: string }
  | { type: 'api_retry'; error: string; attempt: number; retryDelayMs: number; status: number | null }
  | { type: 'result'; subtype: string; isError: boolean; costUsd: number; usage: unknown; numTurns: number;
      structured: MissionResult | null; deferred: { id: string; name: string; input: unknown } | null; text: string; sessionId: string }
  | { type: 'error'; message: string };

export interface RunHandle {
  interrupt(): Promise<void>;
  abort(): void;
}

export interface QuestionBridge {
  /** Registra la pregunta y devuelve su id. */
  open(toolUseId: string | null, questions: unknown): Promise<string>;
  /** Espera una respuesta hasta timeoutMs. Devuelve answers o null si venció. */
  waitAnswer(questionId: string, timeoutMs: number, signal: AbortSignal): Promise<{ answers: Record<string, unknown>; response?: string } | null>;
  /** Busca una respuesta ya registrada para esta misión/sesión (al reanudar). */
  findAnswered(toolUseId: string | null, questions: unknown): Promise<{ questionId: string; answers: Record<string, unknown>; response?: string } | null>;
}

export interface Provider {
  readonly name: 'claude' | 'codex';
  run(spec: RunSpec, input: RunInput, bridge: QuestionBridge, onHandle: (h: RunHandle) => void): AsyncIterable<RunEvent>;
}
