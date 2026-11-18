-- 텔레그램 일정 알림: 시작 1시간 전(종일 일정은 당일 08:00)에 텔레그램 봇으로 알린다.
-- 20261118010000_telegram.sql(봇 연결·아침 요약) 위에 덧붙인다. 휴대폰 웹 푸시 알림과 같은 시각 기준.
-- 5분마다 도는 /api/cron/reminders 가 보낸다('reminder' 비밀값).

-- 1) 무엇을 알릴지: all = 내 강의·가족 일정 전부 / selected = 일정에서 🔔 켠 것만 / off = 안 받음
alter table public.telegram_links
  add column notify_events text not null default 'all' check (notify_events in ('all', 'selected', 'off'));

-- 로그인한 본인이 설정을 바꾼다 (표는 함수로만 수정)
create or replace function public.set_telegram_events(p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'login required' using errcode = '42501'; end if;
  if p_mode not in ('all', 'selected', 'off') then raise exception 'invalid mode' using errcode = '22023'; end if;
  update public.telegram_links set notify_events = p_mode, updated_at = now() where user_id = auth.uid();
end;
$$;
revoke all on function public.set_telegram_events(text) from public, anon;
grant execute on function public.set_telegram_events(text) to authenticated;

-- 2) 보낸 알림 기록 (같은 알림 두 번 방지). 앱에서는 읽지 않는다
create table public.telegram_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_key text not null check (char_length(item_key) <= 700),
  sent_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
alter table public.telegram_sent enable row level security;

-- 3) 지금 보낼 텔레그램 일정 알림. 금액은 넣지 않는다.
create or replace function public.cron_due_telegram(p_secret text)
returns table (user_id uuid, token text, chat_id bigint, item_key text, title text, body text, url text)
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
    where t.chat_id is not null and t.notify_events <> 'off'
  ),
  items as (
    -- 전부: 내 가족(가족을 만든 사람)의 강의와 가족 일정 중 오늘·내일
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
         x.user_id, private.telegram_token(x.user_id), x.chat_id, x.item_key,
         case when x.t is null then '오늘 일정' else '1시간 뒤 일정' end,
         (case when x.t is null then '' else to_char(x.t, 'HH24:MI') || ' ' end) || x.title || coalesce(' · ' || x.place, ''),
         x.url
  from timed x
  where now() >= x.send_from and now() < x.send_until
    and not exists (select 1 from public.telegram_sent s where s.user_id = x.user_id and s.item_key = x.item_key)
  order by x.user_id, x.item_key;
end;
$$;

-- 4) 보낸 알림 기록, 실패 이유는 연동 화면에 보이도록, 오래된 기록 정리
create or replace function public.cron_finish_telegram(p_secret text, p_sent jsonb, p_errors jsonb)
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
  if jsonb_typeof(p_errors) = 'array' then
    update public.telegram_links t set last_error = left(x.error, 500), updated_at = now()
    from jsonb_to_recordset(p_errors) as x(user_id uuid, error text)
    where t.user_id = x.user_id;
  end if;
  delete from public.telegram_sent where sent_at < now() - interval '7 days';
end;
$$;

revoke all on function public.cron_due_telegram(text) from public;
revoke all on function public.cron_finish_telegram(text, jsonb, jsonb) from public;
grant execute on function public.cron_due_telegram(text) to anon;
grant execute on function public.cron_finish_telegram(text, jsonb, jsonb) to anon;
