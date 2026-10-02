import { SUPABASE_CONFIGURED } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import PasswordForm from '../components/PasswordForm';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  let email: string | null = null;
  let role: string | null = null;
  if (SUPABASE_CONFIGURED) {
    const sb = await createClient();
    email = (await sb.auth.getUser()).data.user?.email ?? null;
    if (email) role = ((await sb.from('team_members').select('role').eq('email', email).maybeSingle()).data as { role: string } | null)?.role ?? null;
  }
  return (
    <>
      <h1>Cuenta</h1>
      <p className="lede">{email ? <>Has entrado como <strong>{email}</strong>{role ? ` (${role})` : ' · no figuras en el equipo: pide a un owner que te dé de alta'}.</> : 'Sin sesión.'}</p>
      <PasswordForm />
      <section className="card" style={{ maxWidth: 560, marginTop: 16 }}>
        <h3>Conectar tu computador como ejecutor</h3>
        <ol className="plain small">
          <li><code>git clone https://github.com/joseph1356k/agentes- ~/oficina && cd ~/oficina</code></li>
          <li><code>bash scripts/install-executor.sh /ruta/a/tu/repo</code> (deja la config con este proyecto ya puesto)</li>
          <li><code>oficina-executor login</code> con este mismo correo y contraseña</li>
          <li><code>oficina-executor doctor</code> y luego <code>oficina-executor start</code></li>
        </ol>
        <p className="muted small">Necesitas Claude Code con sesión iniciada (<code>claude login</code>) y <code>gh auth login</code> para que abra PRs.</p>
      </section>
    </>
  );
}
