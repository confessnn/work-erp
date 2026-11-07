-- 전자세금계산서: 내 사업자 정보, 거래처, 발행 내역

-- 1) 내 사업자 정보 (세금계산서의 공급자)
create table public.tax_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  identification_number text not null check (identification_number ~ '^\d{10}$'),
  tax_registration_id text check (tax_registration_id ~ '^\d{4}$'),
  organization_name text not null,
  representative_name text not null,
  address text,
  business_type text,
  business_item text,
  manager_email text not null,
  manager_name text,
  taxation_type text,
  updated_at timestamptz not null default now()
);
alter table public.tax_profiles enable row level security;
create policy "tax_profiles_select_own" on public.tax_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "tax_profiles_insert_own" on public.tax_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tax_profiles_update_own" on public.tax_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tax_profiles_delete_own" on public.tax_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 2) 거래처 (세금계산서의 공급받는자). 사업자등록증 파일은 보관하지 않고 읽은 내용만 저장한다
create table public.tax_partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  identification_number text not null check (identification_number ~ '^\d{10}$'),
  tax_registration_id text check (tax_registration_id ~ '^\d{4}$'),
  organization_name text not null,
  representative_name text not null,
  address text,
  business_type text,
  business_item text,
  manager_email text not null,
  manager_name text,
  validation text check (validation in ('MATCHED', 'NOT_MATCHED', 'UNAVAILABLE')),
  registration_status text,
  taxation_type text,
  status_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index tax_partners_user_number_idx
  on public.tax_partners (user_id, identification_number, coalesce(tax_registration_id, ''));
alter table public.tax_partners enable row level security;
create policy "tax_partners_select_own" on public.tax_partners
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "tax_partners_insert_own" on public.tax_partners
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tax_partners_update_own" on public.tax_partners
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tax_partners_delete_own" on public.tax_partners
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 3) 발행 내역. id 를 볼타 요청 번호로 쓴다. 거래처를 지워도 보낸 내용(request)은 남는다
create table public.tax_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  partner_id uuid references public.tax_partners (id) on delete set null,
  is_test boolean not null,
  invoice_date date not null,
  purpose text not null check (purpose in ('RECEIPT', 'CLAIM')),
  item_name text not null,
  partner_name text not null,
  supply_cost integer not null check (supply_cost >= 1),
  tax integer not null check (tax >= 0),
  request jsonb not null,
  status text not null default 'sending' check (status in ('sending', 'requested', 'issued', 'failed', 'unknown')),
  issuance_key text,
  nts_transaction_id text,
  issued_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index tax_invoices_user_created_idx on public.tax_invoices (user_id, created_at desc);
alter table public.tax_invoices enable row level security;
create policy "tax_invoices_select_own" on public.tax_invoices
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "tax_invoices_insert_own" on public.tax_invoices
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tax_invoices_update_own" on public.tax_invoices
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tax_invoices_delete_own" on public.tax_invoices
  for delete to authenticated using ((select auth.uid()) = user_id);
