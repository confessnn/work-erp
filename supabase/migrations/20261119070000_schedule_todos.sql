-- 오늘 일정(강의·가족 일정)과 그 메모 줄을 '오늘 할 일'로 불러온다.
-- 불러온 할 일은 출처(source_*)를 기억해 다시 불러와도 두 번 생기지 않는다.
alter table public.todos
  add column source_kind text check (source_kind in ('lecture', 'family')),
  add column source_id uuid,
  -- 'event' = 일정 자체, 'memo:<줄 내용>' = 메모 한 줄
  add column source_key text,
  -- 메모 줄이 어느 일정에서 왔는지 (화면에 작게 보여 준다)
  add column source_title text,
  -- 불러온 할 일을 지우면 다시 불러오지 않도록 지운 표시만 한다
  add column dismissed_at timestamptz,
  add constraint todos_source_all_or_none check (
    (source_kind is null and source_id is null and source_key is null)
    or (source_kind is not null and source_id is not null and source_key is not null)
  ),
  add constraint todos_source_unique unique (user_id, source_kind, source_id, source_key);

/**
 * p_day 의 일정과 메모 줄을 할 일로 넣는다. 이미 넣은 것(지운 것 포함)은 건너뛴다.
 * 오늘 불러왔지만 아직 안 한 할 일 중, 일정이 다른 날로 옮겨졌거나 메모에서 지워진 줄은 같이 지운다.
 */
create or replace function private.sync_schedule_todos(p_user uuid, p_family uuid, p_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  with items as (
    select 'lecture' as kind, l.id, l.title, l.start_time, l.memo
    from public.lectures l where l.user_id = p_user and l.lecture_date = p_day
    union all
    select 'family', f.id, f.title, f.start_time, f.memo
    from public.family_events f where f.family_id = p_family and f.event_date = p_day
  ),
  wanted as (
    select x.kind, x.id, x.key, x.title, x.source_title,
           row_number() over (order by x.start_time nulls first, x.sched_title, x.id, x.line_no) as ord
    from (
      -- 일정 자체: "08:00 도고 켐코인재원"
      select i.kind, i.id, 'event' as key,
             left(concat_ws(' ', to_char(i.start_time, 'HH24:MI'), i.title), 200) as title,
             null::text as source_title, i.start_time, i.title as sched_title, 0::bigint as line_no
      from items i
      union all
      -- 메모 한 줄 = 할 일 하나. 줄 앞의 -, •, 1., [ ] 같은 표시는 뗀다. 같은 줄이 두 번 있으면 하나만
      select i.kind, i.id, 'memo:' || m.cleaned, m.cleaned, i.title, i.start_time, i.title, min(m.n)
      from items i
      cross join lateral (
        select left(btrim(regexp_replace(s.line, '^[\s\-*•·▪▶✔✓☐□]*(\[[ xX]?\]\s*)?(\d+[.)]\s+)?', '')), 200) as cleaned, s.n
        from regexp_split_to_table(coalesce(i.memo, ''), E'\\r?\\n') with ordinality as s(line, n)
      ) m
      where m.cleaned <> ''
      group by i.kind, i.id, m.cleaned, i.title, i.start_time
    ) x
  ),
  -- 넣은 순서(created_at)가 곧 목록 순서이므로 시작 시각 순으로 1ms씩 벌려 넣는다
  added as (
    insert into public.todos (user_id, title, due_date, source_kind, source_id, source_key, source_title, created_at)
    select p_user, w.title, p_day, w.kind, w.id, w.key, w.source_title, now() + w.ord * interval '1 millisecond'
    from wanted w
    on conflict (user_id, source_kind, source_id, source_key) do nothing
    returning 1
  )
  -- 오늘 불러와 아직 손대지 않은 것만 정리한다 (어제 일정에서 '내일로' 미룬 할 일은 건드리지 않는다)
  delete from public.todos t
  where t.user_id = p_user
    and t.source_kind is not null
    and t.due_date = p_day
    and t.done_at is null
    and t.dismissed_at is null
    and (t.created_at at time zone 'Asia/Seoul')::date = p_day
    and not exists (select 1 from wanted w where w.kind = t.source_kind and w.id = t.source_id and w.key = t.source_key);
$$;
revoke all on function private.sync_schedule_todos(uuid, uuid, date) from public;

-- 대시보드에서 부른다 (로그인 사용자 본인 것만)
create or replace function public.sync_schedule_todos(p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  perform private.sync_schedule_todos((select auth.uid()), public.my_family(), p_day);
end;
$$;
revoke all on function public.sync_schedule_todos(date) from public;
revoke execute on function public.sync_schedule_todos(date) from anon;
grant execute on function public.sync_schedule_todos(date) to authenticated;

-- 아침 알림: 메모 할 일까지 불러온 뒤 안 끝낸 할 일을 보낸다.
-- 일정 자체는 아침 알림의 '오늘 일정'에 이미 나오므로 할 일 목록에서는 뺀다. 지운 할 일도 뺀다.
create or replace function public.cron_morning_todos(p_secret text, p_user uuid, p_day date)
returns table (title text, due_date date)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  perform private.sync_schedule_todos(p_user, p_user, p_day);
  return query
    select t.title, t.due_date from public.todos t
    where t.user_id = p_user and t.done_at is null and t.due_date <= p_day
      and t.dismissed_at is null
      and t.source_key is distinct from 'event'
    order by t.due_date, t.created_at
    limit 30;
end;
$$;
