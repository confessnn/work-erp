-- 세컨드브레인 매일 자동 내보내기 (크론 /api/cron/brain-export, 한국 시간 새벽 5시).
-- 크론에는 로그인 세션이 없어서 CRON_SECRET 으로 잠근 함수로만 읽고 쓴다 (service_role 키를 쓰지 않는다).

-- 볼트가 있고 구글이 연결된 사람들
create or replace function public.cron_brain_jobs(p_secret text)
returns table (user_id uuid, refresh_token_enc text, scopes text, vault_folder_id text, export_folder_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.check_cron_secret(p_secret);
  return query
    select s.user_id, c.refresh_token_enc, c.scopes::text, s.vault_folder_id, s.export_folder_id
      from public.brain_settings s
      join public.google_connections c on c.user_id = s.user_id;
end;
$$;
revoke all on function public.cron_brain_jobs(text) from public, anon;
grant execute on function public.cron_brain_jobs(text) to anon, authenticated;

-- 내보낼 것: 일정 기록(내 강의 + 우리 가족 일정), 할 일(내 것, 지운 것 제외), 이미 내보낸 노트 목록
create or replace function public.cron_brain_data(p_secret text, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fam uuid := coalesce((select m.owner_id from public.family_members m where m.member_id = p_user), p_user);
begin
  perform private.check_cron_secret(p_secret);
  return jsonb_build_object(
    'lectures', coalesce((
      select jsonb_agg(to_jsonb(r)) from (
        select l.id, l.title, l.organization, l.lecture_date, l.start_time, l.record
          from public.lectures l
         where l.user_id = p_user and l.record is not null
         order by l.lecture_date desc limit 2000) r), '[]'::jsonb),
    'family', coalesce((
      select jsonb_agg(to_jsonb(r)) from (
        select f.id, f.title, f.event_date, f.start_time, f.record
          from public.family_events f
         where f.family_id = fam and f.record is not null
         order by f.event_date desc limit 2000) r), '[]'::jsonb),
    'todos', coalesce((
      select jsonb_agg(to_jsonb(r)) from (
        select t.id, t.title, t.due_date, t.done_at, t.created_at, t.note
          from public.todos t
         where t.user_id = p_user and t.dismissed_at is null
         order by t.due_date desc limit 3000) r), '[]'::jsonb),
    'exports', coalesce((
      select jsonb_agg(to_jsonb(r)) from (
        select e.series_key, e.drive_file_id, e.file_name, e.content_digest
          from public.brain_exports e
         where e.user_id = p_user) r), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.cron_brain_data(text, uuid) from public, anon;
grant execute on function public.cron_brain_data(text, uuid) to anon, authenticated;

-- 올린 결과 저장: 내보낸 노트 목록, ERP 사본(brain_notes), 내보낼 폴더·시각
create or replace function public.cron_brain_save(
  p_secret text, p_user uuid, p_exports jsonb, p_notes jsonb, p_export_folder_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  if not exists (select 1 from public.brain_settings s where s.user_id = p_user) then return; end if;

  insert into public.brain_exports (user_id, series_key, drive_file_id, file_name, content_digest, exported_at)
  select p_user, x.series_key, x.drive_file_id, x.file_name, x.content_digest, now()
    from jsonb_to_recordset(coalesce(p_exports, '[]'::jsonb))
      as x(series_key text, drive_file_id text, file_name text, content_digest text)
  on conflict (user_id, series_key) do update
    set drive_file_id = excluded.drive_file_id, file_name = excluded.file_name,
        content_digest = excluded.content_digest, exported_at = now();

  insert into public.brain_notes (user_id, drive_file_id, path, title, section, content, links, tags, modified_at, synced_at)
  select p_user, n.drive_file_id, left(n.path, 500), left(n.title, 200), n.section, left(n.content, 200000),
         coalesce(n.links, '{}'), coalesce(n.tags, '{}'), n.modified_at, now()
    from jsonb_to_recordset(coalesce(p_notes, '[]'::jsonb))
      as n(drive_file_id text, path text, title text, section text, content text, links text[], tags text[], modified_at timestamptz)
  on conflict (user_id, drive_file_id) do update
    set path = excluded.path, title = excluded.title, section = excluded.section, content = excluded.content,
        links = excluded.links, tags = excluded.tags, modified_at = excluded.modified_at, synced_at = now();

  update public.brain_settings
     set last_exported_at = now(), export_folder_id = coalesce(p_export_folder_id, export_folder_id)
   where user_id = p_user;
end;
$$;
revoke all on function public.cron_brain_save(text, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.cron_brain_save(text, uuid, jsonb, jsonb, text) to anon, authenticated;
