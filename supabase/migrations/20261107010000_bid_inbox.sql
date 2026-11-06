-- 공고 수신함: 원가계산·한일ENG 공고를 구분해 쌓아 두고 1차 판정·관심 표시

-- 1) 수신 설정 + 마지막 수신 결과 (사용자당 1행)
create table public.bid_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  auto_fetch boolean not null default true,
  last_fetched_at timestamptz,
  last_fetch_result text
);
alter table public.bid_settings enable row level security;
create policy "bid_settings_select_own" on public.bid_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "bid_settings_insert_own" on public.bid_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bid_settings_update_own" on public.bid_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "bid_settings_delete_own" on public.bid_settings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 2) 공고. 같은 공고번호·차수는 한 번만 저장 (사용자가 바꾼 상태를 덮어쓰지 않음)
create table public.bid_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- 구분: cost = 원가계산, hanil = 한일ENG / 출처: g2b = 나라장터, d2b = 국방전자조달
  category text not null check (category in ('cost', 'hanil')),
  source text not null default 'g2b' check (source in ('g2b', 'd2b')),
  -- 찾은 방법: industry = 업종, keyword = 공고명 (공고명으로만 찾으면 업종 확인 필요)
  matched_by text not null default 'keyword' check (matched_by in ('industry', 'keyword')),

  bid_no text not null,
  bid_ord text not null default '000',
  title text not null,
  notice_kind text,
  notice_org text,
  demand_org text,
  -- 금액은 원 단위 정수. 공고 금액은 integer 범위(약 21억)를 넘을 수 있어 bigint
  presumed_price bigint check (presumed_price >= 0),
  contract_method text,
  award_method text,
  region_limit text,
  main_industry text,
  site_region text,
  noticed_at timestamptz,
  closes_at timestamptz,
  opens_at timestamptz,
  detail_url text,

  -- 1차 판정: possible = 가능(검토), check = 자격 확인 필요, impossible = 불가, na = 해당 없음
  verdict text not null default 'check' check (verdict in ('possible', 'check', 'impossible', 'na')),
  verdict_reason text,

  status text not null default 'new' check (status in ('new', 'interested', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (user_id, category, bid_no, bid_ord)
);
create index bid_notices_user_close_idx on public.bid_notices (user_id, category, closes_at);

alter table public.bid_notices enable row level security;
create policy "bid_notices_select_own" on public.bid_notices
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "bid_notices_insert_own" on public.bid_notices
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bid_notices_update_own" on public.bid_notices
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "bid_notices_delete_own" on public.bid_notices
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 3) 상세까지 확인한 국방부 공고 (면허가 맞지 않은 것 포함). 호출 한도를 아끼려고 다시 조회하지 않는다
create table public.bid_checked (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  check_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, check_key)
);
create index bid_checked_user_created_idx on public.bid_checked (user_id, created_at desc);
alter table public.bid_checked enable row level security;
create policy "bid_checked_select_own" on public.bid_checked
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "bid_checked_insert_own" on public.bid_checked
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bid_checked_update_own" on public.bid_checked
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "bid_checked_delete_own" on public.bid_checked
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 4) 예약 실행 함수 (비밀값 없으면 거부, private.check_cron_secret 재사용)
create or replace function public.cron_bid_jobs(p_secret text)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query select s.user_id from public.bid_settings s where s.auto_fetch;
end;
$$;

-- 이미 확인한 국방부 공고 키
create or replace function public.cron_bid_checked(p_secret text, p_user uuid)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select c.check_key from public.bid_checked c
    where c.user_id = p_user
    order by c.created_at desc
    limit 1000;
end;
$$;

-- 공고 저장 + 결과 기록. 필요한 컬럼만 넣고, 이미 있는 공고는 건너뜀. p_result가 있으면 실패 메시지로 기록.
create or replace function public.cron_save_bids(p_secret text, p_user uuid, p_rows jsonb, p_checked text[], p_result text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  perform private.check_cron_secret(p_secret);

  if jsonb_typeof(p_rows) = 'array' and jsonb_array_length(p_rows) > 0 then
    insert into public.bid_notices (
      user_id, category, source, matched_by, bid_no, bid_ord, title, notice_kind, notice_org, demand_org, presumed_price,
      contract_method, award_method, region_limit, main_industry, site_region, noticed_at, closes_at, opens_at, detail_url,
      verdict, verdict_reason
    )
    select p_user, r.category, r.source, r.matched_by, r.bid_no, r.bid_ord, r.title, r.notice_kind, r.notice_org, r.demand_org, r.presumed_price,
           r.contract_method, r.award_method, r.region_limit, r.main_industry, r.site_region, r.noticed_at, r.closes_at, r.opens_at, r.detail_url,
           r.verdict, r.verdict_reason
    from jsonb_populate_recordset(null::public.bid_notices, p_rows) r
    on conflict (user_id, category, bid_no, bid_ord) do nothing;
    get diagnostics v_count = row_count;
  end if;

  insert into public.bid_checked (user_id, check_key)
  select p_user, k from unnest(coalesce(p_checked, '{}')) as k
  on conflict do nothing;

  update public.bid_settings
     set last_fetched_at = now(),
         last_fetch_result = coalesce(p_result, '자동: ' || v_count || '건 새로 수신')
   where user_id = p_user;
  return v_count;
end;
$$;

revoke all on function public.cron_bid_jobs(text) from public;
revoke all on function public.cron_bid_checked(text, uuid) from public;
revoke all on function public.cron_save_bids(text, uuid, jsonb, text[], text) from public;
grant execute on function public.cron_bid_jobs(text) to anon;
grant execute on function public.cron_bid_checked(text, uuid) to anon;
grant execute on function public.cron_save_bids(text, uuid, jsonb, text[], text) to anon;
