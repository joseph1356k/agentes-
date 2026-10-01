import { describe, it, expect } from 'vitest';
import { canTransition, classifyApiError, nextStatusAfterFailure, shouldResumeSession, TRANSITIONS } from './state.js';
import type { MissionStatus } from './types.js';

describe('máquina de estados', () => {
  it('permite el camino feliz', () => {
    const path: MissionStatus[] = ['draft', 'queued', 'claimed', 'preparing', 'running', 'review', 'staging', 'approved', 'released', 'verified'];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!), `${path[i]} → ${path[i + 1]}`).toBe(true);
  });
  it('rechaza saltos inválidos', () => {
    expect(canTransition('running', 'released')).toBe(false);
    expect(canTransition('verified', 'queued')).toBe(false);
    expect(canTransition('cancelled', 'queued')).toBe(false);
    expect(canTransition('queued', 'running')).toBe(false);
  });
  it('preguntas, cuota y pausa vuelven a la cola', () => {
    expect(canTransition('running', 'waiting_answer')).toBe(true);
    expect(canTransition('waiting_answer', 'queued')).toBe(true);
    expect(canTransition('running', 'paused_quota')).toBe(true);
    expect(canTransition('paused_quota', 'queued')).toBe(true);
    expect(canTransition('paused', 'queued')).toBe(true);
  });
  it('aprobación invalidada vuelve a review', () => {
    expect(canTransition('approved', 'review')).toBe(true);
  });
  it('todo estado no terminal puede cancelarse salvo released/verified', () => {
    for (const s of Object.keys(TRANSITIONS) as MissionStatus[]) {
      if (['released', 'verified', 'cancelled'].includes(s)) expect(canTransition(s, 'cancelled')).toBe(false);
      else expect(canTransition(s, 'cancelled'), s).toBe(true);
    }
  });
});

describe('política de intentos y errores', () => {
  it('escala al segundo intento fallido', () => {
    expect(nextStatusAfterFailure(1).status).toBe('failed');
    expect(nextStatusAfterFailure(2).status).toBe('blocked');
  });
  it('clasifica errores del proveedor', () => {
    expect(classifyApiError('rate_limit')).toBe('quota');
    expect(classifyApiError('billing_error')).toBe('quota');
    expect(classifyApiError('authentication_failed')).toBe('auth');
    expect(classifyApiError('overloaded')).toBe('transient');
    expect(classifyApiError('model_not_found')).toBe('fatal');
  });
  it('reanuda solo en la misma máquina y con sesión', () => {
    expect(shouldResumeSession('waiting_answer', true, 's')).toBe(true);
    expect(shouldResumeSession('waiting_answer', false, 's')).toBe(false);
    expect(shouldResumeSession('waiting_answer', true, null)).toBe(false);
    expect(shouldResumeSession(null, true, 's')).toBe(false);
  });
});
