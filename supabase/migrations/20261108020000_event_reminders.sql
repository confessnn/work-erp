-- 일정 알림: 각자 고른 일정을 휴대폰 웹 푸시로 1시간 전(종일은 당일 08:00)에 알린다.
-- 5분마다 Supabase pg_cron → pg_net 이 /api/cron/reminders 를 부른다(20261108030000_reminder_schedule.sql).
-- 호출용 비밀값과 웹 푸시 서명 키(VAPID)는 Supabase Vault 에만 있다. Vercel 환경변수 불필요.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 이름별 비밀값 확인 (기존 check_cron_secret 은 'cron' 전용)
create or replace function private.check_named_secret(p_name text, p_secret text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_secret is null or length(p_secret) < 32 or not exists (
    select 1 from private.app_secrets
    where name = p_name and sha256 = encode(extensions.digest(p_secret, 'sha256'), 'hex')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.check_named_secret(text, text) from public, anon, authenticated;

-- 알림 호출용 비밀값: DB 안에서 만들어 해시는 app_secrets, 원문은 Vault 에만 둔다
do $$
declare s text;
begin
  if not exists (select 1 from private.app_secrets where name = 'reminder') then
    s := encode(extensions.gen_random_bytes(32), 'hex');
    insert into private.app_secrets (name, sha256) values ('reminder', encode(extensions.digest(s, 'sha256'), 'hex'));
    perform vault.create_secret(s, 'reminder_secret', '일정 알림 크론 호출용 (pg_net → /api/cron/reminders)');
  end if;
end $$;

-- 휴대폰(브라우저)별 푸시 구독
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

-- 알림 받을 일정 (사람마다 따로)
-- kind: lecture(강의 id) / event(가족 일정 id) / import(구글에서 가져온 일정: "source_id:external_uid", 다시 가져와도 유지)
create table public.event_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('lecture', 'event', 'import')),
  ref text not null check (char_length(ref) <= 600),
  event_date date not null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
alter table public.event_reminders enable row level security;
create policy event_reminders_select_own on public.event_reminders for select to authenticated using ((select auth.uid()) = user_id);
create policy event_reminders_insert_own on public.event_reminders for insert to authenticated with check ((select auth.uid()) = user_id);
create policy event_reminders_delete_own on public.event_reminders for delete to authenticated using ((select auth.uid()) = user_id);
create policy event_reminders_update_own on public.event_reminders for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 웹 푸시 공개키 (구독할 때 브라우저에 넘김). 서명 키 쌍은 첫 크론 실행 때 서버가 만들어 저장한다.
create or replace function public.vapid_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public' limit 1;
$$;
revoke all on function public.vapid_public_key() from public, anon;
grant execute on function public.vapid_public_key() to authenticated;

create or replace function public.cron_vapid(p_secret text)
returns table (public_key text, private_key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_named_secret('reminder', p_secret);
  return query
    select (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public' limit 1),
           (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private' limit 1);
end;
$$;
revoke all on function public.cron_vapid(text) from public;
grant execute on function public.cron_vapid(text) to anon, authenticated;

-- 처음 한 번만 저장 (이미 있으면 무시)
create or replace function public.cron_set_vapid(p_secret text, p_public text, p_private text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.check_named_secret('reminder', p_secret);
  if exists (select 1 from vault.secrets where name = 'vapid_public') then return; end if;
  perform vault.create_secret(p_public, 'vapid_public', '웹 푸시 공개키');
  perform vault.create_secret(p_private, 'vapid_private', '웹 푸시 서명 키');
end;
$$;
revoke all on function public.cron_set_vapid(text, text, text) from public;
grant execute on function public.cron_set_vapid(text, text, text) to anon, authenticated;

-- 지금 보낼 알림 (알림 1건 × 그 사람의 휴대폰 수만큼 행)
-- 시간 일정: 시작 1시간 전 ~ 시작 / 종일 일정: 당일 08:00 ~ 자정. 한국 시간.
-- 그 사람 가족의 일정이 아니면 보내지 않는다(남의 일정 id 를 넣어도 새지 않게).
create or replace function public.cron_due_reminders(p_secret text)
returns table (reminder_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.check_named_secret('reminder', p_secret);
  return query
  with r as (
    select er.*, coalesce(
      (select m.owner_id from public.family_members m where m.member_id = er.user_id), er.user_id
    ) as fam
    from public.event_reminders er
    where er.notified_at is null
  ),
  items as (
    select r.id, r.user_id, l.title, l.lecture_date as d, l.start_time as t,
           case when l.user_id = r.user_id then '/lectures/' || l.id else '/family' end as url
    from r join public.lectures l on r.kind = 'lecture' and l.id::text = r.ref and l.user_id = r.fam
    union all
    select r.id, r.user_id, e.title, e.event_date, e.start_time, '/family/' || e.id
    from r join public.family_events e on r.kind = 'event' and e.id::text = r.ref and e.family_id = r.fam
    union all
    select r.id, r.user_id, e.title, e.event_date, e.start_time, '/family/' || e.id
    from r join public.family_events e
      on r.kind = 'import' and e.source_id::text || ':' || e.external_uid = r.ref and e.family_id = r.fam
  ),
  timed as (
    select i.*,
      case when i.t is null then (i.d + time '08:00') at time zone 'Asia/Seoul'
           else (i.d + i.t) at time zone 'Asia/Seoul' - interval '1 hour' end as send_from,
      case when i.t is null then (i.d + 1)::timestamp at time zone 'Asia/Seoul'
           else (i.d + i.t) at time zone 'Asia/Seoul' end as send_until
    from items i
  )
  select x.id, s.endpoint, s.p256dh, s.auth,
         case when x.t is null then '오늘 일정' else '1시간 뒤 일정' end,
         case when x.t is null then x.title else to_char(x.t, 'HH24:MI') || ' ' || x.title end,
         x.url
  from timed x
  join public.push_subscriptions s on s.user_id = x.user_id
  where now() >= x.send_from and now() < x.send_until;
end;
$$;
revoke all on function public.cron_due_reminders(text) from public;
grant execute on function public.cron_due_reminders(text) to anon, authenticated;

-- 보낸 알림 표시, 만료된 휴대폰 구독 삭제, 지난 알림 정리
create or replace function public.cron_finish_reminders(p_secret text, p_sent uuid[], p_gone text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.check_named_secret('reminder', p_secret);
  update public.event_reminders set notified_at = now() where id = any (coalesce(p_sent, '{}'));
  delete from public.push_subscriptions where endpoint = any (coalesce(p_gone, '{}'));
  -- event_date 는 알림을 켤 때의 날짜라, 일정 날짜가 바뀌었을 수 있어 넉넉히 둔다
  delete from public.event_reminders
  where (notified_at is not null and notified_at < now() - interval '7 days')
     or event_date < (now() at time zone 'Asia/Seoul')::date - 60;
end;
$$;
revoke all on function public.cron_finish_reminders(text, uuid[], text[]) from public;
grant execute on function public.cron_finish_reminders(text, uuid[], text[]) to anon, authenticated;
