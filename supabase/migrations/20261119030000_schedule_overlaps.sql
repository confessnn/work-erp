-- 일정 시간 겹침 확인: 새 일정과 시간이 겹치는 가족 일정·강의를 찾는다.
-- 끝 시간이 없으면 1시간짜리로 본다. 종일 일정(시작 시간 없음)은 겹침으로 치지 않는다.
-- 텔레그램으로 넣을 때 겹치면 바로 넣지 않고 telegram_pending 에 잠시 두었다가 [그래도 넣기]를 누르면 넣는다.

-- 시각을 '자정부터 몇 분'으로. 끝이 없거나 시작보다 이르면 시작 + 60분
create or replace function private.slot_end(p_start time, p_end time)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_end is not null and p_end > p_start then extract(epoch from p_end) / 60
    else extract(epoch from p_start) / 60 + 60
  end;
$$;

create or replace function private.schedule_overlaps(p_fam uuid, p_date date, p_start time, p_end time, p_skip uuid)
returns table (kind text, title text, person text, start_time time, end_time time)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select extract(epoch from p_start) / 60 as s, private.slot_end(p_start, p_end) as e
    where p_start is not null
  )
  select x.kind, x.title, x.person, x.start_time, x.end_time
  from (
    select 'event'::text as kind, f.title, f.person, f.start_time, f.end_time
    from public.family_events f, q
    where f.family_id = p_fam and f.event_date = p_date and f.start_time is not null
      and f.id is distinct from p_skip
      and extract(epoch from f.start_time) / 60 < q.e
      and private.slot_end(f.start_time, f.end_time) > q.s
    union all
    select 'lecture'::text, l.title, null::text, l.start_time, l.end_time
    from public.lectures l, q
    where l.user_id = p_fam and l.lecture_date = p_date and l.start_time is not null
      and l.id is distinct from p_skip
      and extract(epoch from l.start_time) / 60 < q.e
      and private.slot_end(l.start_time, l.end_time) > q.s
  ) x
  order by x.start_time
  limit 5;
$$;
revoke all on function private.schedule_overlaps(uuid, date, time, time, uuid) from public, anon, authenticated;

-- 앱에서 일정·강의를 저장하기 전에 (로그인한 사람의 가족 기준)
create or replace function public.my_schedule_overlaps(p_date date, p_start time, p_end time, p_skip uuid default null)
returns table (kind text, title text, person text, start_time time, end_time time)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.schedule_overlaps((select public.my_family()), p_date, p_start, p_end, p_skip)
  where auth.uid() is not null;
$$;
revoke all on function public.my_schedule_overlaps(date, time, time, uuid) from public, anon;
grant execute on function public.my_schedule_overlaps(date, time, time, uuid) to authenticated;

-- 텔레그램: 누구의 가족인지는 비밀 헤더로 찾는다
create or replace function private.tg_family(p_hook text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.tg_hook_user(p_hook);
begin
  if uid is null then raise exception 'unknown hook' using errcode = '42501'; end if;
  return coalesce((select m.owner_id from public.family_members m where m.member_id = uid), uid);
end;
$$;
revoke all on function private.tg_family(text) from public, anon, authenticated;

create or replace function public.tg_overlaps(p_hook text, p_date date, p_start time, p_end time)
returns table (kind text, title text, person text, start_time time, end_time time)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.schedule_overlaps(private.tg_family(p_hook), p_date, p_start, p_end, null);
$$;

-- 겹쳐서 물어본 일정 (하루 동안만 둔다). 앱에서는 읽지 않는다
create table public.telegram_pending (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  person text not null check (person in ('dad', 'mom', 'baby', 'all')),
  title text not null check (char_length(title) between 1 and 200),
  event_date date not null,
  start_time time,
  end_time time,
  memo text check (memo is null or char_length(memo) <= 2000),
  created_at timestamptz not null default now()
);
alter table public.telegram_pending enable row level security;

create or replace function public.tg_hold_event(
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
  new_id uuid;
begin
  if uid is null then raise exception 'unknown hook' using errcode = '42501'; end if;
  delete from public.telegram_pending where created_at < now() - interval '1 day';
  insert into public.telegram_pending (user_id, person, title, event_date, start_time, end_time, memo)
  values (uid, p_person, left(p_title, 200), p_date, p_start, p_end, left(p_memo, 2000))
  returning id into new_id;
  return new_id;
end;
$$;

-- [그래도 넣기](p_add=true) / [넣지 않기](false). 찾지 못하면 null (이미 눌렀거나 하루가 지남)
create or replace function public.tg_release_event(p_hook text, p_pending uuid, p_add boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := private.tg_hook_user(p_hook);
  p public.telegram_pending;
  new_id uuid;
begin
  if uid is null then raise exception 'unknown hook' using errcode = '42501'; end if;
  delete from public.telegram_pending
  where id = p_pending and user_id = uid and created_at > now() - interval '1 day'
  returning * into p;
  if not found then return null; end if;
  if p_add then
    new_id := public.tg_add_event(p_hook, p.person, p.title, p.event_date, p.start_time, p.end_time, p.memo);
  end if;
  return jsonb_build_object(
    'id', new_id, 'person', p.person, 'title', p.title, 'date', p.event_date,
    'start', to_char(p.start_time, 'HH24:MI'), 'end', to_char(p.end_time, 'HH24:MI'), 'memo', p.memo
  );
end;
$$;

revoke all on function public.tg_overlaps(text, date, time, time) from public;
revoke all on function public.tg_hold_event(text, text, text, date, time, time, text) from public;
revoke all on function public.tg_release_event(text, uuid, boolean) from public;
grant execute on function public.tg_overlaps(text, date, time, time) to anon;
grant execute on function public.tg_hold_event(text, text, text, date, time, time, text) to anon;
grant execute on function public.tg_release_event(text, uuid, boolean) to anon;
