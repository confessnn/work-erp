-- 텔레그램 알림: 아침 '오늘 할 일'과 PC의 Gmail 정리를 사용자의 텔레그램 봇으로 보낸다.
-- 봇 토큰은 Vault(이름 'telegram_token:<user_id>')에만 두고, 표에는 연결 상태만 둔다.

create table public.telegram_links (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  bot_username text check (bot_username is null or bot_username ~ '^[A-Za-z0-9_]{3,64}$'),
  chat_id bigint,
  link_code text check (link_code is null or link_code ~ '^ERP-[0-9A-F]{6}$'),
  linked_at timestamptz,
  last_sent_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.telegram_links enable row level security;
create policy telegram_links_select_own on public.telegram_links
  for select to authenticated using ((select auth.uid()) = user_id);
create policy telegram_links_delete_own on public.telegram_links
  for delete to authenticated using ((select auth.uid()) = user_id);
-- 추가·수정은 아래 함수로만

create or replace function private.telegram_token(p_user uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'telegram_token:' || p_user::text limit 1;
$$;
revoke all on function private.telegram_token(uuid) from public, anon, authenticated;

-- 봇 토큰 저장 (처음이든 다시든). 연결 코드를 새로 만들어 돌려준다. 예전 연결은 끊는다.
create or replace function public.set_telegram_token(p_token text, p_bot text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  secret_name text;
  secret_id uuid;
  code text := 'ERP-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
begin
  if uid is null then raise exception 'login required' using errcode = '42501'; end if;
  if p_token !~ '^[0-9]{5,15}:[A-Za-z0-9_-]{30,60}$' then
    raise exception '봇 토큰 형식이 아닙니다. BotFather가 준 "숫자:영문" 형태의 토큰 전체를 붙여 넣어 주세요.' using errcode = '22023';
  end if;
  secret_name := 'telegram_token:' || uid::text;
  select id into secret_id from vault.secrets where name = secret_name;
  if secret_id is null then
    perform vault.create_secret(p_token, secret_name, '텔레그램 봇 토큰 (ERP 알림)');
  else
    perform vault.update_secret(secret_id, p_token);
  end if;
  insert into public.telegram_links (user_id, bot_username, chat_id, link_code, linked_at, last_error, updated_at)
  values (uid, p_bot, null, code, null, null, now())
  on conflict (user_id) do update
    set bot_username = excluded.bot_username, chat_id = null, link_code = excluded.link_code, linked_at = null, last_error = null, updated_at = now();
  return code;
end;
$$;

-- 서버(로그인한 본인)가 텔레그램 API를 부를 때 쓰는 본인 토큰
create or replace function public.my_telegram_token()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select private.telegram_token(auth.uid()) where auth.uid() is not null;
$$;

-- 연결 코드를 보낸 대화방으로 연결한다 (서버가 getUpdates로 코드를 확인한 뒤 부른다)
create or replace function public.link_telegram_chat(p_chat_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'login required' using errcode = '42501'; end if;
  update public.telegram_links
     set chat_id = p_chat_id, link_code = null, linked_at = now(), last_error = null, updated_at = now()
   where user_id = auth.uid();
end;
$$;

-- 발송 결과 기록 (화면에서 보여 준다)
create or replace function public.record_telegram_result(p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.telegram_links
     set last_sent_at = case when p_error is null then now() else last_sent_at end,
         last_error = left(p_error, 500), updated_at = now()
   where user_id = auth.uid();
$$;

-- 아침 크론용
create or replace function public.cron_telegram(p_secret text, p_user uuid)
returns table (token text, chat_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select private.telegram_token(p_user), l.chat_id
    from public.telegram_links l
    where l.user_id = p_user and l.chat_id is not null;
end;
$$;

create or replace function public.cron_telegram_result(p_secret text, p_user uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  update public.telegram_links
     set last_sent_at = case when p_error is null then now() else last_sent_at end,
         last_error = left(p_error, 500), updated_at = now()
   where user_id = p_user;
end;
$$;

-- PC의 예약 작업(Gmail 정리)이 DB 관리 연결로 부르는 발송 함수. 웹 API에는 열지 않는다.
-- 글자 그대로 보낸다(서식 없음). 4000자를 넘으면 자른다.
create or replace function private.telegram_send(p_user uuid, p_text text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  tok text := private.telegram_token(p_user);
  chat bigint;
begin
  select chat_id into chat from public.telegram_links where user_id = p_user;
  if tok is null or chat is null then raise exception '텔레그램이 연결되어 있지 않습니다.'; end if;
  return net.http_post(
    url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
    body := jsonb_build_object('chat_id', chat, 'text', left(p_text, 4000), 'disable_web_page_preview', true),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
end;
$$;
revoke all on function private.telegram_send(uuid, text) from public, anon, authenticated;

revoke all on function public.set_telegram_token(text, text) from public, anon;
revoke all on function public.my_telegram_token() from public, anon;
revoke all on function public.link_telegram_chat(bigint) from public, anon;
revoke all on function public.record_telegram_result(text) from public, anon;
grant execute on function public.set_telegram_token(text, text) to authenticated;
grant execute on function public.my_telegram_token() to authenticated;
grant execute on function public.link_telegram_chat(bigint) to authenticated;
grant execute on function public.record_telegram_result(text) to authenticated;

revoke all on function public.cron_telegram(text, uuid) from public;
revoke all on function public.cron_telegram_result(text, uuid, text) from public;
grant execute on function public.cron_telegram(text, uuid) to anon;
grant execute on function public.cron_telegram_result(text, uuid, text) to anon;
