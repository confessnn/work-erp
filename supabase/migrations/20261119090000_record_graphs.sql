-- 일 간의 관계도: AI가 일정 기록을 읽고 찾은 관계를 저장해 둔다 (볼 때마다 AI를 부르지 않도록).
-- nodes = 그때의 일 묶음 [{key, name, count}], relations = [{from, to, kind, reason, evidence}] (from/to 는 nodes 의 key)
create table public.record_graphs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nodes jsonb not null default '[]'::jsonb check (jsonb_typeof(nodes) = 'array'),
  relations jsonb not null default '[]'::jsonb check (jsonb_typeof(relations) = 'array'),
  -- 몇 개의 기록을 읽고 만들었는지 (그 뒤로 기록이 늘었는지 알려 주려고)
  entry_count integer not null default 0 check (entry_count >= 0),
  created_at timestamptz not null default now()
);
create index record_graphs_user_created_idx on public.record_graphs (user_id, created_at desc);

alter table public.record_graphs enable row level security;

create policy "record_graphs_select_own" on public.record_graphs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "record_graphs_insert_own" on public.record_graphs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "record_graphs_update_own" on public.record_graphs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "record_graphs_delete_own" on public.record_graphs
  for delete to authenticated using ((select auth.uid()) = user_id);
