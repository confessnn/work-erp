-- 구글 원본 일정과 ERP 일정 중복 방지

-- 1) ERP 일정이 구글 원본 일정과 연결되면(external_uid 가 생기면),
--    'ERP 캘린더'에 올려둔 사본은 지울 대상으로 넣는다 (구글에서 하나만 보이도록)
create or replace function public.unlink_google_copy_when_imported()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.external_uid is null and new.external_uid is not null and old.google_event_id is not null then
    insert into public.google_pending_deletes (user_id, google_event_id)
    values (old.user_id, old.google_event_id)
    on conflict do nothing;
    new.google_event_id := null;
    new.google_synced_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.unlink_google_copy_when_imported() from public, anon, authenticated;

create trigger lectures_unlink_google_copy
  before update of external_uid on public.lectures
  for each row execute function public.unlink_google_copy_when_imported();

-- 2) 자동 불러오기(cron)용: 중복 비교에 쓸 기존 일정 (최근 1개월 이후)
create or replace function public.cron_existing_lectures(p_secret text, p_user uuid)
returns table (id uuid, lecture_date date, start_time time, title text, external_uid text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select l.id, l.lecture_date, l.start_time, l.title, l.external_uid
    from public.lectures l
    where l.user_id = p_user
      and l.lecture_date >= (now() at time zone 'Asia/Seoul')::date - 31;
end;
$$;

-- 3) 자동 불러오기(cron)용: 중복으로 판단된 ERP 일정을 구글 원본과 연결
--    p_links = [{"lecture_id": "...", "external_uid": "..."}]
create or replace function public.cron_link_lectures(p_secret text, p_user uuid, p_links jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  perform private.check_cron_secret(p_secret);
  if jsonb_typeof(p_links) <> 'array' then
    return 0;
  end if;
  update public.lectures l
     set external_uid = x.external_uid
    from jsonb_to_recordset(p_links) as x(lecture_id uuid, external_uid text)
   where l.id = x.lecture_id
     and l.user_id = p_user
     and l.external_uid is null
     and x.external_uid is not null
     and not exists (
       select 1 from public.lectures o where o.user_id = p_user and o.external_uid = x.external_uid
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.cron_existing_lectures(text, uuid) from public;
revoke all on function public.cron_link_lectures(text, uuid, jsonb) from public;
grant execute on function public.cron_existing_lectures(text, uuid) to anon;
grant execute on function public.cron_link_lectures(text, uuid, jsonb) to anon;
