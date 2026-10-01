import type { MissionStatus } from './types.js';

/** Espejo de transition_mission() en SQL. La base de datos es la autoridad; esto evita llamadas inválidas. */
export const TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  draft: ['queued', 'cancelled'],
  queued: ['claimed', 'draft', 'paused', 'cancelled'],
  claimed: ['preparing', 'running', 'orphaned', 'failed', 'queued', 'cancelled'],
  preparing: ['running', 'failed', 'orphaned', 'blocked', 'cancelled'],
  running: ['waiting_answer', 'paused', 'paused_quota', 'blocked', 'review', 'failed', 'orphaned', 'cancelled'],
  waiting_answer: ['queued', 'running', 'cancelled', 'paused'],
  paused: ['queued', 'cancelled'],
  paused_quota: ['queued', 'cancelled'],
  blocked: ['queued', 'cancelled'],
  review: ['changes_requested', 'staging', 'approved', 'queued', 'cancelled'],
  changes_requested: ['queued', 'cancelled'],
  staging: ['approved', 'changes_requested', 'review', 'cancelled'],
  approved: ['released', 'review', 'cancelled'],
  released: ['verified', 'regressed'],
  verified: [],
  regressed: ['queued', 'cancelled'],
  orphaned: ['queued', 'failed', 'cancelled'],
  failed: ['queued', 'blocked', 'cancelled'],
  cancelled: [],
};

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Estados en los que un ejecutor tiene la misión "en mano". */
export const ACTIVE_STATES: MissionStatus[] = ['claimed', 'preparing', 'running'];

/** Estados desde los que se reanuda la sesión existente (misma máquina) en lugar de empezar de cero. */
export function shouldResumeSession(previous: MissionStatus | null, sameExecutor: boolean, sessionId: string | null): boolean {
  if (!sessionId || !sameExecutor) return false;
  return previous === 'waiting_answer' || previous === 'paused' || previous === 'paused_quota' || previous === 'changes_requested' || previous === 'blocked' || previous === 'failed';
}

/** Política de intentos: tras dos intentos de solución fallidos se escala, no se insiste. */
export function nextStatusAfterFailure(attempt: number): { status: MissionStatus; reason: string } {
  if (attempt >= 2) return { status: 'blocked', reason: `dos intentos fallidos (attempt=${attempt}); requiere decisión humana` };
  return { status: 'failed', reason: `intento ${attempt} fallido; reintentable` };
}

/** Mapea el error de reintento del SDK a una acción del ejecutor. */
export function classifyApiError(error: string): 'quota' | 'auth' | 'transient' | 'fatal' {
  switch (error) {
    case 'rate_limit':
    case 'billing_error':
    case 'account_on_hold':
      return 'quota';
    case 'authentication_failed':
    case 'oauth_org_not_allowed':
      return 'auth';
    case 'overloaded':
    case 'server_error':
    case 'unknown':
      return 'transient';
    default:
      return 'fatal';
  }
}
