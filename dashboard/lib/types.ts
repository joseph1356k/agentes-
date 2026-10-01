// Espejo mínimo de supabase/migrations/0001_oficina.sql para el dashboard.
export type MissionStatus =
  | 'draft' | 'queued' | 'claimed' | 'preparing' | 'running' | 'waiting_answer' | 'paused' | 'paused_quota'
  | 'blocked' | 'review' | 'changes_requested' | 'staging' | 'approved' | 'released' | 'verified' | 'regressed'
  | 'orphaned' | 'failed' | 'cancelled';

export const STATUS_LABEL: Record<MissionStatus, string> = {
  draft: 'borrador', queued: 'en cola', claimed: 'reclamada', preparing: 'preparando', running: 'en curso',
  waiting_answer: 'espera respuesta', paused: 'pausada', paused_quota: 'pausada por cuota', blocked: 'bloqueada',
  review: 'en revisión', changes_requested: 'cambios pedidos', staging: 'en staging', approved: 'aprobada',
  released: 'publicada', verified: 'verificada', regressed: 'regresión', orphaned: 'huérfana', failed: 'fallida', cancelled: 'cancelada',
};

export const BOARD_COLUMNS: Array<{ title: string; statuses: MissionStatus[] }> = [
  { title: 'Por decidir', statuses: ['draft', 'blocked', 'waiting_answer', 'paused', 'paused_quota', 'failed', 'orphaned'] },
  { title: 'En cola', statuses: ['queued', 'claimed', 'preparing'] },
  { title: 'En curso', statuses: ['running'] },
  { title: 'Revisión y entrega', statuses: ['review', 'changes_requested', 'staging', 'approved'] },
  { title: 'Cerradas', statuses: ['released', 'verified', 'regressed', 'cancelled'] },
];

export interface Repo { id: string; slug: string; name: string; default_branch: string; branch_prefix: string; subprojects: Array<{ subdir: string; name: string; platform: string | null }>; sensitive_data: boolean }

export interface Mission {
  id: string; repo_id: string; kind: string; subdir: string | null; required_platform: string | null;
  title: string; goal: string; acceptance: string[]; decisions: Array<{ text: string; by?: string }>;
  priority: number; status: MissionStatus; status_reason: string | null; level: string | null; risk: string | null;
  provider: string; model: string | null; billing: string | null; branch: string | null; base_sha: string | null; head_sha: string | null; pr_url: string | null;
  executor_id: string | null; session_id: string | null; attempt: number; cost_usd: number;
  result: MissionResult | null; result_verified: boolean | null; unverified_tests: Array<{ evidence_id: string; reason: string }>;
  approved_sha: string | null; approved_by: string | null; created_by: string; created_at: string; updated_at: string;
}

export interface MissionResult {
  status: string; summary: string;
  changes: Array<{ path: string; kind: string; why: string }>; commits: string[];
  tests: Array<{ evidence_id: string; command: string; verdict: string; notes?: string }>;
  not_tested: Array<{ what: string; why: string; manual_procedure?: string }>;
  decisions: Array<{ text: string; rationale: string; scope: string }>;
  learnings: Array<{ text: string; evidence: string }>;
  blockers: Array<{ what: string; needs: string; detail?: string }>;
  questions: string[]; next_steps: string[]; risk: string;
  delegations: Array<{ agent: string; task: string; outcome: string }>;
}

export interface Message { id: number; mission_id: string; role: 'user' | 'lead' | 'system'; content: string; author: string | null; created_at: string }
export interface Event { id: number; mission_id: string; ts: string; type: string; agent: string | null; payload: Record<string, unknown> }
export interface Question {
  id: string; mission_id: string; status: 'open' | 'answered' | 'expired' | 'cancelled';
  questions: { questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect: boolean }> };
  answers: Record<string, string> | null; response: string | null; asked_at: string; answered_at: string | null; answered_by: string | null;
}
export interface Evidence { id: number; mission_id: string; evidence_id: string; label: string | null; command: string | null; exit_code: number | null; duration_ms: number | null; storage_path: string | null }
export interface ExecutorCapacity { id: string; owner_email: string; hostname: string; status: string; billing: string; max_parallel: number; last_heartbeat: string | null; active_missions: number; free_slots: number }
export interface Ticket { id: string; source: string; repo_id: string | null; service: string | null; symptom: string; version: string | null; severity: string; count: number; status: string; needs_human: boolean; first_seen_at: string; last_seen_at: string; mission_id: string | null }
