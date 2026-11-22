-- 성장 백분위(WHO 기준)를 계산하려고 아기 성별과 출생 주수(이른둥이 교정 나이용)를 적는다.
alter table public.user_settings
  add column baby_sex text check (baby_sex is null or baby_sex in ('male', 'female')),
  add column baby_gest_weeks smallint check (baby_gest_weeks is null or baby_gest_weeks between 22 and 44);

-- 반환 칸이 늘어나서 다시 만든다 (가족 누구나, 만든 사람 설정에서 읽는다)
drop function public.family_baby_info();
create function public.family_baby_info()
returns table (baby_name text, baby_birth_date date, baby_sex text, baby_gest_weeks smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.baby_name, s.baby_birth_date, s.baby_sex, s.baby_gest_weeks
  from public.user_settings s where s.user_id = (select public.my_family());
$$;
revoke all on function public.family_baby_info() from public;
grant execute on function public.family_baby_info() to authenticated;
