-- 가족 역할 경계 강화 (보안점검 7·8번)

-- 1) 초대 링크는 '가족을 만든 사람'만 만든다.
--    지금은 가족 구성원(아내)이나 공고 열람자(동생)도 자기 이름으로 초대를 만들 수 있어서,
--    가족 안에 또 가족이 생기거나 열람자가 가족 대표가 되는 등 역할이 섞일 수 있었다.
create or replace function public.can_own_invites()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not exists (select 1 from public.family_members m where m.member_id = (select auth.uid()))
    and not exists (select 1 from public.bid_viewers v where v.member_id = (select auth.uid()));
$$;
revoke all on function public.can_own_invites() from public, anon;
grant execute on function public.can_own_invites() to authenticated;

drop policy "family_invites_insert_own" on public.family_invites;
create policy "family_invites_insert_own" on public.family_invites
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and (select public.can_own_invites()));

drop policy "bid_viewer_invites_insert_own" on public.bid_viewer_invites;
create policy "bid_viewer_invites_insert_own" on public.bid_viewer_invites
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and (select public.can_own_invites()));

-- 수락할 때도 초대를 만든 사람이 지금 구성원·열람자가 아닌지 확인 (이미 만들어 둔 초대 대비)
create or replace function public.accept_family_invite(p_token text)
returns text
language plpgsql
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
  if exists (select 1 from public.family_members where member_id = inv.owner_id)
     or exists (select 1 from public.bid_viewers where member_id = inv.owner_id) then
    return '이 초대 링크는 쓸 수 없습니다. 가족을 만든 사람에게 새로 만들어 달라고 해 주세요.';
  end if;
  if exists (select 1 from public.family_members where member_id = me) then return '이미 가족에 참여해 있습니다.'; end if;
  if exists (select 1 from public.family_members where owner_id = me) then return '이 계정에는 이미 다른 가족 구성원이 있습니다.'; end if;
  if exists (select 1 from public.bid_viewers where member_id = me) then return '공고 공유용 계정입니다. 다른 이메일로 가입해 주세요.'; end if;

  insert into public.family_members (member_id, owner_id, label) values (me, inv.owner_id, inv.label);
  update public.family_invites set used_by = me, used_at = now() where token = p_token;
  return null;
end;
$$;

create or replace function public.accept_bid_viewer_invite(p_token text)
returns text
language plpgsql
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
  if exists (select 1 from public.family_members where member_id = inv.owner_id)
     or exists (select 1 from public.bid_viewers where member_id = inv.owner_id) then
    return '이 초대 링크는 쓸 수 없습니다. 새로 만들어 달라고 해 주세요.';
  end if;
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

-- 2) 텔레그램 메모: 강의 메모는 강의 주인(대표 계정) 봇에서만.
--    가족 구성원 봇으로 남편 강의 메모를 고치고 기존 메모 전체(금액이 적혀 있을 수 있음)를 돌려받던 문제.
create or replace function public.tg_add_memo(p_hook text, p_kind text, p_id uuid, p_memo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fam uuid := private.tg_family(p_hook);
  me uuid := private.tg_hook_user(p_hook);
  note text := left(btrim(coalesce(p_memo, '')), 500);
  r record;
begin
  if note = '' then return null; end if;
  if p_kind = 'lecture' then
    if me is null or me is distinct from fam then return null; end if;
    update public.lectures l
      set memo = left(case when coalesce(l.memo, '') = '' then note else l.memo || E'\n' || note end, 2000), updated_at = now()
      where l.id = p_id and l.user_id = me
      returning l.title, l.lecture_date as d, l.start_time as s, l.end_time as e, l.memo into r;
  elsif p_kind = 'event' then
    update public.family_events f
      set memo = left(case when coalesce(f.memo, '') = '' then note else f.memo || E'\n' || note end, 2000), updated_at = now()
      where f.id = p_id and f.family_id = fam
      returning f.title, f.event_date as d, f.start_time as s, f.end_time as e, f.memo into r;
  else
    return null;
  end if;
  if r is null then return null; end if;
  return jsonb_build_object('kind', p_kind, 'id', p_id, 'title', r.title, 'date', r.d,
    'start', to_char(r.s, 'HH24:MI'), 'end', to_char(r.e, 'HH24:MI'), 'memo', r.memo);
end;
$$;
