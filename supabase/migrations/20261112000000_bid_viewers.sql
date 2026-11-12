-- 공고 열람자: 초대받은 계정(예: 동생)은 '나라장터 한일ENG 공고'만 본다.
-- 다른 데이터(강의·금액·서류·사진·원가계산 공고·국방부 공고)는 기존 RLS가 그대로 막는다.
-- 열람자의 관심·제외 표시는 따로 저장해서 초대한 사람의 공고함 상태를 바꾸지 않는다.

-- 1) 열람자 (한 계정은 한 사람의 열람자만)
create table public.bid_viewers (
  member_id uuid primary key references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  label text not null default '동생' check (char_length(label) between 1 and 30),
  created_at timestamptz not null default now(),
  check (member_id <> owner_id)
);
create index bid_viewers_owner_idx on public.bid_viewers (owner_id);
alter table public.bid_viewers enable row level security;
create policy bid_viewers_select on public.bid_viewers
  for select to authenticated using ((select auth.uid()) in (owner_id, member_id));
create policy bid_viewers_delete on public.bid_viewers
  for delete to authenticated using ((select auth.uid()) in (owner_id, member_id));
-- 추가는 accept_bid_viewer_invite 함수로만

-- 2) 초대 링크 (7일, 한 번만 사용)
create table public.bid_viewer_invites (
  token text primary key check (char_length(token) >= 32),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null default '동생' check (char_length(label) between 1 and 30),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);
create index bid_viewer_invites_owner_idx on public.bid_viewer_invites (owner_id);
alter table public.bid_viewer_invites enable row level security;
create policy bid_viewer_invites_select_own on public.bid_viewer_invites
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy bid_viewer_invites_insert_own on public.bid_viewer_invites
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy bid_viewer_invites_delete_own on public.bid_viewer_invites
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- 3) 열람자가 볼 수 있는 공고: 초대한 사람의 '한일ENG + 나라장터' 공고만 (읽기 전용)
create policy bid_notices_select_viewer on public.bid_notices
  for select to authenticated
  using (
    category = 'hanil'
    and source = 'g2b'
    and exists (
      select 1 from public.bid_viewers v
      where v.member_id = (select auth.uid()) and v.owner_id = bid_notices.user_id
    )
  );

-- 4) 열람자 본인의 관심·제외 표시
create table public.bid_viewer_marks (
  member_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  notice_id uuid not null references public.bid_notices (id) on delete cascade,
  status text not null check (status in ('interested', 'dismissed')),
  updated_at timestamptz not null default now(),
  primary key (member_id, notice_id)
);
alter table public.bid_viewer_marks enable row level security;
create policy bid_viewer_marks_select_own on public.bid_viewer_marks
  for select to authenticated using ((select auth.uid()) = member_id);
create policy bid_viewer_marks_insert_own on public.bid_viewer_marks
  for insert to authenticated with check (
    (select auth.uid()) = member_id
    -- 볼 수 있는 공고에만 표시 가능 (bid_notices 의 열람자 정책을 그대로 따름)
    and exists (select 1 from public.bid_notices n where n.id = notice_id)
  );
create policy bid_viewer_marks_update_own on public.bid_viewer_marks
  for update to authenticated using ((select auth.uid()) = member_id) with check ((select auth.uid()) = member_id);
create policy bid_viewer_marks_delete_own on public.bid_viewer_marks
  for delete to authenticated using ((select auth.uid()) = member_id);

-- 5) 초대 링크 정보 (참여 화면용). 무효면 행 없음.
create or replace function public.bid_viewer_invite_info(p_token text)
returns table (label text, valid boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.label, (i.used_by is null and i.expires_at > now())
  from public.bid_viewer_invites i
  where i.token = p_token and length(p_token) >= 32;
$$;
revoke all on function public.bid_viewer_invite_info(text) from public;
grant execute on function public.bid_viewer_invite_info(text) to anon, authenticated;

-- 6) 초대 수락. 성공하면 null, 실패하면 이유.
--    가족 계정·다른 사람의 열람자·이미 자기 공고함을 쓰는 계정은 막는다 (역할이 섞이지 않도록)
create or replace function public.accept_bid_viewer_invite(p_token text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv public.bid_viewer_invites;
begin
  if me is null then return '로그인이 필요합니다.'; end if;
  select * into inv from public.bid_viewer_invites where token = p_token and length(p_token) >= 32 for update;
  if not found then return '초대 링크가 올바르지 않습니다.'; end if;
  if inv.owner_id = me then return '내가 만든 초대 링크입니다. 동생에게 보내 주세요.'; end if;
  if inv.used_by is not null then return '이미 사용한 초대 링크입니다.'; end if;
  if inv.expires_at <= now() then return '기간이 지난 초대 링크입니다. 새로 만들어 달라고 해 주세요.'; end if;
  if exists (select 1 from public.bid_viewers where member_id = me) then return '이미 공고 공유에 참여해 있습니다.'; end if;
  if exists (select 1 from public.family_members where member_id = me or owner_id = me) then
    return '가족 달력에 연결된 계정입니다. 다른 이메일로 가입해 주세요.';
  end if;
  if exists (select 1 from public.bid_viewers where owner_id = me)
     or exists (select 1 from public.bid_settings where user_id = me)
     or exists (select 1 from public.lectures where user_id = me) then
    return '이미 사용 중인 계정입니다. 공고만 볼 새 이메일로 가입해 주세요.';
  end if;

  insert into public.bid_viewers (member_id, owner_id, label) values (me, inv.owner_id, inv.label);
  update public.bid_viewer_invites set used_by = me, used_at = now() where token = p_token;
  return null;
end;
$$;
revoke all on function public.accept_bid_viewer_invite(text) from public;
grant execute on function public.accept_bid_viewer_invite(text) to authenticated;

-- 7) 가족 초대도 공고 열람자 계정은 받지 못하게 (역할이 섞이지 않도록)
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
  if exists (select 1 from public.bid_viewers where member_id = me) then return '공고 공유용 계정입니다. 다른 이메일로 가입해 주세요.'; end if;

  insert into public.family_members (member_id, owner_id, label) values (me, inv.owner_id, inv.label);
  update public.family_invites set used_by = me, used_at = now() where token = p_token;
  return null;
end;
$$;
revoke all on function public.accept_family_invite(text) from public;
grant execute on function public.accept_family_invite(text) to authenticated;
