-- 아침 '오늘 할 일' 메일: 강의·가족 일정을 함께 싣는다.
-- 메일에는 시간·제목·장소만 넣고 강의료 같은 금액은 넣지 않는다.
create or replace function public.cron_morning_agenda(p_secret text, p_user uuid, p_from date, p_to date)
returns table (
  kind text,
  event_date date,
  start_time time,
  end_time time,
  title text,
  place text,
  person text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select 'lecture'::text, l.lecture_date, l.start_time, l.end_time, l.title, l.organization, null::text
    from public.lectures l
    where l.user_id = p_user and l.lecture_date between p_from and p_to
    union all
    select 'family'::text, e.event_date, e.start_time, e.end_time, e.title, null::text, e.person
    from public.family_events e
    where e.family_id = p_user and e.event_date between p_from and p_to
    order by 2, 3 nulls first, 5;
end;
$$;

revoke all on function public.cron_morning_agenda(text, uuid, date, date) from public;
grant execute on function public.cron_morning_agenda(text, uuid, date, date) to anon;

-- 입찰가 계산기: 공고문 요약에서 읽어 낸 값(낙찰방식·기준금액·하한율·배점)을 한 번만 뽑아 둔다
alter table public.bid_notices
  add column calc_hints jsonb;
