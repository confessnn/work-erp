-- 텔레그램 알림 (@work_erp_bot): 매일 아침 '오늘 할 일'(일정 + 새 공고)과 일정 1시간 전 알림.
-- 연결: ERP 에서 1회용 코드 발급 → t.me/work_erp_bot?start=<코드> → 봇 웹훅이 대화방(chat_id)을 계정에 묶는다.
-- 웹훅·크론은 로그인 없이 돌기 때문에 DB 쓰기는 비밀값으로 잠긴 함수로만 한다.

-- 1) 연결된 대화방 (사람당 1개, 대화방도 한 계정에만)
create table public.telegram_links (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  chat_id bigint not null unique,
  tg_name text check (tg_name is null or char_length(tg_name) <= 100),
  notify_morning boolean not null default true,   -- 매일 아침 오늘 할 일·새 공고
  notify_events text not null default 'all' check (notify_events in ('all', 'selected', 'off')),
  -- all: 내 강의·가족 일정 전부 / selected: 일정에서 🔔 켠 것만 / off: 안 받음
  linked_at timestamptz not null default now()
);
alter table public.telegram_links enable row level security;
create policy telegram_links_select_own on public.telegram_links for select to authenticated using ((select auth.uid()) = user_id);
create policy telegram_links_update_own on public.telegram_links for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy telegram_links_delete_own on public.telegram_links for delete to authenticated using ((select auth.uid()) = user_id);
-- 추가는 cron_telegram_link 함수(웹훅)로만

-- 2) 연결용 1회 코드 (10분)
create table public.telegram_link_codes (
  code text primary key check (code ~ '^[A-Za-z0-9]{24,64}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index telegram_link_codes_user_idx on public.telegram_link_codes (user_id);
alter table public.telegram_link_codes enable row level security;
create policy telegram_link_codes_insert_own on public.telegram_link_codes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy telegram_link_codes_select_own on public.telegram_link_codes for select to authenticated using ((select auth.uid()) = user_id);
create policy telegram_link_codes_delete_own on public.telegram_link_codes for delete to authenticated using ((select auth.uid()) = user_id);

-- 3) 텔레그램으로 보낸 일정 알림 (같은 알림 두 번 방지). 앱에서는 읽지 않는다
create table public.telegram_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_key text not null check (char_length(item_key) <= 700),
  sent_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
alter table public.telegram_sent enable row level security;

-- 4) 웹훅: /start <코드> 로 대화방 연결. 성공하면 null, 실패하면 이유
create or replace function public.cron_telegram_link(p_secret text, p_code text, p_chat_id bigint, p_name text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform private.check_cron_secret(p_secret);
  delete from public.telegram_link_codes where expires_at < now();
  select user_id into v_user from public.telegram_link_codes where code = p_code;
  if v_user is null then return '연결 코드가 없거나 10분이 지났어요. ERP 연동 화면에서 다시 눌러 주세요.'; end if;

  delete from public.telegram_link_codes where user_id = v_user;
  -- 이 대화방이 다른 계정에 묶여 있었으면 옮긴다
  delete from public.telegram_links where chat_id = p_chat_id and user_id <> v_user;
  insert into public.telegram_links (user_id, chat_id, tg_name)
  values (v_user, p_chat_id, left(p_name, 100))
  on conflict (user_id) do update set chat_id = excluded.chat_id, tg_name = excluded.tg_name, linked_at = now();
  return null;
end;
$$;

-- 웹훅: /stop 또는 봇 차단 시 연결 해제
create or replace function public.cron_telegram_unlink(p_secret text, p_chat_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  delete from public.telegram_links where chat_id = p_chat_id;
end;
$$;

-- 5) 아침 알림 받을 대화방 (아침 크론, 'cron' 비밀값)
create or replace function public.cron_telegram_chat(p_secret text, p_user uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return (select chat_id from public.telegram_links where user_id = p_user and notify_morning);
end;
$$;

-- 6) 지금 보낼 텔레그램 일정 알림 (5분 크론, 'reminder' 비밀값)
--    시간 일정: 시작 1시간 전 ~ 시작 / 종일: 당일 08:00 ~ 자정 (한국 시간). 일정 알림(웹 푸시)과 같은 기준.
--    all: 내 가족의 강의·가족 일정 전부 / selected: 🔔 켠 일정만. 금액은 넣지 않는다.
create or replace function public.cron_due_telegram(p_secret text)
returns table (user_id uuid, chat_id bigint, item_key text, title text, body text, url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.check_named_secret('reminder', p_secret);
  return query
  with links as (
    select t.user_id, t.chat_id, t.notify_events,
      coalesce((select m.owner_id from public.family_members m where m.member_id = t.user_id), t.user_id) as fam
    from public.telegram_links t
    where t.notify_events <> 'off'
  ),
  items as (
    -- 전부 받기: 가족(=가족을 만든 사람)의 강의와 가족 일정
    select k.user_id, k.chat_id, 'lecture:' || l.id as key, l.title, l.lecture_date as d, l.start_time as t, l.organization as place,
           case when l.user_id = k.user_id then '/lectures/' || l.id else '/family' end as url
    from links k join public.lectures l on l.user_id = k.fam
    where k.notify_events = 'all'
      and l.lecture_date between (now() at time zone 'Asia/Seoul')::date and (now() at time zone 'Asia/Seoul')::date + 1
    union all
    select k.user_id, k.chat_id, 'event:' || e.id, e.title, e.event_date, e.start_time, null, '/family/' || e.id
    from links k join public.family_events e on e.family_id = k.fam
    where k.notify_events = 'all'
      and e.event_date between (now() at time zone 'Asia/Seoul')::date and (now() at time zone 'Asia/Seoul')::date + 1
    union all
    -- 골라 받기: 🔔 켠 일정
    select k.user_id, k.chat_id, 'lecture:' || l.id, l.title, l.lecture_date, l.start_time, l.organization,
           case when l.user_id = k.user_id then '/lectures/' || l.id else '/family' end
    from links k
    join public.event_reminders r on r.user_id = k.user_id and r.kind = 'lecture'
    join public.lectures l on l.id::text = r.ref and l.user_id = k.fam
    where k.notify_events = 'selected'
    union all
    select k.user_id, k.chat_id, 'event:' || e.id, e.title, e.event_date, e.start_time, null, '/family/' || e.id
    from links k
    join public.event_reminders r on r.user_id = k.user_id and r.kind = 'event'
    join public.family_events e on e.id::text = r.ref and e.family_id = k.fam
    where k.notify_events = 'selected'
    union all
    select k.user_id, k.chat_id, 'event:' || e.id, e.title, e.event_date, e.start_time, null, '/family/' || e.id
    from links k
    join public.event_reminders r on r.user_id = k.user_id and r.kind = 'import'
    join public.family_events e on e.source_id::text || ':' || e.external_uid = r.ref and e.family_id = k.fam
    where k.notify_events = 'selected'
  ),
  timed as (
    -- 날짜·시간을 키에 넣어, 일정을 옮기면 새 시각에 다시 알린다
    select i.*, i.key || '@' || i.d || coalesce(' ' || i.t::text, '') as item_key,
      case when i.t is null then (i.d + time '08:00') at time zone 'Asia/Seoul'
           else (i.d + i.t) at time zone 'Asia/Seoul' - interval '1 hour' end as send_from,
      case when i.t is null then (i.d + 1)::timestamp at time zone 'Asia/Seoul'
           else (i.d + i.t) at time zone 'Asia/Seoul' end as send_until
    from items i
  )
  select distinct on (x.user_id, x.item_key)
         x.user_id, x.chat_id, x.item_key,
         case when x.t is null then '오늘 일정' else '1시간 뒤 일정' end,
         (case when x.t is null then '' else to_char(x.t, 'HH24:MI') || ' ' end) || x.title || coalesce(' · ' || x.place, ''),
         x.url
  from timed x
  where now() >= x.send_from and now() < x.send_until
    and not exists (select 1 from public.telegram_sent s where s.user_id = x.user_id and s.item_key = x.item_key)
  order by x.user_id, x.item_key;
end;
$$;

-- 보낸 텔레그램 알림 기록 + 오래된 기록 정리
create or replace function public.cron_finish_telegram(p_secret text, p_sent jsonb, p_gone bigint[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.check_named_secret('reminder', p_secret);
  if jsonb_typeof(p_sent) = 'array' then
    insert into public.telegram_sent (user_id, item_key)
    select x.user_id, x.item_key from jsonb_to_recordset(p_sent) as x(user_id uuid, item_key text)
    on conflict do nothing;
  end if;
  -- 봇을 차단했거나 대화방이 없어진 경우
  delete from public.telegram_links where chat_id = any (coalesce(p_gone, '{}'));
  delete from public.telegram_sent where sent_at < now() - interval '7 days';
end;
$$;

revoke all on function public.cron_telegram_link(text, text, bigint, text) from public;
revoke all on function public.cron_telegram_unlink(text, bigint) from public;
revoke all on function public.cron_telegram_chat(text, uuid) from public;
revoke all on function public.cron_due_telegram(text) from public;
revoke all on function public.cron_finish_telegram(text, jsonb, bigint[]) from public;
grant execute on function public.cron_telegram_link(text, text, bigint, text) to anon;
grant execute on function public.cron_telegram_unlink(text, bigint) to anon;
grant execute on function public.cron_telegram_chat(text, uuid) to anon;
grant execute on function public.cron_due_telegram(text) to anon;
grant execute on function public.cron_finish_telegram(text, jsonb, bigint[]) to anon;
