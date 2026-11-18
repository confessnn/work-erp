-- 텔레그램으로 일정 넣기: 봇에게 "내일 3시 치과"처럼 보내면 가족 일정에 들어간다.
-- 텔레그램이 /api/telegram/webhook 으로 보내는 비밀 헤더(사람마다 다름)로 누구인지 찾는다.
-- 표에는 그 비밀값의 sha256 만 둔다.

alter table public.telegram_links
  add column hook_hash text check (hook_hash is null or hook_hash ~ '^[0-9a-f]{64}$');
create unique index telegram_links_hook_hash_key on public.telegram_links (hook_hash) where hook_hash is not null;

-- 텔레그램으로 넣은 일정 (되돌리기 허용 범위). 앱에서는 읽지 않는다
create table public.telegram_added (
  event_id uuid primary key references public.family_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.telegram_added enable row level security;

-- 로그인한 본인이 켜고 끈다 (null = 끄기)
create or replace function public.set_telegram_hook(p_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'login required' using errcode = '42501'; end if;
  update public.telegram_links set hook_hash = p_hash, updated_at = now() where user_id = auth.uid();
end;
$$;
revoke all on function public.set_telegram_hook(text) from public, anon;
grant execute on function public.set_telegram_hook(text) to authenticated;

create or replace function private.tg_hook_user(p_hook text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.user_id from public.telegram_links l
  where char_length(coalesce(p_hook, '')) >= 32
    and l.hook_hash = encode(sha256(convert_to(p_hook, 'UTF8')), 'hex')
    and l.chat_id is not null;
$$;
revoke all on function private.tg_hook_user(text) from public, anon, authenticated;

-- 웹훅이 처음 부르는 함수: 누구인지, 어느 대화방인지, 봇 토큰
create or replace function public.tg_hook_link(p_hook text)
returns table (user_id uuid, chat_id bigint, token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := private.tg_hook_user(p_hook);
begin
  if uid is null then raise exception 'unknown hook' using errcode = '42501'; end if;
  return query select l.user_id, l.chat_id, private.telegram_token(l.user_id) from public.telegram_links l where l.user_id = uid;
end;
$$;

-- 일정 넣기. 가족 달력(가족을 만든 사람 기준)에 넣는다
create or replace function public.tg_add_event(
  p_hook text, p_person text, p_title text, p_date date, p_start time, p_end time, p_memo text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := private.tg_hook_user(p_hook);
  fam uuid;
  new_id uuid;
begin
  if uid is null then raise exception 'unknown hook' using errcode = '42501'; end if;
  fam := coalesce((select m.owner_id from public.family_members m where m.member_id = uid), uid);
  insert into public.family_events (family_id, person, title, event_date, start_time, end_time, memo, created_by)
  values (fam, p_person, left(p_title, 200), p_date, p_start, p_end, left(p_memo, 2000), uid)
  returning id into new_id;
  insert into public.telegram_added (event_id, user_id) values (new_id, uid);
  delete from public.telegram_added where created_at < now() - interval '30 days';
  return new_id;
end;
$$;

-- 되돌리기: 내가 텔레그램으로 넣은 지 하루가 안 된 일정만 지운다
create or replace function public.tg_undo_event(p_hook text, p_event uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := private.tg_hook_user(p_hook);
begin
  if uid is null then raise exception 'unknown hook' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.telegram_added a
    where a.event_id = p_event and a.user_id = uid and a.created_at > now() - interval '1 day'
  ) then
    return false;
  end if;
  delete from public.family_events where id = p_event;
  return true;
end;
$$;

revoke all on function public.tg_hook_link(text) from public;
revoke all on function public.tg_add_event(text, text, text, date, time, time, text) from public;
revoke all on function public.tg_undo_event(text, uuid) from public;
grant execute on function public.tg_hook_link(text) to anon;
grant execute on function public.tg_add_event(text, text, text, date, time, time, text) to anon;
grant execute on function public.tg_undo_event(text, uuid) to anon;
