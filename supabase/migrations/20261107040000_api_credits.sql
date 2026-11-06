-- API 크레딧: 서비스별 사용액과 자동 충전 설정. 잔액은 조회 API가 없어 사용자가 넣은 값에서 사용액을 빼 추정한다
-- 달러 금액은 센트 단위. 설정값은 정수, 하루 사용액은 소수까지 온다

-- 1) 서비스별 설정 + 마지막 조회 결과
create table public.api_credit_settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai')),
  base_balance_cents integer check (base_balance_cents >= 0),
  base_date date,
  -- 잔액을 넣은 날에 이미 쓴 금액. 그날 사용액에서 이만큼 빼고 계산한다
  base_day_cost_cents numeric(14, 6) not null default 0,
  reload_threshold_cents integer check (reload_threshold_cents >= 0),
  reload_amount_cents integer check (reload_amount_cents > 0),
  -- add = 정해진 금액을 더함, to = 정해진 잔액까지 채움
  reload_mode text not null default 'add' check (reload_mode in ('add', 'to')),
  last_synced_at timestamptz,
  last_sync_error text,
  primary key (user_id, provider)
);
alter table public.api_credit_settings enable row level security;
create policy "api_credit_settings_select_own" on public.api_credit_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "api_credit_settings_insert_own" on public.api_credit_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "api_credit_settings_update_own" on public.api_credit_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "api_credit_settings_delete_own" on public.api_credit_settings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 2) 하루 사용액 (UTC 날짜 기준. 두 서비스 모두 UTC로 집계한다)
create table public.api_usage_daily (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai')),
  day date not null,
  cost_cents numeric(14, 6) not null default 0 check (cost_cents >= 0),
  tokens bigint check (tokens >= 0),
  primary key (user_id, provider, day)
);
alter table public.api_usage_daily enable row level security;
create policy "api_usage_daily_select_own" on public.api_usage_daily
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "api_usage_daily_insert_own" on public.api_usage_daily
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "api_usage_daily_update_own" on public.api_usage_daily
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "api_usage_daily_delete_own" on public.api_usage_daily
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 3) 예약 실행 함수 (비밀값 없으면 거부, private.check_cron_secret 재사용)
create or replace function public.cron_api_credit_jobs(p_secret text)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query select distinct s.user_id from public.api_credit_settings s;
end;
$$;

-- 사용액 저장 + 결과 기록. 실패하면 p_error만 남기고 이전 값은 그대로 둔다
create or replace function public.cron_save_api_usage(p_secret text, p_user uuid, p_provider text, p_rows jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);

  if p_error is null and jsonb_typeof(p_rows) = 'array' then
    insert into public.api_usage_daily (user_id, provider, day, cost_cents, tokens)
    select p_user, p_provider, r.day, r.cost_cents, r.tokens
    from jsonb_to_recordset(p_rows) as r (day date, cost_cents numeric, tokens bigint)
    on conflict (user_id, provider, day) do update
      set cost_cents = excluded.cost_cents,
          tokens = coalesce(excluded.tokens, public.api_usage_daily.tokens);
  end if;

  update public.api_credit_settings
     set last_synced_at = case when p_error is null then now() else last_synced_at end,
         last_sync_error = p_error
   where user_id = p_user and provider = p_provider;
end;
$$;

revoke all on function public.cron_api_credit_jobs(text) from public;
revoke all on function public.cron_save_api_usage(text, uuid, text, jsonb, text) from public;
grant execute on function public.cron_api_credit_jobs(text) to anon;
grant execute on function public.cron_save_api_usage(text, uuid, text, jsonb, text) to anon;
