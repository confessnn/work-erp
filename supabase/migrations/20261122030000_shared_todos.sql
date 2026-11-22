-- 할 일 공유: 각자 자기 할 일을 따로 쓰고, '공유'를 켠 할 일만 가족(가족을 만든 사람 ↔ 초대받은 가족)에게 보인다.
-- 공유받은 사람은 보고 완료 체크만 할 수 있다. 고치기·지우기·미루기는 쓴 사람만 (기존 todos 정책 그대로).

alter table public.todos add column shared boolean not null default false;

-- 내 가족이 공유한 할 일을 읽을 수 있다
--   초대받은 가족 → 가족을 만든 사람의 공유 할 일 (user_id = my_family())
--   가족을 만든 사람 → 초대한 가족들의 공유 할 일
create policy todos_select_shared on public.todos
  for select to authenticated
  using (
    shared
    and user_id <> (select auth.uid())
    and (
      user_id = (select public.my_family())
      or exists (
        select 1 from public.family_members m
        where m.member_id = todos.user_id and m.owner_id = (select public.my_family())
      )
    )
  );

-- 공유받은 할 일 완료 체크 (쓴 사람이 아니어도). 공유가 꺼졌거나 가족이 아니면 아무 일도 하지 않는다
create or replace function public.set_shared_todo_done(p_id uuid, p_done boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  fam uuid := public.my_family();
  n integer;
begin
  if me is null then raise exception 'login required' using errcode = '42501'; end if;
  update public.todos t
     set done_at = case when p_done then now() else null end
   where t.id = p_id
     and t.shared
     and t.user_id <> me
     and (
       t.user_id = fam
       or exists (select 1 from public.family_members m where m.member_id = t.user_id and m.owner_id = fam)
     );
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.set_shared_todo_done(uuid, boolean) from public, anon;
grant execute on function public.set_shared_todo_done(uuid, boolean) to authenticated;

-- 아침 알림: 가족이 나에게 공유한, 그날까지 안 끝낸 할 일 (누가 공유했는지 함께)
create or replace function public.cron_morning_shared_todos(p_secret text, p_user uuid, p_day date)
returns table (title text, due_date date, note text, who text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fam uuid := coalesce((select m.owner_id from public.family_members m where m.member_id = p_user), p_user);
begin
  perform private.check_cron_secret(p_secret);
  return query
    select t.title, t.due_date, t.note,
           coalesce((select m.label from public.family_members m where m.member_id = t.user_id), '가족')
    from public.todos t
    where t.shared and t.done_at is null and t.dismissed_at is null
      and t.due_date <= p_day
      and t.user_id <> p_user
      and (t.user_id = fam or exists (select 1 from public.family_members m where m.member_id = t.user_id and m.owner_id = fam))
    order by t.due_date, t.created_at
    limit 30;
end;
$$;
revoke all on function public.cron_morning_shared_todos(text, uuid, date) from public;
grant execute on function public.cron_morning_shared_todos(text, uuid, date) to anon;
