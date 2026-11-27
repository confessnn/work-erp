-- 가족 일정 '전날 알림': remind_day_before = true 인 일정은 전날 한국 09:00 에 텔레그램으로 '내일 일정'을 보낸다.
-- (생일처럼 미리 준비가 필요한 일정용. 당일 08:00 '오늘 일정' 알림은 그대로 간다)
alter table public.family_events
  add column if not exists remind_day_before boolean not null default false;

create or replace function public.cron_due_telegram(p_secret text)
 returns table(user_id uuid, token text, chat_id bigint, item_key text, title text, body text, url text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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
    select i.user_id, i.chat_id, i.key, i.title, i.d, i.t, i.place, i.url,
      i.key || '@' || i.d || coalesce(' ' || i.t::text, '') as item_key,
      case when i.t is null then (i.d + time '08:00') at time zone 'Asia/Seoul'
           else (i.d + i.t) at time zone 'Asia/Seoul' - interval '1 hour' end as send_from,
      case when i.t is null then (i.d + 1)::timestamp at time zone 'Asia/Seoul'
           else (i.d + i.t) at time zone 'Asia/Seoul' end as send_until,
      case when i.t is null then '오늘 일정' else '1시간 뒤 일정' end as head
    from items i
    union all
    -- 전날 알림: 알림을 끄지 않은 사람에게는 'all'·'selected' 상관없이 보낸다 (일정 쪽에서 직접 켠 것이므로)
    select k.user_id, k.chat_id, 'eve:event:' || e.id, e.title, e.event_date, e.start_time, null, '/family/' || e.id,
      'eve:event:' || e.id || '@' || e.event_date,
      (e.event_date - 1 + time '09:00') at time zone 'Asia/Seoul',
      e.event_date::timestamp at time zone 'Asia/Seoul',
      '내일 일정'
    from links k join public.family_events e on e.family_id = k.fam
    where e.remind_day_before
      and e.event_date = (now() at time zone 'Asia/Seoul')::date + 1
  )
  select distinct on (x.user_id, x.item_key)
         x.user_id, private.telegram_token(x.user_id), x.chat_id, x.item_key,
         x.head,
         (case when x.t is null then '' else to_char(x.t, 'HH24:MI') || ' ' end) || x.title || coalesce(' · ' || x.place, ''),
         x.url
  from timed x
  where now() >= x.send_from and now() < x.send_until
    and not exists (select 1 from public.telegram_sent s where s.user_id = x.user_id and s.item_key = x.item_key)
  order by x.user_id, x.item_key;
end;
$function$;

revoke all on function public.cron_due_telegram(text) from public;
grant execute on function public.cron_due_telegram(text) to anon;
