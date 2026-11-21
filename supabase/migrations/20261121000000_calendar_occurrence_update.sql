-- 구글 반복 일정의 시간이 바뀌어도 같은 강의로 보고 ERP 강의 시간을 고친다

-- 1) 기존 일정 조회에 시간·강의료 칸 추가 (반환 칸이 바뀌므로 다시 만든다)
drop function if exists public.cron_existing_lectures(text, uuid);
create function public.cron_existing_lectures(p_secret text, p_user uuid)
returns table (
  id uuid,
  lecture_date date,
  start_time time,
  title text,
  external_uid text,
  end_time time,
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
    select l.id, l.lecture_date, l.start_time, l.title, l.external_uid,
           l.end_time, l.hours::numeric, l.hourly_rate, l.gross_amount, l.income_type, l.apply_tax_exemption
    from public.lectures l
    where l.user_id = p_user
      and l.lecture_date >= (now() at time zone 'Asia/Seoul')::date - 31;
end;
$$;

-- 2) 구글에서 날짜·시간이 바뀐 불러온 강의 고치기
--    p_rows = [{"id": "...", "external_uid": "...", "lecture_date"?: ..., "start_time"?: ..., ...}]
--    적힌 칸만 바꾼다. 이미 구글과 연결된 강의(external_uid 있음)만 대상, 다른 강의와 ID가 겹치면 건너뜀.
create or replace function public.cron_update_lectures(p_secret text, p_user uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  perform private.check_cron_secret(p_secret);
  if jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;
  update public.lectures l
     set external_uid        = x->>'external_uid',
         lecture_date        = case when x ? 'lecture_date' then (x->>'lecture_date')::date else l.lecture_date end,
         start_time          = case when x ? 'start_time' then (x->>'start_time')::time else l.start_time end,
         end_time            = case when x ? 'end_time' then (x->>'end_time')::time else l.end_time end,
         hours               = case when x ? 'hours' then (x->>'hours')::numeric else l.hours end,
         hourly_rate         = case when x ? 'hourly_rate' then (x->>'hourly_rate')::integer else l.hourly_rate end,
         gross_amount        = case when x ? 'gross_amount' then (x->>'gross_amount')::integer else l.gross_amount end,
         income_type         = case when x ? 'income_type' then x->>'income_type' else l.income_type end,
         apply_tax_exemption = case when x ? 'apply_tax_exemption' then (x->>'apply_tax_exemption')::boolean else l.apply_tax_exemption end,
         income_tax          = case when x ? 'income_tax' then (x->>'income_tax')::integer else l.income_tax end,
         local_tax           = case when x ? 'local_tax' then (x->>'local_tax')::integer else l.local_tax end,
         expected_net        = case when x ? 'expected_net' then (x->>'expected_net')::integer else l.expected_net end
    from jsonb_array_elements(p_rows) as x
   where l.id = (x->>'id')::uuid
     and l.user_id = p_user
     and l.external_uid is not null
     and x->>'external_uid' is not null
     and not exists (
       select 1 from public.lectures o
        where o.user_id = p_user and o.external_uid = x->>'external_uid' and o.id <> l.id
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.cron_existing_lectures(text, uuid) from public;
revoke all on function public.cron_update_lectures(text, uuid, jsonb) from public;
grant execute on function public.cron_existing_lectures(text, uuid) to anon;
grant execute on function public.cron_update_lectures(text, uuid, jsonb) to anon;
