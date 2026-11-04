-- 1) 외부 캘린더(구글·iCloud iCal 주소)에서 불러온 일정의 중복 방지용 ID
alter table public.lectures add column external_uid text;
create unique index lectures_user_external_uid_key
  on public.lectures (user_id, external_uid) where external_uid is not null;

-- 2) 불러올 캘린더 주소 (iCal 비밀 주소는 비밀번호처럼 취급: 본인만 조회)
create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  ics_url text not null check (ics_url ~ '^(https|webcal)://'),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index calendar_sources_user_idx on public.calendar_sources (user_id);
alter table public.calendar_sources enable row level security;
create policy "calendar_sources_select_own" on public.calendar_sources
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "calendar_sources_insert_own" on public.calendar_sources
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "calendar_sources_update_own" on public.calendar_sources
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "calendar_sources_delete_own" on public.calendar_sources
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 3) 가족 공유 링크 (로그인 없이 일정만 보기. 금액 정보는 절대 노출하지 않음)
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null default '가족 공유',
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  show_organization boolean not null default true,
  created_at timestamptz not null default now()
);
create index share_links_user_idx on public.share_links (user_id);
alter table public.share_links enable row level security;
create policy "share_links_select_own" on public.share_links
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "share_links_insert_own" on public.share_links
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "share_links_update_own" on public.share_links
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "share_links_delete_own" on public.share_links
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 공유 토큰으로 일정만 읽는 함수. 반환 컬럼에 금액·세금·수령·메모가 없다는 점이 핵심.
-- 링크를 삭제하면 즉시 접근 불가.
create or replace function public.get_shared_schedule(p_token text)
returns table (
  id uuid,
  title text,
  organization text,
  lecture_date date,
  start_time time,
  end_time time,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.title,
         case when s.show_organization then l.organization end,
         l.lecture_date, l.start_time, l.end_time, l.updated_at
  from public.share_links s
  join public.lectures l on l.user_id = s.user_id
  where s.token = p_token
    and length(p_token) >= 32
    and l.lecture_date >= (now() at time zone 'Asia/Seoul')::date - 90
  order by l.lecture_date, l.start_time nulls first;
$$;

revoke all on function public.get_shared_schedule(text) from public;
grant execute on function public.get_shared_schedule(text) to anon, authenticated;
