-- 공고 출처 추가: lh = 한국토지주택공사 전자조달, kwater = 한국수자원공사 전자조달
alter table public.bid_notices drop constraint bid_notices_source_check;
alter table public.bid_notices
  add constraint bid_notices_source_check check (source in ('g2b', 'd2b', 'lh', 'kwater'));

-- 첨부 요약은 나라장터 첨부만 읽을 수 있다. 다른 출처 공고는 요약을 시도하지 않는다(늘 실패로 남던 국방부 공고 포함)
create or replace function public.cron_pending_summaries(p_secret text, p_user uuid)
returns table (id uuid, bid_no text, bid_ord text, title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select n.id, n.bid_no, n.bid_ord, n.title
    from public.bid_notices n
    where n.user_id = p_user
      and n.category = 'cost'
      and n.source = 'g2b'
      and n.verdict in ('possible', 'check')
      and n.status <> 'dismissed'
      and n.summary is null
      and n.summary_error is null
      and (n.closes_at is null or n.closes_at > now())
    order by n.closes_at asc nulls last
    limit 5;
end;
$$;
