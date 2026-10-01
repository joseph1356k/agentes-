'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { MissionStatus } from '@/lib/types';

async function currentEmail(): Promise<string> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) throw new Error('Sesión no válida');
  return user.email;
}

export async function signOut(): Promise<void> {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect('/login');
}

export async function createMission(formData: FormData): Promise<void> {
  const sb = await createClient();
  const email = await currentEmail();
  const acceptance = String(formData.get('acceptance') ?? '').split('\n').map(s => s.trim()).filter(Boolean);
  const subdir = String(formData.get('subdir') ?? '').trim() || null;
  const requiredPlatform = String(formData.get('required_platform') ?? '').trim() || null;
  const row = {
    repo_id: String(formData.get('repo_id')),
    kind: String(formData.get('kind') ?? 'feature'),
    title: String(formData.get('title') ?? '').trim(),
    goal: String(formData.get('goal') ?? '').trim(),
    acceptance,
    priority: Number(formData.get('priority') ?? 50),
    subdir,
    required_platform: requiredPlatform,
    require_plan_approval: formData.get('require_plan_approval') === 'on',
    require_review: formData.get('require_review') === 'on',
    auto_queue_children: formData.get('auto_queue_children') === 'on',
    status: formData.get('queue') === 'on' ? 'queued' : 'draft',
    created_by: email,
  };
  if (!row.title || !row.goal) throw new Error('Título y objetivo son obligatorios');
  const { data, error } = await sb.from('missions').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  revalidatePath('/');
  redirect(`/missions/${data.id}`);
}

export async function transition(missionId: string, to: MissionStatus, reason: string | null = null): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.rpc('transition_mission', { p_mission_id: missionId, p_to: to, p_reason: reason, p_patch: {} });
  if (error) throw new Error(error.message);
  revalidatePath(`/missions/${missionId}`);
  revalidatePath('/');
}

export async function transitionForm(formData: FormData): Promise<void> {
  await transition(String(formData.get('mission_id')), String(formData.get('to')) as MissionStatus, String(formData.get('reason') ?? '') || null);
}

export async function sendMessage(formData: FormData): Promise<void> {
  const sb = await createClient();
  const email = await currentEmail();
  const missionId = String(formData.get('mission_id'));
  const content = String(formData.get('content') ?? '').trim();
  if (!content) return;
  const { error } = await sb.from('mission_messages').insert({ mission_id: missionId, role: 'user', content, author: email });
  if (error) throw new Error(error.message);
  revalidatePath(`/missions/${missionId}`);
}

export async function answerQuestion(formData: FormData): Promise<void> {
  const sb = await createClient();
  const email = await currentEmail();
  const questionId = String(formData.get('question_id'));
  const missionId = String(formData.get('mission_id'));
  const answers: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith('answer:') && typeof v === 'string' && v.trim()) answers[k.slice('answer:'.length)] = v.trim();
    if (k.startsWith('other:') && typeof v === 'string' && v.trim()) answers[k.slice('other:'.length)] = v.trim();
  }
  const response = String(formData.get('response') ?? '').trim() || null;
  const { error } = await sb.from('questions').update({ status: 'answered', answers, response, answered_at: new Date().toISOString(), answered_by: email }).eq('id', questionId);
  if (error) throw new Error(error.message);
  // Si la misión estaba esperando esta respuesta, vuelve a la cola (con preferencia por su ejecutor).
  const { data: m } = await sb.from('missions').select('status').eq('id', missionId).single();
  if (m?.status === 'waiting_answer') await sb.rpc('transition_mission', { p_mission_id: missionId, p_to: 'queued', p_reason: 'pregunta respondida', p_patch: {} });
  revalidatePath(`/missions/${missionId}`);
  revalidatePath('/');
}

export async function approveMission(formData: FormData): Promise<void> {
  const sb = await createClient();
  const missionId = String(formData.get('mission_id'));
  const sha = String(formData.get('sha'));
  const { error } = await sb.rpc('approve_mission', { p_mission_id: missionId, p_sha: sha, p_environment: 'production', p_notes: String(formData.get('notes') ?? '') || null });
  if (error) throw new Error(error.message);
  revalidatePath(`/missions/${missionId}`);
}

export async function setPriority(formData: FormData): Promise<void> {
  const sb = await createClient();
  const missionId = String(formData.get('mission_id'));
  const { error } = await sb.from('missions').update({ priority: Number(formData.get('priority')) }).eq('id', missionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/missions/${missionId}`);
  revalidatePath('/');
}
