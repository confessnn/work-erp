-- 개찰 결과 자동 확인: 내가 투찰한 공고가 개찰되면 순위·1등과의 차이를 저절로 기록하고 텔레그램으로 알린다.
-- 5분마다 도는 /api/cron/reminders 가 함께 처리한다('reminder' 비밀값). 한 번에 몇 건만, 같은 건은 2시간에 한 번만 본다.

alter table public.bid_submissions add column auto_checked_at timestamptz;

-- 확인할 투찰: 결과 대기 + 아직 순위 모름 + 개찰 시각이 지났고 3주가 안 됨 + 사업자번호 저장됨
create or replace function public.cron_due_openings(p_secret text)
returns table (
  id uuid, user_id uuid, bid_no text, bid_ord text, award_method text, title text, notice_org text,
  my_bizno text, amount bigint, plan text, token text, chat_id bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.check_named_secret('reminder', p_secret);
  return query
  select s.id, s.user_id, n.bid_no, coalesce(n.bid_ord, '000'), n.award_method, n.title, n.notice_org,
         b.my_bizno, s.amount, s.plan, private.telegram_token(s.user_id), t.chat_id
  from public.bid_submissions s
  join public.bid_notices n on n.id = s.notice_id
  join public.bid_settings b on b.user_id = s.user_id
  left join public.telegram_links t on t.user_id = s.user_id
  where s.result = 'pending' and s.rank is null
    and n.source = 'g2b' and b.my_bizno is not null
    and coalesce(n.opens_at, n.closes_at, (s.submitted_on + 1)::timestamptz) <= now()
    and coalesce(n.opens_at, n.closes_at, (s.submitted_on + 1)::timestamptz) > now() - interval '21 days'
    and (s.auto_checked_at is null or s.auto_checked_at < now() - interval '2 hours')
  order by s.auto_checked_at nulls first, s.submitted_on
  limit 4;
end;
$$;

-- 확인 결과 저장. p_found 가 null 이면 '아직 없음'으로 시각만 남긴다.
create or replace function public.cron_save_opening(p_secret text, p_id uuid, p_found jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.check_named_secret('reminder', p_secret);
  if p_found is null then
    update public.bid_submissions set auto_checked_at = now() where id = p_id;
    return;
  end if;
  if coalesce(p_found ->> 'result', '') not in ('pending', 'won', 'lost') then
    raise exception 'invalid result' using errcode = '22023';
  end if;
  update public.bid_submissions
     set rank = (p_found ->> 'rank')::integer,
         participants = (p_found ->> 'participants')::integer,
         open_rate = (p_found ->> 'open_rate')::numeric,
         winner_rate = (p_found ->> 'winner_rate')::numeric,
         winner_amount = (p_found ->> 'winner_amount')::bigint,
         result = p_found ->> 'result',
         checked_at = now(),
         auto_checked_at = now()
   where id = p_id and result = 'pending' and rank is null;
end;
$$;

revoke all on function public.cron_due_openings(text) from public;
revoke all on function public.cron_save_opening(text, uuid, jsonb) from public;
grant execute on function public.cron_due_openings(text) to anon;
grant execute on function public.cron_save_opening(text, uuid, jsonb) to anon;
