'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { SUPABASE_CONFIGURED } from '@/lib/env';

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next') || '/';

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    setBusy(false);
    if (error) { setMsg(`No se pudo enviar el enlace: ${error.message}`); return; }
    setSent(true);
    setMsg('Revisa tu correo: tienes un enlace y un código de 6 dígitos. Cualquiera de los dos sirve.');
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) { setMsg(`Código no válido: ${error.message}`); return; }
    router.replace(next);
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>Entrar</h1>
      <p className="lede">Solo correos del equipo (tabla <code>team_members</code>). Sin contraseñas: enlace o código por correo.</p>
      {!SUPABASE_CONFIGURED && <div className="banner">Supabase no está configurado todavía; el login no funcionará hasta que exista el proyecto <code>oficina-ia</code>.</div>}
      {params.get('error') && <div className="banner bad">El enlace no fue válido o caducó. Pide uno nuevo.</div>}
      <form onSubmit={sendLink} className="card">
        <label htmlFor="email">Correo</label>
        <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@itsmiracleai.com" />
        <div className="actions"><button className="btn primary" type="submit" disabled={busy || !SUPABASE_CONFIGURED}>Enviar enlace</button></div>
      </form>
      {sent && (
        <form onSubmit={verifyCode} className="card" style={{ marginTop: 12 }}>
          <label htmlFor="code">Código de 6 dígitos</label>
          <input id="code" type="text" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} placeholder="123456" />
          <div className="actions"><button className="btn" type="submit" disabled={busy}>Entrar con código</button></div>
        </form>
      )}
      {msg && <p className="muted small" style={{ marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
