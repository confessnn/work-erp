-- 텔레그램으로 이미 있는 일정에 메모 붙이기: "내일 도고 켐코 녹음준비"처럼 보내면
-- 새 일정을 만들지 않고 그날 있는 일정(강의·가족 일정)의 메모에 덧붙인다.

-- AI가 고를 수 있도록 앞뒤 일정 목록을 준다 (제목·날짜·시간만)
create or replace function public.tg_upcoming(p_hook text, p_from date, p_to date)
returns table (kind text, id uuid, event_date date, start_time time, title text)
language sql
stable
security definer
set search_path = ''
as $$
  with f as (select private.tg_family(p_hook) as fam)
  select x.kind, x.id, x.event_date, x.start_time, x.title from (
    select 'lecture'::text as kind, l.id, l.lecture_date as event_date, l.start_time, l.title
    from public.lectures l, f where l.user_id = f.fam and l.lecture_date between p_from and p_to
    union all
    select 'event'::text, e.id, e.event_date, e.start_time, e.title
    from public.family_events e, f where e.family_id = f.fam and e.event_date between p_from and p_to
  ) x
  order by x.event_date, x.start_time nulls first
  limit 80;
$$;

-- 메모 덧붙이기. 붙인 뒤의 일정 정보를 돌려준다 (못 찾으면 null)
create or replace function public.tg_add_memo(p_hook text, p_kind text, p_id uuid, p_memo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  fam uuid := private.tg_family(p_hook);
  note text := left(btrim(coalesce(p_memo, '')), 500);
  r record;
begin
  if note = '' then return null; end if;
  if p_kind = 'lecture' then
    update public.lectures l
      set memo = left(case when coalesce(l.memo, '') = '' then note else l.memo || E'\n' || note end, 2000), updated_at = now()
      where l.id = p_id and l.user_id = fam
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

revoke all on function public.tg_upcoming(text, date, date) from public;
revoke all on function public.tg_add_memo(text, text, uuid, text) from public;
grant execute on function public.tg_upcoming(text, date, date) to anon;
grant execute on function public.tg_add_memo(text, text, uuid, text) to anon;
