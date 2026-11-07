-- 가족 달력: 가족 구성원(별도 로그인), 초대 링크, 가족 일정.
-- 가족 구성원은 강의 일정의 제목·시간만 볼 수 있고 금액·수령 여부는 볼 수 없다.
-- (lectures 테이블 RLS는 그대로 본인 것만. 가족에게는 아래 family_lecture_schedule 함수로 금액 없는 열만 준다.)

-- 가족 구성원: member_id 가 owner_id 의 가족으로 참여. 한 사람은 한 가족에만 참여.
create table public.family_members (
  member_id uuid primary key references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  label text not null default '가족' check (char_length(label) between 1 and 30),
  created_at timestamptz not null default now(),
  check (member_id <> owner_id)
);
create index family_members_owner_idx on public.family_members (owner_id);
alter table public.family_members enable row level security;

create policy family_members_select on public.family_members
  for select to authenticated
  using ((select auth.uid()) in (owner_id, member_id));
create policy family_members_delete on public.family_members
  for delete to authenticated
  using ((select auth.uid()) in (owner_id, member_id));
-- 추가는 accept_family_invite 함수로만

-- 초대 링크 (7일, 한 번만 사용)
create table public.family_invites (
  token text primary key check (char_length(token) >= 32),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null default '가족' check (char_length(label) between 1 and 30),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);
create index family_invites_owner_idx on public.family_invites (owner_id);
alter table public.family_invites enable row level security;

create policy family_invites_select_own on public.family_invites
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy family_invites_insert_own on public.family_invites
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy family_invites_delete_own on public.family_invites
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- 내가 속한 가족의 id (= 가족을 만든 사람의 user id). 구성원이 아니면 나 자신.
create or replace function public.my_family()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.owner_id from public.family_members m where m.member_id = (select auth.uid())),
    (select auth.uid())
  );
$$;
revoke all on function public.my_family() from public;
grant execute on function public.my_family() to authenticated;

-- 초대 링크 정보 (참여 화면용). 무효면 행 없음.
create or replace function public.family_invite_info(p_token text)
returns table (label text, valid boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.label, (i.used_by is null and i.expires_at > now())
  from public.family_invites i
  where i.token = p_token and length(p_token) >= 32;
$$;
revoke all on function public.family_invite_info(text) from public;
grant execute on function public.family_invite_info(text) to anon, authenticated;

-- 초대 수락. 성공하면 null, 실패하면 이유를 돌려준다.
create or replace function public.accept_family_invite(p_token text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv public.family_invites;
begin
  if me is null then return '로그인이 필요합니다.'; end if;
  select * into inv from public.family_invites where token = p_token and length(p_token) >= 32 for update;
  if not found then return '초대 링크가 올바르지 않습니다.'; end if;
  if inv.owner_id = me then return '내가 만든 초대 링크입니다. 가족에게 보내 주세요.'; end if;
  if inv.used_by is not null then return '이미 사용한 초대 링크입니다.'; end if;
  if inv.expires_at <= now() then return '기간이 지난 초대 링크입니다. 새로 만들어 달라고 해 주세요.'; end if;
  if exists (select 1 from public.family_members where member_id = me) then return '이미 가족에 참여해 있습니다.'; end if;
  if exists (select 1 from public.family_members where owner_id = me) then return '이 계정에는 이미 다른 가족 구성원이 있습니다.'; end if;

  insert into public.family_members (member_id, owner_id, label) values (me, inv.owner_id, inv.label);
  update public.family_invites set used_by = me, used_at = now() where token = p_token;
  return null;
end;
$$;
revoke all on function public.accept_family_invite(text) from public;
grant execute on function public.accept_family_invite(text) to authenticated;

-- 가족 달력에 보일 강의 일정 (금액·수령 여부·메모 없음)
create or replace function public.family_lecture_schedule(p_from date, p_to date)
returns table (id uuid, title text, organization text, lecture_date date, start_time time, end_time time)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.title, l.organization, l.lecture_date, l.start_time, l.end_time
  from public.lectures l
  where l.user_id = (select public.my_family())
    and l.lecture_date >= p_from and l.lecture_date < p_to
  order by l.lecture_date, l.start_time nulls first;
$$;
revoke all on function public.family_lecture_schedule(date, date) from public;
grant execute on function public.family_lecture_schedule(date, date) to authenticated;

-- 가족 일정 (강의가 아닌 일정)
create table public.family_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default public.my_family() references auth.users (id) on delete cascade,
  person text not null check (person in ('dad', 'mom', 'baby', 'all')),
  title text not null check (char_length(title) between 1 and 200),
  event_date date not null,
  start_time time,
  end_time time,
  memo text check (memo is null or char_length(memo) <= 2000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index family_events_family_date_idx on public.family_events (family_id, event_date);
alter table public.family_events enable row level security;

create policy family_events_select on public.family_events
  for select to authenticated using (family_id = (select public.my_family()));
create policy family_events_insert on public.family_events
  for insert to authenticated with check (family_id = (select public.my_family()));
create policy family_events_update on public.family_events
  for update to authenticated
  using (family_id = (select public.my_family()))
  with check (family_id = (select public.my_family()));
create policy family_events_delete on public.family_events
  for delete to authenticated using (family_id = (select public.my_family()));

-- Supabase 기본 권한이 anon 에도 실행 권한을 주므로 로그인 전용 함수는 따로 막는다
revoke execute on function public.my_family() from anon;
revoke execute on function public.accept_family_invite(text) from anon;
revoke execute on function public.family_lecture_schedule(date, date) from anon;
