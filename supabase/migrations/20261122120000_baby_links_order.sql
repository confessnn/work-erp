-- 아기 링크 순서를 직접 정한다. 순서를 정하지 않은(새로 넣은) 링크는 맨 위에 최근 것부터.
alter table public.baby_links add column position integer;
create index baby_links_family_pos_idx on public.baby_links (family_id, position);

-- 화면에서 정한 순서(id 목록)대로 position을 매긴다. 호출한 사람 권한(RLS)으로 실행 → 가족 링크만 바뀐다
create or replace function public.reorder_baby_links(p_ids uuid[])
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.baby_links b
     set position = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where b.id = x.id;
$$;
revoke all on function public.reorder_baby_links(uuid[]) from public, anon;
grant execute on function public.reorder_baby_links(uuid[]) to authenticated;
