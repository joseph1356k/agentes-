import Link from 'next/link';
import { SUPABASE_CONFIGURED } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import type { Learning, Repo } from '@/lib/types';
import { timeAgo } from '../components/ui';

export const dynamic = 'force-dynamic';

export default async function LearningsPage() {
  let rows: Learning[] = [];
  let repos: Record<string, string> = {};
  if (SUPABASE_CONFIGURED) {
    const sb = await createClient();
    const [l, r] = await Promise.all([
      sb.from('learnings').select('*').order('created_at', { ascending: false }).limit(300),
      sb.from('repos').select('id,slug'),
    ]);
    rows = (l.data ?? []) as Learning[];
    repos = Object.fromEntries(((r.data ?? []) as Pick<Repo, 'id' | 'slug'>[]).map(x => [x.id, x.slug]));
  }
  return (
    <>
      <h1>Aprendizajes</h1>
      <p className="lede">Lo que los agentes comprobaron con evidencia durante las misiones (convenciones reales del repo, trampas, comandos que funcionan). Se registran con <code>learning_record</code> y alimentan la memoria de los agentes y el mapa del repo; nunca contienen datos de usuarios del producto.</p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Repo</th><th>Ámbito</th><th>Aprendizaje</th><th>Evidencia</th><th>Misión</th><th>Cuándo</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="muted">Sin aprendizajes todavía. Aparecen cuando el tech lead registra uno verificado durante una misión.</td></tr>}
            {rows.map(l => (
              <tr key={l.id}>
                <td className="mono">{l.repo_id ? repos[l.repo_id] ?? l.repo_id : '—'}</td>
                <td><span className="pill">{l.scope}{l.area ? `:${l.area}` : ''}</span></td>
                <td>{l.text}</td>
                <td className="mono small">{l.evidence}</td>
                <td className="mono small">{l.mission_id ? <Link href={`/missions/${l.mission_id}`}>{l.mission_id.slice(0, 10)}</Link> : '—'}</td>
                <td className="small">{timeAgo(l.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
