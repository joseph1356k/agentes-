import { STATUS_LABEL, type MissionStatus } from '@/lib/types';

export function StatusPill({ status }: { status: MissionStatus }) {
  const cls = ['running', 'review', 'approved', 'released', 'verified'].includes(status) ? 'hot'
    : ['waiting_answer', 'blocked', 'paused', 'paused_quota', 'changes_requested', 'orphaned', 'draft'].includes(status) ? 'warm'
    : ['failed', 'regressed', 'cancelled'].includes(status) ? 'bad' : '';
  return <span className={`pill ${cls}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `hace ${Math.round(s)} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}

export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
