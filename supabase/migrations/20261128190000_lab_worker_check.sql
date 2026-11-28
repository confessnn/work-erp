-- 워커가 ERP 의 요약 라우트(/api/lab/summarize)를 부를 때, 그 요청이 정말 워커인지 확인하는 함수.
-- 요약 자체는 서버가 CRON_SECRET 으로 하고, 워커에는 CRON_SECRET 을 주지 않는다.
-- 그래서 워커 쪽이 새더라도 열리는 건 연구소 함수와 이 확인뿐이다. 적용함.
create or replace function public.cron_lab_check(p_secret text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_lab_secret(p_secret);
end;
$$;
revoke all on function public.cron_lab_check(text) from public;
grant execute on function public.cron_lab_check(text) to anon;
