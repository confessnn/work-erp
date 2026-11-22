-- 육아 기록: 수유(분유·모유·유축)·기저귀·수면·몸무게·투약·목욕·병원·물·이유식·체온·기타.
-- 가족(가족을 만든 사람과 초대받은 가족)이 같은 기록을 함께 보고 쓰고 고친다.
create table public.baby_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default public.my_family() references auth.users (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  kind text not null check (kind in (
    'formula', 'breast', 'pumped', 'diaper', 'sleep', 'weight', 'medicine',
    'bath', 'hospital', 'water', 'solid', 'temperature', 'other'
  )),
  started_at timestamptz not null default now(),
  ended_at timestamptz,                        -- 수면·모유 끝난 시각 (자는 중이면 비어 있음)
  amount_ml integer check (amount_ml is null or amount_ml between 0 and 5000),   -- 분유·유축·물
  value numeric(6, 2) check (value is null or value between 0 and 999),          -- 몸무게 kg, 체온 ℃, 이유식 g
  side text check (side is null or side in ('left', 'right', 'both')),           -- 모유: 왼쪽·오른쪽·양쪽
  diaper text check (diaper is null or diaper in ('pee', 'poo', 'both')),         -- 기저귀: 소변·대변·둘 다
  label text check (label is null or char_length(label) <= 100),                 -- 약 이름, 이유식 메뉴, 병원 이름
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index baby_logs_family_time_idx on public.baby_logs (family_id, started_at desc);
create index baby_logs_family_kind_idx on public.baby_logs (family_id, kind, started_at desc);
alter table public.baby_logs enable row level security;

create policy baby_logs_select_family on public.baby_logs
  for select to authenticated using (family_id = (select public.my_family()));
create policy baby_logs_insert_family on public.baby_logs
  for insert to authenticated with check (family_id = (select public.my_family()));
create policy baby_logs_update_family on public.baby_logs
  for update to authenticated
  using (family_id = (select public.my_family()))
  with check (family_id = (select public.my_family()));
create policy baby_logs_delete_family on public.baby_logs
  for delete to authenticated using (family_id = (select public.my_family()));

create trigger baby_logs_set_updated_at
  before update on public.baby_logs
  for each row execute function public.set_updated_at();
