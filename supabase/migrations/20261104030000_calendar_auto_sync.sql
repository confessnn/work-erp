-- 캘린더 자동 불러오기 (매일 Vercel Cron이 호출)

-- 1) 캘린더별 자동 불러오기 설정
alter table public.calendar_sources
  add column auto_import boolean not null default false,
  add column keyword text,                       -- 제목·장소에 이 글자가 있는 일정만 (비우면 전부)
  add column hourly_rate integer not null default 0 check (hourly_rate >= 0),
  add column income_type text not null default 'business' check (income_type in ('business', 'other')),
  add column apply_tax_exemption boolean not null default true,
  add column org_from_location boolean not null default true,
  add column last_sync_result text;

-- 2) 불러온 일정을 지우면 자동 불러오기가 다시 가져오지 않도록 기록
create table public.import_skips (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  external_uid text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, external_uid)
);
alter table public.import_skips enable row level security;
create policy "import_skips_select_own" on public.import_skips
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "import_skips_insert_own" on public.import_skips
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "import_skips_delete_own" on public.import_skips
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.remember_deleted_import()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.external_uid is not null then
    insert into public.import_skips (user_id, external_uid)
    values (old.user_id, old.external_uid)
    on conflict do nothing;
  end if;
  return old;
end;
$$;
revoke all on function public.remember_deleted_import() from public, anon, authenticated;

create trigger lectures_remember_deleted_import
  after delete on public.lectures
  for each row execute function public.remember_deleted_import();

-- 3) 예약 실행용 비밀값 (해시만 저장, API에 노출되지 않는 private 스키마)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.app_secrets (
  name text primary key,
  sha256 text not null
);

create or replace function private.check_cron_secret(p_secret text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_secret is null or length(p_secret) < 32 or not exists (
    select 1 from private.app_secrets
    where name = 'cron' and sha256 = encode(extensions.digest(p_secret, 'sha256'), 'hex')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- 4) 예약 실행이 쓰는 함수들 (비밀값 없으면 거부)
create or replace function public.cron_sync_jobs(p_secret text)
returns table (
  source_id uuid,
  user_id uuid,
  ics_url text,
  keyword text,
  hourly_rate integer,
  income_type text,
  apply_tax_exemption boolean,
  org_from_location boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select s.id, s.user_id, s.ics_url, s.keyword, s.hourly_rate, s.income_type,
           s.apply_tax_exemption, s.org_from_location
    from public.calendar_sources s
    where s.auto_import;
end;
$$;

create or replace function public.cron_known_uids(p_secret text, p_user uuid)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select l.external_uid from public.lectures l where l.user_id = p_user and l.external_uid is not null
    union
    select k.external_uid from public.import_skips k where k.user_id = p_user;
end;
$$;

-- 강의 행 저장 + 결과 기록. 필요한 컬럼만 골라서 넣고, 이미 있는 일정은 건너뜀.
create or replace function public.cron_save_import(p_secret text, p_source uuid, p_rows jsonb, p_result text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_count integer := 0;
begin
  perform private.check_cron_secret(p_secret);
  select s.user_id into v_user from public.calendar_sources s where s.id = p_source;
  if v_user is null then
    return 0;
  end if;

  if jsonb_typeof(p_rows) = 'array' and jsonb_array_length(p_rows) > 0 then
    insert into public.lectures (
      user_id, external_uid, title, organization, lecture_date, start_time, end_time, hours,
      hourly_rate, gross_amount, income_type, apply_tax_exemption, income_tax, local_tax, expected_net
    )
    select v_user, r.external_uid, r.title, r.organization, r.lecture_date, r.start_time, r.end_time, r.hours,
           r.hourly_rate, r.gross_amount, r.income_type, r.apply_tax_exemption, r.income_tax, r.local_tax, r.expected_net
    from jsonb_populate_recordset(null::public.lectures, p_rows) r
    where r.external_uid is not null
      and not exists (select 1 from public.import_skips k where k.user_id = v_user and k.external_uid = r.external_uid)
    on conflict (user_id, external_uid) where external_uid is not null do nothing;
    get diagnostics v_count = row_count;
  end if;

  update public.calendar_sources
     set last_synced_at = now(),
         last_sync_result = coalesce(p_result, '자동: ' || v_count || '건 새로 추가')
   where id = p_source;
  return v_count;
end;
$$;

revoke all on function public.cron_sync_jobs(text) from public;
revoke all on function public.cron_known_uids(text, uuid) from public;
revoke all on function public.cron_save_import(text, uuid, jsonb, text) from public;
grant execute on function public.cron_sync_jobs(text) to anon;
grant execute on function public.cron_known_uids(text, uuid) to anon;
grant execute on function public.cron_save_import(text, uuid, jsonb, text) to anon;
