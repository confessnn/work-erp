-- 공유 토큰이 유효한지 + 링크 이름. 무효/삭제된 링크면 null.
create or replace function public.get_share_label(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.label from public.share_links s where s.token = p_token and length(p_token) >= 32;
$$;

revoke all on function public.get_share_label(text) from public;
grant execute on function public.get_share_label(text) to anon, authenticated;
