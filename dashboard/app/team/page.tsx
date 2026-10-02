import { headers } from 'next/headers';
import { SUPABASE_CONFIGURED } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { addMember, removeMember } from '../actions';
import IngestTokenCard from '../components/IngestTokenCard';
import { timeAgo } from '../components/ui';

export const dynamic = 'force-dynamic';

interface Member { email: string; display_name: string | null; role: string; created_at: string }

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  let members: Member[] = [];
  let me: string | null = null;
  let token = { configured: false, created_by: null as string | null, created_at: null as string | null };
  if (SUPABASE_CONFIGURED) {
    const sb = await createClient();
    me = (await sb.auth.getUser()).data.user?.email ?? null;
    members = ((await sb.from('team_members').select('*').order('created_at')).data ?? []) as Member[];
    const t = await sb.rpc('ingest_token_info');
    if (!t.error && Array.isArray(t.data) && t.data[0]) token = t.data[0];
  }
  const isOwner = members.some(m => m.email === me && m.role === 'owner');
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host') ?? 'oficina-ia.vercel.app'}`;
  return (
    <>
      <h1>Equipo</h1>
      <p className="lede">Quién puede entrar al dashboard y conectar ejecutores. Las cuentas solo existen para correos de esta lista: el registro está cerrado.</p>
      {sp.ok && <div className="banner ok">{sp.ok}</div>}
      {sp.error && <div className="banner bad">{sp.error}</div>}
      <div className="tablewrap">
        <table>
          <thead><tr><th>Correo</th><th>Nombre</th><th>Rol</th><th>Desde</th><th></th></tr></thead>
          <tbody>
            {members.map(m => (
              <tr key={m.email}>
                <td className="mono">{m.email}{m.email === me ? ' (tú)' : ''}</td>
                <td>{m.display_name ?? '—'}</td>
                <td><span className={`pill ${m.role === 'owner' ? 'hot' : ''}`}>{m.role}</span></td>
                <td className="small">{timeAgo(m.created_at)}</td>
                <td>{isOwner && m.email !== me && (
                  <form action={removeMember}><input type="hidden" name="email" value={m.email} /><button className="btn danger" type="submit">Quitar</button></form>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isOwner && (
        <form action={addMember} className="card" style={{ maxWidth: 640, marginTop: 16 }}>
          <h3>Dar de alta o restablecer contraseña</h3>
          <label htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" required placeholder="persona@itsmiracleai.com" />
          <label htmlFor="display_name">Nombre (opcional)</label>
          <input id="display_name" name="display_name" type="text" />
          <label htmlFor="role">Rol</label>
          <select id="role" name="role" defaultValue="developer">
            <option value="developer">developer (crea misiones, conecta ejecutores, aprueba)</option>
            <option value="owner">owner (además gestiona el equipo y el token de ingesta)</option>
            <option value="viewer">viewer</option>
          </select>
          <label htmlFor="password">Contraseña inicial (mínimo 10; vacío = no tocar la cuenta)</label>
          <input id="password" name="password" type="text" autoComplete="off" placeholder="la persona la cambia en Cuenta" />
          <div className="actions"><button className="btn primary" type="submit">Guardar miembro</button></div>
        </form>
      )}

      <div style={{ maxWidth: 760, marginTop: 16 }}>
        <IngestTokenCard configured={!!token.configured} createdBy={token.created_by} createdAt={token.created_at} isOwner={isOwner} ingestUrl={`${origin}/api/ingest/feedback`} />
      </div>
    </>
  );
}
