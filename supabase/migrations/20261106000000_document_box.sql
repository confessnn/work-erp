-- 서류함: 이력서·증명서 등을 구글 드라이브에 보관하고, 강의별로 골라 압축 제출

-- 1) 사용자 설정 (파일 이름에 쓸 이름 등)
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 30),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "user_settings_select_own" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_settings_insert_own" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_settings_update_own" on public.user_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_settings_delete_own" on public.user_settings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 2) 구글 연결: 허용된 권한 목록, 드라이브 폴더 ID
alter table public.google_connections
  add column scopes text,
  add column drive_docs_folder_id text,     -- work-erp/서류함
  add column drive_bundles_folder_id text;  -- work-erp/제출용 압축파일

-- 3) 서류
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  doc_type text not null check (doc_type in (
    'resume', 'profile', 'certificate', 'career', 'employment', 'degree',
    'id_card', 'bankbook', 'final_education', 'privacy_consent', 'other'
  )),
  title text,                       -- 예: '정보처리기사' (같은 종류가 여러 개일 때 구분)
  issued_on date,                   -- 발급일 (재직·경력증명서 유효기간 안내용)
  drive_file_id text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  archived boolean not null default false, -- 예전 버전 보관 (제출 목록에서 숨김)
  created_at timestamptz not null default now(),
  unique (user_id, drive_file_id)
);
create index documents_user_idx on public.documents (user_id, doc_type);
alter table public.documents enable row level security;
create policy "documents_select_own" on public.documents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "documents_insert_own" on public.documents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "documents_update_own" on public.documents
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "documents_delete_own" on public.documents
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 4) 강의별 제출 기록 (어떤 서류를, 어떤 방식으로, 언제)
create table public.document_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lecture_id uuid not null references public.lectures (id) on delete cascade,
  doc_types text[] not null,          -- 다음에 같은 기관 의뢰 시 미리 체크용
  document_ids uuid[] not null,
  file_names text[] not null,         -- 제출 당시 파일 이름 (서류가 지워져도 기록 유지)
  zip_name text not null,
  method text not null check (method in ('download', 'drive_link')),
  drive_file_id text,                 -- 드라이브 공유 링크로 보낸 경우 압축파일
  share_url text,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
create index document_submissions_lecture_idx on public.document_submissions (lecture_id, created_at desc);
alter table public.document_submissions enable row level security;
create policy "document_submissions_select_own" on public.document_submissions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "document_submissions_insert_own" on public.document_submissions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "document_submissions_update_own" on public.document_submissions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "document_submissions_delete_own" on public.document_submissions
  for delete to authenticated using ((select auth.uid()) = user_id);
