-- 연구소 워커 전용 비밀값. CRON_SECRET 과 따로 둬서, 워커 쪽이 새더라도 연구소 함수만
-- 열리고 크론 함수(캘린더·백업·공고 등)는 그대로 잠겨 있다.
-- 값은 저장소에 두지 않고 해시만 private.app_secrets 의 name='lab_worker' 에 넣는다
-- (CRON_SECRET 과 같은 방식). 적용함.
create or replace function private.check_lab_secret(p_secret text)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if p_secret is null or length(p_secret) < 32 or not exists (
    select 1 from private.app_secrets
    where name = 'lab_worker' and sha256 = encode(extensions.digest(p_secret, 'sha256'), 'hex')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- 위 검사를 쓰도록 연구소 함수 세 개를 바꾼다
create or replace function public.cron_lab_next(p_secret text, p_user uuid)
returns table (id uuid, researcher text, title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_lab_secret(p_secret);
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
  perform private.check_lab_secret(p_secret);
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
  perform private.check_lab_secret(p_secret);
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
