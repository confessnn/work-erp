-- 백업: 대표 계정의 기록을 JSON 하나로 모아 구글 드라이브 work-erp/백업 폴더에 저장한다.
-- 매주 크론(/api/cron/backup)과 설정 화면의 '지금 백업하기'가 쓴다.
-- 담는 것: 강의·할 일·가족 일정·육아 기록·서류 목록·공고 등 '다시 만들 수 없는 기록'.
-- 빼는 것: 구글·텔레그램 토큰, 알림 구독, 공유·초대 토큰, 비공개 캘린더 주소(ics_url), 사진 미리보기, 다시 받을 수 있는 캐시.

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
      ('baby_photos', 'user_id'),
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

-- 설정 화면 '지금 백업하기': 로그인한 대표 계정 본인 것만 (가족 구성원·공고 열람자는 안 됨)
create or replace function public.my_backup()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or not (select public.can_own_invites()) then
    raise exception 'owner only' using errcode = '42501';
  end if;
  return private.backup_dump(me);
end;
$$;
revoke all on function public.my_backup() from public, anon;
grant execute on function public.my_backup() to authenticated;

-- 매주 크론: 드라이브가 연결된 대표 계정들
create or replace function public.cron_backup_jobs(p_secret text)
returns table (user_id uuid, refresh_token_enc text, scopes text, drive_docs_folder_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select c.user_id, c.refresh_token_enc, c.scopes::text, c.drive_docs_folder_id
      from public.google_connections c
     where c.drive_docs_folder_id is not null
       and not exists (select 1 from public.family_members m where m.member_id = c.user_id)
       and not exists (select 1 from public.bid_viewers v where v.member_id = c.user_id);
end;
$$;
revoke all on function public.cron_backup_jobs(text) from public, anon;
grant execute on function public.cron_backup_jobs(text) to anon, authenticated;

create or replace function public.cron_backup_dump(p_secret text, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return private.backup_dump(p_user);
end;
$$;
revoke all on function public.cron_backup_dump(text, uuid) from public, anon;
grant execute on function public.cron_backup_dump(text, uuid) to anon, authenticated;
