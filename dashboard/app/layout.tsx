import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { SUPABASE_CONFIGURED } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { signOut } from './actions';

export const metadata: Metadata = { title: 'Oficina IA', description: 'Misiones, agentes, evidencia y decisiones de la oficina de desarrollo con IA.' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let email: string | null = null;
  if (SUPABASE_CONFIGURED) {
    try { const sb = await createClient(); email = (await sb.auth.getUser()).data.user?.email ?? null; } catch { email = null; }
  }
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <span className="brand">Oficina IA</span>
          <nav>
            <Link href="/">Misiones</Link>
            <Link href="/missions/new">Nueva misión</Link>
            <Link href="/executors">Ejecutores</Link>
            <Link href="/tickets">Tickets</Link>
            <Link href="/learnings">Aprendizajes</Link>
            <Link href="/team">Equipo</Link>
          </nav>
          <span className="spacer" />
          {email ? (
            <form action={signOut} className="row">
              <Link className="who" href="/account">{email}</Link>
              <button className="btn" type="submit">Salir</button>
            </form>
          ) : null}
        </header>
        <main className="wrap">
          {!SUPABASE_CONFIGURED && (
            <div className="banner">
              <strong>Supabase pendiente.</strong> Configura <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> con el proyecto <code>oficina-ia</code> y aplica <code>supabase/migrations/*.sql</code> + <code>supabase/seed.sql</code>. Mientras tanto el dashboard muestra su estructura sin datos.
            </div>
          )}
          {children}
        </main>
      </body>
    </html>
  );
}
