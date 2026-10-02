-- Oficina de desarrollo con IA — esquema inicial (Supabase / Postgres 15+)
-- Validado en PostgreSQL 16 el 1 de octubre de 2026 (ver docs/01-INVENTARIO.md).
-- Aplicar en el proyecto `oficina-ia` (NUNCA en el proyecto del producto):
--   supabase db push   (o pegar en el editor SQL del dashboard de Supabase)
--
-- Convenciones: ids text con prefijo (m_, ex_, tk_...), timestamps UTC, estados como enums,
-- RLS para miembros del equipo, RPCs para operaciones con concurrencia.

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------
do $$ begin
  create type mission_status as enum (
    'draft','queued','claimed','preparing','running','waiting_answer','paused','paused_quota',
    'blocked','review','changes_requested','staging','approved','released','verified','regressed',
    'orphaned','failed','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type mission_kind as enum ('feature','bugfix','inventory','triage','verify','research','epic');
exception when duplicate_object then null; end $$;

do $$ begin
  create type executor_status as enum ('offline','online','busy','quota_exhausted','error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type billing_mode as enum ('subscription','api_key','unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_source as enum ('feedback','logs','alert','improvement','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('new','triaged','mission_proposed','mission_created','ignored','resolved','verified','regressed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type severity as enum ('critical','high','medium','low','unknown');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Utilidades
-- ----------------------------------------------------------------------------
create or replace function gen_prefixed_id(prefix text) returns text
language sql volatile as $$
  select prefix || '_' || encode(gen_random_bytes(4), 'hex');
$$;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- Equipo y acceso
-- ----------------------------------------------------------------------------
create table if not exists team_members (
  email       text primary key,
  display_name text,
  role        text not null default 'developer' check (role in ('owner','developer','viewer')),
  created_at  timestamptz not null default now()
);

create or replace function is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where email = auth.email());
$$;

-- security definer: evita la recursión infinita de una política de team_members que consulte team_members
create or replace function is_team_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where email = auth.email() and role = 'owner');
$$;

-- Llamadas desde la API (PostgREST pone request.jwt.claims) exigen ser miembro del equipo.
-- Llamadas internas (pg_cron, psql, triggers sin petición) pasan.
create or replace function assert_team_caller() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' and not is_team_member() then
    raise exception 'no autorizado: % no es miembro del equipo', coalesce(auth.email(), 'anónimo') using errcode = '42501';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Repositorios
-- ----------------------------------------------------------------------------
create table if not exists repos (
  id                 text primary key default gen_prefixed_id('repo'),
  slug               text not null unique,
  name               text not null,
  remote_url         text not null,
  default_branch     text not null default 'main',
  production_branch  text not null default 'main',
  stack              jsonb not null default '{}'::jsonb,      -- {package_manager, frameworks, languages,...}
  commands           jsonb not null default '{}'::jsonb,      -- {install, dev, test, lint, typecheck, build, e2e}
  commands_verified  boolean not null default false,
  staging            jsonb not null default '{"kind":"unknown"}'::jsonb, -- {kind: vercel-preview|vercel-env|supabase-branch|manual|none, ...}
  branch_prefix      text not null default 'mission/',                 -- p.ej. 'oficina/' en repos con convención <persona>/<que-hace>
  subprojects        jsonb not null default '[]'::jsonb,               -- monorepos: [{subdir, name, platform, commands, graphify}]
  graphify_enabled   boolean not null default true,
  sensitive_data     boolean not null default false,          -- datos clínicos u otros datos sensibles
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger repos_updated_at before update on repos for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Ejecutores (computadores del equipo)
-- ----------------------------------------------------------------------------
create table if not exists executors (
  id              text primary key default gen_prefixed_id('ex'),
  owner_email     text not null references team_members(email) on delete cascade,
  hostname        text not null,
  platform        text,                                        -- darwin | linux | win32 (lo que puede verificar esta máquina)
  status          executor_status not null default 'offline',
  billing         billing_mode not null default 'unknown',
  billing_detail  text,                                        -- lo que reporte accountInfo(), sin secretos
  providers       jsonb not null default '["claude"]'::jsonb,
  max_parallel    int not null default 1 check (max_parallel between 1 and 8),
  monthly_budget_usd numeric(10,2),                            -- solo aplica con api_key
  quota_reset_at  timestamptz,
  version         text,
  last_heartbeat  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_email, hostname)
);
create trigger executors_updated_at before update on executors for each row execute function set_updated_at();

create table if not exists executor_repos (
  executor_id  text not null references executors(id) on delete cascade,
  repo_id      text not null references repos(id) on delete cascade,
  local_path   text not null,
  primary key (executor_id, repo_id)
);

-- ----------------------------------------------------------------------------
-- Misiones
-- ----------------------------------------------------------------------------
create table if not exists missions (
  id                 text primary key default gen_prefixed_id('m'),
  repo_id            text not null references repos(id),
  parent_mission_id  text references missions(id),
  kind               mission_kind not null default 'feature',
  subdir             text,                                     -- monorepos: carpeta del proyecto (apps/web, services/graph...)
  required_platform  text check (required_platform in ('darwin','linux','win32')), -- solo ejecutores de esa plataforma
  base_branch        text,                                     -- rama base (null = default_branch del repo; las hijas usan la rama del padre)
  depends_on         text[] not null default '{}',             -- misiones que deben estar en review o más allá antes de reclamar esta
  plan               text,                                     -- plan del tech lead (M1)
  spec_path          text,                                     -- docs/specs/<slug>.md en funcionalidades complejas
  require_plan_approval boolean not null default false,        -- gate humano sobre el plan antes de implementar
  require_review     boolean not null default false,           -- fuerza la revisión automática independiente (M9)
  auto_queue_children boolean not null default true,           -- las sub-misiones creadas por el lead nacen en cola (si no, en borrador)
  executor_checks    jsonb,                                    -- verificación independiente del ejecutor (M7)
  review             jsonb,                                    -- veredicto del revisor automático (M9)
  ci                 jsonb,                                    -- estado de CI del PR (M6)
  title              text not null,
  goal               text not null,
  acceptance         jsonb not null default '[]'::jsonb,
  decisions          jsonb not null default '[]'::jsonb,
  priority           int not null default 50 check (priority between 0 and 100), -- mayor = antes
  status             mission_status not null default 'draft',
  status_reason      text,
  level              text check (level in ('N0','N1','N2','N3')),
  risk               severity,
  provider           text not null default 'claude',
  model              text,
  billing            billing_mode,
  branch             text,
  base_sha           text,
  head_sha           text,
  pr_url             text,
  executor_id        text references executors(id),
  preferred_executor_id text references executors(id),
  session_id         text,
  attempt            int not null default 0,
  max_budget_usd     numeric(10,2),
  max_turns          int,
  cost_usd           numeric(10,4) not null default 0,
  result             jsonb,                                    -- informe final (mission-result.schema.json)
  result_verified    boolean,                                  -- evidencia cruzada OK
  unverified_tests   jsonb not null default '[]'::jsonb,
  approved_sha       text,
  approved_by        text,
  approved_at        timestamptz,
  released_at        timestamptz,
  verified_at        timestamptz,
  labels             text[] not null default '{}',
  created_by         text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  claimed_at         timestamptz,
  started_at         timestamptz,
  finished_at        timestamptz
);
create index if not exists missions_status_idx on missions(status, priority desc, created_at);
create index if not exists missions_repo_idx on missions(repo_id);
create index if not exists missions_executor_idx on missions(executor_id);
create trigger missions_updated_at before update on missions for each row execute function set_updated_at();

create table if not exists mission_messages (
  id          bigserial primary key,
  mission_id  text not null references missions(id) on delete cascade,
  role        text not null check (role in ('user','lead','system')),
  content     text not null,
  author      text,
  created_at  timestamptz not null default now()
);
create index if not exists mission_messages_idx on mission_messages(mission_id, created_at);

create table if not exists mission_events (
  id          bigserial primary key,
  mission_id  text not null references missions(id) on delete cascade,
  ts          timestamptz not null default now(),
  type        text not null,          -- init|text|tool_use|tool_result|subagent_start|subagent_stop|commit|push|question|answer|api_retry|result|error|status
  agent       text,                   -- tech-lead|memoria-contexto|...
  payload     jsonb not null default '{}'::jsonb
);
create index if not exists mission_events_idx on mission_events(mission_id, ts);

create table if not exists questions (
  id          text primary key default gen_prefixed_id('q'),
  mission_id  text not null references missions(id) on delete cascade,
  session_id  text,
  tool_use_id text,
  questions   jsonb not null,         -- payload original de AskUserQuestion
  answers     jsonb,                  -- {"<pregunta>": "<respuesta>"}
  response    text,                   -- respuesta libre opcional
  status      text not null default 'open' check (status in ('open','answered','expired','cancelled')),
  asked_at    timestamptz not null default now(),
  answered_at timestamptz,
  answered_by text
);
create index if not exists questions_open_idx on questions(mission_id) where status = 'open';

create table if not exists evidence (
  id           bigserial primary key,
  mission_id   text not null references missions(id) on delete cascade,
  evidence_id  text not null,         -- ev_<ts>_<hex>
  label        text,
  command      text,
  exit_code    int,
  duration_ms  int,
  storage_path text,                  -- bucket evidence/<mission>/<evidence_id>.log
  summary      text,
  created_at   timestamptz not null default now(),
  unique (mission_id, evidence_id)
);

create table if not exists decisions (
  id          text primary key default gen_prefixed_id('d'),
  mission_id  text references missions(id) on delete set null,
  repo_id     text references repos(id),
  scope       text not null check (scope in ('mission','shared')),
  text        text not null,
  rationale   text,
  status      text not null default 'proposed' check (status in ('proposed','accepted','rejected','superseded')),
  adr_path    text,
  decided_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger decisions_updated_at before update on decisions for each row execute function set_updated_at();

-- Aprendizajes verificados (con evidencia y procedencia) que los agentes registran vía la herramienta oficina.learning_record
create table if not exists learnings (
  id          text primary key default gen_prefixed_id('lr'),
  mission_id  text references missions(id) on delete set null,
  repo_id     text references repos(id),
  scope       text not null default 'repo' check (scope in ('repo','area','team')),
  area        text,
  text        text not null,
  evidence    text not null,
  recorded_by text,
  created_at  timestamptz not null default now()
);
create index if not exists learnings_repo_idx on learnings(repo_id, created_at desc);

create table if not exists approvals (
  id           text primary key default gen_prefixed_id('ap'),
  mission_id   text not null references missions(id) on delete cascade,
  sha          text not null,
  environment  text not null check (environment in ('staging','production')),
  approved_by  text not null,
  approved_at  timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidated_reason text,
  notes        text
);
create index if not exists approvals_mission_idx on approvals(mission_id, approved_at desc);

create table if not exists operations (
  id               text primary key default gen_prefixed_id('op'),
  mission_id       text not null references missions(id) on delete cascade,
  kind             text not null check (kind in ('pr','deploy','release','comment','merge')),
  idempotency_key  text not null unique,   -- mission:<id>:<kind>[:<n>]
  external_id      text,
  url              text,
  status           text not null default 'pending' check (status in ('pending','done','failed')),
  payload          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger operations_updated_at before update on operations for each row execute function set_updated_at();

create table if not exists usage_ledger (
  id            bigserial primary key,
  executor_id   text references executors(id) on delete set null,
  mission_id    text references missions(id) on delete set null,
  session_id    text,
  provider      text not null,
  billing       billing_mode not null,
  model         text,
  cost_usd      numeric(10,4),
  input_tokens  bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint,
  num_turns     int,
  ts            timestamptz not null default now()
);
create index if not exists usage_ledger_mission_idx on usage_ledger(mission_id);

-- ----------------------------------------------------------------------------
-- Producción: tickets y alertas
-- ----------------------------------------------------------------------------
create table if not exists tickets (
  id                 text primary key default gen_prefixed_id('tk'),
  source             ticket_source not null,
  repo_id            text references repos(id),
  service            text,
  symptom            text not null,              -- saneado (sin PII)
  raw_private        text,                       -- texto original, solo humanos (nunca a agentes)
  version            text,
  evidence           jsonb not null default '{}'::jsonb,  -- agregados, rutas, hashes de stack, conteos
  severity           severity not null default 'unknown',
  fingerprint        text not null,
  count              int not null default 1,
  duplicate_of       text references tickets(id),
  status             ticket_status not null default 'new',
  resolution_criteria text,
  mission_id         text references missions(id),
  needs_human        boolean not null default false,
  injection_suspected boolean not null default false,
  pii_suspected      boolean not null default false,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists tickets_fingerprint_idx on tickets(fingerprint) where duplicate_of is null;
create index if not exists tickets_status_idx on tickets(status, severity);
create trigger tickets_updated_at before update on tickets for each row execute function set_updated_at();

create table if not exists alerts (
  id            text primary key default gen_prefixed_id('al'),
  repo_id       text references repos(id),
  rule          text not null,                   -- http_5xx_rate|unhandled_exception|healthcheck_down|...
  fingerprint   text not null,
  window_start  timestamptz not null,            -- ventana de deduplicación (p.ej. truncada a 15 min)
  payload       jsonb not null default '{}'::jsonb,
  count         int not null default 1,
  fired_at      timestamptz not null default now(),
  notified_at   timestamptz,
  acknowledged_by text,
  acknowledged_at timestamptz,
  ticket_id     text references tickets(id),
  unique (rule, fingerprint, window_start)
);

-- ----------------------------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------------------------

-- Reclama la siguiente misión elegible para un ejecutor. Devuelve la fila o nada.
-- Reglas: ejecutor online con capacidad; repo autorizado para el ejecutor; prioridad desc, antigüedad;
-- preferencia por misiones que ya estuvieron en este ejecutor (waiting_answer → queued).
create or replace function claim_mission(p_executor_id text)
returns missions
language plpgsql security definer set search_path = public as $$
declare
  v_exec executors%rowtype;
  v_running int;
  v_mission missions%rowtype;
begin
  perform assert_team_caller();
  select * into v_exec from executors where id = p_executor_id for update;
  if not found then raise exception 'executor % no existe', p_executor_id; end if;
  if v_exec.owner_email is distinct from auth.email() and not is_team_owner()
     and coalesce(current_setting('request.jwt.claims', true), '') <> '' then
    raise exception 'no autorizado para reclamar con este ejecutor';
  end if;
  if v_exec.status in ('quota_exhausted','error','offline') then return null; end if;

  select count(*) into v_running from missions
   where executor_id = p_executor_id and status in ('claimed','preparing','running');
  if v_running >= v_exec.max_parallel then return null; end if;

  select m.* into v_mission
    from missions m
    join executor_repos er on er.repo_id = m.repo_id and er.executor_id = p_executor_id
   where m.status = 'queued'
     and (m.required_platform is null or m.required_platform = v_exec.platform)
     and not exists (
       select 1 from unnest(m.depends_on) d(id)
       left join missions dm on dm.id = d.id
       where dm.id is null or dm.status not in ('review','staging','approved','released','verified')
     )
     -- una sub-misión no se reclama mientras la sesión del padre sigue activa (su rama base aún no está empujada)
     and (m.parent_mission_id is null or exists (
       select 1 from missions p where p.id = m.parent_mission_id and p.status not in ('claimed','preparing','running')
     ))
     and (m.preferred_executor_id is null or m.preferred_executor_id = p_executor_id
          or m.updated_at < now() - interval '10 minutes')  -- la preferencia caduca
   order by coalesce(m.preferred_executor_id = p_executor_id, false) desc, m.priority desc, m.created_at asc
   limit 1
   for update of m skip locked;
  if not found then return null; end if;

  update missions
     set status = 'claimed', executor_id = p_executor_id, claimed_at = now(), status_reason = null,
         attempt = attempt + 1
   where id = v_mission.id
   returning * into v_mission;

  insert into mission_events(mission_id, type, payload)
  values (v_mission.id, 'status', jsonb_build_object('status','claimed','executor_id',p_executor_id,'attempt',v_mission.attempt));

  update executors set status = 'busy' where id = p_executor_id;
  return v_mission;
end $$;

-- Latido del ejecutor (y de la misión activa, si la hay)
create or replace function heartbeat(p_executor_id text, p_mission_id text default null, p_status executor_status default 'online')
returns void
language plpgsql security definer set search_path = public as $$
begin
  update executors
     set last_heartbeat = now(),
         status = case when p_status = 'online' and exists (select 1 from missions where executor_id = p_executor_id and status in ('claimed','preparing','running')) then 'busy' else p_status end
   where id = p_executor_id and (owner_email = auth.email() or is_team_owner());
  if p_mission_id is not null then
    update missions set updated_at = now() where id = p_mission_id and executor_id = p_executor_id;
  end if;
end $$;

-- Transición de estado con validación y evento. El ejecutor y el dashboard usan esta función, no UPDATE directo.
create or replace function transition_mission(p_mission_id text, p_to mission_status, p_reason text default null, p_patch jsonb default '{}'::jsonb)
returns missions
language plpgsql security definer set search_path = public as $$
declare
  v_from mission_status;
  v_ok boolean := false;
  v_row missions%rowtype;
begin
  perform assert_team_caller();
  select status into v_from from missions where id = p_mission_id for update;
  if not found then raise exception 'misión % no existe', p_mission_id; end if;

  v_ok := case
    when p_to = 'cancelled' then v_from not in ('released','verified','cancelled')
    when v_from = 'draft'            then p_to in ('queued')
    when v_from = 'queued'           then p_to in ('claimed','draft','paused')
    when v_from = 'claimed'          then p_to in ('preparing','running','orphaned','failed','queued')
    when v_from = 'preparing'        then p_to in ('running','failed','orphaned','blocked')
    when v_from = 'running'          then p_to in ('waiting_answer','paused','paused_quota','blocked','review','failed','orphaned')
    when v_from = 'waiting_answer'   then p_to in ('queued','running','cancelled','paused')
    when v_from = 'paused'           then p_to in ('queued')
    when v_from = 'paused_quota'     then p_to in ('queued')
    when v_from = 'blocked'          then p_to in ('queued')
    when v_from = 'review'           then p_to in ('changes_requested','staging','approved','queued')
    when v_from = 'changes_requested' then p_to in ('queued')
    when v_from = 'staging'          then p_to in ('approved','changes_requested','review')
    when v_from = 'approved'         then p_to in ('released','review')
    when v_from = 'released'         then p_to in ('verified','regressed')
    when v_from = 'orphaned'         then p_to in ('queued','failed')
    when v_from = 'failed'           then p_to in ('queued','blocked')
    when v_from = 'regressed'        then p_to in ('queued')
    else false end;
  if not v_ok then raise exception 'transición inválida % → %', v_from, p_to; end if;

  update missions m
     set status = p_to,
         status_reason = p_reason,
         head_sha      = coalesce(p_patch->>'head_sha', m.head_sha),
         session_id    = coalesce(p_patch->>'session_id', m.session_id),
         branch        = coalesce(p_patch->>'branch', m.branch),
         base_sha      = coalesce(p_patch->>'base_sha', m.base_sha),
         pr_url        = coalesce(p_patch->>'pr_url', m.pr_url),
         model         = coalesce(p_patch->>'model', m.model),
         billing       = coalesce((p_patch->>'billing')::billing_mode, m.billing),
         level         = coalesce(p_patch->>'level', m.level),
         risk          = coalesce((p_patch->>'risk')::severity, m.risk),
         result        = coalesce(p_patch->'result', m.result),
         result_verified = coalesce((p_patch->>'result_verified')::boolean, m.result_verified),
         unverified_tests = coalesce(p_patch->'unverified_tests', m.unverified_tests),
         cost_usd      = coalesce((p_patch->>'cost_usd')::numeric, m.cost_usd),
         acceptance    = coalesce(p_patch->'acceptance', m.acceptance),
         decisions     = coalesce(p_patch->'decisions', m.decisions),
         plan          = coalesce(p_patch->>'plan', m.plan),
         executor_checks = coalesce(p_patch->'executor_checks', m.executor_checks),
         review        = coalesce(p_patch->'review', m.review),
         ci            = coalesce(p_patch->'ci', m.ci),
         executor_id   = case when p_to in ('queued','orphaned','draft') then null else m.executor_id end,
         preferred_executor_id = case when p_to = 'queued' and v_from in ('waiting_answer','paused_quota','paused') then coalesce(m.executor_id, m.preferred_executor_id) else m.preferred_executor_id end,
         started_at    = case when p_to = 'running' and m.started_at is null then now() else m.started_at end,
         finished_at   = case when p_to in ('review','blocked','failed','cancelled') then now() else m.finished_at end,
         released_at   = case when p_to = 'released' then now() else m.released_at end,
         verified_at   = case when p_to = 'verified' then now() else m.verified_at end
   where id = p_mission_id
   returning * into v_row;

  insert into mission_events(mission_id, type, payload)
  values (p_mission_id, 'status', jsonb_build_object('from', v_from, 'to', p_to, 'reason', p_reason));
  return v_row;
end $$;

-- Marca huérfanas las misiones cuyo ejecutor no late hace más de 2 minutos y las re-encola.
create or replace function mark_orphans() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record;
begin
  for r in
    select m.id from missions m join executors e on e.id = m.executor_id
     where m.status in ('claimed','preparing','running')
       and (e.last_heartbeat is null or e.last_heartbeat < now() - interval '2 minutes')
  loop
    perform transition_mission(r.id, 'orphaned', 'sin latido del ejecutor > 2 min');
    perform transition_mission(r.id, 'queued', 'reencolada tras orfandad; retomar desde la rama');
    v_n := v_n + 1;
  end loop;
  update executors set status = 'offline'
   where status in ('online','busy') and (last_heartbeat is null or last_heartbeat < now() - interval '2 minutes');
  return v_n;
end $$;

-- Aprobación atada al SHA: solo si coincide con head_sha actual.
create or replace function approve_mission(p_mission_id text, p_sha text, p_environment text default 'production', p_notes text default null)
returns approvals
language plpgsql security definer set search_path = public as $$
declare v_head text; v_row approvals%rowtype;
begin
  if not is_team_member() then raise exception 'no autorizado'; end if;
  select head_sha into v_head from missions where id = p_mission_id for update;
  if v_head is null or v_head <> p_sha then
    raise exception 'el SHA aprobado (%) no coincide con el head actual (%)', p_sha, coalesce(v_head,'null');
  end if;
  insert into approvals(mission_id, sha, environment, approved_by, notes)
  values (p_mission_id, p_sha, p_environment, auth.email(), p_notes) returning * into v_row;
  update missions set approved_sha = p_sha, approved_by = auth.email(), approved_at = now() where id = p_mission_id;
  perform transition_mission(p_mission_id, 'approved', 'aprobado ' || p_sha);
  return v_row;
end $$;

-- Un push posterior a la aprobación la invalida.
create or replace function invalidate_approvals_on_push() returns trigger
language plpgsql as $$
begin
  if new.head_sha is distinct from old.head_sha and old.approved_sha is not null and new.head_sha <> old.approved_sha then
    update approvals set invalidated_at = now(), invalidated_reason = 'nuevo push ' || new.head_sha
     where mission_id = new.id and invalidated_at is null;
    new.approved_sha := null; new.approved_by := null; new.approved_at := null;
    if old.status = 'approved' then
      new.status := 'review';
      new.status_reason := 'aprobación invalidada por push ' || new.head_sha;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists missions_invalidate_approvals on missions;
create trigger missions_invalidate_approvals before update of head_sha on missions
for each row execute function invalidate_approvals_on_push();

-- Sub-misiones: cuando la última hija llega a revisión (o más allá), la misión padre bloqueada "esperando sub-misiones" vuelve a la cola para integrar.
create or replace function requeue_parent_when_children_done() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_parent missions%rowtype; v_pending int;
begin
  if new.parent_mission_id is null or new.status not in ('review','staging','approved','released','verified') then return new; end if;
  select * into v_parent from missions where id = new.parent_mission_id for update;
  if not found or v_parent.status <> 'blocked' then return new; end if;
  select count(*) into v_pending from missions
   where parent_mission_id = v_parent.id and status not in ('review','staging','approved','released','verified','cancelled');
  if v_pending = 0 then
    perform transition_mission(v_parent.id, 'queued', 'sub-misiones listas: integrar y verificar la spec');
    update missions set preferred_executor_id = coalesce(v_parent.executor_id, v_parent.preferred_executor_id) where id = v_parent.id;
  end if;
  return new;
end $$;
drop trigger if exists missions_requeue_parent on missions;
create trigger missions_requeue_parent after update of status on missions
for each row when (new.parent_mission_id is not null) execute function requeue_parent_when_children_done();

-- Ingesta de ticket con deduplicación por huella (count++ si ya existe en 7 días)
create or replace function upsert_ticket(p_source ticket_source, p_repo_slug text, p_service text, p_symptom text, p_raw text,
                                         p_version text, p_evidence jsonb, p_severity severity, p_fingerprint text)
returns tickets
language plpgsql security definer set search_path = public as $$
declare v_repo text; v_row tickets%rowtype;
begin
  select id into v_repo from repos where slug = p_repo_slug;
  select * into v_row from tickets
   where fingerprint = p_fingerprint and duplicate_of is null and last_seen_at > now() - interval '7 days'
   order by created_at desc limit 1 for update;
  if found then
    update tickets set count = count + 1, last_seen_at = now(),
           evidence = coalesce(p_evidence, evidence),
           severity = least(severity, p_severity)  -- el enum declara critical primero: least = más severo
     where id = v_row.id returning * into v_row;
    return v_row;
  end if;
  insert into tickets(source, repo_id, service, symptom, raw_private, version, evidence, severity, fingerprint)
  values (p_source, v_repo, p_service, p_symptom, p_raw, p_version, coalesce(p_evidence,'{}'::jsonb), p_severity, p_fingerprint)
  returning * into v_row;
  return v_row;
end $$;

-- Alerta deduplicada por regla+huella+ventana de 15 min
create or replace function fire_alert(p_repo_slug text, p_rule text, p_fingerprint text, p_payload jsonb)
returns alerts
language plpgsql security definer set search_path = public as $$
declare v_repo text; v_row alerts%rowtype; v_window timestamptz;
begin
  select id into v_repo from repos where slug = p_repo_slug;
  v_window := date_trunc('hour', now()) + (floor(extract(minute from now()) / 15) * interval '15 minutes');
  insert into alerts(repo_id, rule, fingerprint, window_start, payload)
  values (v_repo, p_rule, p_fingerprint, v_window, coalesce(p_payload,'{}'::jsonb))
  on conflict (rule, fingerprint, window_start) do update set count = alerts.count + 1, payload = excluded.payload
  returning * into v_row;
  return v_row;
end $$;

-- Encola una misión de triage si hay tickets nuevos y no hay triage pendiente (lo llama el cron cada 3 h)
create or replace function enqueue_triage_if_needed(p_repo_slug text, p_created_by text default 'cron')
returns text
language plpgsql security definer set search_path = public as $$
declare v_repo text; v_new int; v_id text;
begin
  perform assert_team_caller();
  select id into v_repo from repos where slug = p_repo_slug;
  if v_repo is null then return null; end if;
  select count(*) into v_new from tickets where repo_id = v_repo and status = 'new';
  if v_new = 0 then return null; end if;
  if exists (select 1 from missions where repo_id = v_repo and kind = 'triage' and status in ('queued','claimed','preparing','running','waiting_answer')) then
    return null;
  end if;
  insert into missions(repo_id, kind, title, goal, priority, status, created_by, acceptance)
  values (v_repo, 'triage', 'Triage de producción', 'Clasificar, agrupar y priorizar ' || v_new || ' tickets nuevos y proponer misiones en borrador',
          70, 'queued', p_created_by, '["triage-result.json producido","tickets actualizados","propuestas en draft"]'::jsonb)
  returning id into v_id;
  return v_id;
end $$;

-- ----------------------------------------------------------------------------
-- Vistas de métricas y capacidad
-- ----------------------------------------------------------------------------
-- Vistas con security_invoker: respetan la RLS de quien consulta (si no, la clave anónima las leería con privilegios del dueño)
create or replace view mission_metrics with (security_invoker = true) as
select
  m.id, m.repo_id, m.kind, m.status, m.level, m.risk, m.attempt, m.cost_usd, m.result_verified,
  m.created_at, m.claimed_at, m.started_at, m.finished_at, m.released_at, m.verified_at,
  extract(epoch from (m.finished_at - m.created_at))/3600.0 as hours_to_result,
  (select coalesce(sum(extract(epoch from (coalesce(q.answered_at, now()) - q.asked_at))),0)/3600.0 from questions q where q.mission_id = m.id) as hours_waiting_answers,
  (select count(*) from questions q where q.mission_id = m.id) as questions_count,
  (select count(*) from tickets t where t.mission_id = m.id and t.status = 'regressed') as regressions,
  (select count(*) from mission_events e where e.mission_id = m.id and e.type = 'subagent_start') as subagents_launched
from missions m;

create or replace view executor_capacity with (security_invoker = true) as
select e.id, e.owner_email, e.hostname, e.status, e.billing, e.max_parallel, e.last_heartbeat,
       (select count(*) from missions m where m.executor_id = e.id and m.status in ('claimed','preparing','running')) as active_missions,
       e.max_parallel - (select count(*) from missions m where m.executor_id = e.id and m.status in ('claimed','preparing','running')) as free_slots
from executors e;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table team_members enable row level security;
alter table repos enable row level security;
alter table executors enable row level security;
alter table executor_repos enable row level security;
alter table missions enable row level security;
alter table mission_messages enable row level security;
alter table mission_events enable row level security;
alter table questions enable row level security;
alter table evidence enable row level security;
alter table decisions enable row level security;
alter table learnings enable row level security;
alter table approvals enable row level security;
alter table operations enable row level security;
alter table usage_ledger enable row level security;
alter table tickets enable row level security;
alter table alerts enable row level security;

-- Miembros del equipo: lectura total; escritura total salvo lo indicado.
do $$
declare t text;
begin
  foreach t in array array['repos','executor_repos','missions','mission_messages','mission_events','questions','evidence','decisions','learnings','approvals','operations','usage_ledger','alerts']
  loop
    execute format('drop policy if exists team_all on %I', t);
    execute format('create policy team_all on %I for all using (is_team_member()) with check (is_team_member())', t);
  end loop;
end $$;

drop policy if exists team_read on team_members;
create policy team_read on team_members for select using (is_team_member());
drop policy if exists owners_write on team_members;
create policy owners_write on team_members for all using (is_team_owner()) with check (is_team_owner());

-- Ejecutores: lectura para el equipo; escritura solo del dueño (u owner) y siempre de un miembro
drop policy if exists executors_read on executors;
create policy executors_read on executors for select using (is_team_member());
drop policy if exists executors_write on executors;
create policy executors_write on executors for all
  using (is_team_member() and (owner_email = auth.email() or is_team_owner()))
  with check (is_team_member() and (owner_email = auth.email() or is_team_owner()));

-- Tickets: el texto crudo (raw_private) no se expone a través de la vista que usan los agentes
drop policy if exists tickets_team on tickets;
create policy tickets_team on tickets for all using (is_team_member()) with check (is_team_member());

create or replace view tickets_sanitized with (security_invoker = true) as
select id, source, repo_id, service, symptom, version, evidence, severity, fingerprint, count, duplicate_of, status,
       resolution_criteria, mission_id, needs_human, injection_suspected, pii_suspected, first_seen_at, last_seen_at
from tickets;

-- ----------------------------------------------------------------------------
-- Realtime (publicación) y cron
-- ----------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table missions; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table mission_events; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table mission_messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table questions; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table executors; exception when duplicate_object then null; end;
  end if;
end $$;

-- pg_cron (disponible en Supabase; en local puede no existir)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('oficina_mark_orphans', '* * * * *', $cron$ select mark_orphans(); $cron$);
    -- triage cada 3 horas: solo encola una misión (sin modelo en la nube); la ejecuta un ejecutor encendido
    perform cron.schedule('oficina_triage', '0 */3 * * *', $cron$ select enqueue_triage_if_needed(slug, 'cron') from repos; $cron$);
  end if;
exception when others then null; end $$;

-- Bucket de evidencia (Storage). En Supabase:
--   insert into storage.buckets (id, name, public) values ('evidence','evidence', false) on conflict do nothing;
-- y política de lectura/escritura para miembros del equipo sobre storage.objects (bucket_id = 'evidence').

-- ----------------------------------------------------------------------------
-- Permisos de ejecución: nada por defecto para PUBLIC/anon; el equipo usa las RPC que comprueban membresía.
-- Las funciones internas (ingesta, alertas, orfandad, triggers) solo las llaman otras funciones, pg_cron o el dueño.
-- ----------------------------------------------------------------------------
do $$
declare f text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then return; end if;
  execute 'revoke execute on all functions in schema public from public, anon, authenticated';
  -- usadas por políticas RLS (se evalúan con el rol que consulta)
  foreach f in array array['is_team_member()', 'is_team_owner()', 'assert_team_caller()'] loop
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  -- API del equipo (cada una comprueba membresía o propiedad)
  foreach f in array array[
    'claim_mission(text)', 'heartbeat(text, text, executor_status)',
    'transition_mission(text, mission_status, text, jsonb)', 'approve_mission(text, text, text, text)',
    'enqueue_triage_if_needed(text, text)', 'gen_prefixed_id(text)'] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
