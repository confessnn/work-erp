-- 출생 주수를 '36주 4일'처럼 일까지 적는다 (교정 나이 = 실제 나이 - (40주 - 출생 주수))
alter table public.user_settings
  add column baby_gest_days smallint check (baby_gest_days is null or baby_gest_days between 0 and 6);

drop function public.family_baby_info();
create function public.family_baby_info()
returns table (baby_name text, baby_birth_date date, baby_sex text, baby_gest_weeks smallint, baby_gest_days smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.baby_name, s.baby_birth_date, s.baby_sex, s.baby_gest_weeks, s.baby_gest_days
  from public.user_settings s where s.user_id = (select public.my_family());
$$;
revoke all on function public.family_baby_info() from public;
grant execute on function public.family_baby_info() to authenticated;
