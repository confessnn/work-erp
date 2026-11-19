-- 끝난 일정에 남기는 '기록'과, 오늘 할 일에서 일정이 끝났는지 알기 위한 끝나는 시각.
-- 기록은 메모와 따로 둔다 (메모의 줄은 할 일로 불러오므로, 기록이 새 할 일이 되지 않게)
alter table public.lectures
  add column record text check (record is null or char_length(record) <= 2000);
alter table public.family_events
  add column record text check (record is null or char_length(record) <= 2000);
alter table public.todos
  add column source_end_at timestamptz;

-- 일정 할 일에 끝나는 시각을 같이 넣고, 일정 시간이 바뀌면 제목·끝나는 시각을 고친다
create or replace function private.sync_schedule_todos(p_user uuid, p_family uuid, p_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  with items as (
    -- 끝나는 시각: 끝 시간이 없으면 강의는 시작 + 강의 시간으로 본다. 시간을 모르면 null
    select 'lecture' as kind, l.id, l.title, l.start_time, l.memo,
           ((p_day + coalesce(l.end_time, l.start_time + make_interval(mins => round(l.hours * 60)::int)))
             at time zone 'Asia/Seoul') as end_at
    from public.lectures l where l.user_id = p_user and l.lecture_date = p_day
    union all
    select 'family', f.id, f.title, f.start_time, f.memo, ((p_day + f.end_time) at time zone 'Asia/Seoul')
    from public.family_events f where f.family_id = p_family and f.event_date = p_day
  ),
  wanted as (
    select x.kind, x.id, x.key, x.title, x.source_title, x.end_at,
           row_number() over (order by x.start_time nulls first, x.sched_title, x.id, x.line_no) as ord
    from (
      -- 일정 자체: "08:00 도고 켐코인재원"
      select i.kind, i.id, 'event' as key,
             left(concat_ws(' ', to_char(i.start_time, 'HH24:MI'), i.title), 200) as title,
             null::text as source_title, i.end_at, i.start_time, i.title as sched_title, 0::bigint as line_no
      from items i
      union all
      -- 메모 한 줄 = 할 일 하나. 줄 앞의 -, •, 1., [ ] 같은 표시는 뗀다. 같은 줄이 두 번 있으면 하나만
      select i.kind, i.id, 'memo:' || m.cleaned, m.cleaned, i.title, null::timestamptz, i.start_time, i.title, min(m.n)
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
    insert into public.todos (user_id, title, due_date, source_kind, source_id, source_key, source_title, source_end_at, created_at)
    select p_user, w.title, p_day, w.kind, w.id, w.key, w.source_title, w.end_at, now() + w.ord * interval '1 millisecond'
    from wanted w
    -- 이미 있는 일정 할 일은 시간이 바뀌었을 수 있으니 제목·끝나는 시각만 새로 고친다
    on conflict (user_id, source_kind, source_id, source_key) do update
      set title = excluded.title, source_end_at = excluded.source_end_at
      where public.todos.source_key = 'event'
        and (public.todos.title, public.todos.source_end_at) is distinct from (excluded.title, excluded.source_end_at)
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
