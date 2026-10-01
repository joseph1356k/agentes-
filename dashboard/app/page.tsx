import { SUPABASE_CONFIGURED } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import type { Mission, Repo } from '@/lib/types';
import MissionBoard from './components/MissionBoard';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let missions: Mission[] = [];
  let repos: Repo[] = [];
  let error: string | null = null;
  if (SUPABASE_CONFIGURED) {
    const sb = await createClient();
    const [m, r] = await Promise.all([
      sb.from('missions').select('*').not('status', 'in', '(verified,cancelled)').order('priority', { ascending: false }).order('created_at', { ascending: true }).limit(300),
      sb.from('repos').select('id,slug,name,default_branch,branch_prefix,subprojects,sensitive_data'),
    ]);
    if (m.error) error = m.error.message; else missions = (m.data ?? []) as Mission[];
    repos = (r.data ?? []) as Repo[];
  }
  return (
    <>
      <h1>Misiones</h1>
      <p className="lede">Tablero en vivo. Cada tarjeta es una misión con su repo, estado y motivo. Las columnas de la izquierda piden una decisión tuya.</p>
      {error && <div className="banner bad">No se pudieron leer las misiones: {error}. Si acabas de entrar, comprueba que tu correo está en <code>team_members</code>.</div>}
      <MissionBoard initial={missions} repos={repos} live={SUPABASE_CONFIGURED} />
    </>
  );
}
