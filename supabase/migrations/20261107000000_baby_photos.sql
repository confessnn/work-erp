-- 아기 사진: 구글 드라이브 work-erp/아기 사진/YYYY-MM/YYYY-MM-DD 에 찍은 날짜별로 보관

-- 1) 아기 정보 (생후 일수 계산용)
alter table public.user_settings
  add column baby_name text check (char_length(baby_name) <= 30),
  add column baby_birth_date date;

-- 2) 드라이브 '아기 사진' 최상위 폴더
alter table public.google_connections add column drive_baby_folder_id text;

-- 3) 날짜 폴더 캐시 (key: '2026-11' 또는 '2026-11-05')
create table public.baby_folders (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key ~ '^\d{4}-\d{2}(-\d{2})?$'),
  folder_id text not null,
  primary key (user_id, key)
);
alter table public.baby_folders enable row level security;
create policy "baby_folders_select_own" on public.baby_folders
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "baby_folders_insert_own" on public.baby_folders
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "baby_folders_update_own" on public.baby_folders
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "baby_folders_delete_own" on public.baby_folders
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 4) 사진
create table public.baby_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  drive_file_id text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  sha1 text not null,                     -- 같은 사진 두 번 올리기 방지
  taken_at timestamptz,                   -- 찍은 시각 (알 수 있으면)
  taken_date date not null,               -- 분류 기준 날짜 (한국 시간)
  date_source text not null check (date_source in ('exif', 'file', 'manual')),
  thumb text,                             -- 작은 미리보기 (data URL, 약 10KB)
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  unique (user_id, sha1),
  unique (user_id, drive_file_id)
);
create index baby_photos_user_date_idx on public.baby_photos (user_id, taken_date desc, taken_at desc);
alter table public.baby_photos enable row level security;
create policy "baby_photos_select_own" on public.baby_photos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "baby_photos_insert_own" on public.baby_photos
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "baby_photos_update_own" on public.baby_photos
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "baby_photos_delete_own" on public.baby_photos
  for delete to authenticated using ((select auth.uid()) = user_id);
