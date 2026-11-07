-- 자동 불러오기(cron)용: 같은 제목의 새 일정에 물려줄 강의료가 있는 기존 일정
create or replace function public.cron_lecture_fees(p_secret text, p_user uuid)
returns table (
  title text,
  lecture_date date,
  hours numeric,
  hourly_rate integer,
  gross_amount integer,
  income_type text,
  apply_tax_exemption boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_cron_secret(p_secret);
  return query
    select l.title, l.lecture_date, l.hours, l.hourly_rate, l.gross_amount, l.income_type, l.apply_tax_exemption
    from public.lectures l
    where l.user_id = p_user
      and (l.hourly_rate > 0 or l.gross_amount > 0);
end;
$$;

revoke all on function public.cron_lecture_fees(text, uuid) from public;
grant execute on function public.cron_lecture_fees(text, uuid) to anon;
