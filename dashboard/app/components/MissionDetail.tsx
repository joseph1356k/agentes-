'use client';
import { useEffect, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';
import type { Evidence, Event, Learning, Message, Mission, Question, Repo } from '@/lib/types';
import type { RelatedMission } from '../missions/[id]/page';
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

export default function MissionDetail(props: { mission: Mission; repo: Repo | null; messages: Message[]; events: Event[]; questions: Question[]; evidence: Evidence[]; childMissions: RelatedMission[]; parent: RelatedMission | null; learnings: Learning[] }) {
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
  const checks = mission.executor_checks;
  const review = mission.review;
  const ci = mission.ci;
  const planOpen = open.some(q => q.questions.questions.some(qq => /plan/i.test(qq.question) || /plan/i.test(qq.header ?? '')));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>{mission.title}</h1>
          <div className="row small muted">
            <StatusPill status={mission.status} />
            <span className="mono">{mission.id}</span>
            <span className="mono">{props.repo?.slug ?? mission.repo_id}{mission.subdir ? `/${mission.subdir}` : ''}</span>
            <span className="pill">{mission.kind}</span>
            {mission.branch && <span className="mono">{mission.branch}{mission.base_branch ? ` ← ${mission.base_branch}` : ''}</span>}
            {mission.pr_url && <a href={mission.pr_url} target="_blank" rel="noreferrer">PR</a>}
            {props.parent && <span>sub-misión de <Link href={`/missions/${props.parent.id}`}>{props.parent.title}</Link></span>}
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
      {planOpen && <div className="banner"><strong>Plan pendiente de aprobación.</strong> El tech lead no tocará código hasta que respondas la pregunta de abajo.</div>}
      {checks && !checks.ok && <div className="banner bad"><strong>Verificación independiente fallida</strong> (ronda {checks.round}): {checks.checks.filter(c => c.exit_code !== 0).map(c => c.name).join(', ') || checks.skipped_reason}.</div>}
      {review && review.verdict !== 'aprobar' && <div className={`banner ${review.verdict === 'cambios_requeridos' ? 'bad' : ''}`}><strong>Revisión automática: {review.verdict.replace('_', ' ')}</strong> · {review.blocking} bloqueantes · {review.high} altos (ronda {review.round}).</div>}
      {ci && (ci.state === 'failure' || ci.state === 'timeout') && <div className="banner bad"><strong>CI del PR: {ci.state}</strong> · {ci.checks.filter(c => c.state !== 'SUCCESS' && c.state !== 'success').map(c => c.name).join(', ')}.</div>}

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

          {(mission.plan || mission.spec_path || mission.require_plan_approval) && (
            <section>
              <h2>Plan {mission.require_plan_approval && <span className="pill warm">requiere aprobación</span>}</h2>
              {mission.spec_path && <p className="small"><span className="muted">Spec:</span> <code>{mission.spec_path}</code> (en la rama de la misión)</p>}
              {mission.plan ? <pre className="plan">{mission.plan}</pre> : <p className="muted small">El tech lead lo registrará antes de implementar.</p>}
            </section>
          )}

          {props.childMissions.length > 0 && (
            <section>
              <h2>Sub-misiones ({props.childMissions.length})</h2>
              <table className="subtable">
                <thead><tr><th>Misión</th><th>Estado</th><th>Depende de</th><th>Entrega</th></tr></thead>
                <tbody>
                  {props.childMissions.map(c => (
                    <tr key={c.id}>
                      <td><Link href={`/missions/${c.id}`}>{c.title}</Link>{c.subdir ? <span className="muted small"> · {c.subdir}</span> : null}<div className="muted small">{c.level ?? '—'} / {c.risk ?? '—'}{c.status_reason ? ` · ${c.status_reason}` : ''}</div></td>
                      <td><StatusPill status={c.status} /></td>
                      <td className="mono small">{(c.depends_on ?? []).map(d => d.slice(0, 10)).join(', ') || '—'}</td>
                      <td className="small">{c.pr_url ? <a href={c.pr_url} target="_blank" rel="noreferrer">PR</a> : c.branch ? <span className="mono">{c.branch}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">Las sub-misiones nacen de la rama de esta misión y entregan PR contra ella. Cuando todas estén en revisión, el tech lead vuelve a la cola para integrar y verificar la spec.</p>
            </section>
          )}

          {(checks || review || ci) && (
            <section>
              <h2>Verificación de la oficina</h2>
              {checks && (
                <>
                  <h3>Comprobaciones independientes del ejecutor {checks.ok ? <span className="pill ok">ok</span> : <span className="pill bad">fallan</span>} <span className="muted small">ronda {checks.round} · {timeAgo(checks.ran_at)}</span></h3>
                  {checks.skipped_reason && <p className="muted small">{checks.skipped_reason}</p>}
                  {checks.checks.map(c => (
                    <div className="evrow" key={c.evidence_id}><span>{c.evidence_id}</span><span className={c.exit_code === 0 ? 'pill ok' : 'pill bad'}>{c.exit_code}</span><span title={c.command}>{c.name} · {c.command.slice(0, 60)} · {(c.duration_ms / 1000).toFixed(1)} s</span></div>
                  ))}
                </>
              )}
              {review && (
                <>
                  <h3>Revisión independiente <span className={`pill ${review.verdict === 'aprobar' ? 'ok' : review.verdict === 'cambios_requeridos' ? 'bad' : 'warm'}`}>{review.verdict.replace('_', ' ')}</span> <span className="muted small">ronda {review.round} · {review.blocking} bloqueantes · {review.high} altos · ${Number(review.cost_usd ?? 0).toFixed(2)}</span></h3>
                  <pre className="plan">{review.summary}</pre>
                </>
              )}
              {ci && (
                <>
                  <h3>CI del PR <span className={`pill ${ci.state === 'success' ? 'ok' : ci.state === 'pending' ? 'warm' : ci.state === 'unknown' ? '' : 'bad'}`}>{ci.state}</span> <span className="muted small">{ci.rounds} rondas de corrección · {timeAgo(ci.checked_at)}</span></h3>
                  {ci.checks.map(c => <div className="evrow" key={c.name}><span>{c.name.slice(0, 24)}</span><span className={/success/i.test(c.state) ? 'pill ok' : /pending|queued|in_progress/i.test(c.state) ? 'pill warm' : 'pill bad'}>{c.state.toLowerCase()}</span><span>{c.link ? <a href={c.link} target="_blank" rel="noreferrer">ver</a> : ''}</span></div>)}
                </>
              )}
            </section>
          )}

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

          {props.learnings.length > 0 && (
            <section>
              <h2>Aprendizajes registrados ({props.learnings.length})</h2>
              <ul className="plain">{props.learnings.map(l => <li key={l.id}><span className="pill">{l.scope}{l.area ? `:${l.area}` : ''}</span> {l.text} <span className="muted small">· evidencia: {l.evidence}</span></li>)}</ul>
            </section>
          )}
        </div>

        <div>
          <section className="card">
            <h3>Estado</h3>
            <dl className="kv">
              <dt>Nivel / riesgo</dt><dd>{mission.level ?? '—'} / {mission.risk ?? '—'}</dd>
              <dt>Controles</dt><dd>{[mission.require_plan_approval ? 'plan aprobado por humano' : null, mission.require_review ? 'revisión obligatoria' : null].filter(Boolean).join(' · ') || 'según nivel y riesgo'}</dd>
              {mission.depends_on?.length ? <><dt>Depende de</dt><dd className="mono">{mission.depends_on.map(d => <Link key={d} href={`/missions/${d}`}>{d.slice(0, 10)} </Link>)}</dd></> : null}
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
    case 'setup': return `setup exit ${p.exit_code} · ${p.evidence_id ?? ''}`;
    case 'executor_checks': return `verificación independiente ${p.ok ? 'ok' : 'falló'} (ronda ${p.round})${p.skipped ? ` · ${p.skipped}` : ''}`;
    case 'review': return `revisión ${p.verdict} · ${p.blocking} bloqueantes · ${p.high} altos (ronda ${p.round})`;
    case 'review_requested': return `revisión pedida por el tech lead: ${String(p.reason ?? '').slice(0, 120)}`;
    case 'review_text': return String(p.text ?? '').slice(0, 160);
    case 'ci': return `ci ${p.state} (ronda ${p.round})`;
    case 'plan': return `plan registrado (${p.chars} caracteres)${p.level ? ` · ${p.level}` : ''}${p.risk ? ` / ${p.risk}` : ''}`;
    case 'acceptance': return `criterio de aceptación: ${((p.acceptance as string[] | undefined) ?? []).length} condiciones`;
    case 'decision': return `[${p.scope}] ${String(p.text ?? '').slice(0, 140)}`;
    case 'learning': return `aprendizaje ${p.id}: ${String(p.text ?? '').slice(0, 120)}`;
    case 'child_created': return `sub-misión ${p.id} (${p.status}): ${String(p.title ?? '').slice(0, 80)}`;
    case 'attention': return String(p.text ?? '').slice(0, 160);
    case 'answer': return `respuesta recibida (${p.question_id})`;
    case 'question_deferred': return `pregunta diferida (${p.question_id}); la sesión se reanuda al responder`;
    case 'evidence_uploaded': return `${((p.files as unknown[] | undefined) ?? []).length} archivos de evidencia subidos`;
    case 'user_message_injected': return `mensaje del humano entregado: ${String(p.preview ?? '').slice(0, 100)}`;
    case 'text': return String(p.text ?? '').slice(0, 160);
    case 'tool_result': return `error de herramienta: ${String(p.preview ?? '').slice(0, 140)}`;
    case 'error': return String(p.message ?? '').slice(0, 160);
    case 'init': return `${p.model} · ${p.billing} · plugins ${(p.plugins as string[] | undefined)?.join(',') ?? ''}`;
    default: return JSON.stringify(p).slice(0, 160);
  }
}
