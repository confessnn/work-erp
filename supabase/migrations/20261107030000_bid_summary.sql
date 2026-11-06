-- 원가계산 공고의 첨부(공고문·과업지시서)를 읽은 AI 요약
alter table public.bid_notices
  add column summary text,
  add column summary_files jsonb,
  add column summary_error text,
  add column summarized_at timestamptz;

-- 아침 수신 때 요약할 공고. 수의계약 등 해당 없음은 참여하지 않으므로 뺀다. 실패한 공고는 화면에서 다시 시도한다
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
      and n.verdict in ('possible', 'check')
      and n.status <> 'dismissed'
      and n.summary is null
      and n.summary_error is null
      and (n.closes_at is null or n.closes_at > now())
    order by n.closes_at asc nulls last
    limit 5;
end;
$$;

create or replace function public.cron_save_summary(p_secret text, p_user uuid, p_id uuid, p_summary text, p_files jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  update public.bid_notices
     set summary = p_summary,
         summary_files = p_files,
         summary_error = p_error,
         summarized_at = now()
   where id = p_id and user_id = p_user;
end;
$$;

revoke all on function public.cron_pending_summaries(text, uuid) from public;
revoke all on function public.cron_save_summary(text, uuid, uuid, text, jsonb, text) from public;
grant execute on function public.cron_pending_summaries(text, uuid) to anon;
grant execute on function public.cron_save_summary(text, uuid, uuid, text, jsonb, text) to anon;
