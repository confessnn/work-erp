-- ERP 일정 → 구글 캘린더("강의 일정(ERP)" 전용 캘린더)로 내보내기

-- 1) 구글 연결 정보. refresh token 은 서버 키(GOOGLE_TOKEN_KEY)로 암호화해서 저장한다.
create table public.google_connections (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  google_email text,
  refresh_token_enc text not null,
  calendar_id text,
  show_amounts boolean not null default false, -- 구글 일정 메모에 강의료 표시
  last_push_at timestamptz,
  last_push_result text,
  created_at timestamptz not null default now()
);
alter table public.google_connections enable row level security;
create policy "google_connections_select_own" on public.google_connections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "google_connections_insert_own" on public.google_connections
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "google_connections_update_own" on public.google_connections
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "google_connections_delete_own" on public.google_connections
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 2) 강의별 구글 일정 ID / 마지막 반영 시각
alter table public.lectures
  add column google_event_id text,
  add column google_synced_at timestamptz;

-- 3) 반영 기록 컬럼만 바뀐 경우에는 updated_at 을 올리지 않는다 (안 그러면 매번 '변경됨'으로 보임)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'google_event_id' - 'google_synced_at')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'google_event_id' - 'google_synced_at') then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

-- 4) ERP에서 지운 강의의 구글 일정도 지우기 위한 대기열
create table public.google_pending_deletes (
  user_id uuid not null references auth.users (id) on delete cascade,
  google_event_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, google_event_id)
);
alter table public.google_pending_deletes enable row level security;
create policy "google_pending_deletes_select_own" on public.google_pending_deletes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "google_pending_deletes_delete_own" on public.google_pending_deletes
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.queue_google_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.google_event_id is not null then
    insert into public.google_pending_deletes (user_id, google_event_id)
    values (old.user_id, old.google_event_id)
    on conflict do nothing;
  end if;
  return old;
end;
$$;
revoke all on function public.queue_google_delete() from public, anon, authenticated;

create trigger lectures_queue_google_delete
  after delete on public.lectures
  for each row execute function public.queue_google_delete();
