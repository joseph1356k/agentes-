import { SUPABASE_CONFIGURED } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import type { Repo } from '@/lib/types';
import { createMission } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function NewMissionPage() {
  let repos: Repo[] = [];
  if (SUPABASE_CONFIGURED) {
    const sb = await createClient();
    repos = ((await sb.from('repos').select('id,slug,name,default_branch,branch_prefix,subprojects,sensitive_data').order('slug')).data ?? []) as Repo[];
  }
  return (
    <>
      <h1>Nueva misión</h1>
      <p className="lede">Describe el objetivo como comportamiento observable. El tech lead propondrá el criterio de aceptación si lo dejas vacío y preguntará solo lo que cambie la solución.</p>
      <form action={createMission} className="card" style={{ maxWidth: 760 }}>
        <label htmlFor="title">Título (5 a 8 palabras)</label>
        <input id="title" name="title" type="text" required maxLength={120} placeholder="Recordar corrección enseñada por voz" />
        <label htmlFor="goal">Objetivo</label>
        <textarea id="goal" name="goal" required placeholder="Cuando el usuario corrige por voz cómo diligenciar un campo, el asistente lo recuerda y lo aplica la próxima vez…" />
        <label htmlFor="repo_id">Repo</label>
        <select id="repo_id" name="repo_id" required defaultValue={repos[0]?.id ?? ''}>
          {repos.map(r => <option key={r.id} value={r.id}>{r.slug} — {r.name}</option>)}
          {repos.length === 0 && <option value="">(sin repos registrados: aplica supabase/seed.sql)</option>}
        </select>
        <label htmlFor="subdir">Proyecto dentro del repo (monorepos; opcional)</label>
        <select id="subdir" name="subdir" defaultValue="">
          <option value="">— raíz del repo —</option>
          {repos.flatMap(r => (r.subprojects ?? []).map(s => <option key={`${r.id}:${s.subdir}`} value={s.subdir}>{r.slug}/{s.subdir} — {s.name}</option>))}
        </select>
        <label htmlFor="required_platform">Plataforma requerida (solo si el proyecto exige una máquina concreta)</label>
        <select id="required_platform" name="required_platform" defaultValue="">
          <option value="">cualquiera</option>
          <option value="darwin">Mac (darwin)</option>
          <option value="win32">Windows (win32)</option>
          <option value="linux">Linux</option>
        </select>
        <label htmlFor="kind">Tipo</label>
        <select id="kind" name="kind" defaultValue="feature">
          <option value="feature">feature</option>
          <option value="bugfix">bugfix</option>
          <option value="inventory">inventory (mapa del repo; primera misión por repo)</option>
          <option value="research">research</option>
          <option value="verify">verify</option>
        </select>
        <label htmlFor="acceptance">Criterio de aceptación (una condición por línea; opcional)</label>
        <textarea id="acceptance" name="acceptance" placeholder={'La corrección queda persistida con procedencia\nEn una sesión posterior la acción usa el campo corregido'} />
        <label htmlFor="priority">Prioridad (0–100)</label>
        <input id="priority" name="priority" type="number" min={0} max={100} defaultValue={50} />
        <label><input type="checkbox" name="queue" defaultChecked /> Encolar ya (si no, queda en borrador)</label>
        <div className="actions"><button className="btn primary" type="submit" disabled={!SUPABASE_CONFIGURED || repos.length === 0}>Crear misión</button></div>
      </form>
    </>
  );
}
