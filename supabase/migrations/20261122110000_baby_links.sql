-- 아기 링크 모음: 사이트 주소를 넣으면 서버가 읽어 제목·짧은 설명을 붙인다. 가족(나·아내) 공용.
create table public.baby_links (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default public.my_family() references auth.users (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  url text not null check (char_length(url) between 8 and 2000 and url ~ '^https?://'),
  title text check (title is null or char_length(title) <= 200),
  description text check (description is null or char_length(description) <= 1000),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index baby_links_family_idx on public.baby_links (family_id, created_at desc);
alter table public.baby_links enable row level security;

create policy baby_links_select_family on public.baby_links
  for select to authenticated using (family_id = (select public.my_family()));
create policy baby_links_insert_family on public.baby_links
  for insert to authenticated with check (family_id = (select public.my_family()));
create policy baby_links_update_family on public.baby_links
  for update to authenticated
  using (family_id = (select public.my_family()))
  with check (family_id = (select public.my_family()));
create policy baby_links_delete_family on public.baby_links
  for delete to authenticated using (family_id = (select public.my_family()));

create trigger baby_links_set_updated_at
  before update on public.baby_links
  for each row execute function public.set_updated_at();
