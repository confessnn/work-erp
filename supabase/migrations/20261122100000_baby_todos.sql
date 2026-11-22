-- 1) 아기 정보(이름·생일·성별·출생 주수)를 가족(아내)도 고친다. 값은 가족을 만든 사람 설정에 저장한다.
create or replace function public.set_family_baby_info(
  p_name text, p_birth date, p_sex text, p_gest_weeks smallint, p_gest_days smallint
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  fam uuid := public.my_family();
begin
  if auth.uid() is null or fam is null then raise exception 'login required' using errcode = '42501'; end if;
  insert into public.user_settings (user_id, baby_name, baby_birth_date, baby_sex, baby_gest_weeks, baby_gest_days, updated_at)
  values (fam, nullif(left(trim(p_name), 30), ''), p_birth, p_sex, p_gest_weeks, p_gest_days, now())
  on conflict (user_id) do update set
    baby_name = excluded.baby_name,
    baby_birth_date = excluded.baby_birth_date,
    baby_sex = excluded.baby_sex,
    baby_gest_weeks = excluded.baby_gest_weeks,
    baby_gest_days = excluded.baby_gest_days,
    updated_at = now();
end;
$$;
revoke all on function public.set_family_baby_info(text, date, text, smallint, smallint) from public, anon;
grant execute on function public.set_family_baby_info(text, date, text, smallint, smallint) to authenticated;

-- 2) 아기 할 일: 가족(나·아내) 공용 한 건. 누가 고치거나 완료해도 둘 다 같은 것을 본다.
create table public.baby_todos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default public.my_family() references auth.users (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  due_date date not null,
  note text check (note is null or char_length(note) <= 1000),
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index baby_todos_family_due_idx on public.baby_todos (family_id, due_date);
alter table public.baby_todos enable row level security;

create policy baby_todos_select_family on public.baby_todos
  for select to authenticated using (family_id = (select public.my_family()));
create policy baby_todos_insert_family on public.baby_todos
  for insert to authenticated with check (family_id = (select public.my_family()));
create policy baby_todos_update_family on public.baby_todos
  for update to authenticated
  using (family_id = (select public.my_family()))
  with check (family_id = (select public.my_family()));
create policy baby_todos_delete_family on public.baby_todos
  for delete to authenticated using (family_id = (select public.my_family()));

create trigger baby_todos_set_updated_at
  before update on public.baby_todos
  for each row execute function public.set_updated_at();

-- 3) 아침 알림: 그날까지 안 끝낸 아기 할 일 (가족 누구에게나)
create or replace function public.cron_morning_baby_todos(p_secret text, p_user uuid, p_day date)
returns table (title text, due_date date, note text, tag text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fam uuid := coalesce((select m.owner_id from public.family_members m where m.member_id = p_user), p_user);
begin
  perform private.check_cron_secret(p_secret);
  return query
    select t.title, t.due_date, t.note,
           coalesce((select s.baby_name from public.user_settings s where s.user_id = fam), '아기')
    from public.baby_todos t
    where t.family_id = fam and t.done_at is null and t.due_date <= p_day
    order by t.due_date, t.created_at
    limit 30;
end;
$$;
revoke all on function public.cron_morning_baby_todos(text, uuid, date) from public;
grant execute on function public.cron_morning_baby_todos(text, uuid, date) to anon;
