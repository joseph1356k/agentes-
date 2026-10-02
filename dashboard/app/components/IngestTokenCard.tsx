'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function IngestTokenCard(props: { configured: boolean; createdBy: string | null; createdAt: string | null; isOwner: boolean; ingestUrl: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function rotate() {
    if (props.configured && !window.confirm('El token actual dejará de funcionar. ¿Generar uno nuevo?')) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabaseBrowser().rpc('rotate_ingest_token');
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setToken(String(data));
  }

  const curl = `curl -X POST ${props.ingestUrl} \\\n  -H "Authorization: Bearer ${token ?? '<token>'}" -H "Content-Type: application/json" \\\n  -d '{"repo":"u","service":"web","severity":"high","message":"No se guarda la nota al pulsar Guardar"}'`;

  return (
    <section className="card">
      <h3>Token de ingesta de producción</h3>
      <p className="small muted">Lo usan tus apps para enviar feedback y errores a <code>/api/ingest/feedback</code>. Se guarda solo su hash; se muestra una vez.</p>
      <p className="small">{props.configured ? <>Configurado por {props.createdBy ?? '?'} · {props.createdAt ? new Date(props.createdAt).toLocaleString() : ''}</> : 'Sin token todavía.'}</p>
      {props.isOwner && <button className="btn" type="button" onClick={rotate} disabled={busy}>{props.configured ? 'Rotar token' : 'Generar token'}</button>}
      {token && <div className="banner ok" style={{ marginTop: 10 }}><strong>Cópialo ahora:</strong> <code style={{ wordBreak: 'break-all' }}>{token}</code></div>}
      {msg && <div className="banner bad" style={{ marginTop: 10 }}>{msg}</div>}
      <pre className="plan" style={{ marginTop: 10 }}>{curl}</pre>
    </section>
  );
}
