import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'unknown']);

/** Redacción determinista: correos, teléfonos, documentos largos y tokens. No es perfecta; el original va a raw_private (solo humanos). */
function sanitize(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[número]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
    .slice(0, 1000);
}

function fingerprint(parts: string[]): string {
  return createHash('sha1').update(parts.map(p => p.toLowerCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim()).join('|')).digest('hex');
}

/**
 * POST /api/ingest/feedback — Authorization: Bearer INGEST_TOKEN
 * body: { repo, service?, version?, route?, category?, message, severity?, meta? }
 * Lista blanca de campos; el texto libre se sanea; se deduplica por huella (7 días) con upsert_ticket.
 */
export async function POST(request: NextRequest) {
  const token = process.env.INGEST_TOKEN;
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const repo = typeof body.repo === 'string' ? body.repo.slice(0, 64) : '';
  const message = typeof body.message === 'string' ? body.message : '';
  if (!repo || !message.trim()) return NextResponse.json({ error: 'repo y message son obligatorios' }, { status: 400 });
  const service = typeof body.service === 'string' ? body.service.slice(0, 64) : null;
  const version = typeof body.version === 'string' ? body.version.slice(0, 32) : null;
  const route = typeof body.route === 'string' ? body.route.slice(0, 200) : '';
  const category = typeof body.category === 'string' ? body.category.slice(0, 32) : '';
  const severity = typeof body.severity === 'string' && SEVERITIES.has(body.severity) ? body.severity : 'unknown';
  const symptom = sanitize(message);
  const fp = fingerprint([repo, service ?? '', route, category, symptom.slice(0, 120)]);
  const evidence = { route: route || null, category: category || null, meta: typeof body.meta === 'object' && body.meta ? body.meta : null, received_at: new Date().toISOString() };

  const sb = createServiceClient();
  const { data, error } = await sb.rpc('upsert_ticket', {
    p_source: 'feedback', p_repo_slug: repo, p_service: service, p_symptom: symptom, p_raw: message.slice(0, 5000),
    p_version: version, p_evidence: evidence, p_severity: severity, p_fingerprint: fp,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ticket_id: data?.id ?? null, count: data?.count ?? 1 });
}
