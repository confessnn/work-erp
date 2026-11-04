-- 강의 일정 + 강의료 + 원천징수 + 수령 관리
create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- 일정
  title text not null,
  organization text,
  lecture_date date not null,
  start_time time,
  end_time time,
  hours numeric(6, 2) not null default 0 check (hours >= 0),

  -- 강의료 (원 단위 정수)
  hourly_rate integer not null default 0 check (hourly_rate >= 0),
  gross_amount integer not null default 0 check (gross_amount >= 0),

  -- 원천징수: business = 사업소득 3.3%, other = 기타소득 8.8%
  income_type text not null default 'business' check (income_type in ('business', 'other')),
  apply_tax_exemption boolean not null default true,
  income_tax integer not null default 0 check (income_tax >= 0),
  local_tax integer not null default 0 check (local_tax >= 0),
  expected_net integer not null default 0,

  -- 수령
  is_paid boolean not null default false,
  paid_date date,
  paid_amount integer check (paid_amount >= 0),

  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lectures_user_date_idx on public.lectures (user_id, lecture_date desc);

alter table public.lectures enable row level security;

create policy "lectures_select_own" on public.lectures
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "lectures_insert_own" on public.lectures
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "lectures_update_own" on public.lectures
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "lectures_delete_own" on public.lectures
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lectures_set_updated_at
  before update on public.lectures
  for each row execute function public.set_updated_at();
