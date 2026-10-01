import { SUPABASE_CONFIGURED } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import type { ExecutorCapacity } from '@/lib/types';
import { timeAgo } from '../components/ui';

export const dynamic = 'force-dynamic';

export default async function ExecutorsPage() {
  let rows: ExecutorCapacity[] = [];
  if (SUPABASE_CONFIGURED) {
    const sb = await createClient();
    rows = ((await sb.from('executor_capacity').select('*').order('hostname')).data ?? []) as ExecutorCapacity[];
  }
  return (
    <>
      <h1>Ejecutores</h1>
      <p className="lede">Un ejecutor por computador del equipo, con su propia cuenta de Claude. Sin ejecutores en línea, las misiones esperan en la cola. La facturación la reporta el SDK al iniciar cada sesión.</p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Máquina</th><th>Dueño</th><th>Estado</th><th>Facturación</th><th>Capacidad</th><th>Último latido</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="muted">Ningún ejecutor registrado. En tu computador: <code>oficina-executor init && oficina-executor login && oficina-executor register && oficina-executor start</code>.</td></tr>}
            {rows.map(e => (
              <tr key={e.id}>
                <td className="mono">{e.hostname}</td>
                <td>{e.owner_email}</td>
                <td><span className={`pill ${e.status === 'online' || e.status === 'busy' ? 'ok' : e.status === 'quota_exhausted' ? 'warm' : ''}`}>{e.status}</span></td>
                <td>{e.billing}</td>
                <td>{e.active_missions}/{e.max_parallel} en uso · {e.free_slots} libre(s)</td>
                <td>{e.last_heartbeat ? timeAgo(e.last_heartbeat) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
