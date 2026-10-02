'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function PasswordForm() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 10) { setMsg({ ok: false, text: 'Mínimo 10 caracteres.' }); return; }
    if (pw !== pw2) { setMsg({ ok: false, text: 'Las contraseñas no coinciden.' }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: `No se pudo cambiar: ${error.message}` }); return; }
    setPw(''); setPw2('');
    setMsg({ ok: true, text: 'Contraseña cambiada. Úsala también en oficina-executor login.' });
  }

  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 560 }}>
      <h3>Cambiar contraseña</h3>
      <label htmlFor="pw">Nueva contraseña</label>
      <input id="pw" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
      <label htmlFor="pw2">Repítela</label>
      <input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
      <div className="actions"><button className="btn primary" type="submit" disabled={busy}>Guardar</button></div>
      {msg && <div className={`banner ${msg.ok ? 'ok' : 'bad'}`} style={{ marginTop: 10, marginBottom: 0 }}>{msg.text}</div>}
    </form>
  );
}
