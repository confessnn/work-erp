-- 아기 사진을 가족(아내) 계정에서도 보고 올리기.
-- 사진·날짜 폴더는 가족을 만든 사람(my_family())의 것으로 저장하고, 드라이브도 그 사람 것을 쓴다.
-- 날짜 바꾸기·삭제는 지금처럼 만든 사람만.

drop policy "baby_photos_select_own" on public.baby_photos;
drop policy "baby_photos_insert_own" on public.baby_photos;
create policy "baby_photos_select_family" on public.baby_photos
  for select to authenticated using (user_id = (select public.my_family()));
create policy "baby_photos_insert_family" on public.baby_photos
  for insert to authenticated with check (user_id = (select public.my_family()));

drop policy "baby_folders_select_own" on public.baby_folders;
drop policy "baby_folders_insert_own" on public.baby_folders;
drop policy "baby_folders_update_own" on public.baby_folders;
create policy "baby_folders_select_family" on public.baby_folders
  for select to authenticated using (user_id = (select public.my_family()));
create policy "baby_folders_insert_family" on public.baby_folders
  for insert to authenticated with check (user_id = (select public.my_family()));
create policy "baby_folders_update_family" on public.baby_folders
  for update to authenticated using (user_id = (select public.my_family())) with check (user_id = (select public.my_family()));

-- 아기 이름·생일 (가족 누구나, 만든 사람 설정에서)
create or replace function public.family_baby_info()
returns table (baby_name text, baby_birth_date date)
language sql
stable
security definer
set search_path = ''
as $$
  select s.baby_name, s.baby_birth_date from public.user_settings s where s.user_id = (select public.my_family());
$$;
revoke all on function public.family_baby_info() from public;
grant execute on function public.family_baby_info() to authenticated;

-- 가족 구성원이 사진을 올릴 때 서버가 쓰는 '만든 사람'의 구글 연결 (암호화된 토큰).
-- 서버 비밀값이 있어야 하므로 브라우저에서는 부를 수 없고, 구성원이 아니면 행이 없다.
create or replace function public.family_owner_drive(p_secret text)
returns table (
  owner_id uuid,
  refresh_token_enc text,
  scopes text,
  drive_docs_folder_id text,
  drive_baby_folder_id text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select c.user_id, c.refresh_token_enc, c.scopes::text, c.drive_docs_folder_id, c.drive_baby_folder_id
    from public.google_connections c
    where c.user_id = (select public.my_family()) and c.user_id <> (select auth.uid());
end;
$$;
revoke all on function public.family_owner_drive(text) from public;
grant execute on function public.family_owner_drive(text) to authenticated;

-- 구성원이 '아기 사진' 최상위 폴더를 새로 만들었을 때 만든 사람의 연결에 기록 (예전 날짜 폴더 기록은 지움)
create or replace function public.family_set_baby_root(p_secret text, p_folder text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select public.my_family());
begin
  perform private.check_cron_secret(p_secret);
  if v_owner = (select auth.uid()) then
    raise exception 'not a family member';
  end if;
  update public.google_connections set drive_baby_folder_id = p_folder where user_id = v_owner;
  delete from public.baby_folders where user_id = v_owner;
end;
$$;
revoke all on function public.family_set_baby_root(text, text) from public;
grant execute on function public.family_set_baby_root(text, text) to authenticated;
