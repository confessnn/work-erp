-- 아기 사진 보안 강화.
-- 지금까지는 가족 구성원(아내) 브라우저가 공개 키로 baby_photos·baby_folders 에 직접 쓸 수 있어서,
-- drive_file_id 를 대표 계정 서류함 파일로 바꾸면 서버가 그 파일을 보여 주거나 지우거나 옮겼다.
-- 이제 드라이브 파일 ID·폴더 ID·파일 종류는 서버만 쓴다 (서버 비밀값으로 잠근 함수).
-- 날짜 바꾸기(taken_date·date_source)와 삭제는 지금처럼 가족 누구나 할 수 있다.

-- 1) 직접 쓰기 막기
drop policy "baby_photos_insert_family" on public.baby_photos;
drop policy "baby_folders_insert_family" on public.baby_folders;
drop policy "baby_folders_update_family" on public.baby_folders;

-- 사진 수정은 날짜 칸만 (drive_file_id·mime_type 은 바꿀 수 없음)
revoke update on public.baby_photos from anon, authenticated;
grant update (taken_date, date_source) on public.baby_photos to authenticated;

-- 2) 서버가 사진 등록 (사진은 늘 가족을 만든 사람 것으로)
create or replace function public.baby_photo_add(
  p_secret text,
  p_drive_file_id text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha1 text,
  p_taken_at timestamptz,
  p_taken_date date,
  p_date_source text,
  p_thumb text,
  p_width integer,
  p_height integer
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select public.my_family());
  v_id uuid;
begin
  perform private.check_cron_secret(p_secret);
  if (select auth.uid()) is null or v_owner is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_mime_type is null or p_mime_type !~ '^(image|video)/[a-z0-9.+-]+$' or p_mime_type = 'image/svg+xml' then
    raise exception 'unsupported media type' using errcode = '22023';
  end if;
  insert into public.baby_photos (
    user_id, drive_file_id, file_name, mime_type, size_bytes, sha1,
    taken_at, taken_date, date_source, thumb, width, height
  ) values (
    v_owner, p_drive_file_id, left(p_file_name, 300), p_mime_type, p_size_bytes, p_sha1,
    p_taken_at, p_taken_date, p_date_source, p_thumb, p_width, p_height
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.baby_photo_add(text, text, text, text, bigint, text, timestamptz, date, text, text, integer, integer) from public, anon;
grant execute on function public.baby_photo_add(text, text, text, text, bigint, text, timestamptz, date, text, text, integer, integer) to authenticated;

-- 3) 서버가 날짜 폴더 기록
create or replace function public.baby_folder_set(p_secret text, p_key text, p_folder_id text)
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
  if (select auth.uid()) is null or v_owner is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.baby_folders (user_id, key, folder_id)
  values (v_owner, p_key, p_folder_id)
  on conflict (user_id, key) do update set folder_id = excluded.folder_id;
end;
$$;
revoke all on function public.baby_folder_set(text, text, text) from public, anon;
grant execute on function public.baby_folder_set(text, text, text) to authenticated;
