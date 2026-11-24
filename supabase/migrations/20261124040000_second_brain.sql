-- 세컨드브레인: 구글 드라이브에 있는 옵시디언 볼트(.md 노트)를 ERP에서 보기·찾기·그래프로.
-- 노트 원본은 드라이브(볼트)에 있고, ERP는 동기화할 때 읽어 brain_notes 에 사본을 둔다 (찾기·링크 계산용).
-- ERP 기록(강의·가족 일정 기록)은 볼트의 'ERP 기록' 폴더에 .md 로 내보낸다 (brain_exports 가 어떤 파일인지 기억).

-- 볼트 설정 (사람마다 하나)
create table public.brain_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  vault_folder_id text not null,
  vault_name text not null,
  export_folder_id text,
  last_synced_at timestamptz,
  last_sync_result text,
  last_exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.brain_settings enable row level security;

create policy "brain_settings_select_own" on public.brain_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "brain_settings_insert_own" on public.brain_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "brain_settings_update_own" on public.brain_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "brain_settings_delete_own" on public.brain_settings
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger brain_settings_set_updated_at
  before update on public.brain_settings
  for each row execute function public.set_updated_at();

-- 볼트 노트 사본 (드라이브에서 다시 받을 수 있는 캐시라 백업에는 넣지 않는다)
create table public.brain_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  drive_file_id text not null,
  path text not null,            -- 볼트 안 경로: '1 Projects/원가계산/착수.md'
  title text not null,           -- 파일 이름에서 .md 뺀 것
  section text not null,         -- PARA: inbox / projects / areas / resources / archives / other
  content text not null default '',
  links text[] not null default '{}',  -- [[링크]] 대상 (소문자, #·| 뒤 뗀 것)
  tags text[] not null default '{}',
  modified_at timestamptz not null,    -- 드라이브의 수정 시각
  synced_at timestamptz not null default now(),
  unique (user_id, drive_file_id)
);

create index brain_notes_user_modified_idx on public.brain_notes (user_id, modified_at desc);

alter table public.brain_notes enable row level security;

create policy "brain_notes_select_own" on public.brain_notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "brain_notes_insert_own" on public.brain_notes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "brain_notes_update_own" on public.brain_notes
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "brain_notes_delete_own" on public.brain_notes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 내보낸 ERP 기록 노트: 일 묶음(series_key)마다 드라이브 파일 하나. 내용이 같으면 다시 올리지 않는다
create table public.brain_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  series_key text not null,
  drive_file_id text not null,
  file_name text not null,
  content_digest text not null,
  exported_at timestamptz not null default now(),
  unique (user_id, series_key)
);

alter table public.brain_exports enable row level security;

create policy "brain_exports_select_own" on public.brain_exports
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "brain_exports_insert_own" on public.brain_exports
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "brain_exports_update_own" on public.brain_exports
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "brain_exports_delete_own" on public.brain_exports
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 백업에 세컨드브레인 설정·내보내기 기록 추가 (brain_notes 는 드라이브 볼트의 사본이라 뺀다).
create or replace function private.backup_dump(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
  cols text;
  rows jsonb;
  out jsonb := '{}'::jsonb;
begin
  for t in
    select * from (values
      ('lectures', 'user_id'), ('todos', 'user_id'), ('event_reminders', 'user_id'),
      ('documents', 'user_id'), ('document_submissions', 'user_id'), ('record_graphs', 'user_id'),
      ('tax_profiles', 'user_id'), ('tax_partners', 'user_id'), ('tax_invoices', 'user_id'),
      ('user_settings', 'user_id'), ('calendar_sources', 'user_id'), ('import_skips', 'user_id'),
      ('bid_settings', 'user_id'), ('bid_notices', 'user_id'), ('bid_submissions', 'user_id'),
      ('x_sources', 'user_id'), ('content_settings', 'user_id'), ('api_credit_settings', 'user_id'),
      ('baby_photos', 'user_id'), ('brain_settings', 'user_id'), ('brain_exports', 'user_id'),
      ('family_events', 'family_id'), ('family_calendar_sources', 'family_id'),
      ('baby_logs', 'family_id'), ('baby_links', 'family_id'), ('baby_todos', 'family_id')
    ) as v(tbl, owner_col)
  loop
    if to_regclass(format('public.%I', t.tbl)) is null then continue; end if;
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
      from pg_attribute a
     where a.attrelid = to_regclass(format('public.%I', t.tbl))
       and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('ics_url', 'thumb', 'share_url')
       and a.attname !~* '(token|secret|password|_enc$|hash$)';
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from (select %s from public.%I where %I = $1) r',
      cols, t.tbl, t.owner_col
    ) into rows using p_user;
    out := out || jsonb_build_object(t.tbl, rows);
  end loop;
  return out;
end;
$$;
revoke all on function private.backup_dump(uuid) from public, anon, authenticated;
