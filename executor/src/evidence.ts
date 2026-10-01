import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EvidenceRecord, MissionResult, VerificationOutcome } from './types.js';

const EVIDENCE_ID = /^ev_\d+_[0-9a-f]+$/;

/** Lee .oficina/evidence/ev_*.json → mapa id → registro. Ignora archivos corruptos (los reporta). */
export async function readEvidenceDir(dir: string): Promise<{ records: Map<string, EvidenceRecord>; corrupt: string[] }> {
  const records = new Map<string, EvidenceRecord>();
  const corrupt: string[] = [];
  let names: string[] = [];
  try { names = await readdir(dir); } catch { return { records, corrupt }; }
  for (const name of names) {
    if (!name.endsWith('.json') || !name.startsWith('ev_')) continue;
    try {
      const raw = JSON.parse(await readFile(join(dir, name), 'utf8')) as Partial<EvidenceRecord>;
      if (typeof raw.id === 'string' && EVIDENCE_ID.test(raw.id) && typeof raw.exit_code === 'number') {
        records.set(raw.id, raw as EvidenceRecord);
      } else {
        corrupt.push(name);
      }
    } catch {
      corrupt.push(name);
    }
  }
  return { records, corrupt };
}

/**
 * Verificación cruzada: cada prueba con verdict "pass" debe tener evidencia real con exit_code 0;
 * una con verdict "fail" debe existir. Un informe "completed" con pruebas no verificadas no se acepta como completado.
 */
export function verifyResult(result: MissionResult, evidence: Map<string, EvidenceRecord>): VerificationOutcome {
  const unverified: VerificationOutcome['unverified'] = [];
  for (const t of result.tests) {
    const rec = evidence.get(t.evidence_id);
    if (!rec) { unverified.push({ evidence_id: t.evidence_id, reason: 'no existe el archivo de evidencia' }); continue; }
    if (t.verdict === 'pass' && rec.exit_code !== 0) {
      unverified.push({ evidence_id: t.evidence_id, reason: `declarado pass pero exit_code=${rec.exit_code}` });
    }
    if (t.verdict === 'fail' && rec.exit_code === 0) {
      unverified.push({ evidence_id: t.evidence_id, reason: 'declarado fail pero exit_code=0 (inconsistente)' });
    }
  }
  if (result.status === 'completed' && result.tests.length === 0) {
    unverified.push({ evidence_id: '-', reason: 'completed sin ninguna prueba registrada' });
  }
  return { verified: unverified.length === 0, unverified, checked: result.tests.length };
}

/** Estado efectivo de la misión a partir del informe y la verificación. */
export function effectiveOutcome(result: MissionResult, outcome: VerificationOutcome): { status: 'review' | 'blocked'; reason: string; verified: boolean } {
  if (result.status === 'blocked') return { status: 'blocked', reason: `bloqueada: ${result.blockers.map(b => b.what).join('; ') || result.summary}`, verified: outcome.verified };
  if (result.status === 'failed') return { status: 'blocked', reason: `fallida según el informe: ${result.summary}`, verified: outcome.verified };
  if (!outcome.verified) {
    return { status: 'review', reason: `informe ${result.status} con ${outcome.unverified.length} prueba(s) NO verificada(s)`, verified: false };
  }
  return { status: 'review', reason: result.status === 'completed' ? 'informe completed verificado' : 'informe partial verificado', verified: true };
}

/** Sanitiza el tipo de un informe recibido como salida estructurada (defensivo). */
export function coerceResult(raw: unknown): MissionResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const status = r.status;
  if (status !== 'completed' && status !== 'partial' && status !== 'blocked' && status !== 'failed') return null;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    status,
    summary: typeof r.summary === 'string' ? r.summary : '',
    changes: arr(r.changes),
    commits: arr<string>(r.commits).filter(c => typeof c === 'string'),
    tests: arr<MissionResult['tests'][number]>(r.tests).filter(t => t && typeof t.evidence_id === 'string'),
    not_tested: arr(r.not_tested),
    decisions: arr(r.decisions),
    learnings: arr(r.learnings),
    blockers: arr(r.blockers),
    questions: arr<string>(r.questions),
    next_steps: arr<string>(r.next_steps),
    risk: r.risk === 'high' || r.risk === 'medium' ? r.risk : 'low',
    delegations: arr(r.delegations),
  };
}
