-- Oficina IA · 0002: operación real sin depender del correo ni de la service role.
--   * Alta de miembros con contraseña inicial (los owners la ponen desde el dashboard; el miembro la cambia en /account).
--   * Registro cerrado: solo pueden existir cuentas de Auth para correos en team_members.
--   * Ingesta de producción con token propio (se guarda solo su hash); la ruta del dashboard usa la clave pública.
-- Idempotente. Requiere 0001_oficina.sql.

-- ----------------------------------------------------------------------------
-- Secretos de la oficina (solo hashes). RLS sin políticas: nadie los lee por la API.
-- ----------------------------------------------------------------------------
create table if not exists office_secrets (
  name        text primary key,
  hash        text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table office_secrets enable row level security;

create or replace function sha256_hex(p text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

-- Genera un token de ingesta nuevo, guarda su hash y lo devuelve UNA vez. Solo owners.
create or replace function rotate_ingest_token() returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_token text;
begin
  if not is_team_owner() then raise exception 'solo un owner puede generar el token de ingesta' using errcode = '42501'; end if;
  v_token := 'ofi_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into office_secrets(name, hash, created_by) values ('ingest_token', sha256_hex(v_token), auth.email())
  on conflict (name) do update set hash = excluded.hash, created_by = excluded.created_by, created_at = now();
  return v_token;
end $$;

create or replace function ingest_token_info() returns table(configured boolean, created_by text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select true, s.created_by, s.created_at from office_secrets s where s.name = 'ingest_token' and is_team_member()
  union all
  select false, null, null where not exists (select 1 from office_secrets where name = 'ingest_token')
  limit 1;
$$;

-- Ingesta pública (la llama /api/ingest/feedback con la clave pública): valida el token y delega en upsert_ticket.
create or replace function ingest_ticket(p_token text, p_repo_slug text, p_service text, p_symptom text, p_raw text,
                                         p_version text, p_evidence jsonb, p_severity text, p_fingerprint text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_hash text; v_row tickets%rowtype; v_sev severity;
begin
  select hash into v_hash from office_secrets where name = 'ingest_token';
  if v_hash is null or p_token is null or sha256_hex(p_token) <> v_hash then
    raise exception 'token de ingesta no válido' using errcode = '28000';
  end if;
  if not exists (select 1 from repos where slug = p_repo_slug) then
    raise exception 'repo desconocido: %', left(p_repo_slug, 64) using errcode = '22023';
  end if;
  v_sev := case when p_severity in ('critical','high','medium','low','unknown') then p_severity::severity else 'unknown'::severity end;
  v_row := upsert_ticket('feedback'::ticket_source, p_repo_slug, left(p_service, 64), left(p_symptom, 1000), left(p_raw, 5000),
                         left(p_version, 32), p_evidence, v_sev, p_fingerprint);
  return jsonb_build_object('id', v_row.id, 'count', v_row.count);
end $$;

-- ----------------------------------------------------------------------------
-- Cuentas de Auth para miembros del equipo (sin correo: contraseña inicial puesta por un owner)
-- ----------------------------------------------------------------------------
-- Interna: crea o actualiza la cuenta de Auth con contraseña y correo confirmado. No expuesta por la API.
create or replace function _oficina_set_password(p_email text, p_password text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(trim(p_email));
begin
  if length(coalesce(p_password, '')) < 10 then raise exception 'la contraseña debe tener al menos 10 caracteres'; end if;
  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
            extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
            'email', now(), now(), now());
  else
    update auth.users
       set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end $$;

-- Owners: alta o cambio de un miembro; con p_password crea/restablece su cuenta (contraseña inicial).
create or replace function admin_upsert_member(p_email text, p_display_name text default null, p_role text default 'developer', p_password text default null)
returns team_members
language plpgsql volatile security definer set search_path = public as $$
declare v_row team_members%rowtype; v_email text := lower(trim(p_email));
begin
  if not is_team_owner() then raise exception 'solo un owner puede gestionar el equipo' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'correo no válido'; end if;
  if p_role not in ('owner','developer','viewer') then raise exception 'rol no válido: %', p_role; end if;
  if v_email = lower(auth.email()) and p_role <> 'owner' then raise exception 'no puedes quitarte el rol de owner a ti mismo'; end if;
  insert into team_members(email, display_name, role) values (v_email, nullif(trim(p_display_name), ''), p_role)
  on conflict (email) do update set display_name = coalesce(excluded.display_name, team_members.display_name), role = excluded.role
  returning * into v_row;
  if p_password is not null and p_password <> '' then perform _oficina_set_password(v_email, p_password); end if;
  return v_row;
end $$;

create or replace function admin_remove_member(p_email text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  if not is_team_owner() then raise exception 'solo un owner puede gestionar el equipo' using errcode = '42501'; end if;
  if v_email = lower(auth.email()) then raise exception 'no puedes quitarte a ti mismo'; end if;
  delete from team_members where email = v_email;
  if to_regclass('auth.users') is not null then
    execute 'update auth.users set banned_until = ''infinity'' where lower(email) = $1' using v_email;
  end if;
end $$;

-- Registro cerrado: un alta de Auth para un correo fuera del equipo se rechaza (signUp, OTP con shouldCreateUser, etc.).
create or replace function oficina_guard_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or not exists (select 1 from public.team_members where email = lower(new.email)) then
    raise exception 'registro cerrado: % no es miembro del equipo de la oficina', coalesce(new.email, '(sin correo)');
  end if;
  return new;
end $$;

do $$ begin
  if to_regclass('auth.users') is not null then
    execute 'drop trigger if exists oficina_guard_signup on auth.users';
    execute 'create trigger oficina_guard_signup before insert on auth.users for each row execute function public.oficina_guard_signup()';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Permisos
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then return; end if;
  revoke execute on function rotate_ingest_token(), ingest_token_info(), ingest_ticket(text, text, text, text, text, text, jsonb, text, text),
                             _oficina_set_password(text, text), admin_upsert_member(text, text, text, text), admin_remove_member(text),
                             oficina_guard_signup(), sha256_hex(text)
    from public, anon, authenticated;
  grant execute on function ingest_ticket(text, text, text, text, text, text, jsonb, text, text) to anon, authenticated;
  grant execute on function rotate_ingest_token(), ingest_token_info(), admin_upsert_member(text, text, text, text), admin_remove_member(text) to authenticated;
end $$;
