-- Smoke test del esquema en Postgres local (simula auth.email() de Supabase con un GUC)
\set ON_ERROR_STOP on
drop database if exists oficina_test;
create database oficina_test;
\connect oficina_test
create schema if not exists auth;
create or replace function auth.email() returns text language sql stable as $$ select current_setting('app.email', true) $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
-- roles de Supabase (para probar RLS y permisos como lo hace PostgREST)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
\i :migration
\i :migration2
grant usage on schema public, auth to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- datos
set app.email = 'dev@itsmiracleai.com';
insert into team_members(email, role) values ('dev@itsmiracleai.com','owner'), ('otro@itsmiracleai.com','developer');
insert into repos(slug, name, remote_url, default_branch, production_branch, sensitive_data) values ('miracle','Miracle','git@github.com:x/miracle.git','main','main',true);
insert into executors(id, owner_email, hostname, status, billing, max_parallel) values ('ex_1','dev@itsmiracleai.com','mac-dev','online','subscription',1);
insert into executors(id, owner_email, hostname, status, billing, max_parallel) values ('ex_2','otro@itsmiracleai.com','pc-otro','online','subscription',1);
insert into executor_repos select 'ex_1', id, '/Users/dev/repos/miracle' from repos where slug='miracle';
insert into missions(id, repo_id, title, goal, status, created_by, priority) select 'm_1', id, 'Recordar corrección por voz', 'goal', 'queued', 'dev@itsmiracleai.com', 50 from repos where slug='miracle';
insert into missions(id, repo_id, title, goal, status, created_by, priority) select 'm_2', id, 'Bug login', 'goal', 'queued', 'dev@itsmiracleai.com', 90 from repos where slug='miracle';

-- claim: debe tomar m_2 (prioridad 90)
select (claim_mission('ex_1')).id as claimed_1;
do $$ begin
  if (select status from missions where id='m_2') <> 'claimed' then raise exception 'm_2 debería estar claimed'; end if;
  if (select attempt from missions where id='m_2') <> 1 then raise exception 'attempt debería ser 1'; end if;
end $$;
-- capacidad 1: segundo claim devuelve null
do $$ begin
  if (claim_mission('ex_1')) is not null then raise exception 'no debería reclamar con capacidad llena'; end if;
end $$;
-- ex_2 no tiene el repo autorizado: null
set app.email = 'otro@itsmiracleai.com';
do $$ begin
  if (claim_mission('ex_2')) is not null then raise exception 'ex_2 no tiene repos autorizados'; end if;
end $$;
-- otro no puede reclamar con el ejecutor de dev (llamada por la API: request.jwt.claims presente)
set request.jwt.claims = '{"role":"authenticated"}';
do $$ begin
  begin perform claim_mission('ex_1'); raise exception 'debió fallar';
  exception when others then if sqlerrm not like '%no autorizado%' then raise; end if; end;
end $$;
reset request.jwt.claims;
set app.email = 'dev@itsmiracleai.com';

-- transiciones
select (transition_mission('m_2','preparing', null, '{"branch":"mission/m2-bug-login","base_sha":"aaaaaaa"}')).status;
select (transition_mission('m_2','running', null, '{"session_id":"sess-1","model":"opus","billing":"subscription"}')).status;
-- transición inválida
do $$ begin
  begin perform transition_mission('m_2','released'); raise exception 'debió fallar';
  exception when others then if sqlerrm not like '%transición inválida%' then raise; end if; end;
end $$;
-- pregunta diferida → waiting_answer → queued con preferencia por ex_1
insert into questions(mission_id, session_id, tool_use_id, questions) values ('m_2','sess-1','t1','{"questions":[{"question":"¿Qué recordar?","header":"Memoria","options":[{"label":"Texto","description":""},{"label":"Campo","description":""}],"multiSelect":false}]}');
select (transition_mission('m_2','waiting_answer','pregunta sin respuesta en 15 min')).status;
update questions set status='answered', answers='{"¿Qué recordar?":"Campo"}', answered_at=now(), answered_by='dev@itsmiracleai.com' where mission_id='m_2';
select (transition_mission('m_2','queued','respondida')).status;
do $$ begin
  if (select preferred_executor_id from missions where id='m_2') <> 'ex_1' then raise exception 'preferencia por ex_1 esperada'; end if;
  if (select executor_id from missions where id='m_2') is not null then raise exception 'executor_id debería ser null en queued'; end if;
end $$;
-- claim de nuevo prefiere m_2 (preferida) sobre m_1
select (claim_mission('ex_1')).id as claimed_2;
do $$ begin if (select status from missions where id='m_2') <> 'claimed' then raise exception 'm_2 reclamada de nuevo'; end if; end $$;
select (transition_mission('m_2','running')).status;
-- resultado → review con head_sha
select (transition_mission('m_2','review','informe completed', '{"head_sha":"bbbbbbb","result":{"status":"completed"},"result_verified":true,"cost_usd":"1.2345"}')).status;
-- aprobación con SHA correcto
select (approve_mission('m_2','bbbbbbb','production','ok')).sha;
do $$ begin if (select status from missions where id='m_2') <> 'approved' then raise exception 'approved esperado'; end if; end $$;
-- aprobación con SHA incorrecto falla
do $$ begin
  begin perform approve_mission('m_2','ccccccc'); raise exception 'debió fallar';
  exception when others then if sqlerrm not like '%no coincide%' then raise; end if; end;
end $$;
-- push posterior invalida la aprobación y vuelve a review
update missions set head_sha='ccccccc' where id='m_2';
do $$ begin
  if (select status from missions where id='m_2') <> 'review' then raise exception 'review tras push esperado'; end if;
  if (select approved_sha from missions where id='m_2') is not null then raise exception 'approved_sha debería ser null'; end if;
  if (select count(*) from approvals where mission_id='m_2' and invalidated_at is not null) <> 1 then raise exception 'aprobación invalidada esperada'; end if;
end $$;

-- huérfanas: m_1 reclamada por ex_1, latido viejo → orphaned → queued
select (transition_mission('m_2','changes_requested','x')).status; select (transition_mission('m_2','queued','x')).status;
select (claim_mission('ex_1')).id as claimed_3;  -- toma m_2 (preferida) de nuevo
update missions set preferred_executor_id=null where id='m_2';
select (transition_mission('m_2','running')).status;
update executors set last_heartbeat = now() - interval '5 minutes' where id='ex_1';
select mark_orphans() as orphans;
do $$ begin
  if (select status from missions where id='m_2') <> 'queued' then raise exception 'm_2 reencolada tras orfandad'; end if;
  if (select status from executors where id='ex_1') <> 'offline' then raise exception 'ex_1 offline esperado'; end if;
  if (select count(*) from mission_events where mission_id='m_2' and type='status') < 8 then raise exception 'eventos de estado esperados'; end if;
end $$;
select heartbeat('ex_1', null, 'online');
do $$ begin if (select status from executors where id='ex_1') <> 'online' then raise exception 'online esperado'; end if; end $$;

-- tickets: dedupe por huella
select (upsert_ticket('feedback','miracle','web','Fallo al guardar nota','texto crudo con datos','1.2.0','{"route":"/notes"}','high','fp-1')).count as c1;
select (upsert_ticket('feedback','miracle','web','Fallo al guardar nota','otro crudo','1.2.0','{"route":"/notes"}','critical','fp-1')).count as c2;
do $$ begin
  if (select count(*) from tickets where fingerprint='fp-1') <> 1 then raise exception 'un solo ticket esperado'; end if;
  if (select count from tickets where fingerprint='fp-1') <> 2 then raise exception 'count 2 esperado'; end if;
  if (select severity from tickets where fingerprint='fp-1') <> 'critical' then raise exception 'severidad escalada esperada'; end if;
end $$;
-- vista saneada no expone raw_private
do $$ begin
  if exists (select 1 from information_schema.columns where table_name='tickets_sanitized' and column_name='raw_private') then raise exception 'raw_private expuesto'; end if;
end $$;
-- alertas dedupe por ventana
select (fire_alert('miracle','http_5xx_rate','api:/notes','{"rate":0.2}')).count as a1;
select (fire_alert('miracle','http_5xx_rate','api:/notes','{"rate":0.3}')).count as a2;
do $$ begin if (select count(*) from alerts) <> 1 then raise exception 'una alerta esperada'; end if; end $$;
-- triage: encola una vez
select enqueue_triage_if_needed('miracle') as triage_1;
do $$ begin
  if enqueue_triage_if_needed('miracle') is not null then raise exception 'no debería encolar un segundo triage'; end if;
  if (select count(*) from missions where kind='triage' and status='queued') <> 1 then raise exception 'triage encolado esperado'; end if;
end $$;
-- dependencias entre misiones: m_c depende de m_1 (en cola) → no reclamable aunque tenga más prioridad; m_d depende de una inexistente → nunca
update missions set status='draft' where kind='triage';
insert into missions(id, repo_id, title, goal, status, created_by, priority, depends_on) select 'm_c', id, 'hija', 'goal', 'queued', 'dev@itsmiracleai.com', 95, '{m_1}' from repos where slug='miracle';
insert into missions(id, repo_id, title, goal, status, created_by, priority, depends_on) select 'm_d', id, 'rota', 'goal', 'queued', 'dev@itsmiracleai.com', 99, '{m_zzz}' from repos where slug='miracle';
update missions set preferred_executor_id = null where id in ('m_1','m_2');
select (claim_mission('ex_1')).id as claimed_dep;
do $$ begin
  if (select status from missions where id='m_c') <> 'queued' then raise exception 'm_c no debía reclamarse (depende de m_1)'; end if;
  if (select status from missions where id='m_d') <> 'queued' then raise exception 'm_d no debía reclamarse (dependencia inexistente)'; end if;
  if (select status from missions where id in ('m_1','m_2') and status='claimed' limit 1) is null then raise exception 'esperaba reclamar m_1 o m_2'; end if;
end $$;
-- plataforma requerida: solo ejecutores de esa plataforma
update executors set platform='darwin' where id='ex_1';
insert into missions(id, repo_id, title, goal, status, created_by, priority, required_platform) select 'm_w', id, 'windows', 'goal', 'queued', 'dev@itsmiracleai.com', 100, 'win32' from repos where slug='miracle';
update missions set status='cancelled' where id in ('m_1','m_2') and status='claimed';
update executors set status='online' where id='ex_1';
do $$ begin
  if (select id from claim_mission('ex_1')) = 'm_w' then raise exception 'm_w exige win32'; end if;
end $$;
-- aprendizajes
insert into learnings(mission_id, repo_id, scope, text, evidence, recorded_by) select 'm_2', id, 'repo', 'pnpm test tarda 90 s', 'ev_1_aa', 'tech-lead' from repos where slug='miracle';
do $$ begin if (select count(*) from learnings) <> 1 then raise exception 'learning esperado'; end if; end $$;

-- sub-misiones: no reclamables mientras la sesión del padre está activa; al entregarse todas, el padre bloqueado vuelve a la cola
update executors set status='online', last_heartbeat=now() where id in ('ex_1','ex_2');   -- ex_2 quedó offline por mark_orphans (sin latido)
update missions set status='cancelled' where id='m_1' and status='claimed';                   -- libera a ex_1
insert into executor_repos select 'ex_2', id, '/home/otro/miracle' from repos where slug='miracle';
insert into missions(id, repo_id, kind, title, goal, status, created_by, priority, executor_id, branch) select 'm_p', id, 'epic', 'padre', 'goal', 'running', 'dev@itsmiracleai.com', 60, 'ex_1', 'oficina/padre-m_p' from repos where slug='miracle';
insert into missions(id, repo_id, parent_mission_id, title, goal, status, created_by, priority, base_branch) select 'm_h1', id, 'm_p', 'hija 1', 'goal', 'queued', 'tech-lead:m_p', 97, 'oficina/padre-m_p' from repos where slug='miracle';
insert into missions(id, repo_id, parent_mission_id, title, goal, status, created_by, priority, base_branch, depends_on) select 'm_h2', id, 'm_p', 'hija 2', 'goal', 'queued', 'tech-lead:m_p', 96, 'oficina/padre-m_p', '{m_h1}' from repos where slug='miracle';
do $$ begin
  if (select id from claim_mission('ex_2')) is not null then raise exception 'las hijas no se reclaman mientras el padre corre'; end if;
end $$;
select transition_mission('m_p', 'blocked', 'esperando sub-misiones', '{}'::jsonb) is not null as padre_bloqueado;
do $$ declare v text; begin
  select id into v from claim_mission('ex_2');
  if v is distinct from 'm_h1' then raise exception 'esperaba reclamar m_h1 (m_h2 depende de ella), obtuve %', v; end if;
end $$;
update missions set status = 'review' where id = 'm_h1';
do $$ begin
  if (select status from missions where id='m_p') <> 'blocked' then raise exception 'el padre sigue bloqueado mientras falte una hija'; end if;
end $$;
update missions set status = 'review' where id = 'm_h2';
do $$ begin
  if (select status from missions where id='m_p') <> 'queued' then raise exception 'el padre debía volver a la cola'; end if;
  if (select preferred_executor_id from missions where id='m_p') <> 'ex_1' then raise exception 'el padre debía preferir su ejecutor'; end if;
  if (select status_reason from missions where id='m_p') not like 'sub-misiones listas%' then raise exception 'motivo del reencolado esperado'; end if;
end $$;
update executors set status='online' where id='ex_1';
do $$ declare v text; begin
  select id into v from claim_mission('ex_1');
  if v is distinct from 'm_p' then raise exception 'ex_1 debía retomar el padre para integrar, obtuvo %', v; end if;
end $$;

-- seguridad con los roles de la API: miembro autenticado, desconocido autenticado y anónimo
reset role;
set app.email = 'dev@itsmiracleai.com';
set request.jwt.claims = '{"role":"authenticated"}';
set role authenticated;
do $$ begin
  if (select count(*) from team_members) < 1 then raise exception 'el miembro debe ver team_members (sin recursión)'; end if;
  if (select count(*) from executors) < 1 then raise exception 'el miembro debe ver executors'; end if;
  perform * from executor_capacity;
  perform * from mission_metrics;
  perform * from tickets_sanitized;
end $$;
select length(rotate_ingest_token()) > 60 as token_generado \gset
reset role;
-- token conocido para la prueba (rotate_ingest_token solo lo muestra una vez)
update office_secrets set hash = sha256_hex('tok_prueba') where name = 'ingest_token';
set app.email = '';
set request.jwt.claims = '{"role":"anon"}';
set role anon;
do $$ declare v jsonb; begin
  if (select count(*) from missions) <> 0 then raise exception 'anon no debe ver misiones'; end if;
  if (select count(*) from tickets_sanitized) <> 0 then raise exception 'anon no debe ver tickets (vista con security_invoker)'; end if;
  if (select count(*) from executor_capacity) <> 0 then raise exception 'anon no debe ver ejecutores'; end if;
  if (select count(*) from office_secrets) <> 0 then raise exception 'anon no debe ver secretos'; end if;
  begin perform transition_mission('m_p', 'cancelled', 'ataque', '{}'::jsonb); raise exception 'FALLO: anon pudo transicionar';
  exception when insufficient_privilege then null; end;
  begin perform upsert_ticket('feedback', 'miracle', null, 'x', 'x', null, null, 'low', 'fp'); raise exception 'FALLO: anon llamó upsert_ticket';
  exception when insufficient_privilege then null; end;
  begin perform ingest_ticket('malo', 'miracle', null, 'falla', 'falla', null, null, 'high', 'fp_x'); raise exception 'FALLO: token malo aceptado';
  exception when invalid_authorization_specification then null; end;
  v := ingest_ticket('tok_prueba', 'miracle', 'api', 'falla al guardar nota', 'falla al guardar nota', '1.0', '{}'::jsonb, 'high', 'fp_ok');
  v := ingest_ticket('tok_prueba', 'miracle', 'api', 'falla al guardar nota', 'falla al guardar nota', '1.0', '{}'::jsonb, 'critical', 'fp_ok');
  if (v->>'count')::int <> 2 then raise exception 'la ingesta debía deduplicar (count=2), obtuvo %', v; end if;
end $$;
reset role;
set app.email = 'intruso@example.com';
set request.jwt.claims = '{"role":"authenticated"}';
set role authenticated;
do $$ begin
  if (select count(*) from missions) <> 0 then raise exception 'un autenticado ajeno no debe ver misiones'; end if;
  begin perform claim_mission('ex_1'); raise exception 'FALLO: ajeno reclamó';
  exception when insufficient_privilege then null; end;
  begin perform admin_upsert_member('yo@example.com', null, 'owner', null); raise exception 'FALLO: ajeno se dio de alta';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set app.email = 'dev@itsmiracleai.com';
set request.jwt.claims = '{"role":"authenticated"}';
set role authenticated;
do $$ begin
  perform admin_upsert_member('nuevo@itsmiracleai.com', 'Nuevo', 'developer', null);
  if (select role from team_members where email = 'nuevo@itsmiracleai.com') <> 'developer' then raise exception 'alta de miembro esperada'; end if;
  if (select severity from tickets where fingerprint = 'fp_ok') <> 'critical' then raise exception 'la severidad debía escalar a critical'; end if;
end $$;
reset role;
reset request.jwt.claims;

-- métricas
select id, status, hours_to_result is not null as has_hours, questions_count from mission_metrics order by id;
select id, free_slots from executor_capacity order by id;
select 'SMOKE OK' as resultado;
