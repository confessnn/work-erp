-- 백업 결과 기록: 아침 7시 브리핑(텔레그램·메일)이 이걸 보고 백업 실패·밀림을 알린다.
-- 매주 크론(cron_backup_result)과 설정 화면 '지금 백업하기'(본인 행 upsert)가 쓴다.

create table public.backup_status (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  last_ok_at timestamptz,          -- 마지막으로 성공한 시각
  last_file text,                  -- 그때 만든 파일 (백업/2026-11/work-erp-backup-….json)
  last_error text,                 -- 마지막 실패 이유
  last_error_at timestamptz,       -- 마지막으로 실패한 시각 (last_ok_at 보다 나중이면 '지금 실패 중')
  updated_at timestamptz not null default now()
);
alter table public.backup_status enable row level security;

create policy "backup_status_select_own" on public.backup_status
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "backup_status_insert_own" on public.backup_status
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "backup_status_update_own" on public.backup_status
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "backup_status_delete_own" on public.backup_status
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 매주 크론: 결과 기록 (성공이면 p_error = null)
create or replace function public.cron_backup_result(p_secret text, p_user uuid, p_file text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  insert into public.backup_status as s (user_id, last_ok_at, last_file, last_error, last_error_at, updated_at)
  values (
    p_user,
    case when p_error is null then now() end,
    case when p_error is null then left(p_file, 300) end,
    left(p_error, 500),
    case when p_error is not null then now() end,
    now()
  )
  on conflict (user_id) do update set
    last_ok_at = coalesce(excluded.last_ok_at, s.last_ok_at),
    last_file = coalesce(excluded.last_file, s.last_file),
    last_error = coalesce(excluded.last_error, s.last_error),
    last_error_at = coalesce(excluded.last_error_at, s.last_error_at),
    updated_at = now();
end;
$$;
revoke all on function public.cron_backup_result(text, uuid, text, text) from public, anon;
grant execute on function public.cron_backup_result(text, uuid, text, text) to anon, authenticated;

-- 아침 브리핑: 백업 상태. applicable = 드라이브가 연결돼 있어 백업 대상인지 (아니면 알리지 않음)
create or replace function public.cron_backup_status(p_secret text, p_user uuid)
returns table (applicable boolean, last_ok_at timestamptz, last_error text, last_error_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select exists (select 1 from public.google_connections c where c.user_id = p_user and c.drive_docs_folder_id is not null),
           s.last_ok_at, s.last_error, s.last_error_at
      from (select 1) one
      left join public.backup_status s on s.user_id = p_user;
end;
$$;
revoke all on function public.cron_backup_status(text, uuid) from public, anon;
grant execute on function public.cron_backup_status(text, uuid) to anon, authenticated;
