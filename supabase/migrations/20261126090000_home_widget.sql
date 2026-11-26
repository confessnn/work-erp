-- 안드로이드 홈 화면 위젯이 읽을 일정 피드.
--
-- 위젯은 로그인할 수 없으므로 비밀 토큰 주소 하나로 읽는다 (share_links 와 같은 방식).
-- 가족 공유 링크(get_shared_schedule)와 섞지 않고 따로 둔다 — 공유 링크의 범위를 넓히면
-- 이미 나눠 준 링크로 보이는 것까지 같이 넓어지기 때문.
--
-- 금액은 절대 나가지 않는다: 아래 함수의 반환 컬럼에 강의료·세금·수령·메모가 아예 없다.

-- 1) 위젯 토큰 (비밀번호처럼 취급. 본인만 조회·생성·삭제)
create table public.widget_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null default '홈 화면 위젯',
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index widget_tokens_user_idx on public.widget_tokens (user_id);
alter table public.widget_tokens enable row level security;
create policy "widget_tokens_select_own" on public.widget_tokens
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "widget_tokens_insert_own" on public.widget_tokens
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "widget_tokens_update_own" on public.widget_tokens
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "widget_tokens_delete_own" on public.widget_tokens
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 2) 위젯이 그릴 일정. 강의 + 가족 일정, 금액 없음.
--    범위는 '일정' 탭의 가족 공유 뷰와 같다 (강의는 제목·기관·시간, 가족 일정은 사람·제목·시간).
--    위젯은 한 달 칸을 그리므로 앞뒤 몇 달치를 한 번에 준다.
create or replace function public.get_widget_schedule(p_token text)
returns table (
  kind text,
  id uuid,
  title text,
  organization text,
  person text,
  event_date date,
  start_time time,
  end_time time
)
language sql
stable
security definer
set search_path = ''
as $$
  with owner as (
    select w.user_id
    from public.widget_tokens w
    where w.token = p_token and length(p_token) >= 32
  )
  select 'lecture'::text, l.id, l.title, l.organization, null::text,
         l.lecture_date, l.start_time, l.end_time
  from public.lectures l
  join owner o on o.user_id = l.user_id
  where l.lecture_date >= (now() at time zone 'Asia/Seoul')::date - 62
    and l.lecture_date <  (now() at time zone 'Asia/Seoul')::date + 186
  union all
  select 'event'::text, e.id, e.title, null::text, e.person,
         e.event_date, e.start_time, e.end_time
  from public.family_events e
  join owner o on o.user_id = e.family_id
  where e.event_date >= (now() at time zone 'Asia/Seoul')::date - 62
    and e.event_date <  (now() at time zone 'Asia/Seoul')::date + 186
  order by 6, 7 nulls first, 3;
$$;
revoke all on function public.get_widget_schedule(text) from public;
-- 위젯은 로그인하지 않고 부른다 (서버 라우트가 anon 키로 부름)
grant execute on function public.get_widget_schedule(text) to anon, authenticated;

-- 3) 토큰이 살아 있는지 확인하면서, 마지막으로 쓴 때를 적어 둔다 (안 쓰는 토큰을 지울 때 참고).
--    없는 토큰이면 false. 이 값으로 '주소가 틀림'과 '일정이 없음'을 가린다
--    (그래야 주소를 지웠을 때 위젯이 빈 달력이 아니라 안내를 보여 준다).
create or replace function public.touch_widget_token(p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare hit int;
begin
  update public.widget_tokens set last_used_at = now()
  where token = p_token and length(p_token) >= 32;
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;
revoke all on function public.touch_widget_token(text) from public;
grant execute on function public.touch_widget_token(text) to anon, authenticated;
