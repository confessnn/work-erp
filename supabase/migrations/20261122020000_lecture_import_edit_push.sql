-- ERP에서 고친 '구글에서 불러온 강의' → 구글 원본 일정도 고치기
-- google_import_dirty = true 이면 구글 반영(push) 때 원본의 제목·날짜·시간을 고치고 false 로 되돌린다.
-- 반영 전에 자동 불러오기가 구글 값으로 덮어쓰지 않도록 cron_update_lectures 도 dirty 강의는 건너뛴다.
alter table public.lectures add column google_import_dirty boolean not null default false;

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
     and not l.google_import_dirty
     and x->>'external_uid' is not null
     and not exists (
       select 1 from public.lectures o
        where o.user_id = p_user and o.external_uid = x->>'external_uid' and o.id <> l.id
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.cron_update_lectures(text, uuid, jsonb) from public;
grant execute on function public.cron_update_lectures(text, uuid, jsonb) to anon;
