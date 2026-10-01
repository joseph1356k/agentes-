-- Datos iniciales de la oficina (aplicar después de 0001_oficina.sql). Idempotente.
-- Repos identificados por inspección del código el 1 de octubre de 2026 (ver docs/01-INVENTARIO.md §4).
-- Los comandos vienen de package.json/README y NO están verificados: la misión de inventario los verifica
-- con oficina-run y pone commands_verified = true.

insert into team_members (email, display_name, role)
values ('dev@itsmiracleai.com', 'Equipo Miracle', 'owner')
on conflict (email) do nothing;

-- Monorepo Ü: Ü (Windows/Mac/Android), Miracle Notes (apps/web) y Graph (services/graph)
insert into repos (slug, name, remote_url, default_branch, production_branch, branch_prefix, stack, commands, staging, subprojects, graphify_enabled, sensitive_data, notes)
values (
  'u',
  'Ü (monorepo: Ü clientes + Miracle Notes + Graph)',
  'https://github.com/ZevCorp/U-Windows-App',
  'main', 'main',
  'oficina/',
  '{"languages":"cs ts tsx js kt swift py sql","package_managers":"pnpm (apps/web), npm (services/graph), dotnet (apps/windows), gradle (apps/android), swift (apps/mac)"}'::jsonb,
  '{}'::jsonb,
  '{"kind":"vercel-on-merge","detail":"Graph y el portal se despliegan solos al mergear a main (vercel-desplegar.yml, con prueba de humo y rollback). Preview por PR: comprobar en web-ci.yml / Vercel."}'::jsonb,
  '[
    {"subdir":"apps/web","name":"Miracle Notes (portal clínico)","platform":null,"commands":{"install":"pnpm install --frozen-lockfile","dev":"pnpm dev","test":"pnpm test","lint":"pnpm lint","typecheck":"pnpm typecheck","build":"pnpm build"},"graphify":true},
    {"subdir":"services/graph","name":"Graph (cerebro: API, LLM, memoria, Provider Studio)","platform":null,"commands":{"install":"npm ci","test":"npm test","test_privacy":"npm run test:privacy","test_evals":"npm run test:evals","build":"npm run build:vercel"},"graphify":true},
    {"subdir":"apps/windows","name":"Ü Windows (C# .NET 8 WPF, SAP GUI)","platform":"win32","commands":{"test":"dotnet test","build":"dotnet build"},"graphify":false},
    {"subdir":"apps/mac","name":"Ü Mac (Swift)","platform":"darwin","commands":{},"graphify":false},
    {"subdir":"apps/android","name":"Ü Android (Kotlin, Gradle)","platform":null,"commands":{"test":"./gradlew test","build":"./gradlew assembleDebug"},"graphify":false}
  ]'::jsonb,
  true, true,
  'Convenciones del repo: ramas <persona>/<que-hace> desde main fresco (la oficina usa oficina/<slug>); commits "tipo(ámbito): resultado en español y minúscula"; main solo por PR con squash; portero: git config core.hooksPath .githooks; trabajar desde la carpeta del proyecto (subdir); Windows solo desde Windows y Mac solo desde Mac; graphify-out/ no se versiona. Datos clínicos: sí (Miracle Notes, Graph).'
)
on conflict (slug) do update set
  name = excluded.name, remote_url = excluded.remote_url, branch_prefix = excluded.branch_prefix,
  stack = excluded.stack, staging = excluded.staging, subprojects = excluded.subprojects,
  sensitive_data = excluded.sensitive_data, notes = excluded.notes;

-- Miracle (notas contextualizadas con voz, runtime OpenClaw) — repo Python aparte
insert into repos (slug, name, remote_url, default_branch, production_branch, branch_prefix, stack, commands, staging, graphify_enabled, sensitive_data, notes)
values (
  'miracle-ai',
  'Miracle (notas contextualizadas, voz, OpenClaw)',
  'https://github.com/joseph1356k/Miracle-AI',
  'main', 'main',
  'mission/',
  '{"languages":"py","package_manager":"uv","runtime":"OpenClaw upstream, Deepgram"}'::jsonb,
  '{"install":"uv sync --extra dev","dev":"PYTHONPATH=src python -m miracle_agent notes --host 127.0.0.1 --port 8765","test":"pytest"}'::jsonb,
  '{"kind":"manual","detail":"app local; sin staging conocido"}'::jsonb,
  true, true,
  'Modular monolith: app/ features/ platform/ integrations/ (OpenClaw, Deepgram). orchestration/ es tooling del equipo, no producto. Rama por defecto: verificar.'
)
on conflict (slug) do update set
  name = excluded.name, remote_url = excluded.remote_url, stack = excluded.stack, commands = excluded.commands,
  staging = excluded.staging, sensitive_data = excluded.sensitive_data, notes = excluded.notes;

-- Bucket de evidencia (Storage)
insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false) on conflict (id) do nothing;
drop policy if exists evidence_team_read on storage.objects;
create policy evidence_team_read on storage.objects for select using (bucket_id = 'evidence' and is_team_member());
drop policy if exists evidence_team_write on storage.objects;
create policy evidence_team_write on storage.objects for insert with check (bucket_id = 'evidence' and is_team_member());
drop policy if exists evidence_team_update on storage.objects;
create policy evidence_team_update on storage.objects for update using (bucket_id = 'evidence' and is_team_member());
