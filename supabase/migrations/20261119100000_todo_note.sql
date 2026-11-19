-- 할 일 메모: 할 일에 덧붙여 둘 내용 (담당자 연락처, 금액 등). 아침 알림에도 같이 보낸다
alter table public.todos
  add column note text check (note is null or char_length(note) <= 1000);

-- 반환 칸이 늘어나므로 지우고 다시 만든다 (내용은 20261119070000_schedule_todos.sql 과 같고 note 만 더함)
drop function public.cron_morning_todos(text, uuid, date);
create function public.cron_morning_todos(p_secret text, p_user uuid, p_day date)
returns table (title text, due_date date, note text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  perform private.sync_schedule_todos(p_user, p_user, p_day);
  return query
    select t.title, t.due_date, t.note from public.todos t
    where t.user_id = p_user and t.done_at is null and t.due_date <= p_day
      and t.dismissed_at is null
      and t.source_key is distinct from 'event'
    order by t.due_date, t.created_at
    limit 30;
end;
$$;
revoke all on function public.cron_morning_todos(text, uuid, date) from public;
grant execute on function public.cron_morning_todos(text, uuid, date) to anon;
