-- 할 일(To-do): 대시보드에서 오늘 할 일을 적고 체크한다. 아침 텔레그램에도 오늘·밀린 할 일을 넣는다.
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  due_date date not null default (now() at time zone 'Asia/Seoul')::date,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index todos_user_due_idx on public.todos (user_id, due_date);
alter table public.todos enable row level security;

create policy todos_select on public.todos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy todos_insert on public.todos
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy todos_update on public.todos
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy todos_delete on public.todos
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 아침 알림용: 그날까지 안 끝낸 할 일 (밀린 것 포함, 최대 30개)
create or replace function public.cron_morning_todos(p_secret text, p_user uuid, p_day date)
returns table (title text, due_date date)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select t.title, t.due_date from public.todos t
    where t.user_id = p_user and t.done_at is null and t.due_date <= p_day
    order by t.due_date, t.created_at
    limit 30;
end;
$$;
revoke all on function public.cron_morning_todos(text, uuid, date) from public;
grant execute on function public.cron_morning_todos(text, uuid, date) to anon;
