-- 맥에서 도는 연구소 워커가 쓰는 함수.
-- 워커에는 로그인 세션이 없으므로 CRON_SECRET 으로 잠근 security definer 함수로만 lab_tasks 에
-- 닿게 한다 (service_role 키는 쓰지 않는다 — AGENTS.md).

-- 맡긴 일 중 가장 오래된 하나를 집어 '진행 중'으로 바꾸고 돌려준다.
-- for update skip locked 라 워커가 여럿이어도 같은 일을 두 번 집지 않는다.
create or replace function public.cron_lab_next(p_secret text, p_user uuid)
returns table (id uuid, researcher text, title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
  update public.lab_tasks t
     set state = 'running', started_at = now(), updated_at = now()
   where t.id = (
     select x.id
       from public.lab_tasks x
      where x.user_id = p_user and x.state = 'queued'
      order by x.created_at
      limit 1
      for update skip locked
   )
  returning t.id, t.researcher, t.title;
end;
$$;
revoke all on function public.cron_lab_next(text, uuid) from public;
grant execute on function public.cron_lab_next(text, uuid) to anon;

-- 끝낸 일에 결과를 적고 '확인 대기'로 옮긴다 (사람이 보고 '완료'로 넘긴다)
create or replace function public.cron_lab_finish(p_secret text, p_user uuid, p_id uuid, p_result text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  update public.lab_tasks
     set state = 'review', result = p_result, finished_at = now(), updated_at = now()
   where id = p_id and user_id = p_user;
end;
$$;
revoke all on function public.cron_lab_finish(text, uuid, uuid, text) from public;
grant execute on function public.cron_lab_finish(text, uuid, uuid, text) to anon;

-- 워커가 꺼진 사이 '진행 중'으로 남은 일을 다시 '맡긴 일'로 돌린다 (맥을 껐다 켜면 이어서 한다)
create or replace function public.cron_lab_requeue_stale(p_secret text, p_user uuid, p_minutes int default 30)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.check_cron_secret(p_secret);
  update public.lab_tasks
     set state = 'queued', started_at = null, updated_at = now()
   where user_id = p_user
     and state = 'running'
     and started_at < now() - make_interval(mins => p_minutes);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.cron_lab_requeue_stale(text, uuid, int) from public;
grant execute on function public.cron_lab_requeue_stale(text, uuid, int) to anon;
