-- 플랜 사용량: Claude·Codex 구독의 5시간·주간 한도. 서버에서 읽을 방법이 없어 PC 스크립트가 보낸 값을 저장한다
create table public.plan_usage (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('claude', 'codex')),
  plan text,
  five_hour_percent numeric(5, 2) check (five_hour_percent between 0 and 100),
  five_hour_resets_at timestamptz,
  weekly_percent numeric(5, 2) check (weekly_percent between 0 and 100),
  weekly_resets_at timestamptz,
  -- Codex 크레딧 잔량 (달러가 아니라 서비스 자체 단위)
  credits_balance numeric(14, 4),
  reported_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.plan_usage enable row level security;
create policy "plan_usage_select_own" on public.plan_usage
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "plan_usage_insert_own" on public.plan_usage
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "plan_usage_update_own" on public.plan_usage
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "plan_usage_delete_own" on public.plan_usage
  for delete to authenticated using ((select auth.uid()) = user_id);

-- PC 스크립트의 토큰. DB에는 sha256만 저장하고 토큰별로 사용자를 정한다
create table private.plan_usage_tokens (
  sha256 text primary key,
  user_id uuid not null references auth.users (id) on delete cascade
);

-- 토큰이 맞을 때만 저장한다. 한쪽 창만 온 경우 다른 창의 값은 유지한다
create or replace function public.report_plan_usage(
  p_token text,
  p_provider text,
  p_plan text,
  p_five_hour_percent numeric,
  p_five_hour_resets_at timestamptz,
  p_weekly_percent numeric,
  p_weekly_resets_at timestamptz,
  p_credits_balance numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select t.user_id into v_user from private.plan_usage_tokens t
   where t.sha256 = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.plan_usage as u (
    user_id, provider, plan, five_hour_percent, five_hour_resets_at, weekly_percent, weekly_resets_at, credits_balance, reported_at
  ) values (
    v_user, p_provider, p_plan, p_five_hour_percent, p_five_hour_resets_at, p_weekly_percent, p_weekly_resets_at, p_credits_balance, now()
  )
  on conflict (user_id, provider) do update set
    plan = coalesce(excluded.plan, u.plan),
    five_hour_percent = coalesce(excluded.five_hour_percent, u.five_hour_percent),
    five_hour_resets_at = coalesce(excluded.five_hour_resets_at, u.five_hour_resets_at),
    weekly_percent = coalesce(excluded.weekly_percent, u.weekly_percent),
    weekly_resets_at = coalesce(excluded.weekly_resets_at, u.weekly_resets_at),
    credits_balance = coalesce(excluded.credits_balance, u.credits_balance),
    reported_at = now();
end;
$$;

revoke all on function public.report_plan_usage(text, text, text, numeric, timestamptz, numeric, timestamptz, numeric) from public;
grant execute on function public.report_plan_usage(text, text, text, numeric, timestamptz, numeric, timestamptz, numeric) to anon;
