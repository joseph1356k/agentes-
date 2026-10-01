'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/client';
import { BOARD_COLUMNS, STATUS_LABEL, type Mission, type Repo } from '@/lib/types';
import { StatusPill, timeAgo } from './ui';

export default function MissionBoard({ initial, repos, live }: { initial: Mission[]; repos: Repo[]; live: boolean }) {
  const [missions, setMissions] = useState<Mission[]>(initial);
  const repoName = useMemo(() => Object.fromEntries(repos.map(r => [r.id, r.slug])), [repos]);

  useEffect(() => { setMissions(initial); }, [initial]);

  useEffect(() => {
    if (!live) return;
    const sb = supabaseBrowser();
    const ch = sb.channel('board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, (p: RealtimePostgresChangesPayload<Mission>) => {
        setMissions(prev => {
          if (p.eventType === 'DELETE') return prev.filter(m => m.id !== (p.old as Mission).id);
          const row = p.new as Mission;
          const idx = prev.findIndex(m => m.id === row.id);
          const next = idx >= 0 ? prev.map(m => (m.id === row.id ? row : m)) : [row, ...prev];
          return next.sort((a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at));
        });
      })
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [live]);

  return (
    <div className="board">
      {BOARD_COLUMNS.map(col => {
        const items = missions.filter(m => col.statuses.includes(m.status));
        return (
          <section className="col" key={col.title}>
            <h3>{col.title} <span className="muted">({items.length})</span></h3>
            {items.length === 0 && <p className="muted small" style={{ margin: '0 6px 6px' }}>Nada aquí.</p>}
            {items.map(m => (
              <Link className="mcard" href={`/missions/${m.id}`} key={m.id}>
                <div className="t">{m.title}</div>
                <div className="m">
                  <StatusPill status={m.status} />
                  <span className="mono">{repoName[m.repo_id] ?? m.repo_id}{m.subdir ? `/${m.subdir}` : ''}</span>
                  <span>p{m.priority}</span>
                  <span>{timeAgo(m.updated_at)}</span>
                </div>
                {m.status_reason && <div className="muted small" style={{ marginTop: 4 }}>{m.status_reason.slice(0, 140)}</div>}
              </Link>
            ))}
          </section>
        );
      })}
      {missions.length === 0 && live && (
        <div className="card" style={{ gridColumn: '1 / -1' }}>Sin misiones todavía. <Link href="/missions/new">Crea la primera</Link>: la misión de inventario del monorepo es un buen comienzo.</div>
      )}
      <p className="muted small" style={{ gridColumn: '1 / -1' }}>Estados: {Object.entries(STATUS_LABEL).map(([k, v]) => `${k} = ${v}`).join(' · ')}</p>
    </div>
  );
}
