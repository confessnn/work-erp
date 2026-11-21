-- 구글 캘린더에서 지운 일정 → ERP 강의도 지우기
-- 판단(어떤 강의가 구글에서 없어졌는지)은 앱(sync.ts planRemovals)이 하고,
-- DB는 안전 조건을 다시 확인한 뒤 지운다:
--   오늘 이후 · 수령 안 함 · 서류 제출 기록 없음 · 구글과 연결된 강의(external_uid 또는 google_event_id)

-- 1) 판단에 필요한 것: 사용자의 모든 캘린더 주소, ERP 전용 구글 캘린더 ID, 지울 수 있는 강의 후보
create or replace function private.removal_context(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'ics_url', s.ics_url))
      from public.calendar_sources s where s.user_id = p_user
    ), '[]'::jsonb),
    'erp_calendar_id', (select c.calendar_id from public.google_connections c where c.user_id = p_user),
    'lectures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'lecture_date', l.lecture_date,
        'external_uid', l.external_uid,
        'google_event_id', l.google_event_id,
        'google_synced_at', l.google_synced_at,
        'updated_at', l.updated_at
      ))
      from public.lectures l
      where l.user_id = p_user
        and l.lecture_date >= (now() at time zone 'Asia/Seoul')::date
        and not l.is_paid
        and (l.external_uid is not null or l.google_event_id is not null)
        and not exists (select 1 from public.document_submissions d where d.lecture_id = l.id)
    ), '[]'::jsonb)
  );
$$;

create or replace function private.remove_gone_lectures(p_user uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uids text[];
  v_events text[];
  v_count integer;
begin
  with gone as (
    delete from public.lectures l
     where l.user_id = p_user
       and l.id = any(p_ids)
       and l.lecture_date >= (now() at time zone 'Asia/Seoul')::date
       and not l.is_paid
       and (l.external_uid is not null or l.google_event_id is not null)
       and not exists (select 1 from public.document_submissions d where d.lecture_id = l.id)
    returning l.external_uid, l.google_event_id
  )
  select array_agg(external_uid) filter (where external_uid is not null),
         array_agg(google_event_id) filter (where google_event_id is not null),
         count(*)
    into v_uids, v_events, v_count
    from gone;

  -- 구글에서 지운 것이므로 '다시 불러오지 않기' 기록은 남기지 않는다 (구글에서 되살리면 다시 불러옴)
  if v_uids is not null then
    delete from public.import_skips k where k.user_id = p_user and k.external_uid = any(v_uids);
  end if;
  -- 구글에는 이미 없으므로 구글 삭제 대기열에서도 뺀다
  if v_events is not null then
    delete from public.google_pending_deletes g where g.user_id = p_user and g.google_event_id = any(v_events);
  end if;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function private.removal_context(uuid) from public, anon, authenticated;
revoke all on function private.remove_gone_lectures(uuid, uuid[]) from public, anon, authenticated;

-- 2) 자동 불러오기(cron)용 (비밀값 필요)
create or replace function public.cron_removal_context(p_secret text, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return private.removal_context(p_user);
end;
$$;

create or replace function public.cron_remove_gone_lectures(p_secret text, p_user uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return private.remove_gone_lectures(p_user, p_ids);
end;
$$;

revoke all on function public.cron_removal_context(text, uuid) from public;
revoke all on function public.cron_remove_gone_lectures(text, uuid, uuid[]) from public;
grant execute on function public.cron_removal_context(text, uuid) to anon;
grant execute on function public.cron_remove_gone_lectures(text, uuid, uuid[]) to anon;

-- 3) '지금 불러오기'(로그인 사용자 본인)용
create or replace function public.removal_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.removal_context((select auth.uid()));
$$;

create or replace function public.remove_gone_lectures(p_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.remove_gone_lectures((select auth.uid()), p_ids);
$$;

revoke all on function public.removal_context() from public, anon;
revoke all on function public.remove_gone_lectures(uuid[]) from public, anon;
grant execute on function public.removal_context() to authenticated;
grant execute on function public.remove_gone_lectures(uuid[]) to authenticated;
