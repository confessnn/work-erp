-- 가족 구성원이 자기 구글 캘린더(비공개 iCal 주소)를 등록하면 가족 달력으로 가져온다. 구글 → ERP 한 방향.
-- iCal 주소는 그 캘린더 전체를 읽을 수 있는 비밀값이라 등록한 본인만 보고 지울 수 있다.

create table public.family_calendar_sources (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default public.my_family() references auth.users (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person text not null check (person in ('dad', 'mom', 'baby', 'all')),
  name text not null default '구글 캘린더' check (char_length(name) between 1 and 50),
  ics_url text not null check (ics_url ~ '^https://' and char_length(ics_url) <= 2000),
  last_synced_at timestamptz,
  last_result text,
  created_at timestamptz not null default now()
);
create index family_calendar_sources_family_idx on public.family_calendar_sources (family_id);
alter table public.family_calendar_sources enable row level security;

create policy family_calendar_sources_select_own on public.family_calendar_sources
  for select to authenticated using ((select auth.uid()) = created_by);
create policy family_calendar_sources_insert_own on public.family_calendar_sources
  for insert to authenticated
  with check ((select auth.uid()) = created_by and family_id = (select public.my_family()));
create policy family_calendar_sources_update_own on public.family_calendar_sources
  for update to authenticated
  using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by and family_id = (select public.my_family()));
create policy family_calendar_sources_delete_own on public.family_calendar_sources
  for delete to authenticated using ((select auth.uid()) = created_by);

-- 가져온 일정은 원본(source)과 원본 일정 id를 기억한다. 원본을 지우면 가져온 일정도 지워진다.
alter table public.family_events
  add column source_id uuid references public.family_calendar_sources (id) on delete cascade,
  add column external_uid text;
create index family_events_source_idx on public.family_events (source_id) where source_id is not null;

-- 가져오기 결과 저장 (내부용): p_from 이후의 가져온 일정을 새 목록으로 통째로 바꾼다.
create or replace function private.replace_family_import(p_source uuid, p_from date, p_rows jsonb, p_result text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  src public.family_calendar_sources;
  n integer := 0;
begin
  select * into src from public.family_calendar_sources where id = p_source for update;
  if not found then return 0; end if;
  -- 가족에서 나간 사람의 캘린더는 더 이상 가져오지 않고 지운다 (가져온 일정도 함께 지워짐)
  if src.created_by <> src.family_id and not exists (
    select 1 from public.family_members m where m.member_id = src.created_by and m.owner_id = src.family_id
  ) then
    delete from public.family_calendar_sources where id = src.id;
    return 0;
  end if;
  if p_rows is not null then
    if jsonb_array_length(p_rows) > 2000 then raise exception '일정이 너무 많습니다 (2000개 초과)'; end if;
    delete from public.family_events where source_id = src.id and event_date >= p_from;
    insert into public.family_events (family_id, person, title, event_date, start_time, end_time, created_by, source_id, external_uid)
    select src.family_id, src.person, left(coalesce(nullif(r->>'title', ''), '(제목 없음)'), 200), (r->>'event_date')::date,
           nullif(r->>'start_time', '')::time, nullif(r->>'end_time', '')::time, src.created_by, src.id, r->>'external_uid'
    from jsonb_array_elements(p_rows) r
    where (r->>'event_date')::date >= p_from;
    get diagnostics n = row_count;
  end if;
  update public.family_calendar_sources
     set last_synced_at = now(), last_result = coalesce(p_result, n || '개 가져옴')
   where id = src.id;
  return n;
end;
$$;
revoke all on function private.replace_family_import(uuid, date, jsonb, text) from public, anon, authenticated;

-- 화면의 '지금 가져오기' (등록한 본인만)
create or replace function public.save_family_import(p_source uuid, p_from date, p_rows jsonb, p_result text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.family_calendar_sources
    where id = p_source and created_by = (select auth.uid())
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.replace_family_import(p_source, p_from, p_rows, p_result);
end;
$$;
revoke all on function public.save_family_import(uuid, date, jsonb, text) from public, anon;
grant execute on function public.save_family_import(uuid, date, jsonb, text) to authenticated;

-- 매일 자동 가져오기 (Vercel Cron, 비밀값 필요)
create or replace function public.cron_family_sources(p_secret text)
returns table (id uuid, family_id uuid, ics_url text, last_synced_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query select s.id, s.family_id, s.ics_url, s.last_synced_at from public.family_calendar_sources s;
end;
$$;
revoke all on function public.cron_family_sources(text) from public;
grant execute on function public.cron_family_sources(text) to anon, authenticated;

create or replace function public.cron_save_family_import(p_secret text, p_source uuid, p_from date, p_rows jsonb, p_result text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return private.replace_family_import(p_source, p_from, p_rows, p_result);
end;
$$;
revoke all on function public.cron_save_family_import(text, uuid, date, jsonb, text) from public;
grant execute on function public.cron_save_family_import(text, uuid, date, jsonb, text) to anon, authenticated;
