-- 플랜 사용량 '지금 갱신' 요청. 값은 PC에서만 읽을 수 있어, 화면이 요청을 남기면 PC 스크립트가 확인해 값을 보낸다
create table public.plan_usage_refresh (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now()
);
alter table public.plan_usage_refresh enable row level security;
create policy "plan_usage_refresh_select_own" on public.plan_usage_refresh
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "plan_usage_refresh_insert_own" on public.plan_usage_refresh
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "plan_usage_refresh_update_own" on public.plan_usage_refresh
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "plan_usage_refresh_delete_own" on public.plan_usage_refresh
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 토큰이 맞으면 요청을 지우고, 요청이 있었는지 돌려준다
create or replace function public.take_plan_usage_refresh(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_count integer;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select t.user_id into v_user from private.plan_usage_tokens t
   where t.sha256 = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.plan_usage_refresh r where r.user_id = v_user;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.take_plan_usage_refresh(text) from public;
grant execute on function public.take_plan_usage_refresh(text) to anon;
