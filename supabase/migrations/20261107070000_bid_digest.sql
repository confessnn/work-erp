-- 아침 공고 메일: 이미 알린 공고를 기록한다
alter table public.bid_notices
  add column notified_at timestamptz;

-- 한일ENG 공고는 이미 화면에서 봤으므로 첫 메일에 한꺼번에 넣지 않는다
update public.bid_notices set notified_at = now() where category = 'hanil';

-- 아직 알리지 않은 검토 대상 공고. 불가·해당 없음·제외·마감된 공고는 뺀다
create or replace function public.cron_digest_notices(p_secret text, p_user uuid)
returns table (
  id uuid,
  category text,
  title text,
  verdict text,
  verdict_reason text,
  notice_org text,
  presumed_price bigint,
  closes_at timestamptz,
  detail_url text,
  summary text,
  summary_error text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select n.id, n.category, n.title, n.verdict, n.verdict_reason, n.notice_org, n.presumed_price,
           n.closes_at, n.detail_url, n.summary, n.summary_error
    from public.bid_notices n
    where n.user_id = p_user
      and n.notified_at is null
      and n.verdict in ('possible', 'check')
      and n.status <> 'dismissed'
      and (n.closes_at is null or n.closes_at > now())
    order by n.closes_at asc nulls last;
end;
$$;

create or replace function public.cron_mark_notified(p_secret text, p_user uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  update public.bid_notices
     set notified_at = now()
   where user_id = p_user and id = any(p_ids);
end;
$$;

-- 수신이 실패하거나 돌지 않은 날을 메일로 알리기 위한 마지막 수신 기록
create or replace function public.cron_bid_status(p_secret text, p_user uuid)
returns table (last_fetched_at timestamptz, last_fetch_result text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select s.last_fetched_at, s.last_fetch_result
    from public.bid_settings s
    where s.user_id = p_user;
end;
$$;

revoke all on function public.cron_digest_notices(text, uuid) from public;
revoke all on function public.cron_mark_notified(text, uuid, uuid[]) from public;
revoke all on function public.cron_bid_status(text, uuid) from public;
grant execute on function public.cron_digest_notices(text, uuid) to anon;
grant execute on function public.cron_mark_notified(text, uuid, uuid[]) to anon;
grant execute on function public.cron_bid_status(text, uuid) to anon;
