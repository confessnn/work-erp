-- 내 투찰 기록: 어떤 안으로 얼마를 냈고 결과가 어땠는지 남겨, 다음 3안을 고칠 근거로 쓴다.
alter table public.bid_settings
  add column my_bizno text check (my_bizno is null or my_bizno ~ '^[0-9]{10}$');

create table public.bid_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  notice_id uuid not null references public.bid_notices (id) on delete cascade,
  plan text not null check (plan in ('attack', 'balanced', 'safe', 'manual')),
  amount bigint not null check (amount > 0),
  base_amount bigint check (base_amount is null or base_amount > 0),
  rate numeric(7, 3),
  submitted_on date not null default ((now() at time zone 'Asia/Seoul')::date),
  memo text check (memo is null or char_length(memo) <= 500),
  result text not null default 'pending' check (result in ('pending', 'won', 'lost', 'invalid', 'cancelled')),
  rank integer check (rank is null or rank > 0),
  participants integer check (participants is null or participants > 0),
  open_rate numeric(7, 3),
  winner_rate numeric(7, 3),
  winner_amount bigint,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index bid_submissions_user_idx on public.bid_submissions (user_id, submitted_on desc);
create index bid_submissions_notice_idx on public.bid_submissions (notice_id);
alter table public.bid_submissions enable row level security;
create policy bid_submissions_select_own on public.bid_submissions for select to authenticated using ((select auth.uid()) = user_id);
create policy bid_submissions_insert_own on public.bid_submissions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy bid_submissions_update_own on public.bid_submissions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy bid_submissions_delete_own on public.bid_submissions for delete to authenticated using ((select auth.uid()) = user_id);
