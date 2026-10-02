'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { SUPABASE_CONFIGURED } from '@/lib/env';

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next') || '/';

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) { setMsg(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : `No se pudo entrar: ${error.message}`); return; }
    router.replace(next);
    router.refresh();
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    setBusy(false);
    if (error) { setMsg(`No se pudo enviar el correo: ${error.message}`); return; }
    setSent(true);
    setMsg('Revisa tu correo. Si la plantilla del proyecto incluye código de 6 dígitos, puedes escribirlo abajo.');
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) { setMsg(`Código no válido: ${error.message}`); return; }
    router.replace(next);
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>Entrar</h1>
      <p className="lede">Solo miembros del equipo. Un owner te da de alta en <code>Equipo</code> con una contraseña inicial que cambias en <code>Cuenta</code>.</p>
      {!SUPABASE_CONFIGURED && <div className="banner">Supabase no está configurado todavía en este despliegue.</div>}
      {params.get('error') && <div className="banner bad">El enlace no fue válido o caducó. Entra con tu contraseña o pide uno nuevo.</div>}
      {mode === 'password' ? (
        <form onSubmit={signInPassword} className="card">
          <label htmlFor="email">Correo</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@itsmiracleai.com" />
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
          <div className="actions"><button className="btn primary" type="submit" disabled={busy || !SUPABASE_CONFIGURED}>Entrar</button></div>
        </form>
      ) : (
        <>
          <form onSubmit={sendLink} className="card">
            <label htmlFor="email-otp">Correo</label>
            <input id="email-otp" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@itsmiracleai.com" />
            <div className="actions"><button className="btn primary" type="submit" disabled={busy || !SUPABASE_CONFIGURED}>Enviar enlace</button></div>
          </form>
          {sent && (
            <form onSubmit={verifyCode} className="card" style={{ marginTop: 12 }}>
              <label htmlFor="code">Código de 6 dígitos</label>
              <input id="code" type="text" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} placeholder="123456" />
              <div className="actions"><button className="btn" type="submit" disabled={busy}>Entrar con código</button></div>
            </form>
          )}
        </>
      )}
      <p className="small" style={{ marginTop: 10 }}>
        <button className="linkish" type="button" onClick={() => { setMode(mode === 'password' ? 'otp' : 'password'); setMsg(null); }}>
          {mode === 'password' ? 'Entrar con enlace por correo' : 'Entrar con contraseña'}
        </button>
      </p>
      {msg && <p className="muted small" style={{ marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
