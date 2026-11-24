-- 텔레그램으로 보낸 '메모 …' 글을 세컨드브레인 볼트 Inbox 에 노트로 저장한다.
-- 웹훅에는 로그인 세션이 없어서, 웹훅 비밀값(p_hook)으로 사람을 찾는 tg_* 함수 방식을 그대로 쓴다.

-- 메모를 저장할 곳: 구글 연결(암호화된 refresh token, 권한)과 볼트 폴더
create or replace function public.tg_brain_target(p_hook text)
returns table (user_id uuid, refresh_token_enc text, scopes text, vault_folder_id text, export_folder_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := private.tg_hook_user(p_hook);
begin
  if uid is null then raise exception 'unknown hook' using errcode = '42501'; end if;
  return query
    select s.user_id, c.refresh_token_enc, c.scopes::text, s.vault_folder_id, s.export_folder_id
      from public.brain_settings s
      join public.google_connections c on c.user_id = s.user_id
     where s.user_id = uid;
end;
$$;
revoke all on function public.tg_brain_target(text) from public;
grant execute on function public.tg_brain_target(text) to anon;

-- 드라이브에 올린 메모의 ERP 사본 (동기화를 기다리지 않고 바로 보이게) → 노트 ID
create or replace function public.tg_save_brain_note(
  p_hook text, p_drive_file_id text, p_path text, p_title text, p_section text,
  p_content text, p_links text[], p_tags text[], p_modified_at timestamptz
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := private.tg_hook_user(p_hook);
  nid uuid;
begin
  if uid is null then raise exception 'unknown hook' using errcode = '42501'; end if;
  if not exists (select 1 from public.brain_settings s where s.user_id = uid) then
    raise exception 'no vault' using errcode = '42501';
  end if;
  insert into public.brain_notes (user_id, drive_file_id, path, title, section, content, links, tags, modified_at, synced_at)
  values (uid, p_drive_file_id, left(p_path, 500), left(p_title, 200), p_section, left(p_content, 200000),
          coalesce(p_links, '{}'), coalesce(p_tags, '{}'), p_modified_at, now())
  on conflict (user_id, drive_file_id) do update
    set path = excluded.path, title = excluded.title, section = excluded.section, content = excluded.content,
        links = excluded.links, tags = excluded.tags, modified_at = excluded.modified_at, synced_at = now()
  returning id into nid;
  return nid;
end;
$$;
revoke all on function public.tg_save_brain_note(text, text, text, text, text, text, text[], text[], timestamptz) from public;
grant execute on function public.tg_save_brain_note(text, text, text, text, text, text, text[], text[], timestamptz) to anon;
