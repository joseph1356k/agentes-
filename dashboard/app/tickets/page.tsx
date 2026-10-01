import { SUPABASE_CONFIGURED } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import type { Ticket } from '@/lib/types';
import { timeAgo } from '../components/ui';

export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  let rows: Ticket[] = [];
  if (SUPABASE_CONFIGURED) {
    const sb = await createClient();
    rows = ((await sb.from('tickets_sanitized').select('*').order('severity').order('last_seen_at', { ascending: false }).limit(200)).data ?? []) as Ticket[];
  }
  return (
    <>
      <h1>Tickets de producción</h1>
      <p className="lede">Feedback, logs y alertas registrados y deduplicados en la nube sin modelo. Cada 3 horas una misión de triage los clasifica y propone misiones en borrador; nada pasa a desarrollo sin que alguien lo encole.</p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Severidad</th><th>Fuente</th><th>Síntoma</th><th>Veces</th><th>Estado</th><th>Último</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="muted">Sin tickets. La ingesta es <code>POST /api/ingest/feedback</code> con <code>Authorization: Bearer INGEST_TOKEN</code>.</td></tr>}
            {rows.map(t => (
              <tr key={t.id}>
                <td><span className={`pill ${t.severity === 'critical' ? 'bad' : t.severity === 'high' ? 'warm' : ''}`}>{t.severity}</span></td>
                <td>{t.source}{t.service ? ` · ${t.service}` : ''}</td>
                <td>{t.symptom}{t.needs_human ? <span className="pill warm" style={{ marginLeft: 6 }}>revisar</span> : null}</td>
                <td>{t.count}</td>
                <td>{t.status}</td>
                <td>{timeAgo(t.last_seen_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
