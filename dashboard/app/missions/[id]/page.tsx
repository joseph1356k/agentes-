import { notFound } from 'next/navigation';
import { SUPABASE_CONFIGURED } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import type { Evidence, Event, Message, Mission, Question, Repo } from '@/lib/types';
import MissionDetail from '../../components/MissionDetail';

export const dynamic = 'force-dynamic';

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SUPABASE_CONFIGURED) return <div className="banner">Supabase pendiente: no se puede cargar la misión {id}.</div>;
  const sb = await createClient();
  const m = await sb.from('missions').select('*').eq('id', id).maybeSingle();
  if (m.error || !m.data) notFound();
  const mission = m.data as Mission;
  const [repo, messages, events, questions, evidence] = await Promise.all([
    sb.from('repos').select('id,slug,name,default_branch,branch_prefix,subprojects,sensitive_data').eq('id', mission.repo_id).single(),
    sb.from('mission_messages').select('*').eq('mission_id', id).order('created_at').limit(500),
    sb.from('mission_events').select('*').eq('mission_id', id).order('ts', { ascending: false }).limit(300),
    sb.from('questions').select('*').eq('mission_id', id).order('asked_at', { ascending: false }),
    sb.from('evidence').select('*').eq('mission_id', id).order('created_at'),
  ]);
  return (
    <MissionDetail
      mission={mission}
      repo={(repo.data ?? null) as Repo | null}
      messages={(messages.data ?? []) as Message[]}
      events={(events.data ?? []) as Event[]}
      questions={(questions.data ?? []) as Question[]}
      evidence={(evidence.data ?? []) as Evidence[]}
    />
  );
}
