-- 연구소 업무 지시: 연구원(Claude Code 세션·예약 작업)에게 맡긴 일.
-- ERP 는 지시를 받아 두기만 하고, 실제 작업은 맥에서 도는 워커가 가져가서 한다.
-- 보드 칸: queued(맡긴 일) → running(진행 중) → review(확인 대기) → done(완료)
create table public.lab_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- features/lab/roster.ts 의 연구원 id (chief, scout, cost, dev, content, spare)
  researcher text not null check (char_length(researcher) between 1 and 40),
  title text not null check (char_length(title) between 1 and 4000),
  state text not null default 'queued' check (state in ('queued', 'running', 'review', 'done')),
  -- 연구원이 적어 두는 결과 한 덩어리
  result text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lab_tasks_user_state_idx on public.lab_tasks (user_id, state, created_at desc);
alter table public.lab_tasks enable row level security;

create policy lab_tasks_select on public.lab_tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy lab_tasks_insert on public.lab_tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy lab_tasks_update on public.lab_tasks
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy lab_tasks_delete on public.lab_tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 화면이 저절로 갱신되도록 (연구원이 상태를 바꾸면 보고 있던 보드가 바뀐다)
alter publication supabase_realtime add table public.lab_tasks;
