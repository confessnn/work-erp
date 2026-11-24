-- 나라장터 낙찰정보(지난 원가 용역 낙찰금액·낙찰률) 캐시. 1년치를 7일씩 52번 받아야 해서 하루 한 번만 새로 받는다.
-- 낙찰 업체 대표자·전화·주소는 저장하지 않는다.
create table public.bid_award_cache (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  keyword text not null check (char_length(keyword) between 1 and 30),
  fetched_at timestamptz not null default now(),
  failed_weeks integer not null default 0,
  awards jsonb not null default '[]'::jsonb,
  primary key (user_id, keyword)
);
alter table public.bid_award_cache enable row level security;
create policy bid_award_cache_select_own on public.bid_award_cache for select to authenticated using ((select auth.uid()) = user_id);
create policy bid_award_cache_insert_own on public.bid_award_cache for insert to authenticated with check ((select auth.uid()) = user_id);
create policy bid_award_cache_update_own on public.bid_award_cache for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy bid_award_cache_delete_own on public.bid_award_cache for delete to authenticated using ((select auth.uid()) = user_id);
