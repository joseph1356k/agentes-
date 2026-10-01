'use client';
import { useEffect, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Evidence, Event, Message, Mission, Question, Repo } from '@/lib/types';
import { answerQuestion, approveMission, sendMessage, setPriority, transitionForm } from '../actions';
import { StatusPill, hhmm, timeAgo } from './ui';

const ACTIONS: Array<{ label: string; to: string; from: string[]; danger?: boolean; reason?: string }> = [
  { label: 'Encolar', to: 'queued', from: ['draft', 'paused', 'blocked', 'failed', 'changes_requested', 'orphaned', 'regressed'] },
  { label: 'Pausar', to: 'paused', from: ['queued', 'running', 'waiting_answer'] },
  { label: 'Pedir cambios', to: 'changes_requested', from: ['review', 'staging'], reason: 'cambios pedidos desde el dashboard (ver mensajes)' },
  { label: 'A staging', to: 'staging', from: ['review'] },
  { label: 'Publicada', to: 'released', from: ['approved'] },
  { label: 'Verificada', to: 'verified', from: ['released'] },
  { label: 'Regresión', to: 'regressed', from: ['released'], danger: true },
  { label: 'Cancelar', to: 'cancelled', from: ['draft', 'queued', 'claimed', 'preparing', 'running', 'waiting_answer', 'paused', 'paused_quota', 'blocked', 'review', 'changes_requested', 'staging', 'approved', 'orphaned', 'failed'], danger: true },
];

export default function MissionDetail(props: { mission: Mission; repo: Repo | null; messages: Message[]; events: Event[]; questions: Question[]; evidence: Evidence[] }) {
  const [mission, setMission] = useState(props.mission);
  const [messages, setMessages] = useState(props.messages);
  const [events, setEvents] = useState(props.events);
  const [questions, setQuestions] = useState(props.questions);
  useEffect(() => { setMission(props.mission); setMessages(props.messages); setEvents(props.events); setQuestions(props.questions); }, [props]);

  useEffect(() => {
    const sb = supabaseBrowser();
    const id = props.mission.id;
    const ch = sb.channel(`mission-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'missions', filter: `id=eq.${id}` }, (p: RealtimePostgresChangesPayload<Mission>) => setMission(p.new as Mission))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mission_messages', filter: `mission_id=eq.${id}` }, (p: RealtimePostgresChangesPayload<Message>) => setMessages(prev => [...prev, p.new as Message]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mission_events', filter: `mission_id=eq.${id}` }, (p: RealtimePostgresChangesPayload<Event>) => setEvents(prev => [p.new as Event, ...prev].slice(0, 300)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions', filter: `mission_id=eq.${id}` }, (p: RealtimePostgresChangesPayload<Question>) => setQuestions(prev => {
        const row = p.new as Question; const i = prev.findIndex(q => q.id === row.id);
        return i >= 0 ? prev.map(q => (q.id === row.id ? row : q)) : [row, ...prev];
      }))
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [props.mission.id]);

  const open = questions.filter(q => q.status === 'open');
  const r = mission.result;
  const unverified = mission.unverified_tests ?? [];

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>{mission.title}</h1>
          <div className="row small muted">
            <StatusPill status={mission.status} />
            <span className="mono">{mission.id}</span>
            <span className="mono">{props.repo?.slug ?? mission.repo_id}{mission.subdir ? `/${mission.subdir}` : ''}</span>
            {mission.branch && <span className="mono">{mission.branch}</span>}
            {mission.pr_url && <a href={mission.pr_url} target="_blank" rel="noreferrer">PR</a>}
            <span>actualizada {timeAgo(mission.updated_at)}</span>
          </div>
        </div>
        <form action={setPriority} className="row">
          <input type="hidden" name="mission_id" value={mission.id} />
          <label htmlFor="priority" style={{ margin: 0 }}>Prioridad</label>
          <input id="priority" name="priority" type="number" min={0} max={100} defaultValue={mission.priority} style={{ width: 80 }} />
          <button className="btn" type="submit">Guardar</button>
        </form>
      </div>
      {mission.status_reason && <div className={`banner ${mission.status === 'blocked' || mission.status === 'failed' ? 'bad' : ''}`}>{mission.status_reason}</div>}
      {mission.result_verified === false && unverified.length > 0 && (
        <div className="banner bad"><strong>Pruebas no verificadas.</strong> El informe declara pruebas sin evidencia válida: {unverified.map(u => `${u.evidence_id} (${u.reason})`).join('; ')}. La misión no puede darse por completada.</div>
      )}

      <div className="row" style={{ margin: '10px 0 16px' }}>
        {ACTIONS.filter(a => a.from.includes(mission.status)).map(a => (
          <form action={transitionForm} key={a.to}>
            <input type="hidden" name="mission_id" value={mission.id} />
            <input type="hidden" name="to" value={a.to} />
            <input type="hidden" name="reason" value={a.reason ?? ''} />
            <button className={`btn ${a.danger ? 'danger' : ''}`} type="submit">{a.label}</button>
          </form>
        ))}
        {(mission.status === 'review' || mission.status === 'staging') && mission.head_sha && (
          <form action={approveMission} className="row">
            <input type="hidden" name="mission_id" value={mission.id} />
            <input type="hidden" name="sha" value={mission.head_sha} />
            <button className="btn primary" type="submit">Aprobar {mission.head_sha.slice(0, 7)}</button>
          </form>
        )}
      </div>

      <div className="detail">
        <div>
          {open.length > 0 && (
            <section>
              <h2>Preguntas del tech lead</h2>
              {open.map(q => (
                <form action={answerQuestion} className="qcard" key={q.id}>
                  <input type="hidden" name="question_id" value={q.id} />
                  <input type="hidden" name="mission_id" value={mission.id} />
                  <div className="small muted">abierta {timeAgo(q.asked_at)} {mission.status === 'waiting_answer' ? '· la misión está esperando esta respuesta' : '· la sesión espera unos minutos y luego se difiere'}</div>
                  {q.questions.questions.map(qq => (
                    <div key={qq.question}>
                      <div className="q">{qq.header ? `${qq.header}: ` : ''}{qq.question}</div>
                      {qq.options.map(o => (
                        <label className="opt" key={o.label} style={{ margin: 0, color: 'inherit' }}>
                          <input type={qq.multiSelect ? 'checkbox' : 'radio'} name={`answer:${qq.question}`} value={o.label} /> <strong>{o.label}</strong> <span className="muted">{o.description}</span>
                        </label>
                      ))}
                      <input type="text" name={`other:${qq.question}`} placeholder="Otra respuesta (texto libre)" style={{ marginTop: 4 }} />
                    </div>
                  ))}
                  <label htmlFor={`response-${q.id}`}>Respuesta general (opcional, reemplaza las anteriores)</label>
                  <input id={`response-${q.id}`} type="text" name="response" />
                  <div className="actions"><button className="btn primary" type="submit">Responder</button></div>
                </form>
              ))}
            </section>
          )}

          <section>
            <h2>Chat con el tech lead</h2>
            <div className="chat">
              {messages.length === 0 && <p className="muted small">Sin mensajes todavía. Lo que escribas aquí llega al tech lead en su siguiente turno.</p>}
              {messages.map(m => <div className={`msg ${m.role}`} key={m.id}>{m.role === 'user' && m.author ? <span className="muted small">{m.author}: </span> : null}{m.content}</div>)}
            </div>
            <form action={sendMessage}>
              <input type="hidden" name="mission_id" value={mission.id} />
              <textarea name="content" placeholder="Instrucción, aclaración o cambio pedido…" />
              <div className="actions"><button className="btn primary" type="submit">Enviar</button></div>
            </form>
          </section>

          <section>
            <h2>Objetivo y criterio de aceptación</h2>
            <p>{mission.goal}</p>
            {mission.acceptance?.length ? <ul className="plain">{mission.acceptance.map(a => <li key={a}>{a}</li>)}</ul> : <p className="muted small">El tech lead lo propondrá.</p>}
            {mission.decisions?.length ? (<><h3>Decisiones</h3><ul className="plain">{mission.decisions.map((d, i) => <li key={i}>{d.text} <span className="muted small">({d.by ?? '?'})</span></li>)}</ul></>) : null}
          </section>

          {r && (
            <section>
              <h2>Informe {r.status} {mission.result_verified ? <span className="pill ok">evidencia verificada</span> : <span className="pill warm">sin verificar</span>}</h2>
              <p>{r.summary}</p>
              {r.tests?.length ? (<><h3>Pruebas</h3>{r.tests.map(t => <div className="evrow" key={t.evidence_id}><span>{t.evidence_id}</span><span className={t.verdict === 'pass' ? 'pill ok' : 'pill bad'}>{t.verdict}</span><span>{t.command}</span></div>)}</>) : null}
              {r.not_tested?.length ? (<><h3>No probado</h3><ul className="plain">{r.not_tested.map((n, i) => <li key={i}>{n.what}: {n.why}</li>)}</ul></>) : null}
              {r.changes?.length ? (<><h3>Cambios</h3><ul className="plain">{r.changes.map(c => <li key={c.path}><code>{c.path}</code> ({c.kind}) {c.why}</li>)}</ul></>) : null}
              {r.decisions?.length ? (<><h3>Decisiones</h3><ul className="plain">{r.decisions.map((d, i) => <li key={i}>[{d.scope}] {d.text} <span className="muted">{d.rationale}</span></li>)}</ul></>) : null}
              {r.blockers?.length ? (<><h3>Bloqueos</h3><ul className="plain">{r.blockers.map((b, i) => <li key={i}>{b.what} <span className="pill warm">{b.needs}</span></li>)}</ul></>) : null}
              {r.questions?.length ? (<><h3>Preguntas pendientes</h3><ul className="plain">{r.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></>) : null}
              {r.next_steps?.length ? (<><h3>Siguientes pasos</h3><ul className="plain">{r.next_steps.map((s, i) => <li key={i}>{s}</li>)}</ul></>) : null}
              {r.delegations?.length ? (<><h3>Delegaciones</h3><ul className="plain">{r.delegations.map((d, i) => <li key={i}><code>{d.agent}</code> {d.task} <span className="pill">{d.outcome}</span></li>)}</ul></>) : null}
            </section>
          )}
        </div>

        <div>
          <section className="card">
            <h3>Estado</h3>
            <dl className="kv">
              <dt>Nivel / riesgo</dt><dd>{mission.level ?? '—'} / {mission.risk ?? '—'}</dd>
              <dt>Intento</dt><dd>{mission.attempt}</dd>
              <dt>Ejecutor</dt><dd className="mono">{mission.executor_id ?? '—'}</dd>
              <dt>Sesión</dt><dd className="mono">{mission.session_id ? mission.session_id.slice(0, 8) : '—'}</dd>
              <dt>Modelo / facturación</dt><dd>{mission.model ?? '—'} / {mission.billing ?? '—'}</dd>
              <dt>Costo estimado</dt><dd>${Number(mission.cost_usd ?? 0).toFixed(2)}</dd>
              <dt>Base / head</dt><dd className="mono">{mission.base_sha?.slice(0, 7) ?? '—'} / {mission.head_sha?.slice(0, 7) ?? '—'}</dd>
              <dt>Aprobación</dt><dd>{mission.approved_sha ? `${mission.approved_sha.slice(0, 7)} por ${mission.approved_by}` : 'sin aprobar'}</dd>
              <dt>Creada por</dt><dd>{mission.created_by} · {timeAgo(mission.created_at)}</dd>
            </dl>
          </section>

          <section className="card" style={{ marginTop: 12 }}>
            <h3>Evidencia ({props.evidence.length})</h3>
            {props.evidence.length === 0 && <p className="muted small">Se sube al terminar cada ejecución.</p>}
            {props.evidence.map(e => (
              <div className="evrow" key={e.evidence_id}>
                <span>{e.evidence_id}</span>
                <span className={e.exit_code === 0 ? 'pill ok' : 'pill bad'}>{e.exit_code ?? '?'}</span>
                <span title={e.command ?? ''}>{e.label ?? ''} {e.command?.slice(0, 60)}</span>
              </div>
            ))}
          </section>

          <section className="card" style={{ marginTop: 12 }}>
            <h3>Actividad ({events.length})</h3>
            <div className="timeline">
              {events.map(e => (
                <div className="ev" key={e.id}>
                  <span className="ts">{hhmm(e.ts)}</span>
                  <span className="ty">{e.type}{e.agent ? `·${e.agent}` : ''}</span>
                  <span className="pl">{summarize(e)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function summarize(e: Event): string {
  const p = e.payload ?? {};
  switch (e.type) {
    case 'status': return `${p.from ?? ''} → ${p.to ?? ''}${p.reason ? ` · ${p.reason}` : ''}`;
    case 'tool_use': { const i = (p.input ?? {}) as Record<string, unknown>; return `${p.tool}: ${i.command ?? i.file_path ?? i.subagent_type ?? i.skill ?? ''}`; }
    case 'subagent_start': return `inicia ${e.agent ?? ''}`;
    case 'subagent_stop': return `termina ${e.agent ?? ''}: ${String(p.last ?? '').slice(0, 120)}`;
    case 'question': return `pregunta ${p.question_id}`;
    case 'api_retry': return `${p.error} (intento ${p.attempt}, ${p.kind})`;
    case 'result': return `${p.subtype} · $${Number(p.cost_usd ?? 0).toFixed(2)} · ${p.num_turns} turnos${p.has_structured ? ' · informe' : ''}`;
    case 'workspace': return `${p.branch} desde ${String(p.base_sha ?? '').slice(0, 7)} · graphify ${p.graphify}`;
    case 'init': return `${p.model} · ${p.billing} · plugins ${(p.plugins as string[] | undefined)?.join(',') ?? ''}`;
    default: return JSON.stringify(p).slice(0, 160);
  }
}
