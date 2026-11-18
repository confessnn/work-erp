-- 콘텐츠 창고: 관심 분야 인플루언서의 X 글을 매일 모아(공식 X API) 쌓고, AI로 정리해 노션에 적는다.
-- Supabase = 원본 창고·진행 기록, 노션 = 정리된 결과를 읽고 고르는 곳.
-- X·노션 토큰은 Vault('x_token:<uid>', 'notion_token:<uid>')에만 둔다.
-- 함수는 로그인한 본인(화면의 '지금 모으기')과 크론(비밀값 + p_user) 둘 다 같은 함수를 쓴다.

create table public.content_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  fields text[] not null default '{}' check (cardinality(fields) <= 20),
  daily_budget integer not null default 200 check (daily_budget between 0 and 3000),
  notion_parent text check (notion_parent is null or notion_parent ~ '^[0-9a-f]{32}$'),
  notion_db text check (notion_db is null or notion_db ~ '^[0-9a-f-]{32,36}$'),
  reads_day date,
  reads_count integer not null default 0,
  last_run_at timestamptz,
  last_result text check (last_result is null or char_length(last_result) <= 1000),
  updated_at timestamptz not null default now()
);
alter table public.content_settings enable row level security;
create policy content_settings_select_own on public.content_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy content_settings_insert_own on public.content_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy content_settings_update_own on public.content_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table public.x_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  handle text not null check (handle ~ '^[A-Za-z0-9_]{1,15}$'),
  field text check (field is null or char_length(field) <= 40),
  memo text check (memo is null or char_length(memo) <= 200),
  active boolean not null default true,
  x_user_id text check (x_user_id is null or x_user_id ~ '^[0-9]{1,25}$'),
  since_id text check (since_id is null or since_id ~ '^[0-9]{1,25}$'),
  last_fetched_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, handle)
);
alter table public.x_sources enable row level security;
create policy x_sources_select_own on public.x_sources for select to authenticated using ((select auth.uid()) = user_id);
create policy x_sources_insert_own on public.x_sources for insert to authenticated with check ((select auth.uid()) = user_id);
create policy x_sources_update_own on public.x_sources for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy x_sources_delete_own on public.x_sources for delete to authenticated using ((select auth.uid()) = user_id);

create table public.x_posts (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[0-9]{1,25}$'),
  source_id uuid references public.x_sources (id) on delete set null,
  handle text not null,
  text text not null check (char_length(text) <= 30000),
  lang text,
  posted_at timestamptz,
  likes integer not null default 0,
  reposts integer not null default 0,
  replies integer not null default 0,
  views bigint,
  status text not null default 'new' check (status in ('new', 'analyzed', 'synced', 'error')),
  field text,
  summary text,
  translation text,
  idea text,
  idea_score smallint check (idea_score is null or idea_score between 1 and 5),
  notion_page text,
  tries smallint not null default 0,
  last_error text,
  fetched_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index x_posts_user_status_idx on public.x_posts (user_id, status);
create index x_posts_user_posted_idx on public.x_posts (user_id, posted_at desc);
alter table public.x_posts enable row level security;
create policy x_posts_select_own on public.x_posts for select to authenticated using ((select auth.uid()) = user_id);
create policy x_posts_delete_own on public.x_posts for delete to authenticated using ((select auth.uid()) = user_id);

-- 로그인한 본인이면 본인, 아니면 크론 비밀값 확인 후 p_user
create or replace function private.content_uid(p_secret text, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then return auth.uid(); end if;
  perform private.check_cron_secret(p_secret);
  if p_user is null then raise exception 'user required' using errcode = '22023'; end if;
  return p_user;
end;
$$;
revoke all on function private.content_uid(text, uuid) from public, anon, authenticated;

create or replace function private.vault_get(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;
revoke all on function private.vault_get(text) from public, anon, authenticated;

-- 토큰 저장 (로그인한 본인). p_kind: 'x' 또는 'notion'. 빈 값이면 지운다
create or replace function public.set_content_token(p_kind text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  secret_name text;
  secret_id uuid;
begin
  if uid is null then raise exception 'login required' using errcode = '42501'; end if;
  if p_kind not in ('x', 'notion') then raise exception 'invalid kind' using errcode = '22023'; end if;
  secret_name := p_kind || '_token:' || uid::text;
  select id into secret_id from vault.secrets where name = secret_name;
  if coalesce(p_token, '') = '' then
    if secret_id is not null then delete from vault.secrets where id = secret_id; end if;
    return;
  end if;
  if char_length(p_token) > 400 or p_token ~ '\s' then
    raise exception '토큰 형식이 아닙니다. 공백 없이 토큰 전체를 붙여 넣어 주세요.' using errcode = '22023';
  end if;
  if secret_id is null then
    perform vault.create_secret(p_token, secret_name, case p_kind when 'x' then 'X API Bearer 토큰 (콘텐츠 창고)' else '노션 연결 토큰 (콘텐츠 창고)' end);
  else
    perform vault.update_secret(secret_id, p_token);
  end if;
  insert into public.content_settings (user_id) values (uid) on conflict (user_id) do nothing;
end;
$$;
revoke all on function public.set_content_token(text, text) from public, anon;
grant execute on function public.set_content_token(text, text) to authenticated;

-- 토큰이 저장돼 있는지만 (화면 표시용)
create or replace function public.my_content_tokens()
returns table (has_x boolean, has_notion boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select private.vault_get('x_token:' || auth.uid()::text) is not null,
         private.vault_get('notion_token:' || auth.uid()::text) is not null
  where auth.uid() is not null;
$$;
revoke all on function public.my_content_tokens() from public, anon;
grant execute on function public.my_content_tokens() to authenticated;

-- 크론: 켜 둔 사람 목록
create or replace function public.content_jobs(p_secret text)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query select s.user_id from public.content_settings s where s.enabled;
end;
$$;

-- 한 사람의 작업 정보 (토큰 포함). 오늘 읽은 글 수도 함께
create or replace function public.content_job(p_secret text, p_user uuid)
returns table (
  x_token text, notion_token text, notion_parent text, notion_db text,
  fields text[], daily_budget integer, reads_today integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.content_uid(p_secret, p_user);
begin
  insert into public.content_settings (user_id) values (uid) on conflict (user_id) do nothing;
  return query
    select private.vault_get('x_token:' || uid::text), private.vault_get('notion_token:' || uid::text),
           s.notion_parent, s.notion_db, s.fields, s.daily_budget,
           case when s.reads_day = (now() at time zone 'Asia/Seoul')::date then s.reads_count else 0 end
    from public.content_settings s where s.user_id = uid;
end;
$$;

create or replace function public.content_sources(p_secret text, p_user uuid)
returns setof public.x_sources
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.content_uid(p_secret, p_user);
begin
  return query select * from public.x_sources s where s.user_id = uid and s.active order by s.last_fetched_at nulls first, s.created_at;
end;
$$;

-- 받은 글 저장 + 오늘 읽은 수 더하기 + 출처 상태 갱신. 새로 들어간 글 수를 돌려준다
create or replace function public.content_save_fetch(
  p_secret text, p_user uuid, p_source uuid, p_x_user_id text, p_since_id text, p_reads integer, p_posts jsonb, p_error text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.content_uid(p_secret, p_user);
  today date := (now() at time zone 'Asia/Seoul')::date;
  added integer := 0;
begin
  update public.content_settings
     set reads_count = case when reads_day = today then reads_count else 0 end + greatest(coalesce(p_reads, 0), 0),
         reads_day = today, updated_at = now()
   where user_id = uid;
  if jsonb_typeof(p_posts) = 'array' then
    insert into public.x_posts (user_id, id, source_id, handle, text, lang, posted_at, likes, reposts, replies, views)
    select uid, x.id, p_source, x.handle, left(x.text, 30000), x.lang, x.posted_at,
           coalesce(x.likes, 0), coalesce(x.reposts, 0), coalesce(x.replies, 0), x.views
    from jsonb_to_recordset(p_posts) as x(id text, handle text, text text, lang text, posted_at timestamptz, likes integer, reposts integer, replies integer, views bigint)
    on conflict do nothing;
    get diagnostics added = row_count;
  end if;
  update public.x_sources
     set x_user_id = coalesce(p_x_user_id, x_user_id),
         since_id = coalesce(p_since_id, since_id),
         last_fetched_at = now(),
         last_error = left(p_error, 500)
   where id = p_source and user_id = uid;
  return added;
end;
$$;

-- AI 정리 대기 글
create or replace function public.content_pending(p_secret text, p_user uuid, p_limit integer)
returns table (id text, handle text, text text, lang text, likes integer, reposts integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := private.content_uid(p_secret, p_user);
begin
  return query select p.id, p.handle, p.text, p.lang, p.likes, p.reposts
    from public.x_posts p
    where p.user_id = uid and p.status = 'new'
    order by p.posted_at desc nulls last limit least(greatest(p_limit, 1), 50);
end;
$$;

-- AI 정리 결과 저장. 실패한 글은 tries 를 올리고 3번 넘으면 error
create or replace function public.content_save_analysis(p_secret text, p_user uuid, p_rows jsonb, p_failed text[], p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.content_uid(p_secret, p_user);
begin
  if jsonb_typeof(p_rows) = 'array' then
    update public.x_posts p
       set status = 'analyzed', field = left(x.field, 40), summary = left(x.summary, 1000), translation = left(x.translation, 30000),
           idea = left(x.idea, 1000), idea_score = least(greatest(x.idea_score, 1), 5), last_error = null
      from jsonb_to_recordset(p_rows) as x(id text, field text, summary text, translation text, idea text, idea_score integer)
     where p.user_id = uid and p.id = x.id and p.status = 'new';
  end if;
  if p_failed is not null then
    update public.x_posts p
       set tries = tries + 1, last_error = left(p_error, 500),
           status = case when tries + 1 >= 3 then 'error' else status end
     where p.user_id = uid and p.id = any (p_failed) and p.status = 'new';
  end if;
end;
$$;

-- 노션에 아직 안 적은 정리된 글
create or replace function public.content_unsynced(p_secret text, p_user uuid, p_limit integer)
returns table (id text, handle text, text text, posted_at timestamptz, likes integer, reposts integer, views bigint,
               field text, summary text, translation text, idea text, idea_score smallint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := private.content_uid(p_secret, p_user);
begin
  return query select p.id, p.handle, p.text, p.posted_at, p.likes, p.reposts, p.views,
                      p.field, p.summary, p.translation, p.idea, p.idea_score
    from public.x_posts p
    where p.user_id = uid and p.status = 'analyzed'
    order by p.posted_at nulls last limit least(greatest(p_limit, 1), 100);
end;
$$;

create or replace function public.content_mark_synced(p_secret text, p_user uuid, p_rows jsonb, p_notion_db text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.content_uid(p_secret, p_user);
begin
  if p_notion_db is not null then
    update public.content_settings set notion_db = p_notion_db, updated_at = now() where user_id = uid;
  end if;
  if jsonb_typeof(p_rows) = 'array' then
    update public.x_posts p set status = 'synced', notion_page = x.page
      from jsonb_to_recordset(p_rows) as x(id text, page text)
     where p.user_id = uid and p.id = x.id;
  end if;
end;
$$;

create or replace function public.content_finish(p_secret text, p_user uuid, p_result text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.content_uid(p_secret, p_user);
begin
  update public.content_settings set last_run_at = now(), last_result = left(p_result, 1000), updated_at = now() where user_id = uid;
  -- 원본은 6개월 지나면 지운다 (노션에는 남아 있음)
  delete from public.x_posts where user_id = uid and fetched_at < now() - interval '6 months';
end;
$$;

-- 로그인한 본인(화면)과 크론(anon + 비밀값)만
do $$
declare f text;
begin
  foreach f in array array[
    'public.content_jobs(text)',
    'public.content_job(text, uuid)',
    'public.content_sources(text, uuid)',
    'public.content_save_fetch(text, uuid, uuid, text, text, integer, jsonb, text)',
    'public.content_pending(text, uuid, integer)',
    'public.content_save_analysis(text, uuid, jsonb, text[], text)',
    'public.content_unsynced(text, uuid, integer)',
    'public.content_mark_synced(text, uuid, jsonb, text)',
    'public.content_finish(text, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end;
$$;
