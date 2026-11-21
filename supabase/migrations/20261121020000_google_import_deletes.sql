-- ERP에서 지운 '구글에서 불러온 강의' → 구글 캘린더 원본 일정도 지우기 위한 대기열
-- (ERP가 직접 만든 강의는 google_pending_deletes 로 이미 처리됨)

create table public.google_import_deletes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  external_uid text not null,
  lecture_date date,
  created_at timestamptz not null default now(),
  primary key (user_id, external_uid)
);
alter table public.google_import_deletes enable row level security;
create policy "google_import_deletes_select_own" on public.google_import_deletes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "google_import_deletes_insert_own" on public.google_import_deletes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "google_import_deletes_update_own" on public.google_import_deletes
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "google_import_deletes_delete_own" on public.google_import_deletes
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.queue_google_import_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.external_uid is not null then
    insert into public.google_import_deletes (user_id, external_uid, lecture_date)
    values (old.user_id, old.external_uid, old.lecture_date)
    on conflict do nothing;
  end if;
  return old;
end;
$$;
revoke all on function public.queue_google_import_delete() from public, anon, authenticated;

create trigger lectures_queue_google_import_delete
  after delete on public.lectures
  for each row execute function public.queue_google_import_delete();

-- 구글에서 먼저 지워져서 ERP에서 지운 강의는 구글에 지울 게 없으므로 대기열에서 뺀다
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

  if v_uids is not null then
    -- 구글에서 지운 것이므로 '다시 불러오지 않기' 기록은 남기지 않는다 (구글에서 되살리면 다시 불러옴)
    delete from public.import_skips k where k.user_id = p_user and k.external_uid = any(v_uids);
    delete from public.google_import_deletes q where q.user_id = p_user and q.external_uid = any(v_uids);
  end if;
  if v_events is not null then
    delete from public.google_pending_deletes g where g.user_id = p_user and g.google_event_id = any(v_events);
  end if;
  return coalesce(v_count, 0);
end;
$$;
revoke all on function private.remove_gone_lectures(uuid, uuid[]) from public, anon, authenticated;
